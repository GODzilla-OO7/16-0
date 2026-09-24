import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]
  return c
}

function getAnonId() {
  let id = localStorage.getItem('live_cup_anon_id')
  if (!id) { id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; localStorage.setItem('live_cup_anon_id', id) }
  return id
}

function saveSession(roomId, code, mode) {
  try { sessionStorage.setItem('fcup_session', JSON.stringify({ roomId, code, mode })) } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('fcup_session') ?? 'null') } catch { return null }
}
function clearSession() {
  try { sessionStorage.removeItem('fcup_session') } catch {}
}

function stageRank(s) {
  if (!s) return 0
  const m = { 'Champion': 6, 'Finalist': 5, 'Semi-Finalist': 4, 'Quarter-Finalist': 3, 'Group Stage': 2, 'League Stage': 1 }
  for (const [k, v] of Object.entries(m)) if (s.includes(k)) return v
  return 0
}

function weekKey() {
  // Not needed here but handy
}

// ─── Shared UI bits ───────────────────────────────────────────────────────────

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

// ─── Stage label helper ───────────────────────────────────────────────────────
function stageLabel(r) {
  if (r.ipl_outcome === 'Champion') return '🏆 Champion'
  if (r.ipl_outcome === 'Finalist') return '🥈 Finalist'
  if (r.ipl_outcome) return r.ipl_outcome
  if (r.stage_reached) return r.stage_reached
  return `${r.wins}W-${r.losses}L`
}

