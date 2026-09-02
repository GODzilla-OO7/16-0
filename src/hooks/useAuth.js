import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let sub = null
    getSupabase().then(sb => {
      if (!sb) { setLoading(false); return }
      sb.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setLoading(false)
      })
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })
      sub = data?.subscription
    })
    return () => sub?.unsubscribe()
  }, [])

  const signOut = async () => {
    const sb = await getSupabase()
    sb?.auth.signOut()
  }

  return { user, loading, signOut }
}

export async function saveGameResult(userId, { mode, wins, losses, total, stageReached, iplOutcome, iplPosition, perfect }) {
  const sb = await getSupabase()
  if (!sb) return

  await sb.from('game_results').insert({
    user_id:       userId,
    mode,
    wins,
    losses,
    total_matches: total,
    stage_reached: stageReached ?? null,
    ipl_outcome:   iplOutcome   ?? null,
    ipl_position:  iplPosition  ?? null,
    perfect:       perfect      ?? false,
  })

  const { data: profile } = await sb.from('profiles').select('total_games,total_wins,total_losses,best_streak').eq('id', userId).single()
  if (profile) {
    await sb.from('profiles').update({
      total_games:  (profile.total_games  || 0) + 1,
      total_wins:   (profile.total_wins   || 0) + wins,
      total_losses: (profile.total_losses || 0) + losses,
      best_streak:  Math.max(profile.best_streak || 0, wins),
      updated_at:   new Date().toISOString(),
    }).eq('id', userId)
  }
}

// ── Global play counter (anonymous + logged-in) ──────────────────────────────
// Reads from / increments the global_stats table (single row, id=1).
// Run this SQL in Supabase once to create the table:
//
//   create table global_stats (
//     id int primary key default 1,
//     total_plays bigint default 0,
//     check (id = 1)
//   );
//   insert into global_stats values (1, 0);
//   alter table global_stats enable row level security;
//   create policy "read" on global_stats for select using (true);
//   create policy "increment" on global_stats for update using (true) with check (true);

export async function fetchTotalPlays() {
  const sb = await getSupabase()
  if (!sb) return null
  const { data, error } = await sb.from('global_stats').select('total_plays').eq('id', 1).single()
  if (error) return null
  return data?.total_plays ?? null
}

export async function incrementTotalPlays() {
  const sb = await getSupabase()
  if (!sb) return
  // Direct fetch + increment — works for anon users via existing RLS policies
  // (select: true, update: true on global_stats)
  try {
    const { data } = await sb.from('global_stats').select('total_plays').eq('id', 1).single()
    if (data == null) return
    await sb.from('global_stats')
      .update({ total_plays: (data.total_plays ?? 0) + 1 })
      .eq('id', 1)
  } catch {
    // Silently ignore — counter is best-effort
  }
}

export function subscribeToPlays(onUpdate) {
  let channel = null
  getSupabase().then(sb => {
    if (!sb) return
    channel = sb
      .channel('global_stats_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_stats' },
        payload => onUpdate(payload.new?.total_plays))
      .subscribe()
  })
  return () => { channel?.unsubscribe() }
}

export async function signInWithGoogle() {
  const sb = await getSupabase()
  if (!sb) return
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export async function fetchProfile(userId) {
  const sb = await getSupabase()
  if (!sb) return { profile: null, results: [] }
  const [{ data: profile }, { data: results }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).single(),
    sb.from('game_results').select('*').eq('user_id', userId).order('played_at', { ascending: false }).limit(20),
  ])
  return { profile, results: results ?? [] }
}

/**
 * Persist earned award IDs to the Supabase profiles.awards column.
 * Merges with whatever is already there (array_cat / dedup server-side).
 */
export async function saveAwards(userId, newAwardIds) {
  if (!userId || !newAwardIds?.length) return
  const sb = await getSupabase()
  if (!sb) return
  try {
    // Fetch current awards, merge, dedup, then update
    const { data: profile } = await sb.from('profiles').select('awards').eq('id', userId).single()
    const existing = profile?.awards ?? []
    const merged   = [...new Set([...existing, ...newAwardIds])]
    await sb.from('profiles').update({ awards: merged }).eq('id', userId)
  } catch { /* best-effort */ }
}
