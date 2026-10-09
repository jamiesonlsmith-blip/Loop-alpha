-- Loop Profiles + Messages 1.0
-- Private account data remains private. Public member cards disclose ONLY opted-in display fields.
alter table public.profiles
  add column if not exists public_interests text not null default '' check (char_length(public_interests)<=180),
  add column if not exists share_communities boolean not null default false,
  add column if not exists allow_messages boolean not null default true;

-- Opted-in avatar media; never store account email or personal location in public cards.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('loop-avatars','loop-avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "loop_avatars_member_insert" on storage.objects;
create policy "loop_avatars_member_insert" on storage.objects for insert to authenticated
with check (bucket_id='loop-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.loop_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id<>blocked_id)
);
alter table public.loop_blocks enable row level security;
grant select,insert,delete on public.loop_blocks to authenticated;
revoke all on public.loop_blocks from anon;
drop policy if exists "blocks_read_mine" on public.loop_blocks;
create policy "blocks_read_mine" on public.loop_blocks for select to authenticated using (blocker_id=(select auth.uid()));
drop policy if exists "blocks_insert_mine" on public.loop_blocks;
create policy "blocks_insert_mine" on public.loop_blocks for insert to authenticated with check (blocker_id=(select auth.uid()));
drop policy if exists "blocks_delete_mine" on public.loop_blocks;
create policy "blocks_delete_mine" on public.loop_blocks for delete to authenticated using (blocker_id=(select auth.uid()));

-- Sorted member UUIDs guarantee one lightweight correspondence thread per pair.
create table if not exists public.loop_message_threads (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references auth.users(id) on delete cascade,
  member_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_a,member_b),
  check (member_a<member_b)
);
create index if not exists loop_threads_a_recent on public.loop_message_threads(member_a,updated_at desc);
create index if not exists loop_threads_b_recent on public.loop_message_threads(member_b,updated_at desc);
alter table public.loop_message_threads enable row level security;
grant select,insert on public.loop_message_threads to authenticated;
revoke all on public.loop_message_threads from anon;
drop policy if exists "threads_read_participant" on public.loop_message_threads;
create policy "threads_read_participant" on public.loop_message_threads for select to authenticated
using ((select auth.uid()) in (member_a,member_b));
drop policy if exists "threads_start_from_contribution" on public.loop_message_threads;
create policy "threads_start_from_contribution" on public.loop_message_threads for insert to authenticated
with check (
 (select auth.uid()) in (member_a,member_b)
 and exists (
   select 1 from public.profiles p
   where p.id=case when member_a=(select auth.uid()) then member_b else member_a end
   and p.allow_messages=true
 )
 and exists (
   select 1 from public.community_posts p where p.user_id=case when member_a=(select auth.uid()) then member_b else member_a end
   union all select 1 from public.community_replies r where r.user_id=case when member_a=(select auth.uid()) then member_b else member_a end
 )
 and not exists (
   select 1 from public.loop_blocks b where
     (b.blocker_id=member_a and b.blocked_id=member_b) or
     (b.blocker_id=member_b and b.blocked_id=member_a)
 )
 -- Limit cold introductions to 12 per day for the initiating member.
 and (select count(*) from public.loop_message_threads t
      where t.created_at > now()-interval '1 day'
      and (t.member_a=(select auth.uid()) or t.member_b=(select auth.uid()))) < 12
);

