# Loop real authentication — Phase 1 setup

The application code supports real Supabase email/password accounts, but the Supabase project must be connected before the live app switches from local Alpha profiles to real authentication.

## 1. Supabase project

Use the existing Loop Supabase project if one already exists for feedback. Otherwise create a new Supabase project owned by the Loop project owner.

## 2. Database

Open Supabase -> SQL Editor and run:

`supabase-auth.sql`

This creates `public.profiles`, Row Level Security policies for each user to read/update only their own profile, and a trigger that creates the profile after a successful Auth signup.

## 3. Email/password authentication

In Supabase -> Authentication -> Providers -> Email:

- Enable Email provider.
- Keep email confirmation enabled for the production-like flow.

In Supabase -> Authentication -> URL Configuration:

- Set Site URL to the live Loop URL.
- Add the live Loop URL to Redirect URLs.
- Add any Vercel preview URL you intentionally use for auth testing.

The app uses those redirect URLs for account verification and password recovery.

## 4. Vercel environment variables

Add these to the Loop Alpha Vercel project for Production and Preview:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Use the project URL and the current publishable key from Supabase Project Settings / API.

The publishable key is intended for browser clients. Do not expose the Supabase secret/service-role key in the browser.

The existing server-side feedback system may also use:

- `SUPABASE_SECRET_KEY`

Keep that key server-side only.

## 5. Redeploy

Redeploy Loop after adding the environment variables.

When `/api/auth-config` reports `configured: true`, Loop automatically enables:

- Create account with email + password
- Email confirmation
- Sign in
- Session restore
- Sign out
- Forgot password
- Password recovery/update
- Backend profile loading/updating
- Guest mode

Until the config exists, Loop keeps the current local Alpha profile flow so production does not break during setup.
