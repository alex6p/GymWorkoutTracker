# Lift Log automatic weekly-plan setup

Lift Log uses Supabase for two private data flows:

- completed workouts sync from the signed-in phone to `workout_sessions`;
- the Sunday ChatGPT automation reviews those sessions and writes the next plan to `weekly_plans`.

When the app opens while signed in, it downloads the newest owner-only plan. This path does not use the OpenAI API or require an OpenAI API key.

## 1. Create the private Supabase database

1. Create a Supabase project.
2. Open **SQL Editor**, create a new query, paste the full contents of `supabase/schema.sql`, and run it. The script creates both private tables and their row-level-security policies.
3. In **Authentication > URL Configuration**, set the Site URL to `https://alex6p.github.io/GymWorkoutTracker/` and add the same URL to the redirect allow list.
4. From the project's API settings, copy the **Project URL** and the client-safe **Publishable key** (`sb_publishable_...`). These two values are designed for browser use; do not use the service-role key in the app.

## 2. Connect the phone app

1. Open Lift Log and go to **Settings > Automatic Workout Sync**.
2. Enter the Project URL and Publishable key, then select **Save Connection**.
3. Enter an email and a new password, then select **Create Account**.
4. If Supabase sends a confirmation email, confirm it and return to Lift Log.
5. Enter the same email and password and select **Sign In**, followed by **Sync Now**.

The password is used only for sign-in and is never stored by Lift Log. The browser stores the renewable Supabase session on that device so later workouts can sync without another login. Signing in also checks immediately for a newly published weekly plan.

## 3. Weekly review and publishing

The recurring ChatGPT task performs the weekly review directly through the connected Supabase plugin. It reads only the workout history needed for progression, generates the four-day plan, validates the plan shape, and upserts it into `weekly_plans` for the same owner.

No `OPENAI_API_KEY` is needed. The GitHub Action secrets and the old scheduled AI workflow are not part of this path. Keep private database keys out of the app, repository files, issues, and chat.

## 4. Normal use

1. Stay signed in to Supabase inside Lift Log on the phone.
2. Finish workouts normally. A completed workout syncs immediately when online.
3. Reopen Lift Log after the weekly plan is generated. It checks Supabase on startup and whenever the browser returns online.
4. Use **Sync Now** if a completed workout is still waiting to upload.

If the phone is offline, completed workouts remain queued locally and retry later. `data/current-plan.json` remains a read-only fallback if Supabase is temporarily unavailable. **Export Workout Data** is a manual backup and troubleshooting option; it is not required for the normal weekly review.

## Security model

- the publishable key in the browser identifies the Supabase project but does not bypass security;
- Supabase Auth identifies the signed-in user;
- row-level security limits workout and plan reads to that user's rows;
- the app can read its owner's generated plans but cannot create, edit, or delete them;
- anonymous visitors cannot read either private table.
