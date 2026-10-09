-- Contact checks must bypass private profile row-level SELECT rules without exposing profile rows.
create or replace function public.loop_can_contact(target uuid, requester uuid, require_contribution boolean default true)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select requester=auth.uid()
   and target<>requester
   and exists (select 1 from public.profiles p where p.id=target and p.allow_messages=true)
   and not exists (select 1 from public.loop_blocks b
      where (b.blocker_id=requester and b.blocked_id=target)
         or (b.blocker_id=target and b.blocked_id=requester))
   and (not require_contribution
       or exists (select 1 from public.community_posts c where c.user_id=target)
       or exists (select 1 from public.community_replies r where r.user_id=target))
$$;
revoke all on function public.loop_can_contact(uuid,uuid,boolean) from public;
grant execute on function public.loop_can_contact(uuid,uuid,boolean) to authenticated;

drop policy if exists "threads_start_from_contribution" on public.loop_message_threads;
create policy "threads_start_from_contribution" on public.loop_message_threads for insert to authenticated
with check (
 (select auth.uid()) in (member_a,member_b)
 and public.loop_can_contact(
   case when member_a=(select auth.uid()) then member_b else member_a end,
   (select auth.uid()),true
 )
 and (select count(*) from public.loop_message_threads t
  where t.created_at>now()-interval '1 day'
    and (t.member_a=(select auth.uid()) or t.member_b=(select auth.uid())))<12
);

drop policy if exists "messages_send_participant" on public.loop_messages;
create policy "messages_send_participant" on public.loop_messages for insert to authenticated
with check (
 sender_id=(select auth.uid()) and read_at is null
 and exists (select 1 from public.loop_message_threads t where t.id=thread_id
   and (select auth.uid()) in (t.member_a,t.member_b)
   and public.loop_can_contact(
     case when t.member_a=(select auth.uid()) then t.member_b else t.member_a end,
     (select auth.uid()),false))
 and (select count(*) from public.loop_messages m
    where m.sender_id=(select auth.uid()) and m.created_at>now()-interval '1 minute')<10
 and (select count(*) from public.loop_messages m
    where m.sender_id=(select auth.uid()) and m.created_at>now()-interval '1 day')<100
);
