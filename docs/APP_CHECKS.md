# Endurance automated app check

Run:

```bash
npm run check:app
```

The check validates the most important MVP regressions:

- build script exists
- login redirects incomplete profiles to onboarding
- trainings page blocks users without completed onboarding
- old trainings are hidden after 24 hours
- onboarding has a location field and required-location validation
- avatar crop exports a square image
- Supabase client uses env vars
- optional live Supabase table checks when env vars are available

Live Supabase checks run only when these variables are set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

This is a lightweight smoke check. It does not replace full browser E2E tests, but it catches the exact regressions we are fixing during Phase 1.2 and 1.3.
