-- ============================================================
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- User profiles
create table if not exists profiles (
  id                  uuid references auth.users on delete cascade primary key,
  age                 text,
  sex                 text,
  height              text,
  weight              text,
  allergies           text,
  exercise_frequency  text,
  targets             jsonb,
  onboarding_complete boolean default false,
  plan_accepted       boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- 7-day AI meal plans
create table if not exists meal_plans (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  plan       jsonb not null,
  targets    jsonb,
  source     text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Free-form diet log entries (Diet Tracker screen)
create table if not exists diet_entries (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  date       date not null,
  name       text not null,
  type       text,
  time       text,
  calories   numeric,
  protein    numeric,
  carbs      numeric,
  fat        numeric,
  created_at timestamptz default now()
);

-- Completion logs for planned meals (tracking against meal plan)
create table if not exists meal_logs (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references auth.users on delete cascade not null,
  date                date not null,
  meal_slot           text not null,
  completed           boolean default false,
  consumed_at         text,
  custom_description  text,
  nutrition           jsonb,
  created_at          timestamptz default now(),
  unique(user_id, date, meal_slot)
);

-- Grocery list (stored as JSONB array per user)
create table if not exists groceries (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null unique,
  items      jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- Weight / height check-ins
create table if not exists check_ins (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  weight     text,
  height     text,
  notes      text,
  created_at timestamptz default now()
);

-- Daily routine block logs
create table if not exists routine_logs (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  date         date not null,
  block_id     text not null,
  block_name   text,
  block_type   text,
  planned_time text,
  actual_time  text,
  note         text,
  created_at   timestamptz default now(),
  unique(user_id, date, block_id)
);

-- Per-user routine block configuration
create table if not exists routine_settings (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null unique,
  blocks     jsonb not null,
  updated_at timestamptz default now()
);

-- Saved custom meal templates
create table if not exists custom_meals (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references auth.users on delete cascade not null,
  short_name         text,
  meal_name          text,
  recipe             text,
  ingredients        jsonb,
  source_description text,
  created_at         timestamptz default now()
);

-- ── Row-Level Security ──────────────────────────────────────────────────────

alter table profiles        enable row level security;
alter table meal_plans      enable row level security;
alter table diet_entries    enable row level security;
alter table meal_logs       enable row level security;
alter table groceries       enable row level security;
alter table check_ins       enable row level security;
alter table routine_logs    enable row level security;
alter table routine_settings enable row level security;
alter table custom_meals    enable row level security;

-- Each user can only see and modify their own rows
create policy "own profiles"          on profiles         for all using (auth.uid() = id);
create policy "own meal_plans"        on meal_plans       for all using (auth.uid() = user_id);
create policy "own diet_entries"      on diet_entries     for all using (auth.uid() = user_id);
create policy "own meal_logs"         on meal_logs        for all using (auth.uid() = user_id);
create policy "own groceries"         on groceries        for all using (auth.uid() = user_id);
create policy "own check_ins"         on check_ins        for all using (auth.uid() = user_id);
create policy "own routine_logs"      on routine_logs     for all using (auth.uid() = user_id);
create policy "own routine_settings"  on routine_settings for all using (auth.uid() = user_id);
create policy "own custom_meals"      on custom_meals     for all using (auth.uid() = user_id);

-- ── Auto-create profile row on sign-up ─────────────────────────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
