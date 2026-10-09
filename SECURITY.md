# Loop security operations

**Production:** The main branch and live Supabase project are sensitive assets.

## Account safeguards (owner in GitHub, Vercel and Supabase dashboards)
1. Enable phishing-resistant two-factor authentication (prefer passkeys/hardware security keys).
2. Audit collaborators, installed GitHub Apps, deploy tokens and OAuth integrations quarterly. Revoke anything unused.
3. Change GitHub repository visibility to Private when approved. Verify Vercel Git integration can still deploy private repository.
4. Create a repository ruleset for `main`: require pull requests, passing `search-tests` status check, block force pushes/deletion, and restrict bypass permissions. Availability of enforced rules on private repositories depends on GitHub plan.
5. Require review of production configuration and third-party permissions before enabling new external integrations.

## Application safeguards
- Browser uses only Supabase publishable credentials, never service-role secrets.
- RLS is mandatory for all exposed tables. Database-side column grants protect reputation_score.
- Server validates the real Supabase session *and* persistent contribution ownership before issuing reputation points.
- Do not trust localStorage events, caller-supplied categories/points, or mutable user metadata for authorization.
- Keep preview deployments authenticated and enable Git fork deployment approvals.
- Limit abusive API request traffic in the Vercel firewall after log-only observation.
- Treat backup branches as recovery points, **not** as off-site disaster recovery. Export encrypted database backups and practice restores.

## Owner dashboard settings still to enable
- Supabase Authentication > Password Security > Leaked password protection.
- GitHub private visibility, ruleset, required checks, 2FA.
- Review Supabase Security Advisor and Vercel Firewall after each significant release.

## 2026-10-09 security migration
`supabase-security-hardening-20261009.sql` was applied to the live database.
