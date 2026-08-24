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

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_week date not null,
  plan_id text not null,
  plan jsonb not null,
  generated_at timestamptz not null,
  source text not null default 'chatgpt_automation',
  reviewed_session_count integer not null default 0 check (reviewed_session_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_user_week_unique unique (user_id, plan_week),
  constraint weekly_plans_user_plan_id_unique unique (user_id, plan_id),
  constraint weekly_plans_payload_shape check (
    jsonb_typeof(plan) = 'object'
    and plan ? 'planId'
    and plan ? 'planWeek'
    and plan->>'planId' = plan_id
    and plan->>'planWeek' = plan_week::text
  )
);

alter table public.weekly_plans enable row level security;

revoke all on table public.weekly_plans from anon, authenticated;
grant select on table public.weekly_plans to authenticated;
grant select, insert, update, delete on table public.weekly_plans to service_role;

drop policy if exists "Users can read their weekly plans" on public.weekly_plans;
create policy "Users can read their weekly plans"
on public.weekly_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists weekly_plans_user_week_idx
on public.weekly_plans (user_id, plan_week desc, generated_at desc);

comment on table public.weekly_plans is
'Private generated Lift Log plans. The signed-in owner has read-only access through RLS; scheduled server-side automation publishes updates.';
