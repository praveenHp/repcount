# Repcount

A small workout consistency tracker built with plain HTML, CSS, and JavaScript. Vite bundles the Neon client for deployment to GitHub Pages.

## Local setup

1. Create a Neon project and enable **Managed Better Auth** and the **Data API** for its main branch.
2. Run [`neon/schema.sql`](neon/schema.sql) once in the Neon SQL editor. It creates the workout table and policies that restrict every operation to the signed-in account.
3. Copy `.env.example` to `.env.local` and set `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL` to the endpoint URLs shown for your Neon branch. Use the URLs only; never add a database connection string or secret key to the frontend.
4. Add `http://localhost:5173` as a trusted origin in Neon Auth.
5. Run `npm install`, then `npm run dev`.

Create an account from the app the first time, then sign in. Workout records are stored in Neon and scoped to the signed-in user. Existing sessions from the old browser-only version are imported once after the first sign-in when the account has no workout records.

## Deploy to GitHub Pages

The included GitHub Actions workflow builds and deploys the `main` branch. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Add these repository variables under **Settings → Secrets and variables → Actions → Variables**:

- `VITE_NEON_AUTH_URL`
- `VITE_NEON_DATA_API_URL`

Add the published `https://<your-account>.github.io/habit-tracker/` URL as a trusted origin in Neon Auth. The browser receives only endpoint URLs; all workout access is restricted by Postgres row-level security in `neon/schema.sql`.

The contribution grid covers the last 365 days. Each day's shade represents total minutes logged: under 30, 30–59, 60–89, or 90+ minutes. Select a square to see sessions for that date.
