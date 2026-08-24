-- Lift Log private workout-sync schema.
-- Run this entire file once in the Supabase SQL Editor.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_session_id text not null,
  workout_name text not null,
  plan_week date,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  payload jsonb not null,
  app_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_user_client_unique unique (user_id, client_session_id)
);

alter table public.workout_sessions enable row level security;

revoke all on table public.workout_sessions from anon;
grant select, insert, update on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_sessions to service_role;

drop policy if exists "Users can read their workout sessions" on public.workout_sessions;
create policy "Users can read their workout sessions"
on public.workout_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their workout sessions" on public.workout_sessions;
create policy "Users can insert their workout sessions"
on public.workout_sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their workout sessions" on public.workout_sessions;
create policy "Users can update their workout sessions"
on public.workout_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists workout_sessions_user_ended_idx
on public.workout_sessions (user_id, ended_at desc);

comment on table public.workout_sessions is
'Private Lift Log session payloads. Browser access is restricted to the signed-in owner with RLS.';
