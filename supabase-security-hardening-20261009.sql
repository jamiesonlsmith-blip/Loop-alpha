-- Applied to live Loop Supabase on 2026-10-09.
-- Least privilege protects server-computed reputation_score from browser updates.
revoke insert, update on table public.profiles from public, anon, authenticated;
grant insert (
  id, display_name, home_area, work_title, tastes, avatar_url,
  home_loop_radius_miles, preference_settings, public_interests,
  share_communities, allow_messages
) on table public.profiles to authenticated;
grant update (
  display_name, home_area, work_title, tastes, avatar_url,
  home_loop_radius_miles, preference_settings, public_interests,
  share_communities, allow_messages
) on table public.profiles to authenticated;
revoke all on table public.reputation_events from public, anon, authenticated;
revoke execute on function public.loop_can_contact(uuid,uuid,boolean) from public, anon, authenticated;
revoke execute on function public.loop_mark_thread_read(uuid) from public, anon, authenticated;
revoke execute on function public.loop_member_cards(uuid[]) from public, anon, authenticated;
revoke execute on function public.loop_touch_thread() from public, anon, authenticated;
grant execute on function public.loop_can_contact(uuid,uuid,boolean) to authenticated;
grant execute on function public.loop_mark_thread_read(uuid) to authenticated;
grant execute on function public.loop_member_cards(uuid[]) to authenticated;
alter function public.touch_arcade_scores_updated_at() set search_path to public, pg_temp;
