-- Loop Guide preferences: private, owner-editable, never public data.
alter table public.profiles
  add column if not exists preference_settings jsonb not null
    default '{"version":1,"categories":{},"preferLocal":false,"learnFromActivity":false}'::jsonb;
alter table public.profiles enable row level security;
comment on column public.profiles.preference_settings is
  'Private explicit category preferences for Loop Guide; authenticated profile owners control their own values via profiles RLS.';
