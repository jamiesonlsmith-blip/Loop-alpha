-- Loop Reputation + Home Loop Radius
-- Additive migration for existing Loop Alpha projects.
-- The live Supabase project received this migration on 2026-10-07.

alter table public.profiles
  add column if not exists home_loop_radius_miles integer not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_home_loop_radius_miles_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_home_loop_radius_miles_check
      check (home_loop_radius_miles between 30 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_reputation_score_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_reputation_score_check
      check (reputation_score between 0 and 10);
  end if;
end $$;

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('review','recommendation','community_post','reply','interaction')),
  source_key text not null check (char_length(source_key) between 1 and 180),
  category text,
  points numeric not null check (points >= 0 and points <= 10),
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source_key)
);

create index if not exists reputation_events_user_created_idx
  on public.reputation_events (user_id, created_at desc);

create index if not exists reputation_events_user_category_idx
  on public.reputation_events (user_id, category)
  where category is not null;

alter table public.reputation_events enable row level security;

comment on table public.reputation_events is
  'Server-recorded evidence events used to build Loop Reputation. Client applications do not write this table directly.';

comment on column public.profiles.home_loop_radius_miles is
  'Starting geographic radius for the member Home Loop. Loop Alpha defaults to 30 miles and expands outward in 10-mile steps.';
