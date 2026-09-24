-- Live Friends Cup — Supabase SQL migration
-- Run this in your Supabase SQL editor (Project → SQL Editor → New query)

-- 1. Rooms
create table if not exists live_cup_rooms (
  id          uuid        primary key default gen_random_uuid(),
  code        text        unique not null,                 -- 6-char e.g. "KR7XP2"
  host_id     text        not null,
  mode        text        not null default 'ipl',          -- ipl | odi-wc | t20-wc
  status      text        not null default 'lobby',        -- lobby | playing | playoffs | done
  created_at  timestamptz default now(),
  started_at  timestamptz
);

-- 2. Players in a room
create table if not exists live_cup_players (
  id           uuid        primary key default gen_random_uuid(),
  room_id      uuid        references live_cup_rooms(id) on delete cascade,
  player_id    text        not null,                       -- user UUID or anon localStorage UUID
  display_name text        not null,
  team_name    text        default '',
  team         jsonb,                                      -- drafted XI JSON
  manager      jsonb,
  rating_type  text        default 'overall',
  ready        boolean     default false,                  -- true = draft complete
  strength     numeric     default 0,                      -- pre-calculated team strength
  joined_at    timestamptz default now(),
  unique(room_id, player_id)
);

-- 3. Pre-calculated fixture list — one row per match slot per player
--    For human vs human matches the result is pre-determined (same for both sides)
create table if not exists live_cup_fixtures (
  id                  uuid    primary key default gen_random_uuid(),
  room_id             uuid    references live_cup_rooms(id) on delete cascade,
  player_id           text    not null,
  match_num           int     not null,
  opponent_player_id  text,                               -- null = AI opponent
  opponent_name       text    not null,
  opponent_strength   numeric not null,
  won                 boolean,                            -- pre-determined result (null until host starts)
  my_score            text,
  opp_score           text,
  unique(room_id, player_id, match_num)
);

-- 4. Live results — submitted after each match is played
create table if not exists live_cup_results (
  id            uuid        primary key default gen_random_uuid(),
  room_id       uuid        references live_cup_rooms(id) on delete cascade,
  player_id     text        not null,
  match_num     int         not null,
  opponent_name text        not null,
  won           boolean     not null,
  my_score      text,
  opp_score     text,
  stage         text,                                     -- 'league' | 'semi' | 'final'
  submitted_at  timestamptz default now(),
  unique(room_id, player_id, match_num)
);

-- 5. Enable realtime on all four tables
alter publication supabase_realtime add table live_cup_rooms;
alter publication supabase_realtime add table live_cup_players;
alter publication supabase_realtime add table live_cup_fixtures;
alter publication supabase_realtime add table live_cup_results;
