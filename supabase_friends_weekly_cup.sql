-- ─── Friends Cup ──────────────────────────────────────────────────────────────
-- Rooms: one per cup session
create table if not exists friends_cup_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  host_id    text not null,
  mode       text not null default 'ipl',
  created_at timestamptz default now()
);

-- Results: one row per (room, player) — upserted when sim completes
create table if not exists friends_cup_results (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references friends_cup_rooms(id) on delete cascade,
  player_id     text not null,
  display_name  text not null default 'Player',
  team_name     text,
  wins          int not null default 0,
  losses        int not null default 0,
  stage_reached text,
  ipl_outcome   text,
  submitted_at  timestamptz default now(),
  unique(room_id, player_id)
);

-- Enable realtime on both tables
alter publication supabase_realtime add table friends_cup_rooms;
alter publication supabase_realtime add table friends_cup_results;

-- ─── Weekly Cup ───────────────────────────────────────────────────────────────
-- Global weekly leaderboard — one entry per (week_key, player_id)
-- week_key format: "2026-W39"
create table if not exists weekly_cup_entries (
  id            uuid primary key default gen_random_uuid(),
  week_key      text not null,
  player_id     text not null,
  display_name  text not null default 'Player',
  mode          text not null default 'ipl',
  wins          int not null default 0,
  losses        int not null default 0,
  total         int not null default 0,
  stage_reached text,
  ipl_outcome   text,
  submitted_at  timestamptz default now(),
  unique(week_key, player_id)
);

alter publication supabase_realtime add table weekly_cup_entries;

-- ─── Row Level Security (open read, anon/auth write) ─────────────────────────
-- Friends Cup Rooms
alter table friends_cup_rooms enable row level security;
create policy "Anyone can read rooms" on friends_cup_rooms for select using (true);
create policy "Anyone can create rooms" on friends_cup_rooms for insert with check (true);

-- Friends Cup Results
alter table friends_cup_results enable row level security;
create policy "Anyone can read results" on friends_cup_results for select using (true);
create policy "Anyone can upsert own result" on friends_cup_results for insert with check (true);
create policy "Anyone can update result" on friends_cup_results for update using (true);

-- Weekly Cup Entries
alter table weekly_cup_entries enable row level security;
create policy "Anyone can read weekly entries" on weekly_cup_entries for select using (true);
create policy "Anyone can upsert weekly entry" on weekly_cup_entries for insert with check (true);
create policy "Anyone can update weekly entry" on weekly_cup_entries for update using (true);
