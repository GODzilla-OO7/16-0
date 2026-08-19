import { useState, useEffect } from 'react'
import { fetchProfile } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { getStreakData } from '../hooks/useStreak'
import { loadProfile, AWARDS } from '../hooks/useProfile'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_EMOJI  = { ipl: '🏏', 'odi-wc': '🌍', 't20-wc': '⚡' }
const MODE_LABEL  = { ipl: 'IPL', 'odi-wc': 'ODI WC', 't20-wc': 'T20 WC' }

function outcomeLabel(r) {
  if (r.ipl_outcome === 'champion')      return { text: 'IPL Champion',   color: '#f59e0b', icon: '🏆' }
  if (r.ipl_outcome === 'runner-up')     return { text: 'Runner-up',       color: '#94a3b8', icon: '🥈' }
  if (r.ipl_outcome === 'eliminated')    return { text: 'Playoff Exit',    color: '#4169E1', icon: '⚡' }
  if (r.ipl_outcome === 'not_qualified') return { text: 'No Playoffs',     color: 'var(--muted)', icon: '📊' }
  if (r.stage_reached === 'Champion')    return { text: 'WC Champion',     color: '#f59e0b', icon: '🏆' }
  if (r.stage_reached === 'Runner-up')   return { text: 'WC Runner-up',    color: '#94a3b8', icon: '🥈' }
  if (r.stage_reached === 'Semi-Final')  return { text: 'Semi-Final',      color: '#a78bfa', icon: '🎯' }
  if (r.stage_reached === 'Quarter-Final') return { text: 'Quarter-Final', color: 'var(--text-dim)', icon: '🎯' }
  return null
}

function rankOutcome(r) {
  if (r.ipl_outcome === 'champion' || r.stage_reached === 'Champion')   return 0
  if (r.ipl_outcome === 'runner-up' || r.stage_reached === 'Runner-up') return 1
  if (r.stage_reached === 'Semi-Final')  return 2
  if (r.stage_reached === 'Quarter-Final') return 3
  if (r.ipl_outcome === 'eliminated')    return 4
  return 5
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', marginTop: '0.25rem' }}>
      {icon && <span style={{ fontSize: '0.9rem' }}>{icon}</span>}
      <div style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {title}
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: '0.25rem' }} />
    </div>
  )
}

function StatCard({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: '0.75rem', padding: '0.875rem 0.75rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.3rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  )
}

function HighlightCard({ icon, value, label, desc, color = 'var(--text)' }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: '0.75rem', padding: '0.875rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <div style={{ fontSize: '1.1rem' }}>{icon}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color, lineHeight: 1 }}>
        {value} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '0.58rem', color: 'var(--muted)', fontWeight: 600, lineHeight: 1.3 }}>{desc}</div>
    </div>
  )
}

function MilestoneBadge({ icon, label, count, unlocked }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
      opacity: unlocked ? 1 : 0.35,
      filter: unlocked ? 'none' : 'grayscale(1)',
      minWidth: 60,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--card)',
        border: unlocked ? '2px solid #f59e0b55' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem',
        boxShadow: unlocked ? '0 0 12px #f59e0b22' : 'none',
      }}>
        {unlocked ? icon : '🔒'}
      </div>
      <div style={{
        fontSize: '0.56rem', fontWeight: 800,
        color: unlocked ? '#f59e0b' : 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        textAlign: 'center', maxWidth: 56, lineHeight: 1.2,
      }}>{label}</div>
      {unlocked && <div style={{ fontSize: '0.5rem', color: 'var(--muted)' }}>{count}+</div>}
    </div>
  )
}

