/**
 * H2H Lobby — room creation, joining, mode selection, composition, and draft coordination.
 *
 * Supabase tables needed (run once in Supabase SQL editor):
 *
 *   create table h2h_rooms (
 *     id text primary key,
 *     host_id text not null,
 *     guest_id text,
 *     host_name text,
 *     guest_name text,
 *     draft_mode text default 'snake',   -- 'snake' | 'auction'
 *     league_mode text default 'classic',-- 'classic' | 'shared'
 *     status text default 'waiting',     -- 'waiting' | 'composition' | 'drafting' | 'simulating' | 'done'
 *     current_turn text,                 -- user_id whose turn it is
 *     host_team jsonb default '[]',
 *     guest_team jsonb default '[]',
 *     host_budget int default 80,
 *     guest_budget int default 80,
 *     current_pick jsonb,                -- { entry, player } for auction, null between turns
 *     auction_bid jsonb,                 -- { host: N, guest: N, deadline: iso }
 *     pick_number int default 0,
 *     tournament jsonb,                  -- shared league state
 *     host_comp int default 5,           -- composition slider 0-10 (0=bowling,10=batting)
 *     guest_comp int default 5,
 *     host_comp_ready bool default false,
 *     guest_comp_ready bool default false,
 *     created_at timestamptz default now()
 *   );
 *
 *   -- Run these in Supabase SQL editor if you created the table before this was added:
 *   -- alter table h2h_rooms add column if not exists league_mode text default 'classic';
 *   -- alter table h2h_rooms add column if not exists tournament jsonb;
 *   -- alter table h2h_rooms add column if not exists host_comp int default 5;
 *   -- alter table h2h_rooms add column if not exists guest_comp int default 5;
 *   -- alter table h2h_rooms add column if not exists host_comp_ready bool default false;
 *   -- alter table h2h_rooms add column if not exists guest_comp_ready bool default false;
 *   alter table h2h_rooms enable row level security;
 *   create policy "anyone can read" on h2h_rooms for select using (true);
 *   create policy "anyone can insert" on h2h_rooms for insert with check (true);
 *   create policy "anyone can update" on h2h_rooms for update using (true);
 *
 *   create table h2h_results (
 *     id bigint generated always as identity primary key,
 *     room_id text,
 *     winner_id text,
 *     loser_id text,
 *     winner_name text,
 *     loser_name text,
 *     played_at timestamptz default now()
 *   );
 *   alter table h2h_results enable row level security;
 *   create policy "anyone can read" on h2h_results for select using (true);
 *   create policy "anyone can insert" on h2h_results for insert with check (true);
 */

import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '../lib/supabase.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function genUserId() {
  return 'u_' + Math.random().toString(36).slice(2, 10)
}

function getUserId() {
  let id = sessionStorage.getItem('h2h_uid')
  if (!id) { id = genUserId(); sessionStorage.setItem('h2h_uid', id) }
  return id
}

function getUserName() {
  return sessionStorage.getItem('h2h_name') || 'Player'
}

// ─── Composition helpers ──────────────────────────────────────────────────────

export function compFromSlider(v) {
  // v = 0 (bowling heavy) → 10 (batting heavy); returns role quotas for 11-player squad
  if (v <= 1)  return { label: 'Bowling Heavy',   emoji: '🎯', batters: 3, ar: 2, bowlers: 5, wk: 1 }
  if (v <= 3)  return { label: 'Bowling Leaning', emoji: '🏏', batters: 4, ar: 1, bowlers: 5, wk: 1 }
  if (v <= 6)  return { label: 'Balanced',        emoji: '⚖️', batters: 4, ar: 2, bowlers: 4, wk: 1 }
  if (v <= 8)  return { label: 'Batting Leaning', emoji: '🔥', batters: 5, ar: 2, bowlers: 3, wk: 1 }
  return              { label: 'Batting Heavy',   emoji: '💥', batters: 5, ar: 3, bowlers: 2, wk: 1 }
}

