-- Loop Profile 2.0: optional age with explicit public visibility.
-- Age is an integer supplied by the member, never derived from a birth date.
alter table public.profiles
  add column if not exists age_years smallint check (age_years between 18 and 120),
  add column if not exists share_age boolean not null default false;

-- Preserve the column-level access hardening: clients may edit only their own profile fields;
-- reputation_score remains server-managed and cannot be written by authenticated clients.
grant update(age_years,share_age) on public.profiles to authenticated;
grant insert(age_years,share_age) on public.profiles to authenticated;

-- Adjust the opted-in member-card RPC to show age only when the member explicitly permits it.
-- Changing the RETURNS TABLE shape requires replacing the existing function.
drop function if exists public.loop_member_cards(uuid[]);

create function public.loop_member_cards(target_ids uuid[])
returns table (
 id uuid, display_name text, avatar_url text, public_interests text,
 reputation_score numeric, communities text[], allow_messages boolean, age_years smallint
)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.display_name,
   case when p.avatar_url like 'preset:%' or p.avatar_url like
    'https://%.supabase.co/storage/v1/object/public/loop-avatars/%'
      then p.avatar_url else null end as avatar_url,
   p.public_interests,p.reputation_score,
   case when p.share_communities then
     coalesce((select array_agg(m.category order by m.category)
       from public.community_memberships m where m.user_id=p.id),'{}'::text[])
     else '{}'::text[] end as communities,
   p.allow_messages,
   case when p.share_age then p.age_years else null::smallint end as age_years
 from public.profiles p
 where p.id=any(target_ids[1:60])
   and (p.id=auth.uid()
     or exists (select 1 from public.community_posts c where c.user_id=p.id)
     or exists (select 1 from public.community_replies r where r.user_id=p.id)
     or exists (select 1 from public.loop_message_threads t
       where auth.uid() in (t.member_a,t.member_b) and p.id in (t.member_a,t.member_b)))
 limit 60
$$;
revoke all on function public.loop_member_cards(uuid[]) from public;
revoke all on function public.loop_member_cards(uuid[]) from anon;
grant execute on function public.loop_member_cards(uuid[]) to authenticated;
