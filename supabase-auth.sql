-- Loop Authentication Phase 1
-- Run once in Supabase SQL Editor after creating/selecting the Loop project.
-- This creates the authenticated profile record that belongs to auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  home_area text,
  work_title text,
  tastes text,
  avatar_url text,
  reputation_score numeric not null default 0 check (reputation_score between 0 and 10),
  home_loop_radius_miles integer not null default 30 check (home_loop_radius_miles between 30 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create or replace function public.handle_new_loop_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    home_area,
    work_title,
    tastes
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'home_area', ''),
    nullif(new.raw_user_meta_data ->> 'work_title', ''),
    nullif(new.raw_user_meta_data ->> 'tastes', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_loop_user();

comment on table public.profiles is
  'Private Phase 1 Loop member profile. Community-facing public profile fields can be separated later.';
