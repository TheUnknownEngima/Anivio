-- Manual supporter grants. Admins are bootstrapped explicitly in the SQL console;
-- neither user_metadata nor a browser-submitted email can grant admin access.
begin;
create table if not exists public.anivio_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.anivio_admins enable row level security;
revoke all on public.anivio_admins from anon,authenticated;

create table if not exists public.supporter_grants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tier text not null check(tier in ('SUPPORTER','SUPPORTER_PLUS')),
 expires_at timestamptz,granted_at timestamptz not null default now(),
 granted_by uuid references auth.users(id) on delete set null,reason text not null default ''
);
alter table public.supporter_grants enable row level security;
revoke all on public.supporter_grants from anon,authenticated;
create table if not exists public.supporter_grant_audit (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,previous_grant jsonb,next_grant jsonb,
 changed_at timestamptz not null default now(),reason text not null default ''
);
alter table public.supporter_grant_audit enable row level security;
revoke all on public.supporter_grant_audit from anon,authenticated;

create or replace function public.web_is_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
 select exists(select 1 from public.anivio_admins a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and u.email_confirmed_at is not null);
$$;
create or replace function public.get_my_member_access()
returns table(tier text,entitlements text[])
language sql stable security definer set search_path=public as $$
 select g.tier,array['GOLD_THEME','JADE_THEME','ROSE_GOLD_THEME','ARCTIC_BLUE_THEME','GRAPHITE_THEME','PROFILE_BACKGROUNDS','PROFILE_AVATARS']::text[]
 from supporter_grants g where g.user_id=auth.uid() and (g.expires_at is null or g.expires_at>now());
$$;
create or replace function public.get_my_membership_overview()
returns table(status text,tier text,verified_at text,supporter_since text,has_active_grant boolean,
 grant_is_lifetime boolean,grant_expires_at text,grant_kind text,grant_tier text,grant_source text,has_lifetime_grant boolean,lifetime_grant_tier text)
language sql stable security definer set search_path=public as $$
 select case when g.user_id is null then 'inactive' else 'active' end,g.tier,now()::text,g.granted_at::text,g.user_id is not null,
 g.user_id is not null and g.expires_at is null,g.expires_at::text,'manual',g.tier,'Anivio creator',g.user_id is not null and g.expires_at is null,
 case when g.expires_at is null then g.tier end
 from (select 1) seed left join supporter_grants g on g.user_id=auth.uid() and (g.expires_at is null or g.expires_at>now());
$$;
create or replace function public.admin_find_member(p_email text)
returns table(user_id uuid,email text,tier text,expires_at timestamptz,granted_at timestamptz,reason text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not web_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if length(trim(p_email))<3 then raise exception 'Enter an exact account email'; end if;
 return query select u.id,u.email::text,g.tier,g.expires_at,g.granted_at,g.reason from auth.users u
 left join public.supporter_grants g on g.user_id=u.id where lower(u.email)=lower(trim(p_email));
end; $$;
create or replace function public.admin_set_supporter(p_user_id uuid,p_tier text,p_expires_at timestamptz default null,p_reason text default '')
returns void language plpgsql security definer set search_path=public,auth as $$
declare previous jsonb; next_value jsonb;
begin
 if not web_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_tier is not null and p_tier not in ('SUPPORTER','SUPPORTER_PLUS') then raise exception 'Invalid supporter tier'; end if;
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Account not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || 'supporter',0));
 select to_jsonb(g) into previous from supporter_grants g where g.user_id=p_user_id for update;
 if p_tier is null then delete from supporter_grants where user_id=p_user_id;
 else
  insert into supporter_grants(user_id,tier,expires_at,granted_by,reason) values(p_user_id,p_tier,p_expires_at,auth.uid(),left(coalesce(p_reason,''),500))
  on conflict(user_id) do update set tier=excluded.tier,expires_at=excluded.expires_at,granted_by=excluded.granted_by,reason=excluded.reason;
  select to_jsonb(g) into next_value from supporter_grants g where g.user_id=p_user_id;
 end if;
 insert into supporter_grant_audit(actor_id,target_id,previous_grant,next_grant,reason)
 values(auth.uid(),p_user_id,previous,next_value,left(coalesce(p_reason,''),500));
end; $$;
revoke all on function public.web_is_admin(),public.get_my_member_access(),public.get_my_membership_overview(),public.admin_find_member(text),public.admin_set_supporter(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.web_is_admin(),public.get_my_member_access(),public.get_my_membership_overview(),public.admin_find_member(text),public.admin_set_supporter(uuid,text,timestamptz,text) to authenticated;
commit;