const BATTING_ROLES  = new Set(['opener', 'top-order', 'middle-order'])
const BOWLING_ROLES  = new Set(['pace-bowler', 'spin-bowler'])
const AR_ROLES       = new Set(['all-rounder'])
const WK_ROLES       = new Set(['wicket-keeper'])

export function roleGroup(role) {
  if (BATTING_ROLES.has(role))  return 'batter'
  if (BOWLING_ROLES.has(role))  return 'bowler'
  if (AR_ROLES.has(role))       return 'ar'
  if (WK_ROLES.has(role))       return 'wk'
  return 'batter'
}

// ─── Composition Slider Component ─────────────────────────────────────────────

function CompSlider({ value, onChange, disabled }) {
  const trackRef = useRef(null)

  function getVal(clientX) {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(fraction * 10)
  }

  function startDrag(e) {
    if (disabled) return
    e.preventDefault()
    const onMove = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      onChange(getVal(cx))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  function onTrackClick(e) {
    if (disabled) return
    onChange(getVal(e.clientX))
  }

  const comp   = compFromSlider(value)
  const pctStr = `${(value / 10 * 100).toFixed(1)}%`

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>🎯 Bowling</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#f59e0b' }}>{comp.emoji} {comp.label}</span>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>Batting 🔥</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 8, background: 'var(--border2)', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', margin: '1.25rem 0 0.5rem' }}
        onMouseDown={e => { startDrag(e); onTrackClick(e) }}
      >
        <div style={{ position: 'absolute', left: 0, width: pctStr, top: 0, bottom: 0, background: disabled ? '#4169E155' : '#4169E1', borderRadius: 4 }} />
        {/* Thumb */}
        <div
          style={{
            position: 'absolute', top: '50%', left: pctStr,
            width: 22, height: 22, borderRadius: '50%',
            background: disabled ? '#2a2a3a' : '#4169E1',
            border: '3px solid var(--bg)',
            transform: 'translate(-50%, -50%)',
            cursor: disabled ? 'default' : 'grab',
            boxShadow: disabled ? 'none' : '0 2px 8px #4169E155',
            transition: 'box-shadow 0.15s',
          }}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
        />
      </div>

      {/* Slot counts */}
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        {[
          { label: `${comp.batters} Batters`, color: '#f59e0b' },
          { label: `${comp.wk} WK`,          color: '#a78bfa' },
          { label: `${comp.ar} All-rounders`, color: '#22c55e' },
          { label: `${comp.bowlers} Bowlers`, color: '#ef4444' },
        ].map(pill => (
          <div key={pill.label} style={{ fontSize: '0.72rem', fontWeight: 800, color: pill.color, background: pill.color + '18', padding: '0.2rem 0.6rem', borderRadius: '999px', border: `1px solid ${pill.color}33` }}>
            {pill.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function H2HLobby({ onClose, onStartDraft }) {
  const [screen, setScreen]       = useState('home')   // home | join | waiting | composition
  const [roomId, setRoomId]       = useState('')
  const [joinCode, setJoinCode]   = useState('')
  const [room, setRoom]           = useState(null)
  const [myName, setMyName]       = useState(getUserName())
  const [nameSet, setNameSet]     = useState(!!sessionStorage.getItem('h2h_name'))
  const [myComp, setMyComp]       = useState(5)
  const [compReady, setCompReady] = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [draftMode,  setDraftMode]  = useState('auction')
  const leagueMode = 'shared'  // auction always uses shared tournament
  const channelRef = useRef(null)

  const uid = getUserId()
  const isHost  = room?.host_id  === uid
  const isGuest = room?.guest_id === uid

  // ── Real-time subscription to room state ──────────────────────────────────
  function applyRoomUpdate(data) {
    setRoom(data)
    if (data.status === 'composition' && screen !== 'composition') {
      setScreen('composition')
    }
    if (data.status === 'comp_ready' && screen !== 'comp_ready') {
      setScreen('comp_ready')
    }
    if (data.status === 'drafting') {
      onStartDraft(data, uid)
    }
  }

  function subscribeRoom(id) {
    getSupabase().then(sb => {
      if (!sb) return
      channelRef.current = sb
        .channel(`room_${id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'h2h_rooms', filter: `id=eq.${id}`,
        }, payload => applyRoomUpdate(payload.new))
        .subscribe()
    })
  }

  useEffect(() => () => channelRef.current?.unsubscribe(), [])

  // Polling fallback — in case Supabase Realtime isn't enabled for h2h_rooms
  useEffect(() => {
    if ((screen !== 'waiting' && screen !== 'composition' && screen !== 'comp_ready') || !roomId) return
    const interval = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', roomId).single()
      if (!data) return
      applyRoomUpdate(data)
      if (data.status === 'drafting') clearInterval(interval)
    }, 2500)
    return () => clearInterval(interval)
  }, [screen, roomId])

  // ── Create room ───────────────────────────────────────────────────────────
  async function createRoom() {
    setLoading(true); setError('')
    const sb = await getSupabase()
    if (!sb) { setError('No connection'); setLoading(false); return }
    const id = genRoomId()
    const { error: e } = await sb.from('h2h_rooms').insert({
      id, host_id: uid, host_name: myName, status: 'waiting', draft_mode: 'auction',
      league_mode: leagueMode,
      current_turn: uid, pick_number: 0, host_team: [], guest_team: [],
      host_budget: 100, guest_budget: 100,
      host_comp: 5, guest_comp: 5, host_comp_ready: false, guest_comp_ready: false,
    })
    if (e) { setError(e.message); setLoading(false); return }
    setRoomId(id)
    const { data } = await sb.from('h2h_rooms').select('*').eq('id', id).single()
    setRoom(data)
    subscribeRoom(id)
    setScreen('waiting')
    setLoading(false)
  }

  // ── Join room ─────────────────────────────────────────────────────────────
  async function joinRoom() {
    setLoading(true); setError('')
    const sb = await getSupabase()
    if (!sb) { setError('No connection'); setLoading(false); return }
    const code = joinCode.trim().toUpperCase()
    const { data: existing } = await sb.from('h2h_rooms').select('*').eq('id', code).single()
    if (!existing) { setError('Room not found'); setLoading(false); return }
    if (existing.status !== 'waiting') { setError('Room already started'); setLoading(false); return }
    if (existing.guest_id) { setError('Room is full'); setLoading(false); return }
    const { error: e } = await sb.from('h2h_rooms').update({ guest_id: uid, guest_name: myName }).eq('id', code)
    if (e) { setError(e.message); setLoading(false); return }
    const { data: updated } = await sb.from('h2h_rooms').select('*').eq('id', code).single()
    setRoom(updated)
    setRoomId(code)
    subscribeRoom(code)
    setScreen('waiting')
    setLoading(false)
  }

  // ── Host moves to composition screen ─────────────────────────────────────
  async function startComposition() {
    if (!room?.guest_id) { setError('Waiting for opponent to join'); return }
    const sb = await getSupabase()
    await sb.from('h2h_rooms').update({
      status: 'composition', draft_mode: draftMode,
      host_comp: 5, guest_comp: 5, host_comp_ready: false, guest_comp_ready: false,
    }).eq('id', roomId)
    setScreen('composition')
    setRoom(r => r ? { ...r, status: 'composition' } : r)
  }

  // ── Update my composition slider value ────────────────────────────────────
  async function updateMyComp(v) {
    setMyComp(v)
    if (!roomId) return
    const sb = await getSupabase()
    if (!sb) return
    const field = isHost ? 'host_comp' : 'guest_comp'
    await sb.from('h2h_rooms').update({ [field]: v }).eq('id', roomId)
  }

  // ── Lock in my composition choice ─────────────────────────────────────────
  async function confirmComposition() {
    setCompReady(true)
    const sb = await getSupabase()
    if (!sb) return
    const field = isHost ? 'host_comp_ready' : 'guest_comp_ready'
    const compField = isHost ? 'host_comp' : 'guest_comp'
    await sb.from('h2h_rooms').update({ [field]: true, [compField]: myComp }).eq('id', roomId)

    // If host and both are ready, move to comp_ready for the reveal step
    if (isHost) {
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', roomId).single()
      if (data?.guest_comp_ready) {
        await sb.from('h2h_rooms').update({ status: 'comp_ready' }).eq('id', roomId)
        setScreen('comp_ready')
        setRoom(r => r ? { ...r, status: 'comp_ready' } : r)
      }
    }
  }

  // ── Host starts the auction after composition reveal ──────────────────────
  async function startAuction() {
    const sb = await getSupabase()
    if (!sb) return
    await sb.from('h2h_rooms').update({ status: 'drafting' }).eq('id', roomId)
  }

  // Watch for both ready → comp_ready (host triggers it, guest watches via poll)
  useEffect(() => {
    if (!room || room.status !== 'composition') return
    if (!room.host_comp_ready || !room.guest_comp_ready || !isHost) return
    // Safety net for refresh race — push comp_ready if still stuck on composition
    getSupabase().then(async sb => {
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('status').eq('id', roomId).single()
      if (data?.status === 'composition') {
        await sb.from('h2h_rooms').update({ status: 'comp_ready' }).eq('id', roomId)
      }
    })
  }, [room?.host_comp_ready, room?.guest_comp_ready])

  // ── Name gate ─────────────────────────────────────────────────────────────
  function saveName() {
    if (!myName.trim()) return
    sessionStorage.setItem('h2h_name', myName.trim())
    setNameSet(true)
  }

  const inp = {
    width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'var(--text)',
    fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
  }

  // ── Full-page composition screen (Tasks 2 & 3) ───────────────────────────
  if (screen === 'composition' || screen === 'comp_ready') {
    const bothReady   = room?.host_comp_ready && room?.guest_comp_ready
    const oppCompVal  = isHost ? (room?.guest_comp ?? 5) : (room?.host_comp ?? 5)
    const oppReady    = isHost ? room?.guest_comp_ready  : room?.host_comp_ready
    const oppName     = isHost ? room?.guest_name        : room?.host_name
    const myName2     = isHost ? room?.host_name         : room?.guest_name
    const myCompData  = compFromSlider(myComp)
    const oppCompData = compFromSlider(oppCompVal)

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1.25rem' }}>
        {/* Header */}
        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.4rem' }}>⚖️ Team Composition</div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '2.5rem', textAlign: 'center', maxWidth: 480 }}>
          Pick your squad shape. You'll only be able to bid on players that fit your chosen slots.
        </div>

        {!bothReady ? (
          // ── Pre-reveal: my big card + opponent placeholder ──────────────
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* My card — full DraftSettings size */}
            <div style={{ background: 'var(--card)', border: `1px solid ${compReady ? '#22c55e66' : 'var(--border)'}`, borderRadius: '1.25rem', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: compReady ? '#22c55e' : '#4169E1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
                  Your Composition {compReady ? '· ✓ Locked' : ''}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>{myName2}</div>
              </div>
              <div style={{ padding: '1.1rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
                <CompSlider value={myComp} onChange={updateMyComp} disabled={compReady} />
              </div>
              <div style={{ padding: '1rem 1.75rem' }}>
                {!compReady
                  ? <button onClick={confirmComposition} style={{ width: '100%', padding: '0.875rem', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}>✓ Lock In Composition</button>
                  : <div style={{ padding: '0.75rem', background: '#0d1a0d', border: '1px solid #22c55e44', borderRadius: '0.625rem', color: '#86efac', fontSize: '0.88rem', fontWeight: 700, textAlign: 'center' }}>✓ Locked in — waiting for opponent…</div>
                }
              </div>
            </div>

            {/* Opponent placeholder */}
            <div style={{ background: 'var(--card)', border: `1px solid ${oppReady ? '#22c55e44' : 'var(--border)'}`, borderRadius: '1.25rem', padding: '1.25rem 1.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '1.6rem' }}>{oppReady ? '✅' : '⏳'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>{oppName}</div>
                <div style={{ fontSize: '0.75rem', color: oppReady ? '#86efac' : '#64748b', marginTop: '0.15rem' }}>
                  {oppReady ? 'Locked in — waiting for you to lock in' : 'Still selecting their composition…'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ── Post-reveal: both composition cards ─────────────────────────
          <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0 1rem' }}>
              <CompRevealCard name={myName2}  compData={myCompData}  isMe />
              <CompRevealCard name={oppName}  compData={oppCompData} isMe={false} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {isHost
                ? <button onClick={startAuction} style={{ padding: '1rem 3.5rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0a0a0f', border: 'none', borderRadius: '0.875rem', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px #f59e0b44' }}>🔨 Go to Auction →</button>
                : <div style={{ padding: '1rem 2rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', color: '#64748b', fontSize: '0.9rem', fontWeight: 700 }}>⏳ Waiting for host to start the auction…</div>
              }
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#0d0d16', border: '1px solid var(--border)',
        borderRadius: '1.25rem', padding: '1.75rem',
        animation: 'fade-in-up 0.25s ease both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#e2e8f0' }}>
            {screen === 'waiting'     ? '🔗 Room ' + roomId :
             screen === 'join'        ? '🚪 Join Room'      :
             screen === 'composition' ? '⚖️ Team Composition' : '⚔️ Head to Head'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Name gate */}
        {!nameSet && (
          <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#13131f', border: '1px solid #2a2a3a', borderRadius: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your display name</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inp, flex: 1 }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && saveName()} />
              <button onClick={saveName} style={{ padding: '0.75rem 1rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 800, cursor: 'pointer' }}>✓</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.875rem', background: '#1a0505', border: '1px solid #ef444433', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#f87171' }}>
            {error}
          </div>
        )}

        {/* ── Home ── */}
        {screen === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Draft real-time with a friend. Your teams clash in the IPL — more intense QTEs decide the showdown.
            </p>

            {/* Draft Mode — Live Auction only (snake hidden for now) */}
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '2px solid #4169E1', background: '#4169E118', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.4rem' }}>🔨</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#4169E1' }}>Live Auction</div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', lineHeight: 1.3 }}>Bid on players in real time — highest bid wins</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                onClick={createRoom}
                disabled={!nameSet || loading}
                style={{ padding: '0.75rem', background: nameSet ? 'linear-gradient(135deg, #4169E1, #2952CC)' : '#2a2a3a', color: nameSet ? '#fff' : '#475569', border: 'none', borderRadius: '0.625rem', fontSize: '0.88rem', fontWeight: 800, cursor: nameSet && !loading ? 'pointer' : 'not-allowed' }}
              >
                {loading ? '🔄 Creating…' : '🏠 Create Room'}
              </button>
              <button
                onClick={() => setScreen('join')}
                disabled={!nameSet}
                style={{ padding: '0.75rem', background: 'transparent', color: nameSet ? '#94a3b8' : '#475569', border: '1px solid #2a2a3a', borderRadius: '0.625rem', fontSize: '0.88rem', fontWeight: 700, cursor: nameSet ? 'pointer' : 'not-allowed' }}
              >
                🚪 Join Room
              </button>
            </div>
          </div>
        )}

        {/* ── Join ── */}
        {screen === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Room Code</div>
              <input
                style={{ ...inp, textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.2rem', fontWeight: 900, textAlign: 'center' }}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
              />
            </div>
            <button
              onClick={joinRoom}
              disabled={loading || joinCode.length < 6}
              style={{ padding: '0.875rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
            >
              {loading ? 'Joining…' : '🚪 Join'}
            </button>
            <button onClick={() => setScreen('home')} style={{ padding: '0.5rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</button>
          </div>
        )}

        {/* Composition screen now renders as full-page above the modal — nothing here */}

        {/* ── Waiting room ── */}
        {screen === 'waiting' && room && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Room Code</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#4169E1', letterSpacing: '0.25em' }}>{roomId}</div>
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.3rem' }}>Share this with your opponent</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <PlayerSlot name={room.host_name} label="Host" ready />
              <PlayerSlot name={room.guest_name} label="Guest" ready={!!room.guest_id} />
            </div>

            <div style={{ padding: '0.6rem 0.875rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>{room.draft_mode === 'snake' ? '🐍' : '🔨'}</span>
              <span style={{ fontWeight: 700, color: '#94a3b8' }}>{room.draft_mode === 'snake' ? 'Snake Draft' : 'Live Auction'}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700, color: room.league_mode === 'shared' ? '#f59e0b' : '#64748b' }}>
                {room.league_mode === 'shared' ? '🏟️ Shared League' : '⚔️ Classic H2H'}
              </span>
            </div>

            {isHost && (
              <button
                onClick={startComposition}
                disabled={!room.guest_id}
                style={{
                  padding: '0.9rem', fontWeight: 800, fontSize: '0.95rem', border: 'none',
                  borderRadius: '0.625rem', cursor: room.guest_id ? 'pointer' : 'not-allowed',
                  background: room.guest_id ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--border2)',
                  color: room.guest_id ? 'var(--bg)' : '#475569',
                }}
              >
                {room.guest_id ? '⚖️ Set Compositions →' : '⏳ Waiting for opponent…'}
              </button>
            )}
            {isGuest && (
              <div style={{ textAlign: 'center', padding: '0.875rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.625rem', color: '#64748b', fontSize: '0.875rem', fontWeight: 700 }}>
                ⏳ Waiting for host to start…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CompRevealCard({ name, compData, isMe }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `2px solid ${isMe ? '#4169E166' : 'var(--border)'}`,
      borderRadius: '1.25rem', overflow: 'hidden',
    }}>
      <div style={{ padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: isMe ? '#4169E1' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
          {isMe ? 'Your Composition' : "Opponent's Composition"}
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>{name}</div>
        <div style={{ fontSize: '1.3rem' }}>{compData.emoji} <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dim)' }}>{compData.label}</span></div>
      </div>
      <div style={{ padding: '1.1rem 1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { label: `${compData.batters} Batters`,      color: '#f59e0b' },
            { label: `${compData.wk} WK`,                color: '#a78bfa' },
            { label: `${compData.ar} All-rounders`,      color: '#22c55e' },
            { label: `${compData.bowlers} Bowlers`,      color: '#ef4444' },
          ].map(pill => (
            <div key={pill.label} style={{
              fontSize: '0.8rem', fontWeight: 800, color: pill.color,
              background: pill.color + '18', padding: '0.35rem 0.875rem',
              borderRadius: '999px', border: `1px solid ${pill.color}33`,
            }}>
              {pill.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlayerSlot({ name, label, ready }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 0.875rem',
      background: ready ? 'var(--win-bg)' : 'var(--card)',
      border: `1px solid ${ready ? 'var(--win-border)' : 'var(--border)'}`,
      borderRadius: '0.625rem',
    }}>
      <span style={{ fontSize: '1.2rem' }}>{ready ? '✅' : '⏳'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: ready ? '#86efac' : '#475569' }}>
          {name || 'Waiting…'}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  )
}
