import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAnonId() {
  let id = localStorage.getItem('live_cup_anon_id')
  if (!id) { id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; localStorage.setItem('live_cup_anon_id', id) }
  return id
}

function currentWeekKey() {
  const d = new Date()
  // ISO week: Monday = day 1
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function stageRank(s) {
  if (!s) return 0
  const m = { 'Champion': 6, 'Finalist': 5, 'Semi-Finalist': 4, 'Quarter-Finalist': 3, 'Group Stage': 2, 'League Stage': 1 }
  for (const [k, v] of Object.entries(m)) if (s.includes(k)) return v
  return 0
}

const MODE_LABELS = { ipl: '🏏 IPL', 'odi-wc': '🌍 ODI WC', 't20-wc': '⚡ T20 WC' }
const MODES = ['ipl', 'odi-wc', 't20-wc']

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{ background: 'rgba(8,8,14,0.72)', border: '1.5px solid rgba(255,255,255,0.11)', borderRadius: '1rem', padding: '1.25rem', ...style }}>
    {children}
  </div>
)
const PrimaryBtn = ({ onClick, disabled, children, style }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '0.75rem 1.5rem', background: disabled ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#C8102E,#9b0e24)',
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: '0.625rem',
    fontSize: '0.9rem', fontWeight: 800, cursor: disabled ? 'default' : 'pointer', ...style,
  }}>{children}</button>
)
const GhostBtn = ({ onClick, children, style }) => (
  <button onClick={onClick} style={{
    padding: '0.5rem 1rem', background: 'none', color: 'rgba(255,255,255,0.45)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', ...style,
  }}>{children}</button>
)

function stageLabel(r) {
  if (r.ipl_outcome === 'Champion') return '🏆 Champion'
  if (r.ipl_outcome === 'Finalist') return '🥈 Finalist'
  if (r.ipl_outcome) return r.ipl_outcome
  if (r.stage_reached) return r.stage_reached
  return `${r.wins}W-${r.losses}L`
}

