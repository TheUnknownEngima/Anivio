-- Device sign-in: the displayed code only approves; exchange also requires a
-- high-entropy device secret AND the original nonce. Only the Edge Function's
-- service role may consume an approval. Secrets are stored as SHA-256 hashes.
begin;
create table if not exists public.device_login_sessions (
 secret_hash text primary key,nonce_hash text not null,user_code text not null unique,
 device_name text not null,device_type text not null,status text not null default 'pending',
 user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '10 minutes')
);
alter table public.device_login_sessions enable row level security;
revoke all on public.device_login_sessions from anon,authenticated;
create table if not exists public.anivio_web_config(key text primary key,value text not null);
alter table public.anivio_web_config enable row level security;
revoke all on public.anivio_web_config from anon,authenticated;
create or replace function public.start_device_login_session(p_device_nonce text,p_redirect_base_url text,p_device_name text,p_device_type text)
returns table(device_code text,user_code text,verification_uri_complete text,poll_interval_seconds integer)
language plpgsql security definer set search_path=public as $$
declare secret text;code text;link text;
begin
 if p_device_nonce is null or length(p_device_nonce)<32 or length(p_device_nonce)>128 then raise exception 'Invalid device nonce'; end if;
 delete from device_login_sessions where expires_at<now()-interval '1 day';
 if (select count(*) from device_login_sessions where status='pending' and expires_at>now())>=1000 then raise exception 'Too many pending requests'; end if;
 if (select count(*) from device_login_sessions where nonce_hash=encode(sha256(convert_to(p_device_nonce,'UTF8')),'hex') and created_at>now()-interval '10 minutes')>=3 then raise exception 'Try again later'; end if;
 select value into link from anivio_web_config where key='device_link_url';
 if link is null then link:=p_redirect_base_url;end if;
 if coalesce(link,'') !~ '^https://[^[:space:]?#]+$' and coalesce(link,'') !~ '^http://(localhost|127\.0\.0\.1):[0-9]+/link$' then raise exception 'Configure the website device-link URL';end if;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 code:=upper(left(replace(gen_random_uuid()::text,'-',''),12));
 insert into device_login_sessions(secret_hash,nonce_hash,user_code,device_name,device_type)
 values(encode(sha256(convert_to(secret,'UTF8')),'hex'),encode(sha256(convert_to(p_device_nonce,'UTF8')),'hex'),code,left(coalesce(p_device_name,'Device'),100),left(coalesce(p_device_type,'unknown'),30));
 return query select secret,code,rtrim(link,'/')||'?code='||code,3;
end; $$;
create or replace function public.poll_tv_login_session(p_code text,p_device_nonce text)
returns table(status text) language sql security definer set search_path=public as $$
 select coalesce((select case when s.expires_at<=now() then 'expired' else s.status end from device_login_sessions s
 where s.secret_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') and s.nonce_hash=encode(sha256(convert_to(p_device_nonce,'UTF8')),'hex')),'expired');
$$;
create or replace function public.preview_device_login_session(p_user_code text)
returns table(device_name text,device_type text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return query select s.device_name,s.device_type,s.expires_at from device_login_sessions s
 where s.user_code=upper(regexp_replace(p_user_code,'[^a-zA-Z0-9]','','g')) and s.status='pending' and s.expires_at>now();
end; $$;
create or replace function public.approve_tv_login_session(p_user_code text)
returns boolean language plpgsql security definer set search_path=public as $$
declare target device_login_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into target from device_login_sessions where user_code=upper(regexp_replace(p_user_code,'[^a-zA-Z0-9]','','g')) for update;
 if target.secret_hash is null or target.expires_at<=now() or target.status not in ('pending','approved') then raise exception 'Code expired or already used';end if;
 if target.status='approved' then if target.user_id=auth.uid() then return true;else raise exception 'Code already approved';end if;end if;
 update device_login_sessions set user_id=auth.uid(),status='approved' where secret_hash=target.secret_hash;
 return true;
end; $$;
create or replace function public.consume_device_login(p_code text,p_device_nonce text)
returns table(user_id uuid,email text) language plpgsql security definer set search_path=public,auth as $$
declare target device_login_sessions%rowtype;
begin
 select * into target from device_login_sessions s where s.secret_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex')
 and s.nonce_hash=encode(sha256(convert_to(p_device_nonce,'UTF8')),'hex') for update;
 if target.secret_hash is null or target.status<>'approved' or target.expires_at<=now() then raise exception 'Device approval unavailable';end if;
 if not exists(select 1 from auth.users u where u.id=target.user_id and u.email_confirmed_at is not null) then raise exception 'Confirmed account required';end if;
 update device_login_sessions set status='consumed' where secret_hash=target.secret_hash;
 return query select u.id,u.email::text from auth.users u where u.id=target.user_id;
end; $$;
revoke all on function public.start_device_login_session(text,text,text,text),public.poll_tv_login_session(text,text),public.preview_device_login_session(text),public.approve_tv_login_session(text),public.consume_device_login(text,text) from public,anon,authenticated;
grant execute on function public.start_device_login_session(text,text,text,text),public.poll_tv_login_session(text,text) to anon,authenticated;
grant execute on function public.preview_device_login_session(text),public.approve_tv_login_session(text) to authenticated;
grant execute on function public.consume_device_login(text,text) to service_role;
commit;
