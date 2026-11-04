-- Run this in the SQL editor for the same Neon branch/database where both
-- Managed Better Auth and the Data API are enabled. Enabling the Data API
-- installs pg_session_jwt, which provides auth.user_id(). Do not create the
-- auth schema or install pg_session_jwt manually.
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  date date not null,
  workout_type text not null check (workout_type in ('Strength', 'Cardio', 'Leg day', 'Upper body', 'Full body', 'Mobility', 'Other')),
  duration integer check (duration between 1 and 600),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

-- Allow duration to be omitted in existing databases too.
alter table public.workouts alter column duration drop not null;

alter table public.workouts enable row level security;

revoke all on public.workouts from public, anonymous;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;

drop policy if exists "Users can read their own workouts" on public.workouts;
create policy "Users can read their own workouts"
  on public.workouts for select to authenticated
  using (auth.user_id() = user_id);

drop policy if exists "Users can add workouts to their account" on public.workouts;
create policy "Users can add workouts to their account"
  on public.workouts for insert to authenticated
  with check (auth.user_id() = user_id);

drop policy if exists "Users can update their own workouts" on public.workouts;
create policy "Users can update their own workouts"
  on public.workouts for update to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

drop policy if exists "Users can delete their own workouts" on public.workouts;
create policy "Users can delete their own workouts"
  on public.workouts for delete to authenticated
  using (auth.user_id() = user_id);