function Rank({ n }) {
  if (n === 1) return <span style={{ fontSize: '1rem' }}>🥇</span>
  if (n === 2) return <span style={{ fontSize: '1rem' }}>🥈</span>
  if (n === 3) return <span style={{ fontSize: '1rem' }}>🥉</span>
  return <span style={{ fontWeight: 800, color: '#64748b', fontSize: '0.75rem' }}>#{n}</span>
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function WeeklyCup({ user, onStartSeason, onHome }) {
  const weekKey = currentWeekKey()
  const [myId]    = useState(() => user?.id ?? getAnonId())
  const [nameInput, setNameInput] = useState(() => localStorage.getItem('live_cup_display_name') || user?.email?.split('@')[0] || '')
  const [selectedMode, setSelectedMode] = useState('ipl')
  const [leaderboard, setLeaderboard]   = useState([])
  const [myEntry,   setMyEntry]   = useState(null)
  const [loading,  setLoading]    = useState(true)
  const [filterMode, setFilterMode] = useState('all')  // 'all' | mode key
  const subRef = useRef(null)

  const loadLeaderboard = useCallback(async () => {
    const sb = await getSupabase()
    if (!sb) return
    const { data } = await sb.from('weekly_cup_entries')
      .select('*')
      .eq('week_key', weekKey)
      .order('wins', { ascending: false })
      .order('total', { ascending: false })
      .limit(100)
    if (data) {
      setLeaderboard(data)
      const mine = data.find(e => e.player_id === myId)
      if (mine) setMyEntry(mine)
    }
    setLoading(false)
  }, [myId, weekKey])

  useEffect(() => {
    loadLeaderboard()

    let sub = null
    getSupabase().then(sb => {
      if (!sb) return
      sub = sb.channel('weekly_cup_lb')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_cup_entries', filter: `week_key=eq.${weekKey}` },
          () => loadLeaderboard())
        .subscribe()
      subRef.current = sub
    })
    return () => { if (subRef.current) { try { subRef.current.unsubscribe() } catch {} } }
  }, [loadLeaderboard, weekKey])

  function handlePlay() {
    const name = nameInput.trim()
    if (!name) return
    localStorage.setItem('live_cup_display_name', name)
    // Store context in sessionStorage so WeeklyCup can pick it up after sim
    try {
      sessionStorage.setItem('wcup_pending', JSON.stringify({ playerId: myId, displayName: name, mode: selectedMode, weekKey }))
    } catch {}
    onStartSeason({ playerId: myId, displayName: name, weekKey }, selectedMode)
  }

  const wrap = (content) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: window.innerWidth <= 640 ? '1.25rem 1rem' : '2rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={onHome} style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}>← Home</button>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>🏅 Weekly Cup</div>
          <div style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, color: '#475569', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.35rem' }}>{weekKey}</div>
        </div>
        {content}
      </div>
    </div>
  )

  const filtered = filterMode === 'all' ? leaderboard : leaderboard.filter(e => e.mode === filterMode)

  return wrap(<>
    <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
      <div style={{ fontSize: window.innerWidth <= 640 ? '1.8rem' : '2.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.25rem' }}>🏅 Weekly Cup</div>
      <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Global leaderboard — new week, fresh start. Anyone can play.</div>
    </div>

    {/* Play section */}
    <Card style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.75rem' }}>🏏 Play This Week</div>

      <div style={{ marginBottom: '0.625rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>Your name</div>
        <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="e.g. Aryaman" maxLength={24}
          style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: 'var(--text)', fontSize: '0.88rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>Mode</div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {MODES.map(m => (
            <button key={m} onClick={() => setSelectedMode(m)}
              style={{
                flex: 1, padding: '0.45rem 0.25rem', borderRadius: '0.5rem', border: `1.5px solid ${selectedMode === m ? '#C8102E' : 'rgba(255,255,255,0.1)'}`,
                background: selectedMode === m ? 'rgba(200,16,46,0.1)' : 'rgba(255,255,255,0.03)',
                color: selectedMode === m ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
              }}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {myEntry ? (
        <div style={{ marginBottom: '0.625rem' }}>
          <div style={{ padding: '0.625rem 0.75rem', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#22c55e', fontWeight: 800, marginBottom: '0.5rem' }}>
            ✓ You submitted: {myEntry.wins}W-{myEntry.losses}L ({stageLabel(myEntry)})
          </div>
          <GhostBtn onClick={handlePlay} disabled={!nameInput.trim()} style={{ width: '100%' }}>🔄 Play Again (replaces your best result)</GhostBtn>
        </div>
      ) : (
        <PrimaryBtn onClick={handlePlay} disabled={!nameInput.trim()} style={{ width: '100%' }}>
          Play & Submit →
        </PrimaryBtn>
      )}
    </Card>

    {/* Leaderboard */}
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)' }}>📊 Leaderboard</div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {['all', ...MODES].map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              style={{
                padding: '0.2rem 0.45rem', borderRadius: '0.35rem', border: `1px solid ${filterMode === m ? '#C8102E' : 'rgba(255,255,255,0.1)'}`,
                background: filterMode === m ? 'rgba(200,16,46,0.1)' : 'none',
                color: filterMode === m ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer',
              }}>
              {m === 'all' ? 'All' : MODE_LABELS[m].split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.82rem' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.82rem' }}>
          No entries yet this week. Be the first! 🏆
        </div>
      ) : (
        filtered
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins
            if (stageRank(b.stage_reached) !== stageRank(a.stage_reached)) return stageRank(b.stage_reached) - stageRank(a.stage_reached)
            return a.losses - b.losses
          })
          .map((entry, idx) => (
            <div key={entry.id ?? entry.player_id + entry.mode} style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.5rem 0.625rem', marginBottom: '0.3rem',
              background: entry.player_id === myId ? 'rgba(200,16,46,0.07)' : 'rgba(255,255,255,0.025)',
              border: `1px solid ${entry.player_id === myId ? 'rgba(200,16,46,0.2)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: '0.5rem',
            }}>
              <div style={{ width: 26, textAlign: 'center', flexShrink: 0 }}><Rank n={idx + 1} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.display_name}{entry.player_id === myId ? ' ★' : ''}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
                  {MODE_LABELS[entry.mode] ?? entry.mode} · {stageLabel(entry)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#22c55e' }}>{entry.wins}W</div>
                <div style={{ fontSize: '0.62rem', color: '#475569' }}>{entry.losses}L</div>
              </div>
            </div>
          ))
      )}
    </Card>
  </>)
}
