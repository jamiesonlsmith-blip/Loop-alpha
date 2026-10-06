# Loop Alpha Feedback v2 setup

The code is ready for central storage and email notification. Do not put secrets in index.html, GitHub, or chat.

## 1. Choose a Loop feedback inbox
Use a dedicated Loop inbox if possible. A temporary Gmail address is fine for Alpha. Later, move to a domain address such as feedback@yourloopdomain.com.

## 2. Create a Supabase project
1. Create a Supabase project.
2. Open the SQL Editor.
3. Run `supabase-feedback.sql`.
4. In the project Connect/API settings, copy the project URL and a **secret** API key intended for server-side use.

Supabase is moving from legacy service_role keys to the newer secret key format; use the current secret key shown by Supabase.

## 3. Create a Resend account
1. Create a Resend account and API key.
2. For production sending, verify a sender domain and choose a From address such as `Loop Alpha <feedback@yourloopdomain.com>`.
3. During early testing, use whatever sender Resend permits for your verified account.

## 4. Add Vercel environment variables
In the Loop Alpha Vercel project, add these to Production (and Preview if desired):

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `FEEDBACK_TO_EMAIL`
- `FEEDBACK_FROM_EMAIL`

Example values:
- `FEEDBACK_TO_EMAIL=your-loop-feedback-inbox@example.com`
- `FEEDBACK_FROM_EMAIL=Loop Alpha <feedback@your-verified-domain.com>`

Then redeploy the latest production deployment so the server function receives the new environment variables.

## 5. Test
Open Loop → Settings & privacy → Send feedback.
Submit a test message.

Expected result:
- A new row appears in Supabase → `feedback`.
- The row's `notification_status` becomes `sent`.
- The Loop feedback inbox receives a "Loop Alpha Feedback" email.
- If email sending fails after the database save, the submission remains stored centrally with status `failed`.

## Security notes
- Never expose `SUPABASE_SECRET_KEY` or `RESEND_API_KEY` in browser code.
- Rotate a key immediately if it is ever committed to GitHub or pasted somewhere public.
- The API validates message size and type and includes a honeypot field for basic bot filtering.
- Before a wide public launch, add stronger abuse protection/rate limiting.
