-- Account dashboard contracts. Apply after 0001..0007. Owner RLS protects
-- every client table. Only session revocation needs SECURITY DEFINER.
begin;

create table if not exists public.addons (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile_id integer not null check(profile_id between 1 and 6),url text not null,
 name text not null default '',enabled boolean not null default true,sort_order integer not null default 0,
 primary key(user_id,profile_id,url),
 foreign key(user_id,profile_id) references public.profiles(user_id,profile_index) on delete cascade
);
create table if not exists public.plugins (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile_id integer not null check(profile_id between 1 and 6),url text not null,
 name text not null default '',enabled boolean not null default true,sort_order integer not null default 0,
 primary key(user_id,profile_id,url),
 foreign key(user_id,profile_id) references public.profiles(user_id,profile_index) on delete cascade
);
alter table public.addons enable row level security;
alter table public.plugins enable row level security;
drop policy if exists addons_owner on public.addons;
create policy addons_owner on public.addons for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists plugins_owner on public.plugins;
create policy plugins_owner on public.plugins for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.addons,public.plugins to authenticated;

create or replace function public.web_replace_sources(p_profile_id integer,p_kind text,p_sources jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_kind not in ('addons','plugins') or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources)>100 then
    raise exception 'Invalid source list';
  end if;
  if not exists(select 1 from profiles where user_id=auth.uid() and profile_index=p_profile_id) then raise exception 'Profile not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_profile_id || p_kind,0));
  execute format('delete from public.%I where user_id=auth.uid() and profile_id=$1',p_kind) using p_profile_id;
  execute format('insert into public.%I(user_id,profile_id,url,name,enabled,sort_order)
    select auth.uid(),$1,x.url,coalesce(x.name,'''') ,coalesce(x.enabled,true),coalesce(x.sort_order,0)
    from jsonb_to_recordset($2) as x(url text,name text,enabled boolean,sort_order integer)',p_kind)
    using p_profile_id,p_sources;
end; $$;
create or replace function public.sync_pull_addons(p_profile_id integer)
returns table(url text,name text,enabled boolean,sort_order integer)
language sql security invoker set search_path=public as $$
select s.url,s.name,s.enabled,s.sort_order from addons s where s.user_id=auth.uid() and s.profile_id=p_profile_id order by s.sort_order;
$$;
create or replace function public.sync_pull_plugins(p_profile_id integer)
returns table(url text,name text,enabled boolean,sort_order integer)
language sql security invoker set search_path=public as $$
select s.url,s.name,s.enabled,s.sort_order from plugins s where s.user_id=auth.uid() and s.profile_id=p_profile_id order by s.sort_order;
$$;
create or replace function public.sync_push_addons(p_profile_id integer,p_addons jsonb,p_origin_client_id text default null)
returns void language sql security invoker set search_path=public as $$ select web_replace_sources(p_profile_id,'addons',p_addons); $$;
create or replace function public.sync_push_plugins(p_profile_id integer,p_plugins jsonb,p_origin_client_id text default null)
returns void language sql security invoker set search_path=public as $$ select web_replace_sources(p_profile_id,'plugins',p_plugins); $$;

create table if not exists public.synced_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check(profile_id between 1 and 6),
  collections_json jsonb not null default '[]',updated_at timestamptz not null default now(),
  primary key(user_id,profile_id),
  foreign key(user_id,profile_id) references public.profiles(user_id,profile_index) on delete cascade
);
alter table public.synced_collections enable row level security;
drop policy if exists synced_collections_owner on public.synced_collections;
create policy synced_collections_owner on public.synced_collections for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.synced_collections to authenticated;
create or replace function public.sync_pull_collections(p_profile_id integer)
returns table(profile_id integer,collections_json jsonb,updated_at text)
language sql security invoker set search_path=public as $$
 select c.profile_id,c.collections_json,c.updated_at::text from synced_collections c where c.user_id=auth.uid() and c.profile_id=p_profile_id;
$$;
create or replace function public.sync_push_collections(p_profile_id integer,p_collections_json jsonb,p_origin_client_id text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or jsonb_typeof(p_collections_json) is distinct from 'array' or octet_length(p_collections_json::text)>1048576 then raise exception 'Invalid collections'; end if;
 insert into synced_collections(user_id,profile_id,collections_json) values(auth.uid(),p_profile_id,p_collections_json)
 on conflict(user_id,profile_id) do update set collections_json=excluded.collections_json,updated_at=clock_timestamp();
end; $$;

create table if not exists public.provider_credentials (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile_id integer not null check(profile_id between 1 and 6),
 provider text not null,credential_json jsonb not null,updated_at timestamptz not null default now(),
 primary key(user_id,profile_id,provider),
 foreign key(user_id,profile_id) references public.profiles(user_id,profile_index) on delete cascade
);
alter table public.provider_credentials enable row level security;
drop policy if exists provider_credentials_owner on public.provider_credentials;
create policy provider_credentials_owner on public.provider_credentials for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.provider_credentials to authenticated;
create or replace function public.sync_pull_provider_credentials(p_profile_id integer)
returns table(provider text,credential_json jsonb,updated_at text)
language sql security invoker set search_path=public as $$
 select c.provider,c.credential_json,c.updated_at::text from provider_credentials c where c.user_id=auth.uid() and c.profile_id=p_profile_id;
$$;
create or replace function public.sync_push_provider_credentials(p_profile_id integer,p_credentials jsonb,p_origin_client_id text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or jsonb_typeof(p_credentials) is distinct from 'array' or octet_length(p_credentials::text)>131072 then raise exception 'Invalid credentials'; end if;
 insert into provider_credentials(user_id,profile_id,provider,credential_json)
 select auth.uid(),p_profile_id,x.provider,x.credential_json from jsonb_to_recordset(p_credentials) as x(provider text,credential_json jsonb)
 on conflict(user_id,profile_id,provider) do update set credential_json=excluded.credential_json,updated_at=clock_timestamp();
end; $$;
create or replace function public.sync_seed_provider_credentials(p_profile_id integer,p_credentials jsonb,p_origin_client_id text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or jsonb_typeof(p_credentials) is distinct from 'array' or octet_length(p_credentials::text)>131072 then raise exception 'Invalid credentials'; end if;
 insert into provider_credentials(user_id,profile_id,provider,credential_json)
 select auth.uid(),p_profile_id,x.provider,x.credential_json from jsonb_to_recordset(p_credentials) as x(provider text,credential_json jsonb)
 on conflict(user_id,profile_id,provider) do nothing;
end; $$;

-- Revision check and row lock prevent a browser tab from overwriting newer app settings.
create or replace function public.web_patch_mobile_settings(p_profile_id integer,p_features jsonb,p_expected_updated_at timestamptz default null)
returns text language plpgsql security invoker set search_path=public as $$
declare current_row profile_settings_blobs%rowtype; next_revision timestamptz;
begin
 if auth.uid() is null or jsonb_typeof(p_features) is distinct from 'object' or octet_length(p_features::text)>1048576 then raise exception 'Invalid settings'; end if;
 if not exists(select 1 from profiles where user_id=auth.uid() and profile_index=p_profile_id) then raise exception 'Profile not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_profile_id || 'mobile',0));
 select * into current_row from profile_settings_blobs where user_id=auth.uid() and profile_id=p_profile_id and platform='mobile' for update;
 if current_row.updated_at is distinct from p_expected_updated_at then raise exception 'Settings changed on another device. Reload before saving.'; end if;
 next_revision:=clock_timestamp();
 insert into profile_settings_blobs(user_id,profile_id,platform,settings_json,updated_at,origin_client_id)
 values(auth.uid(),p_profile_id,'mobile',jsonb_set(coalesce(current_row.settings_json,'{"version":5,"features":{}}'),'{features}',coalesce(current_row.settings_json->'features','{}') || p_features),next_revision,'anivio-web')
 on conflict(user_id,profile_id,platform) do update set settings_json=excluded.settings_json,updated_at=excluded.updated_at,origin_client_id=excluded.origin_client_id;
 return next_revision::text;
end; $$;

alter table public.registered_devices add column if not exists session_id uuid;
create or replace function public.register_current_device(p_client_name text,p_client_version text,p_device_name text,p_installation_id text,p_platform text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or coalesce(p_installation_id,'')='' then return; end if;
 insert into registered_devices(user_id,installation_id,device_name,platform,client_name,client_version,last_seen_at,session_id)
 values(auth.uid(),p_installation_id,p_device_name,p_platform,p_client_name,p_client_version,now(),nullif(auth.jwt()->>'session_id','')::uuid)
 on conflict(user_id,installation_id) do update set device_name=excluded.device_name,platform=excluded.platform,client_name=excluded.client_name,client_version=excluded.client_version,last_seen_at=now(),session_id=excluded.session_id;
end; $$;
create or replace function public.list_my_sessions()
returns table(session_id uuid,device_name text,platform text,client_name text,client_version text,last_seen_at timestamptz,is_current boolean)
language sql security definer set search_path=public,auth as $$
 select s.id,coalesce(d.device_name,'Unregistered device'),coalesce(d.platform,'unknown'),coalesce(d.client_name,'Anivio'),d.client_version,coalesce(d.last_seen_at,s.created_at),s.id::text=auth.jwt()->>'session_id'
 from auth.sessions s left join public.registered_devices d on d.session_id=s.id and d.user_id=s.user_id
 where s.user_id=auth.uid() order by coalesce(d.last_seen_at,s.created_at) desc;
$$;
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 delete from auth.sessions where id=p_session_id and user_id=auth.uid();
 return found;
end; $$;

revoke all on function public.list_my_sessions() from public,anon;
revoke all on function public.revoke_my_session(uuid) from public,anon;
revoke all on function public.web_patch_mobile_settings(integer,jsonb,timestamptz) from public,anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.web_patch_mobile_settings(integer,jsonb,timestamptz) to authenticated;
grant execute on function public.web_replace_sources(integer,text,jsonb) to authenticated;
grant execute on function public.sync_pull_addons(integer),public.sync_pull_plugins(integer),public.sync_pull_collections(integer),public.sync_pull_provider_credentials(integer) to authenticated;
grant execute on function public.sync_push_addons(integer,jsonb,text),public.sync_push_plugins(integer,jsonb,text),public.sync_push_collections(integer,jsonb,text),public.sync_push_provider_credentials(integer,jsonb,text),public.sync_seed_provider_credentials(integer,jsonb,text) to authenticated;
commit;
