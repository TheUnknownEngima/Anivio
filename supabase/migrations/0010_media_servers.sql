begin;
create table if not exists public.media_server_connections (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile_id integer not null,servers jsonb not null default '[]',updated_at timestamptz not null default now(),
 primary key(user_id,profile_id),foreign key(user_id,profile_id) references public.profiles(user_id,profile_index) on delete cascade
);
alter table public.media_server_connections enable row level security;
drop policy if exists media_servers_owner on public.media_server_connections;
create policy media_servers_owner on public.media_server_connections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.media_server_connections to authenticated;
create or replace function public.sync_pull_media_servers(p_profile_id integer)
returns table(profile_id integer,servers jsonb,updated_at text)
language sql security invoker set search_path=public as $$
 select s.profile_id,s.servers,s.updated_at::text from media_server_connections s where s.user_id=auth.uid() and s.profile_id=p_profile_id;
$$;
create or replace function public.sync_push_media_servers(p_profile_id integer,p_servers jsonb,p_origin_client_id text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or jsonb_typeof(p_servers) is distinct from 'array' or octet_length(p_servers::text)>1048576 then raise exception 'Invalid server connections'; end if;
 if exists(select 1 from jsonb_array_elements(p_servers) s where s->>'provider_id' not in ('jellyfin','emby') or coalesce(s->>'token','')='') then raise exception 'Unsupported or incomplete server connection'; end if;
 insert into media_server_connections(user_id,profile_id,servers) values(auth.uid(),p_profile_id,p_servers)
 on conflict(user_id,profile_id) do update set servers=excluded.servers,updated_at=clock_timestamp();
end; $$;
revoke all on function public.sync_pull_media_servers(integer),public.sync_push_media_servers(integer,jsonb,text) from public,anon;
grant execute on function public.sync_pull_media_servers(integer),public.sync_push_media_servers(integer,jsonb,text) to authenticated;
commit;