// ─── Playoff bracket (top 4 by wins, then stage, then losses) ────────────────
function buildBracket(results) {
  const sorted = [...results].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (stageRank(b.stage_reached) !== stageRank(a.stage_reached)) return stageRank(b.stage_reached) - stageRank(a.stage_reached)
    return a.losses - b.losses
  })
  const top4 = sorted.slice(0, 4)
  if (top4.length < 2) return null
  // S1: #1 vs #4, S2: #2 vs #3, Final: winners
  const s1winner = top4[0]  // higher seed always advances in this simple model
  const s2winner = top4[1]
  return {
    semi1: { a: top4[0], b: top4[3] ?? null, winner: s1winner },
    semi2: { a: top4[1], b: top4[2] ?? null, winner: s2winner },
    final: { a: s1winner, b: s2winner, winner: s1winner },  // #1 seed wins
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FriendsCup({ user, onStartSeason, onHome }) {
  const [savedSession] = useState(() => loadSession())
  const [phase, setPhase] = useState(() => savedSession ? 'lobby' : 'entry')
  const [myId]           = useState(() => user?.id ?? getAnonId())
  const [nameInput, setNameInput] = useState(() => localStorage.getItem('live_cup_display_name') || user?.email?.split('@')[0] || '')
  const [joinCode, setJoinCode]   = useState('')
  const [joinError, setJoinError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [room, setRoom]       = useState(null)
  const [players, setPlayers] = useState([])  // from friends_cup_results
  const [myResult, setMyResult] = useState(null)

  const isMobile = window.innerWidth <= 640
  const subRef = useRef([])

  useEffect(() => {
    if (savedSession?.roomId) subscribeToRoom(savedSession.roomId)
    return () => subRef.current.forEach(s => { try { s.unsubscribe() } catch {} })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribeToRoom = useCallback(async (roomId) => {
    const sb = await getSupabase()
    if (!sb) return

    async function loadRoom() {
      const { data } = await sb.from('friends_cup_rooms').select('*').eq('id', roomId).single()
      if (data) setRoom(data)
    }
    async function loadResults() {
      const { data } = await sb.from('friends_cup_results').select('*').eq('room_id', roomId).order('wins', { ascending: false })
      if (data) {
        setPlayers(data)
        const mine = data.find(r => r.player_id === myId)
        if (mine) setMyResult(mine)
      }
    }

    await Promise.all([loadRoom(), loadResults()])

    const resSub = sb.channel(`fcup_results_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends_cup_results', filter: `room_id=eq.${roomId}` },
        () => loadResults())
      .subscribe()

    subRef.current = [resSub]
  }, [myId])

  // ── Create room ──────────────────────────────────────────────────────────────
  async function handleCreate() {
    const name = nameInput.trim()
    if (!name) return
    setIsCreating(true)
    try {
      const sb = await getSupabase()
      if (!sb) throw new Error('No connection')
      let code, attempt = 0
      do {
        code = genCode()
        const { data } = await sb.from('friends_cup_rooms').select('id').eq('code', code).maybeSingle()
        if (!data) break
      } while (++attempt < 5)

      const { data: roomData, error } = await sb.from('friends_cup_rooms').insert({ code, host_id: myId, mode: 'ipl' }).select().single()
      if (error) throw error

      // Reserve a spot (without result yet)
      await sb.from('friends_cup_results').upsert({ room_id: roomData.id, player_id: myId, display_name: name, wins: 0, losses: 0 }, { onConflict: 'room_id,player_id' })

      localStorage.setItem('live_cup_display_name', name)
      setRoom(roomData)
      saveSession(roomData.id, roomData.code, roomData.mode)
      await subscribeToRoom(roomData.id)
      setPhase('lobby')
    } catch (e) { console.error(e) }
    finally { setIsCreating(false) }
  }

  // ── Join room ────────────────────────────────────────────────────────────────
  async function handleJoin() {
    const name = nameInput.trim()
    const code = joinCode.trim().toUpperCase()
    if (!name || !code) return
    setJoinError('')
    const sb = await getSupabase()
    if (!sb) { setJoinError('No connection'); return }

    const { data: roomData } = await sb.from('friends_cup_rooms').select('*').eq('code', code).maybeSingle()
    if (!roomData) { setJoinError('Room not found.'); return }

    await sb.from('friends_cup_results').upsert({ room_id: roomData.id, player_id: myId, display_name: name, wins: 0, losses: 0 }, { onConflict: 'room_id,player_id' })

    localStorage.setItem('live_cup_display_name', name)
    setRoom(roomData)
    saveSession(roomData.id, roomData.code, roomData.mode)
    await subscribeToRoom(roomData.id)
    setPhase('lobby')
  }

  // ── Start season ─────────────────────────────────────────────────────────────
  function handlePlaySeason() {
    const roomId   = room?.id   ?? savedSession?.roomId
    const roomMode = room?.mode ?? savedSession?.mode ?? 'ipl'
    const name     = nameInput.trim() || localStorage.getItem('live_cup_display_name') || 'Player'
    clearSession()  // will be set again when we return
    onStartSeason({ roomId, playerId: myId, displayName: name }, roomMode)
  }

  // ── Called by App.jsx after sim completes ────────────────────────────────────
  // (called via the friendsCupCtx mechanism in App.jsx)

  // ── Wrap ─────────────────────────────────────────────────────────────────────
  const wrap = (content) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '1.25rem 1rem' : '2rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={onHome} style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}>← Home</button>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>👥 Friends Cup</div>
        </div>
        {content}
      </div>
    </div>
  )

  // ── Entry ────────────────────────────────────────────────────────────────────
  if (phase === 'entry') return wrap(<>
    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: isMobile ? '1.8rem' : '2.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.35rem' }}>👥 Friends Cup</div>
      <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Private cup with your mates. Everyone sims their own season — highest W-L wins.</div>
    </div>

    <Card style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Your name</div>
      <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="e.g. Aryaman" maxLength={24}
        style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
    </Card>

    <Card style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>🏠 Create a room</div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>Share the 6-letter code with friends.</div>
      <PrimaryBtn onClick={handleCreate} disabled={!nameInput.trim() || isCreating} style={{ width: '100%' }}>
        {isCreating ? 'Creating…' : 'Create Room →'}
      </PrimaryBtn>
    </Card>

    <Card>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>🔗 Join a room</div>
      <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setJoinError('') }}
        placeholder="6-letter code" maxLength={6}
        style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: `1px solid ${joinError ? '#ef4444' : 'rgba(255,255,255,0.12)'}`, borderRadius: '0.5rem', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.5rem' }} />
      {joinError && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: '0.5rem' }}>{joinError}</div>}
      <PrimaryBtn onClick={handleJoin} disabled={!nameInput.trim() || joinCode.length < 6} style={{ width: '100%' }}>Join Room →</PrimaryBtn>
    </Card>
  </>)

  // ── Lobby / results ───────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const roomCode   = room?.code ?? savedSession?.code ?? '……'
    const haveResult = !!myResult?.stage_reached || (myResult?.wins > 0 || myResult?.losses > 0)
    const bracket    = players.length >= 2 ? buildBracket(players.filter(p => p.stage_reached || p.wins > 0 || p.losses > 0)) : null
    const anyResults = players.some(p => p.stage_reached || p.wins > 0)

    return wrap(<>
      <Card style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Room Code</div>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '0.18em', marginBottom: '0.25rem' }}>{roomCode}</div>
        <button onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#fcup=${roomCode}`) } catch {} }}
          style={{ fontSize: '0.72rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
          📋 Copy invite link
        </button>
      </Card>

      {/* Leaderboard */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.75rem' }}>
          📊 Standings ({players.length} player{players.length !== 1 ? 's' : ''})
        </div>
        {players.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: '#475569', textAlign: 'center', padding: '0.875rem' }}>Waiting for players…</div>
        ) : (
          players
            .slice()
            .sort((a, b) => {
              if (b.wins !== a.wins) return b.wins - a.wins
              return stageRank(b.stage_reached) - stageRank(a.stage_reached)
            })
            .map((p, idx) => (
              <div key={p.player_id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0.75rem', marginBottom: '0.3rem',
                background: p.player_id === myId ? 'rgba(200,16,46,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${p.player_id === myId ? 'rgba(200,16,46,0.25)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: '0.5rem',
              }}>
                <div style={{ width: 24, textAlign: 'center', fontWeight: 800, color: idx < 4 ? '#22c55e' : '#64748b', fontSize: '0.75rem' }}>
                  {idx < 4 ? `Q${idx + 1}` : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.display_name}{p.player_id === myId ? ' ★' : ''}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{stageLabel(p)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {(p.stage_reached || p.wins > 0) ? (
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#22c55e' }}>{p.wins}W-{p.losses}L</div>
                  ) : (
                    <div style={{ fontSize: '0.68rem', color: '#475569' }}>Not played</div>
                  )}
                </div>
              </div>
            ))
        )}
      </Card>

      {/* Playoff bracket if ≥ 4 results in */}
      {bracket && anyResults && (
        <Card style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.75rem' }}>🏆 Playoff Bracket</div>
          {[
            { label: 'Semi-Final 1', m: bracket.semi1 },
            { label: 'Semi-Final 2', m: bracket.semi2 },
            { label: 'Final',        m: bracket.final  },
          ].map(({ label, m }) => m.b ? (
            <div key={label} style={{ marginBottom: '0.625rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 800, color: m.winner.player_id === m.a.player_id ? '#22c55e' : 'var(--text)' }}>{m.a.display_name}</span>
                <span style={{ color: '#475569' }}>vs</span>
                <span style={{ fontWeight: 800, color: m.winner.player_id === m.b.player_id ? '#22c55e' : 'var(--text)' }}>{m.b.display_name}</span>
                <span style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 800 }}>→ {m.winner.display_name}</span>
              </div>
            </div>
          ) : null)}
        </Card>
      )}

      {/* Play / replay button */}
      {!haveResult ? (
        <PrimaryBtn onClick={handlePlaySeason} style={{ width: '100%', marginBottom: '0.5rem' }}>
          🏏 Play My Season →
        </PrimaryBtn>
      ) : (
        <>
          <div style={{ padding: '0.75rem', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '0.625rem', textAlign: 'center', marginBottom: '0.625rem', fontSize: '0.82rem', color: '#22c55e', fontWeight: 800 }}>
            ✓ {myResult.wins}W-{myResult.losses}L submitted · {stageLabel(myResult)}
          </div>
          <GhostBtn onClick={handlePlaySeason} style={{ width: '100%' }}>🔄 Play Again (replaces your result)</GhostBtn>
        </>
      )}
    </>)
  }

  return null
}
