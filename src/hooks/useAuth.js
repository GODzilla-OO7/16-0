import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { user, loading, signOut }
}

// Save a completed game to Supabase (call after each game if user is logged in)
export async function saveGameResult(userId, { mode, wins, losses, total, stageReached, iplOutcome, iplPosition, perfect }) {
  const { error } = await supabase.from('game_results').insert({
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
  if (error) console.error('Save result error:', error)

  // Update profile aggregates
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_games, total_wins, total_losses, best_streak')
    .eq('id', userId)
    .single()

  if (profile) {
    const newStreak = wins >= losses ? (profile.best_streak || 0) : profile.best_streak
    await supabase.from('profiles').update({
      total_games:  (profile.total_games  || 0) + 1,
      total_wins:   (profile.total_wins   || 0) + wins,
      total_losses: (profile.total_losses || 0) + losses,
      best_streak:  Math.max(newStreak, wins),
      updated_at:   new Date().toISOString(),
    }).eq('id', userId)
  }
}

// Fetch full profile + recent results
export async function fetchProfile(userId) {
  const [{ data: profile }, { data: results }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('game_results')
      .select('*')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(20),
  ])
  return { profile, results: results ?? [] }
}
