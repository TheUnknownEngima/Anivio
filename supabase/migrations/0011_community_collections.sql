begin;
create table if not exists public.community_collections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 collection_id text not null,title text not null,description text not null default '',collection_json jsonb not null,
 author_name text not null default '',status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),unique(user_id,collection_id)
);
alter table public.community_collections enable row level security;
revoke all on public.community_collections from anon,authenticated;
create or replace function public.browse_community_collections(p_query text default '',p_offset integer default 0)
returns table(id uuid,title text,description text,collection_json jsonb,author_name text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select c.id,c.title,c.description,c.collection_json,c.author_name,c.created_at from community_collections c
 where c.status='approved' and (p_query='' or c.title ilike '%'||left(p_query,100)||'%')
 order by c.created_at desc,c.id limit 24 offset greatest(p_offset,0);
$$;
create or replace function public.submit_community_collection(p_profile_id integer,p_collection_id text,p_description text default '')
returns void language plpgsql security definer set search_path=public as $$
declare payload jsonb; author text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select p.name into author from profiles p where p.user_id=auth.uid() and p.profile_index=p_profile_id;
 select item into payload from synced_collections s,jsonb_array_elements(s.collections_json) item
 where s.user_id=auth.uid() and s.profile_id=p_profile_id and item->>'id'=p_collection_id;
 if payload is null then raise exception 'Collection not found'; end if;
 if payload::text ~* '(api_key|access_token|refresh_token|client_secret|password)' then raise exception 'Remove credentials before sharing'; end if;
 if (select count(*) from community_collections where user_id=auth.uid())>=20 and not exists(select 1 from community_collections where user_id=auth.uid() and collection_id=p_collection_id) then raise exception 'Publication limit reached'; end if;
 insert into community_collections(user_id,collection_id,title,description,collection_json,author_name)
 values(auth.uid(),p_collection_id,left(payload->>'title',150),left(p_description,1000),payload,coalesce(author,'Anivio member'))
 on conflict(user_id,collection_id) do update set title=excluded.title,description=excluded.description,collection_json=excluded.collection_json,author_name=excluded.author_name,status='pending';
end; $$;
create or replace function public.import_community_collection(p_profile_id integer,p_publication_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare payload jsonb; new_id text; current_items jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select c.collection_json into payload from community_collections c where c.id=p_publication_id and c.status='approved';
 if payload is null then raise exception 'Approved collection not found'; end if;
 new_id:=gen_random_uuid()::text;payload:=jsonb_set(payload,'{id}',to_jsonb(new_id));
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_profile_id||'collections',0));
 select s.collections_json into current_items from synced_collections s where s.user_id=auth.uid() and s.profile_id=p_profile_id for update;
 perform sync_push_collections(p_profile_id,coalesce(current_items,'[]')||jsonb_build_array(payload),'anivio-web');
 return new_id;
end; $$;
create or replace function public.admin_community_collections()
returns table(id uuid,title text,description text,collection_json jsonb,author_name text,status text)
language plpgsql security definer set search_path=public as $$
begin
 if not web_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return query select c.id,c.title,c.description,c.collection_json,c.author_name,c.status from community_collections c order by c.created_at desc limit 100;
end; $$;
create or replace function public.admin_review_collection(p_publication_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not web_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_status not in ('approved','rejected','pending') then raise exception 'Invalid review status'; end if;
 update community_collections set status=p_status where id=p_publication_id;
end; $$;
revoke all on function public.browse_community_collections(text,integer),public.submit_community_collection(integer,text,text),public.import_community_collection(integer,uuid),public.admin_community_collections(),public.admin_review_collection(uuid,text) from public,anon;
grant execute on function public.browse_community_collections(text,integer) to anon,authenticated;
grant execute on function public.submit_community_collection(integer,text,text),public.import_community_collection(integer,uuid),public.admin_community_collections(),public.admin_review_collection(uuid,text) to authenticated;
commit;
