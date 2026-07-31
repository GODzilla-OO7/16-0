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

export async function fetchProfile(userId) {
  const sb = await getSupabase()
  if (!sb) return { profile: null, results: [] }
  const [{ data: profile }, { data: results }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).single(),
    sb.from('game_results').select('*').eq('user_id', userId).order('played_at', { ascending: false }).limit(20),
  ])
  return { profile, results: results ?? [] }
}
