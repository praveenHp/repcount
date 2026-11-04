# Repcount

A small workout consistency tracker built with plain HTML, CSS, and JavaScript. Vite bundles the Neon client for deployment to GitHub Pages.

## Local setup

1. Create a Neon project. On the branch and database your app will use, enable **Managed Better Auth** as the Data API's authentication provider, then enable the **Data API**. Neon installs the `pg_session_jwt` extension when the Data API is enabled; it provides the `auth.user_id()` function used by the SQL policies. If SQL reports `schema "auth" does not exist`, check that the Data API is enabled for the same branch and database where you opened the SQL editor. Do not create the `auth` schema manually or install the extension yourself.
2. Run [`neon/schema.sql`](neon/schema.sql) in that branch/database's Neon SQL editor. It creates the workout table and policies that restrict every operation to the signed-in account. It is safe to run again after schema updates.
3. Copy `.env.example` to `.env.local` and set `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL` to the endpoint URLs shown for your Neon branch. Use the URLs only; never add a database connection string or secret key to the frontend.
4. Add `http://localhost:5173` as a trusted origin in Neon Auth.
5. Run `npm install`, then `npm run dev`.

Create an account from the app the first time, then sign in. Workout records are stored in Neon and scoped to the signed-in user. Existing sessions from the old browser-only version are imported once after the first sign-in when the account has no workout records.

## Deploy to GitHub Pages

The included GitHub Actions workflow builds and deploys the `main` branch. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Add these repository variables under **Settings → Secrets and variables → Actions → Variables**:

- `VITE_NEON_AUTH_URL`
- `VITE_NEON_DATA_API_URL`

Add the published site origin (for example, `https://<your-account>.github.io`) as a trusted domain in Neon Auth. The browser receives only endpoint URLs; all workout access is restricted by Postgres row-level security in `neon/schema.sql`.

The contribution grid covers the last 365 days. Each day's shade represents total minutes logged: under 30, 30–59, 60–89, or 90+ minutes. A workout without a duration still marks the day as active. Select a square to see sessions for that date.
