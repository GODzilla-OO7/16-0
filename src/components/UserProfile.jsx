import { useState, useEffect } from 'react'
import { fetchProfile } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'

const MODE_LABEL = { ipl: '🏏 IPL', 'odi-wc': '🌍 ODI WC', 't20-wc': '⚡ T20 WC' }

function StatCard({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      background: '#0e0e18', border: '1px solid #1e1e2e',
      borderRadius: '0.75rem', padding: '0.875rem 1rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.3rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  )
}

function ResultRow({ result }) {
  const isWin = result.wins > result.losses
  const outcome =
    result.ipl_outcome === 'champion'   ? '🏆 Champion' :
    result.ipl_outcome === 'runner-up'  ? '🥈 Runner-up' :
    result.ipl_outcome === 'eliminated' ? '❌ Eliminated' :
    result.ipl_outcome === 'not_qualified' ? '📊 Did Not Qualify' :
    result.stage_reached === 'Champion' ? '🏆 Champion' :
    result.stage_reached === 'Runner-up' ? '🥈 Runner-up' :
    result.stage_reached

  const date = new Date(result.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.625rem 0.875rem',
      background: '#0e0e18', borderRadius: '0.625rem',
      border: '1px solid #1e1e2e',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isWin ? '#1F6FEB' : '#ef4444',
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
            {result.wins}W – {result.losses}L
            {result.perfect && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: '#f59e0b' }}>✨ Perfect</span>}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#475569' }}>
            {MODE_LABEL[result.mode] ?? result.mode} · {date}
          </div>
        </div>
      </div>
      {outcome && (
        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{outcome}</div>
      )}
    </div>
  )
}

export default function UserProfile({ user, onClose, onSignOut }) {
  const [profile, setProfile] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]     = useState('')

  useEffect(() => {
    if (!user) return
    fetchProfile(user.id).then(({ profile, results }) => {
      setProfile(profile)
      setResults(results)
      setNameInput(profile?.display_name ?? '')
      setLoading(false)
    })
  }, [user])

  async function saveName() {
    const sb = await getSupabase()
    await sb?.from('profiles').update({ display_name: nameInput }).eq('id', user.id)
    setProfile(p => ({ ...p, display_name: nameInput }))
    setEditingName(false)
  }

  const initial = (profile?.display_name || user?.email || '?')[0].toUpperCase()
  const winPct = profile?.total_games
    ? Math.round((profile.total_wins / (profile.total_wins + profile.total_losses)) * 100)
    : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      overflowY: 'auto',
      animation: 'fade-in 0.2s ease both',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        {/* Header row: back + sign out */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#475569', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0 }}
          >
            ← Back
          </button>
          <button
            onClick={onSignOut}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '0.4rem', color: '#64748b',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              padding: '0.3rem 0.65rem',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#64748b' }}
          >
            Sign out
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#64748b', paddingTop: '4rem' }}>Loading...</div>
        ) : (
          <>
            {/* Avatar + Name */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.75rem', fontWeight: 900, color: 'var(--bg)',
                margin: '0 auto 0.875rem',
                boxShadow: '0 0 24px #1F6FEB44',
              }}>
                {initial}
              </div>

              {editingName ? (
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    autoFocus
                    style={{ padding: '0.4rem 0.75rem', background: 'var(--bg)', border: '1px solid #1F6FEB', borderRadius: '0.4rem', color: 'var(--text)', fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}
                  />
                  <button onClick={saveName} style={{ background: '#1F6FEB', border: 'none', borderRadius: '0.4rem', color: 'var(--bg)', fontWeight: 800, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'var(--border2)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: '#64748b', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>
                    {profile?.display_name || user?.email?.split('@')[0]}
                  </div>
                  <button
                    onClick={() => setEditingName(true)}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem' }}
                    title="Edit name"
                  >
                    ✏️
                  </button>
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.2rem' }}>{user?.email}</div>
              <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: '0.15rem' }}>
                Member since {new Date(user?.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>Career Stats</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <StatCard label="Games" value={profile?.total_games ?? 0} />
                <StatCard label="Wins" value={profile?.total_wins ?? 0} color="#1F6FEB" />
                <StatCard label="Win %" value={`${winPct}%`} color={winPct >= 60 ? '#f59e0b' : 'var(--text)'} />
                <StatCard label="Best Streak" value={profile?.best_streak ?? 0} color="#3b82f6" sub="most wins in one season" />
                <StatCard label="Perfect" value={profile?.perfect_seasons ?? 0} color="#f59e0b" sub="zero-loss seasons" />
                <StatCard label="Losses" value={profile?.total_losses ?? 0} color="#ef4444" />
              </div>
            </div>

            {/* Recent Results */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                Recent Results
              </div>
              {results.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#334155', fontSize: '0.85rem' }}>
                  No games yet — play a season to see your history here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {results.map(r => <ResultRow key={r.id} result={r} />)}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
