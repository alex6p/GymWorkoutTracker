# Lift Log automation setup

The app code and weekly GitHub workflow are already prepared. This one-time setup connects the phone app to a private Supabase table and gives GitHub Actions permission to generate the next plan.

## 1. Create the private Supabase database

1. Create a Supabase project.
2. Open **SQL Editor**, create a new query, paste the full contents of `supabase/schema.sql`, and run it.
3. In **Authentication > URL Configuration**, set the Site URL to `https://alex6p.github.io/GymWorkoutTracker/` and add the same URL to the redirect allow list.
4. From the project's API settings, copy the **Project URL** and the client-safe **Publishable key** (`sb_publishable_...`). These two values are designed for browser use; do not use the service-role key in the app.

## 2. Connect the phone app

1. Open Lift Log and go to **Settings > Automatic Workout Sync**.
2. Enter the Project URL and Publishable key, then select **Save Connection**.
3. Enter an email and a new password, then select **Create Account**.
4. If Supabase sends a confirmation email, confirm it and return to Lift Log.
5. Enter the same email and password and select **Sign In**, followed by **Sync Now**.

The password is used only for sign-in and is never stored by Lift Log. The browser stores the renewable Supabase session on that device so later workouts can sync without another login.

## 3. Add the private GitHub Actions values

In the GitHub repository, open **Settings > Secrets and variables > Actions** and add these repository secrets:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | The Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The private Supabase service-role/secret key |
| `SUPABASE_USER_ID` | Your user UUID from **Supabase > Authentication > Users** |
| `OPENAI_API_KEY` | An OpenAI API key created for this workflow |

Never put the service-role key or OpenAI API key in the app, repository files, an issue, or chat.

Optional: under **Variables**, add `OPENAI_MODEL`. If omitted, the workflow uses `gpt-5.6`.

## 4. Test the automation

1. Open the repository's **Actions** tab.
2. Choose **Weekly automated strength plan**.
3. Select **Run workflow** and leave the optional plan-week field blank.
4. Confirm the run succeeds and creates a commit named `Publish automated weekly strength plan`.
5. Reopen Lift Log and confirm the four routines show the new plan week.

After the test, Lift Log will sync each completed workout immediately. If the phone is offline, the workout remains queued locally and retries when the app next opens online. The GitHub workflow runs Sunday evening Eastern, reviews up to six weeks of private sessions, validates the four-day plan, commits only `data/current-plan.json`, and lets GitHub Pages publish it.

The manual **Export Workout Data** and **Sync Now** buttons remain available as recovery options.