function BestWorstCard({ result, type }) {
  if (!result) return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem',
      padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 70,
    }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No data yet</div>
    </div>
  )

  const isBest = type === 'best'
  const oc = outcomeLabel(result)
  const date = new Date(result.played_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${isBest ? '#f59e0b44' : 'var(--card-border)'}`,
      borderRadius: '0.75rem', padding: '0.875rem',
    }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 900, color: isBest ? '#f59e0b' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
        {isBest ? '⬆ Best' : '⬇ Worst'} · {MODE_EMOJI[result.mode]} {MODE_LABEL[result.mode]}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
        {result.wins}W – {result.losses}L
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
        {oc && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: oc.color }}>{oc.icon} {oc.text}</span>}
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{date}</span>
        {result.perfect && <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>✨ Perfect</span>}
      </div>
    </div>
  )
}

function ResultRow({ result }) {
  const oc = outcomeLabel(result)
  const date = new Date(result.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.625rem 0.875rem',
      background: 'var(--card)', borderRadius: '0.625rem',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '0.9rem', flexShrink: 0 }}>{MODE_EMOJI[result.mode] ?? '🏏'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#4169E1' }}>{result.wins}W</span>
          <span style={{ color: 'var(--text-dim)' }}>–</span>
          <span style={{ color: '#ef4444' }}>{result.losses}L</span>
          {result.perfect && <span style={{ fontSize: '0.62rem', color: '#f59e0b' }}>✨</span>}
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
          {MODE_LABEL[result.mode] ?? result.mode} · {date}
        </div>
      </div>
      {oc && (
        <div style={{
          fontSize: '0.62rem', fontWeight: 700, color: oc.color,
          background: `${oc.color}18`, borderRadius: '0.3rem',
          padding: '0.2rem 0.45rem', flexShrink: 0,
        }}>
          {oc.icon} {oc.text}
        </div>
      )}
    </div>
  )
}

function TrophyCard({ award, earned }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      padding: '0.625rem 0.75rem',
      background: earned ? 'var(--card)' : 'var(--bg)',
      border: `1px solid ${earned ? '#f59e0b33' : 'var(--border)'}`,
      borderRadius: '0.625rem',
      opacity: earned ? 1 : 0.4,
      filter: earned ? 'none' : 'grayscale(1)',
    }}>
      <div style={{ fontSize: '1.3rem', flexShrink: 0, width: 28, textAlign: 'center' }}>
        {earned ? award.icon : '🔒'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: earned ? 'var(--text)' : 'var(--muted)', lineHeight: 1.2 }}>{award.name}</div>
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginTop: '0.15rem', lineHeight: 1.3 }}>{award.desc}</div>
      </div>
      {earned && (
        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>✓</div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserProfile({ user, onClose, onSignOut }) {
  const [profile,     setProfile]     = useState(null)
  const [results,     setResults]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState('')
  const [rivals,      setRivals]      = useState([])
  const [cabinetShared, setCabinetShared] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchProfile(user.id).then(({ profile, results }) => {
      setProfile(profile)
      setResults(results)
      setNameInput(profile?.display_name ?? '')
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    async function loadRivals() {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb
        .from('h2h_results')
        .select('*')
        .or(`winner_id.eq.${user.id},loser_id.eq.${user.id}`)
        .order('played_at', { ascending: false })
      if (!data) return
      const rivalMap = {}
      for (const r of data) {
        const iWon   = r.winner_id === user.id
        const oppId  = iWon ? r.loser_id   : r.winner_id
        const oppName = iWon ? r.loser_name : r.winner_name
        if (!rivalMap[oppId]) rivalMap[oppId] = { name: oppName, wins: 0, losses: 0 }
        if (iWon) rivalMap[oppId].wins++
        else      rivalMap[oppId].losses++
      }
      setRivals(Object.values(rivalMap).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))
    }
    loadRivals()
  }, [user])

  async function saveName() {
    const sb = await getSupabase()
    await sb?.from('profiles').update({ display_name: nameInput }).eq('id', user.id)
    setProfile(p => ({ ...p, display_name: nameInput }))
    setEditingName(false)
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalSeasons   = profile?.total_games  ?? 0
  const totalWins      = profile?.total_wins   ?? 0
  const totalLosses    = profile?.total_losses ?? 0
  const bestSeasonWins = profile?.best_streak  ?? 0
  const totalMatches   = totalWins + totalLosses
  const overallWinPct  = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0

  const iplResults     = results.filter(r => r.mode === 'ipl')
  const wcResults      = results.filter(r => r.mode !== 'ipl')
  const iplTitles      = iplResults.filter(r => r.ipl_outcome === 'champion').length
  const wcTitles       = wcResults.filter(r => r.stage_reached === 'Champion').length
  const perfectSeasons = results.filter(r => r.perfect).length
  const playoffApps    = iplResults.filter(r => r.ipl_outcome && r.ipl_outcome !== 'not_qualified').length

  const sortedByBest = [...results].sort((a, b) => rankOutcome(a) - rankOutcome(b) || b.wins - a.wins)
  const bestSeason   = sortedByBest[0] ?? null
  const worstSeason  = sortedByBest[sortedByBest.length - 1] ?? null

  const { streak: loginStreak } = getStreakData()

  // Local awards (stored in localStorage, not Supabase)
  const localProfile  = loadProfile()
  const earnedIds     = new Set(localProfile.awards ?? [])
  const earnedAwards  = AWARDS.filter(a => earnedIds.has(a.id))
  const lockedAwards  = AWARDS.filter(a => !earnedIds.has(a.id))

  const MILESTONES = [
    { count: 1,   icon: '🏏', label: 'First Season' },
    { count: 5,   icon: '📅', label: '5 Seasons' },
    { count: 10,  icon: '🎯', label: '10 Seasons' },
    { count: 25,  icon: '⭐', label: '25 Seasons' },
    { count: 50,  icon: '🏆', label: '50 Seasons' },
    { count: 100, icon: '💯', label: '100 Seasons' },
  ]

  const initial = (profile?.display_name || user?.email || '?')[0].toUpperCase()
  const titlesTotal = iplTitles + wcTitles

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'var(--bg)',
      overflowY: 'auto',
      animation: 'fade-in 0.2s ease both',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.25rem 1rem 5rem' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
          >
            ← Back
          </button>
          <button
            onClick={onSignOut}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '0.4rem', color: 'var(--muted)',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              padding: '0.3rem 0.65rem', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            Sign out
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', paddingTop: '4rem' }}>Loading...</div>
        ) : (
          <>
            {/* ── Avatar + Name ────────────────────────────────────────────── */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#C8102E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.75rem', fontWeight: 900, color: '#fff',
                margin: '0 auto 0.875rem',
                boxShadow: '0 0 24px #4169E144',
              }}>
                {initial}
              </div>

              {editingName ? (
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    autoFocus
                    style={{ padding: '0.4rem 0.75rem', background: 'var(--bg)', border: '1px solid #4169E1', borderRadius: '0.4rem', color: 'var(--text)', fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}
                  />
                  <button onClick={saveName} style={{ background: '#4169E1', border: 'none', borderRadius: '0.4rem', color: '#fff', fontWeight: 800, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: 'var(--muted)', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>
                    {profile?.display_name || user?.email?.split('@')[0]}
                  </div>
                  <button
                    onClick={() => setEditingName(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                    title="Edit name"
                  >✏️</button>
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{user?.email}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                Manager since {new Date(user?.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* ── Career Overview ──────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Career Overview" icon="📊" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <StatCard label="Seasons" value={totalSeasons} />
                <StatCard label="All-Time Wins" value={totalWins} color="#4169E1" />
                <StatCard label="Win Rate" value={`${overallWinPct}%`} color={overallWinPct >= 60 ? '#f59e0b' : 'var(--text)'} />
                <StatCard
                  label="Best Season"
                  value={`${bestSeasonWins}W`}
                  color="#f59e0b"
                  sub="wins in one run"
                />
                <StatCard
                  label="Titles"
                  value={titlesTotal || '—'}
                  color={titlesTotal > 0 ? '#f59e0b' : 'var(--muted)'}
                  sub={
                    iplTitles > 0 && wcTitles > 0 ? `${iplTitles} IPL · ${wcTitles} WC`
                    : iplTitles > 0 ? `${iplTitles} IPL 🏏`
                    : wcTitles > 0 ? `${wcTitles} WC 🌍`
                    : 'yet to win one'
                  }
                />
                <StatCard
                  label="Perfect"
                  value={perfectSeasons || '—'}
                  color={perfectSeasons > 0 ? '#f59e0b' : 'var(--muted)'}
                  sub="zero-loss seasons"
                />
              </div>
            </div>

            {/* ── Highlights ───────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Highlights" icon="⚡" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <HighlightCard
                  icon="🔥"
                  value={loginStreak}
                  label="day streak"
                  desc="Consecutive days opening the app"
                  color={loginStreak >= 7 ? '#f59e0b' : loginStreak >= 3 ? '#fb923c' : 'var(--text)'}
                />
                <HighlightCard
                  icon="🏏"
                  value={playoffApps}
                  label="playoff runs"
                  desc="IPL playoff appearances (last 20)"
                  color={playoffApps >= 5 ? '#f59e0b' : '#4169E1'}
                />
                <HighlightCard
                  icon="🎯"
                  value={bestSeasonWins}
                  label="best season"
                  desc="Most wins in a single season"
                  color={bestSeasonWins >= 12 ? '#f59e0b' : 'var(--text)'}
                />
                <HighlightCard
                  icon="✨"
                  value={perfectSeasons}
                  label="perfect seasons"
                  desc="Completed without a single loss"
                  color={perfectSeasons > 0 ? '#f59e0b' : 'var(--muted)'}
                />
              </div>
            </div>

            {/* ── Season Milestones ────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Season Milestones" icon="🎖️" />
              <div style={{
                display: 'flex', gap: '0.625rem', overflowX: 'auto',
                paddingBottom: '0.5rem', scrollbarWidth: 'none',
              }}>
                {MILESTONES.map(m => (
                  <MilestoneBadge
                    key={m.count}
                    icon={m.icon}
                    label={m.label}
                    count={m.count}
                    unlocked={totalSeasons >= m.count}
                  />
                ))}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.5rem', textAlign: 'center' }}>
                {totalSeasons} season{totalSeasons !== 1 ? 's' : ''} played
                {MILESTONES.find(m => m.count > totalSeasons) &&
                  ` · ${MILESTONES.find(m => m.count > totalSeasons).count - totalSeasons} more for next badge`}
              </div>
            </div>

            {/* ── Best & Worst Season ──────────────────────────────────────── */}
            {results.length > 0 && (
              <div style={{ marginBottom: '1.75rem' }}>
                <SectionHeader title="Best & Worst Season" icon="📈" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <BestWorstCard result={bestSeason}  type="best" />
                  <BestWorstCard result={worstSeason} type="worst" />
                </div>
              </div>
            )}

            {/* ── Trophy Cabinet ───────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.9rem' }}>🏆</span>
                <div style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Trophy Cabinet · {earnedAwards.length} / {AWARDS.length}
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: '0.25rem' }} />
                {earnedAwards.length > 0 && (
                  <button
                    onClick={() => {
                      const text = `🏆 My Cricket 38-0 Cabinet: ${earnedAwards.map(a => `${a.icon} ${a.name}`).join(' · ')}\n16zero.in`
                      if (navigator.share) {
                        navigator.share({ text }).catch(() => {})
                      } else {
                        navigator.clipboard.writeText(text).then(() => { setCabinetShared(true); setTimeout(() => setCabinetShared(false), 2000) })
                      }
                    }}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      borderRadius: '0.4rem', color: cabinetShared ? '#22c55e' : 'var(--muted)',
                      fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
                      padding: '0.2rem 0.5rem', flexShrink: 0,
                      transition: 'color 0.15s, border-color 0.15s',
                      borderColor: cabinetShared ? '#22c55e55' : undefined,
                    }}
                  >
                    {cabinetShared ? '✅ Copied!' : '↗ Share'}
                  </button>
                )}
              </div>
              {earnedAwards.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '1.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.82rem',
                }}>
                  No trophies yet — win your first IPL or World Cup to start collecting.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  {earnedAwards.map(a => <TrophyCard key={a.id} award={a} earned />)}
                </div>
              )}
              {lockedAwards.length > 0 && earnedAwards.length > 0 && (
                <details style={{ marginTop: '0.625rem' }}>
                  <summary style={{ fontSize: '0.65rem', color: 'var(--muted)', cursor: 'pointer', fontWeight: 600, padding: '0.25rem 0', userSelect: 'none' }}>
                    +{lockedAwards.length} locked {lockedAwards.length === 1 ? 'trophy' : 'trophies'} to discover
                  </summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem' }}>
                    {lockedAwards.map(a => <TrophyCard key={a.id} award={a} earned={false} />)}
                  </div>
                </details>
              )}
              {earnedAwards.length === 0 && lockedAwards.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.75rem' }}>
                  {lockedAwards.slice(0, 4).map(a => <TrophyCard key={a.id} award={a} earned={false} />)}
                </div>
              )}
            </div>

            {/* ── Rivals ──────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Multiplayer Rivals" icon="⚔️" />
              {rivals.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '1.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.82rem',
                }}>
                  No multiplayer matches yet — play an H2H draft to see your rivals here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {rivals.map((r, i) => {
                    const total = r.wins + r.losses
                    const winPct = total > 0 ? Math.round((r.wins / total) * 100) : 0
                    const leading = r.wins > r.losses
                    const behind  = r.losses > r.wins
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.625rem 0.875rem',
                        background: 'var(--card)', borderRadius: '0.625rem',
                        border: `1px solid ${leading ? '#4169E144' : behind ? '#ef444433' : 'var(--border)'}`,
                      }}>
                        <div style={{ fontSize: '0.9rem', flexShrink: 0 }}>⚔️</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)' }}>{r.name}</div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                            {total} match{total !== 1 ? 'es' : ''} · {winPct}% win rate
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 900, lineHeight: 1 }}>
                            <span style={{ color: '#4169E1' }}>{r.wins}W</span>
                            <span style={{ color: 'var(--text-dim)', margin: '0 0.2rem' }}>–</span>
                            <span style={{ color: '#ef4444' }}>{r.losses}L</span>
                          </div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, marginTop: '0.2rem', color: leading ? '#22c55e' : behind ? '#ef4444' : 'var(--muted)' }}>
                            {leading ? 'You lead' : behind ? 'They lead' : 'Even'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Recent Seasons ───────────────────────────────────────────── */}
            <div>
              <SectionHeader
                title={`Recent Seasons${results.length > 0 ? ` (last ${results.length})` : ''}`}
                icon="📋"
              />
              {results.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '2.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.85rem',
                }}>
                  No seasons yet — play a run to see your history here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
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