create table if not exists public.loop_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.loop_message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 800),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists loop_messages_thread_recent on public.loop_messages(thread_id,created_at desc);
create index if not exists loop_messages_unread on public.loop_messages(thread_id,created_at desc) where read_at is null;
alter table public.loop_messages enable row level security;
grant select,insert on public.loop_messages to authenticated;
revoke all on public.loop_messages from anon;
drop policy if exists "messages_private_participants" on public.loop_messages;
create policy "messages_private_participants" on public.loop_messages for select to authenticated
using (exists (select 1 from public.loop_message_threads t where t.id=thread_id and (select auth.uid()) in (t.member_a,t.member_b)));
drop policy if exists "messages_send_participant" on public.loop_messages;
create policy "messages_send_participant" on public.loop_messages for insert to authenticated
with check (
  sender_id=(select auth.uid()) and read_at is null
  and exists (
    select 1 from public.loop_message_threads t
    join public.profiles recipient on recipient.id=case when t.member_a=(select auth.uid()) then t.member_b else t.member_a end
    where t.id=thread_id and (select auth.uid()) in (t.member_a,t.member_b)
    and recipient.allow_messages=true
    and not exists (select 1 from public.loop_blocks b
      where (b.blocker_id=t.member_a and b.blocked_id=t.member_b)
      or (b.blocker_id=t.member_b and b.blocked_id=t.member_a))
  )
  -- Not real-time chat: moderate asynchronous pacing and abuse volume server-side.
  and (select count(*) from public.loop_messages m where m.sender_id=(select auth.uid()) and m.created_at>now()-interval '1 minute')<10
  and (select count(*) from public.loop_messages m where m.sender_id=(select auth.uid()) and m.created_at>now()-interval '1 day')<100
);

create or replace function public.loop_touch_thread()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.loop_message_threads set updated_at=new.created_at where id=new.thread_id;
  return new;
end $$;
drop trigger if exists loop_message_touch on public.loop_messages;
create trigger loop_message_touch after insert on public.loop_messages
for each row execute function public.loop_touch_thread();

-- No direct UPDATE permission to message bodies, sender, or read receipts.
create or replace function public.loop_mark_thread_read(target_thread uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.loop_message_threads t where t.id=target_thread
    and (t.member_a=auth.uid() or t.member_b=auth.uid())) then
    raise exception 'Thread not available' using errcode='42501';
  end if;
  update public.loop_messages set read_at=now()
  where thread_id=target_thread and sender_id<>auth.uid() and read_at is null;
end $$;
revoke all on function public.loop_mark_thread_read(uuid) from public;
grant execute on function public.loop_mark_thread_read(uuid) to authenticated;

-- Safe public card RPC; no work title, exact home area, email, or private tastes.
-- Other profiles only become discoverable after an authentic community contribution
-- or a private shared message thread. Private interests must be explicitly entered.
create or replace function public.loop_member_cards(target_ids uuid[])
returns table (
 id uuid, display_name text, avatar_url text, public_interests text,
 reputation_score numeric, communities text[], allow_messages boolean
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
   p.allow_messages
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
grant execute on function public.loop_member_cards(uuid[]) to authenticated;

create table if not exists public.loop_message_reports (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.loop_messages(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check (reason in ('Harassment','Bullying','Hate','Spam','Inappropriate','Other')),
 details text not null default '' check (char_length(details)<=450),
 status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now(),
 unique (message_id,reporter_id)
);
create index if not exists loop_reports_pending on public.loop_message_reports(status,created_at);
alter table public.loop_message_reports enable row level security;
grant select,insert on public.loop_message_reports to authenticated;
revoke all on public.loop_message_reports from anon;
drop policy if exists "reports_see_own" on public.loop_message_reports;
create policy "reports_see_own" on public.loop_message_reports for select to authenticated using (reporter_id=(select auth.uid()));
drop policy if exists "reports_submit_recipient" on public.loop_message_reports;
create policy "reports_submit_recipient" on public.loop_message_reports for insert to authenticated
with check (reporter_id=(select auth.uid()) and status='pending'
 and exists (select 1 from public.loop_messages m join public.loop_message_threads t on t.id=m.thread_id
  where m.id=message_id and m.sender_id<>(select auth.uid()) and (select auth.uid()) in (t.member_a,t.member_b))
);
comment on table public.loop_message_reports is
 'Private member message safety reports. Project operator reviews pending reports in Supabase; no automated email escalation is configured.';
