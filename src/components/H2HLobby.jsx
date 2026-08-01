/**
 * H2H Lobby — room creation, joining, mode selection, and draft coordination.
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
 *     status text default 'waiting',     -- 'waiting' | 'drafting' | 'simulating' | 'done'
 *     current_turn text,                 -- user_id whose turn it is
 *     host_team jsonb default '[]',
 *     guest_team jsonb default '[]',
 *     host_budget int default 80,
 *     guest_budget int default 80,
 *     current_pick jsonb,                -- { entry, player } for auction, null between turns
 *     auction_bid jsonb,                 -- { host: N, guest: N, deadline: iso }
 *     pick_number int default 0,
 *     created_at timestamptz default now()
 *   );
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

import { useState, useEffect, useRef, useCallback } from 'react'
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

// ─── Main ────────────────────────────────────────────────────────────────────

export default function H2HLobby({ onClose, onStartDraft }) {
  const [screen, setScreen]       = useState('home')   // home | create | join | waiting | mode
  const [roomId, setRoomId]       = useState('')
  const [joinCode, setJoinCode]   = useState('')
  const [room, setRoom]           = useState(null)
  const [myName, setMyName]       = useState(getUserName())
  const [nameSet, setNameSet]     = useState(!!sessionStorage.getItem('h2h_name'))
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [draftMode, setDraftMode] = useState('snake')
  const channelRef = useRef(null)

  const uid = getUserId()
  const isHost  = room?.host_id  === uid
  const isGuest = room?.guest_id === uid

  // ── Real-time subscription to room state ──────────────────────────────────
  function subscribeRoom(id) {
    getSupabase().then(sb => {
      if (!sb) return
      channelRef.current = sb
        .channel(`room_${id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'h2h_rooms', filter: `id=eq.${id}`,
        }, payload => {
          setRoom(payload.new)
          if (payload.new.status === 'drafting') {
            onStartDraft(payload.new, uid)
          }
        })
        .subscribe()
    })
  }

  useEffect(() => () => channelRef.current?.unsubscribe(), [])

  // Polling fallback — in case Supabase Realtime isn't enabled for h2h_rooms
  useEffect(() => {
    if (screen !== 'waiting' || !roomId) return
    const interval = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', roomId).single()
      if (!data) return
      setRoom(data)
      if (data.status === 'drafting') {
        clearInterval(interval)
        onStartDraft(data, uid)
      }
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
      id, host_id: uid, host_name: myName, status: 'waiting', draft_mode: draftMode,
      current_turn: uid, pick_number: 0, host_team: [], guest_team: [],
      host_budget: 80, guest_budget: 80,
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

  // ── Host starts draft ─────────────────────────────────────────────────────
  async function startDraft() {
    if (!room?.guest_id) { setError('Waiting for opponent to join'); return }
    const sb = await getSupabase()
    await sb.from('h2h_rooms').update({ status: 'drafting', draft_mode: draftMode }).eq('id', roomId)
  }

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
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>
            {screen === 'home'    ? '⚔️ Head to Head' :
             screen === 'waiting' ? '🔗 Room ' + roomId :
             screen === 'create'  ? '🏠 Create Room' : '🚪 Join Room'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Name gate */}
        {!nameSet && (
          <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your display name</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inp, flex: 1 }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && saveName()} />
              <button onClick={saveName} style={{ padding: '0.75rem 1rem', background: 'linear-gradient(135deg, #1F6FEB, #0047CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.5rem', fontWeight: 800, cursor: 'pointer' }}>✓</button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
              Draft teams in real-time with a friend. When your teams meet in the IPL, more intense QTEs decide the result.
            </p>

            {/* Draft mode selector */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>Draft Mode</div>
              {[
                { id: 'snake', icon: '🐍', label: 'Snake Draft', desc: 'Take turns picking — order reverses each round. No money, pure strategy.' },
                { id: 'auction', icon: '🔨', label: 'Live Auction', desc: 'Both players bid on each player. 10-second countdown. Highest bid wins.' },
              ].map(m => (
                <div
                  key={m.id}
                  onClick={() => setDraftMode(m.id)}
                  style={{
                    display: 'flex', gap: '0.75rem', padding: '0.75rem',
                    marginBottom: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer',
                    border: `1.5px solid ${draftMode === m.id ? '#1F6FEB' : 'var(--border2)'}`,
                    background: draftMode === m.id ? '#1F6FEB12' : 'transparent',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.15rem' }}>{m.label}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setScreen('create'); createRoom() }}
              disabled={!nameSet || loading}
              style={{ padding: '0.875rem', background: nameSet ? 'linear-gradient(135deg, #1F6FEB, #0047CC)' : 'var(--border2)', color: nameSet ? 'var(--bg)' : '#475569', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: nameSet ? 'pointer' : 'not-allowed' }}
            >
              🏠 Create Room
            </button>
            <button
              onClick={() => setScreen('join')}
              disabled={!nameSet}
              style={{ padding: '0.875rem', background: 'transparent', color: nameSet ? '#94a3b8' : '#475569', border: '1px solid var(--border)', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 700, cursor: nameSet ? 'pointer' : 'not-allowed' }}
            >
              🚪 Join Room
            </button>
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
              style={{ padding: '0.875rem', background: 'linear-gradient(135deg, #1F6FEB, #0047CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
            >
              {loading ? 'Joining…' : '🚪 Join'}
            </button>
            <button onClick={() => setScreen('home')} style={{ padding: '0.5rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</button>
          </div>
        )}

        {/* ── Waiting room ── */}
        {screen === 'waiting' && room && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Room Code</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1F6FEB', letterSpacing: '0.25em' }}>{roomId}</div>
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.3rem' }}>Share this with your opponent</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <PlayerSlot name={room.host_name} label="Host" ready />
              <PlayerSlot name={room.guest_name} label="Guest" ready={!!room.guest_id} />
            </div>

            <div style={{ padding: '0.6rem 0.875rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{room.draft_mode === 'snake' ? '🐍' : '🔨'}</span>
              <span style={{ fontWeight: 700, color: '#94a3b8' }}>{room.draft_mode === 'snake' ? 'Snake Draft' : 'Live Auction'}</span>
            </div>

            {isHost && (
              <button
                onClick={startDraft}
                disabled={!room.guest_id}
                style={{
                  padding: '0.9rem', fontWeight: 800, fontSize: '0.95rem', border: 'none',
                  borderRadius: '0.625rem', cursor: room.guest_id ? 'pointer' : 'not-allowed',
                  background: room.guest_id ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--border2)',
                  color: room.guest_id ? 'var(--bg)' : '#475569',
                }}
              >
                {room.guest_id ? '🏏 Start Draft' : '⏳ Waiting for opponent…'}
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

function PlayerSlot({ name, label, ready }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 0.875rem',
      background: ready ? '#0d1a0d' : 'var(--card)',
      border: `1px solid ${ready ? '#22c55e44' : 'var(--border)'}`,
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
