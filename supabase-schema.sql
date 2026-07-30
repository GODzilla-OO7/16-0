-- ─── 16-0 Database Schema ─────────────────────────────────────────────────────
-- Run this entire file in Supabase → SQL Editor → New query → Run

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  display_name    text,
  total_games     integer default 0,
  total_wins      integer default 0,
  total_losses    integer default 0,
  best_streak     integer default 0,
  perfect_seasons integer default 0,
  created_at      timestamp with time zone default now(),
  updated_at      timestamp with time zone default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Game Results ───────────────────────────────────────────────────────────────
create table public.game_results (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users on delete cascade not null,
  mode           text not null,
  wins           integer not null,
  losses         integer not null,
  total_matches  integer not null,
  stage_reached  text,
  ipl_outcome    text,
  ipl_position   integer,
  perfect        boolean default false,
  played_at      timestamp with time zone default now()
);

alter table public.game_results enable row level security;

create policy "Users can view their own results"
  on public.game_results for select using (auth.uid() = user_id);

create policy "Users can insert their own results"
  on public.game_results for insert with check (auth.uid() = user_id);

-- ── Daily Challenges ───────────────────────────────────────────────────────────
create table public.daily_challenges (
  id               uuid default gen_random_uuid() primary key,
  challenge_date   date unique not null,
  challenge_type   text not null,
  challenge_label  text not null,
  challenge_config jsonb not null,
  created_at       timestamp with time zone default now()
);

alter table public.daily_challenges enable row level security;
create policy "Anyone can view daily challenges"
  on public.daily_challenges for select using (true);

create table public.daily_results (
  id           uuid default gen_random_uuid() primary key,
  challenge_id uuid references public.daily_challenges on delete cascade not null,
  user_id      uuid references auth.users on delete cascade not null,
  wins         integer not null,
  losses       integer not null,
  score        integer not null,
  submitted_at timestamp with time zone default now(),
  unique(challenge_id, user_id)
);

alter table public.daily_results enable row level security;

create policy "Anyone can view daily leaderboard"
  on public.daily_results for select using (true);

create policy "Users can insert their own daily result"
  on public.daily_results for insert with check (auth.uid() = user_id);
