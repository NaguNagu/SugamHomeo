# Sugam Homeo

Secure, responsive practice management for a single homeopathy clinic.

## Local setup

```bash
npm install
npm run dev
```

Environment variables are documented in `.env.example`. Keep `.env.local` private.

## Supabase setup

Run these scripts in Supabase SQL Editor, in order:

1. `supabase/schema.sql`
2. `supabase/seed-profiles.sql`
3. `supabase/production-hardening.sql`

Run `supabase/verify-production.sql` afterward for a read-only check that the RPCs, RLS policies, and audit triggers are present.

The app uses Supabase Auth for email/password sign-in. Create the doctor and pharmacist Auth users first, then seed their profiles.

## Routes

- `/login` — clinic sign-in
- `/` — doctor overview
- `/appointments` — appointment scheduling
- `/visits/new` — consultation, prescription, and pharmacy handoff
- `/patients/[patientNumber]` — longitudinal patient history
- `/pharmacy` — pharmacist dispatch queue
- `/reports` — live practice totals
- `/settings` — clinic and connection status

Sarvam transcription is server-side at `/api/transcribe` and becomes active once `SARVAM_API_KEY` is set.

## Production launch checklist

1. Apply all three Supabase SQL scripts above. Keep the Supabase project in a region close to the clinic and enable email/password authentication.
2. In Vercel, import this repository and add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview, and Development environments. Add `SARVAM_API_KEY` only when voice transcription is required.
3. Add the deployed Vercel URL to Supabase Auth URL Configuration as the Site URL and as an allowed redirect URL.
4. Enable Supabase database backups/PITR appropriate for the clinic’s retention needs and periodically verify a restore procedure. Never expose a Supabase service-role key in this app or in browser variables.
5. Sign in once with each role and verify: patient creation/editing, appointment creation, visit bundle creation, pharmacy dispatch, payment recording, and pharmacist clinical-note restrictions.
