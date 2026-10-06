-- Loop Alpha Feedback v2
-- Run this once in the Supabase SQL Editor.

create table if not exists public.feedback (
  id uuid primary key,
  created_at timestamptz not null default now(),
  feedback_type text not null,
  message text not null check (char_length(message) between 5 and 700),
  contact_email text,
  page_url text,
  user_agent text,
  app_version text not null default 'alpha',
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed'))
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- The browser never receives the Supabase secret key and has no direct table access.
revoke all on table public.feedback from anon, authenticated;

comment on table public.feedback is
  'Central feedback submissions from Loop Alpha. Access only from trusted server-side code.';
