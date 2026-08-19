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
 *   -- alter table h2h_rooms add column if not exists host_comp_data jsonb;
 *   -- alter table h2h_rooms add column if not exists guest_comp_data jsonb;
 *   -- alter table h2h_rooms add column if not exists rating_type text default 'overall';
 *   -- alter table h2h_rooms add column if not exists season_range jsonb default '{"min":2008,"max":2026}';
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
import { createShortUrl } from '../lib/shortUrl.js'

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

// Keep for H2HDraft backward-compat (old rooms without comp_data)
export function compFromSlider(v) {
  if (v <= 1)  return { label: 'Bowling Heavy',   emoji: '🎯', batters: 3, ar: 2, bowlers: 5, wk: 1 }
  if (v <= 3)  return { label: 'Bowling Leaning', emoji: '🏏', batters: 4, ar: 1, bowlers: 5, wk: 1 }
  if (v <= 6)  return { label: 'Balanced',        emoji: '⚖️', batters: 4, ar: 2, bowlers: 4, wk: 1 }
  if (v <= 8)  return { label: 'Batting Leaning', emoji: '🔥', batters: 5, ar: 2, bowlers: 3, wk: 1 }
  return              { label: 'Batting Heavy',   emoji: '💥', batters: 5, ar: 3, bowlers: 2, wk: 1 }
}

export function roleGroup(role) {
  if (['opener','top-order','middle-order'].includes(role)) return 'batter'
  if (['pace-bowler','spin-bowler'].includes(role))         return 'bowler'
  if (role === 'all-rounder')   return 'ar'
  if (role === 'wicket-keeper') return 'wk'
  return 'batter'
}

// ─── Per-role composition system (matches SquadComposer) ─────────────────────

const H2H_ROLE_DEFS = [
  { key: 'opener',        label: 'Openers',       short: 'OPN', icon: '🏏', color: '#f59e0b',  min: 1, max: 4 },
  { key: 'top-order',     label: 'Top Order',      short: 'BAT', icon: '🏏', color: '#fbbf24',  min: 0, max: 4 },
  { key: 'middle-order',  label: 'Middle Order',   short: 'BAT', icon: '🏏', color: '#fb923c',  min: 0, max: 4 },
  { key: 'wicket-keeper', label: 'Wicket-keeper',  short: 'WK',  icon: '🧤', color: '#a78bfa',  min: 1, max: 4 },
  { key: 'all-rounder',   label: 'All-rounders',   short: 'ALL', icon: '⚡', color: '#34d399',  min: 0, max: 4 },
  { key: 'pace-bowler',   label: 'Pace Bowlers',   short: 'PACE',icon: '💨', color: '#ef4444',  min: 0, max: 5 },
  { key: 'spin-bowler',   label: 'Spin Bowlers',   short: 'SPIN',icon: '🌀', color: '#a855f7',  min: 0, max: 5 },
]

const H2H_DEFAULT_COMP = {
  opener: 2, 'top-order': 2, 'middle-order': 1,
  'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 2, 'spin-bowler': 1,
}

const H2H_PRESETS = [
  { label: 'Balanced',     icon: '⚖️', color: '#C8102E',
    comp: { opener: 2, 'top-order': 2, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 2, 'spin-bowler': 1 } },
  { label: 'Batting Heavy',icon: '💥', color: '#f59e0b',
    comp: { opener: 2, 'top-order': 2, 'middle-order': 2, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 1 } },
  { label: 'Pace Atk',     icon: '💨', color: '#ef4444',
    comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 3, 'spin-bowler': 1 } },
  { label: 'Spin Web',     icon: '🌀', color: '#a855f7',
    comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 3 } },
]

const FLEX_ORDER = ['middle-order','top-order','pace-bowler','spin-bowler','all-rounder','opener','wicket-keeper']

function autoBalance(prev, changedKey, newValue) {
  const def = H2H_ROLE_DEFS.find(r => r.key === changedKey)
  const clamped = Math.max(def.min, Math.min(def.max, newValue))
  const delta = clamped - (prev[changedKey] || 0)
  if (delta === 0) return prev
  const next = { ...prev, [changedKey]: clamped }
  let remaining = delta
  for (const key of FLEX_ORDER) {
    if (key === changedKey || remaining === 0) continue
    const d = H2H_ROLE_DEFS.find(r => r.key === key)
    const cur = next[key] || 0
    if (remaining > 0) {
      const canSteal = Math.min(remaining, cur - d.min)
      if (canSteal > 0) { next[key] = cur - canSteal; remaining -= canSteal }
    } else {
      const canGive = Math.min(-remaining, d.max - cur)
      if (canGive > 0) { next[key] = cur + canGive; remaining += canGive }
    }
    if (remaining === 0) break
  }
  return remaining === 0 ? next : prev
}

// ─── H2H Role Slider (same visuals as SquadComposer) ─────────────────────────

function H2HRoleSlider({ def, value, onDrag, disabled }) {
  const trackRef = useRef(null)

  const getValFromX = useCallback((clientX) => {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.max(def.min, Math.min(def.max, Math.round(frac * def.max)))
  }, [def, value])

  const startDrag = useCallback((e) => {
    if (disabled) return
    e.preventDefault()
    const move = ev => { const cx = ev.touches ? ev.touches[0].clientX : ev.clientX; onDrag(def.key, getValFromX(cx)) }
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up)
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up)
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    onDrag(def.key, getValFromX(cx))
  }, [def.key, disabled, getValFromX, onDrag])

  const pct  = def.max > 0 ? (value / def.max) * 100 : 0
  const dots = Array.from({ length: def.max }, (_, i) => i + 1)

  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{def.icon}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: value > 0 ? 'var(--text)' : '#64748b' }}>{def.label}</span>
          {def.min > 0 && (
            <span style={{ fontSize: '0.5rem', fontWeight: 800, color: def.color, background: def.color + '22', border: `1px solid ${def.color}44`, borderRadius: '999px', padding: '0.08rem 0.3rem' }}>min {def.min}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {dots.map(i => (
            <div key={i} onClick={() => !disabled && onDrag(def.key, i)} style={{
              width: 10, height: 10, borderRadius: '50%', cursor: disabled ? 'default' : 'pointer',
              background: i <= value ? def.color : 'var(--border2)',
              border: `1.5px solid ${i <= value ? def.color : 'var(--border)'}`,
              boxShadow: i <= value ? `0 0 6px ${def.color}66` : 'none',
            }} />
          ))}
          <span style={{ marginLeft: 5, fontSize: '0.95rem', fontWeight: 900, minWidth: 16, textAlign: 'center', color: value > 0 ? def.color : '#475569' }}>{value}</span>
        </div>
      </div>
      <div ref={trackRef} onMouseDown={startDrag} onTouchStart={startDrag}
        style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--border2)', cursor: disabled ? 'default' : 'pointer', userSelect: 'none', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: value > 0 ? `linear-gradient(90deg, ${def.color}bb, ${def.color})` : 'transparent', borderRadius: 5, boxShadow: value > 0 ? `0 0 10px ${def.color}44` : 'none' }} />
        {dots.map(i => (
          <div key={i} style={{ position: 'absolute', left: `${(i / def.max) * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 2, height: 16, background: i <= value ? def.color + '55' : 'var(--border)', pointerEvents: 'none' }} />
        ))}
        {value > 0 && (
          <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 20, height: 20, borderRadius: '50%', background: def.color, border: '3px solid var(--bg)', boxShadow: `0 0 12px ${def.color}88`, pointerEvents: 'none' }} />
        )}
      </div>
      <div style={{ position: 'relative', marginTop: '0.25rem', height: 10 }}>
        <span style={{ position: 'absolute', left: 0, fontSize: '0.5rem', color: value === 0 ? def.color : '#475569', fontWeight: value === 0 ? 900 : 400 }}>0</span>
        <span style={{ position: 'absolute', right: 0, fontSize: '0.5rem', color: value === def.max ? def.color : '#475569', fontWeight: value === def.max ? 900 : 400 }}>{def.max}</span>
      </div>
    </div>
  )
}

// ─── Opponent composition summary card ───────────────────────────────────────

function CompSummaryCard({ comp }) {
  if (!comp) return null
  return (
    <div style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Squad Shape</div>
      {H2H_ROLE_DEFS.map(def => {
        const count = comp[def.key] || 0
        if (count === 0) return null
        return (
          <div key={def.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem' }}>{def.icon}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{def.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {Array.from({ length: def.max }, (_, i) => i + 1).map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i <= count ? def.color : 'var(--border2)', border: `1.5px solid ${i <= count ? def.color : 'var(--border)'}`, boxShadow: i <= count ? `0 0 5px ${def.color}66` : 'none' }} />
              ))}
              <span style={{ marginLeft: 5, fontSize: '0.95rem', fontWeight: 900, color: def.color }}>{count}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function H2HLobby({ onClose, onStartDraft, joinRoomId = null }) {
  const [screen, setScreen]       = useState('home')   // home | join | waiting | composition
  const [roomId, setRoomId]       = useState('')
  const [joinCode, setJoinCode]   = useState('')
  const [room, setRoom]           = useState(null)
  const [myName, setMyName]       = useState(getUserName())
  const [nameSet, setNameSet]     = useState(!!sessionStorage.getItem('h2h_name'))
  const [myCompData, setMyCompData] = useState({ ...H2H_DEFAULT_COMP })
  const [activePreset, setActivePreset] = useState(0)
  const [compReady, setCompReady] = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [draftMode,  setDraftMode]  = useState('auction')
  const leagueMode = 'shared'  // auction always uses shared tournament
  // Room settings — chosen by host before creating, stored in DB
  const [ratingType, setRatingType] = useState('overall')   // 'overall' | 'prime'
  const [seasonMin,  setSeasonMin]  = useState(2008)
  const [seasonMax,  setSeasonMax]  = useState(2026)
  const [inviteLink, setInviteLink] = useState(null)
  const [copied, setCopied]         = useState(false)
  const autoJoinedRef = useRef(false)
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
      host_comp_data: null, guest_comp_data: null,
      rating_type: ratingType,
      season_range: { min: seasonMin, max: seasonMax },
    })
    if (e) { setError(e.message); setLoading(false); return }
    setRoomId(id)
    const { data } = await sb.from('h2h_rooms').select('*').eq('id', id).single()
    setRoom(data)
    subscribeRoom(id)
    setScreen('waiting')
    setLoading(false)
    // Generate short invite link in background
    const longUrl = window.location.origin + '/#h2h=' + id
    createShortUrl(longUrl).then(short => setInviteLink(short))
  }

  // ── Join room (codeOverride used for auto-join via link) ──────────────────
  async function joinRoom(codeOverride) {
    setLoading(true); setError('')
    const sb = await getSupabase()
    if (!sb) { setError('No connection'); setLoading(false); return }
    const code = (codeOverride ?? joinCode).trim().toUpperCase()
    const { data: existing } = await sb.from('h2h_rooms').select('*').eq('id', code).single()
    if (!existing) { setError('Room not found'); setLoading(false); return }
    if (existing.status !== 'waiting') { setError('Room already started'); setLoading(false); return }
    if (existing.guest_id && existing.guest_id !== uid) { setError('Room is full'); setLoading(false); return }
    const { error: e } = await sb.from('h2h_rooms').update({ guest_id: uid, guest_name: myName }).eq('id', code)
    if (e) { setError(e.message); setLoading(false); return }
    const { data: updated } = await sb.from('h2h_rooms').select('*').eq('id', code).single()
    setRoom(updated)
    setRoomId(code)
    subscribeRoom(code)
    setScreen('waiting')
    setLoading(false)
    // Clean up hash so it doesn't linger
    if (window.location.hash.startsWith('#h2h=')) history.replaceState(null, '', window.location.pathname)
  }

  // ── Auto-join when arriving via invite link ───────────────────────────────
  useEffect(() => {
    if (!joinRoomId || !nameSet || autoJoinedRef.current) return
    autoJoinedRef.current = true
    joinRoom(joinRoomId)
  }, [joinRoomId, nameSet])

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

  // ── Handle comp slider drag ───────────────────────────────────────────────
  const handleCompDrag = useCallback((key, val) => {
    setMyCompData(prev => {
      const next = autoBalance(prev, key, val)
      setActivePreset(-1)
      if (roomId) {
        getSupabase().then(sb => {
          if (!sb) return
          const field = isHost ? 'host_comp_data' : 'guest_comp_data'
          sb.from('h2h_rooms').update({ [field]: next }).eq('id', roomId)
        })
      }
      return next
    })
  }, [roomId, isHost])

  // ── Handle preset selection ───────────────────────────────────────────────
  function handleCompPreset(preset, idx) {
    if (compReady) return
    setActivePreset(idx)
    setMyCompData({ ...preset.comp })
    if (roomId) {
      getSupabase().then(sb => {
        if (!sb) return
        const field = isHost ? 'host_comp_data' : 'guest_comp_data'
        sb.from('h2h_rooms').update({ [field]: preset.comp }).eq('id', roomId)
      })
    }
  }

  // ── Lock in my composition choice ─────────────────────────────────────────
  async function confirmComposition() {
    const total = Object.values(myCompData).reduce((s, v) => s + v, 0)
    const bowlers = (myCompData['pace-bowler'] || 0) + (myCompData['spin-bowler'] || 0)
    if (total !== 11 || bowlers < 2) return
    setCompReady(true)
    const sb = await getSupabase()
    if (!sb) return
    const readyField = isHost ? 'host_comp_ready' : 'guest_comp_ready'
    const dataField  = isHost ? 'host_comp_data'  : 'guest_comp_data'
    await sb.from('h2h_rooms').update({ [readyField]: true, [dataField]: myCompData }).eq('id', roomId)
    if (isHost) {
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', roomId).single()
      if (data?.guest_comp_ready) {
        await sb.from('h2h_rooms').update({ status: 'comp_ready' }).eq('id', roomId)
        setScreen('comp_ready')
        setRoom(r => r ? { ...r, status: 'comp_ready' } : r)
      }
    }
  }

  // ── Unlock (Back button) ──────────────────────────────────────────────────
  async function unlockComposition() {
    setCompReady(false)
    const sb = await getSupabase()
    if (!sb) return
    const readyField = isHost ? 'host_comp_ready' : 'guest_comp_ready'
    const dataField  = isHost ? 'host_comp_data'  : 'guest_comp_data'
    await sb.from('h2h_rooms').update({ [readyField]: false, [dataField]: null }).eq('id', roomId)
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
    border: '1px solid #2a2a3a', borderRadius: '0.5rem', color: 'var(--text)',
    fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
  }

  // ── Full-page composition screen (Tasks 2 & 3) ───────────────────────────
  if (screen === 'composition' || screen === 'comp_ready') {
    const bothReady    = room?.host_comp_ready && room?.guest_comp_ready
    const oppReady     = isHost ? room?.guest_comp_ready : room?.host_comp_ready
    const oppName      = isHost ? room?.guest_name : room?.host_name
    const myName2      = isHost ? room?.host_name  : room?.guest_name
    const oppCompData  = isHost ? room?.guest_comp_data : room?.host_comp_data

    const total   = Object.values(myCompData).reduce((s, v) => s + v, 0)
    const bowlers = (myCompData['pace-bowler'] || 0) + (myCompData['spin-bowler'] || 0)
    const isValid = total === 11 && bowlers >= 2

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.75rem 1.25rem', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.25rem' }}>⚖️ Team Composition</div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1.25rem', textAlign: 'center' }}>
          Pick your squad shape — you'll only bid on players that fit your chosen slots.
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', width: '100%', maxWidth: 1080 }}>

          {/* ── MY CARD ── */}
          <div style={{ background: 'var(--card)', border: `1px solid ${compReady ? '#22c55e66' : 'var(--border)'}`, borderRadius: '1.25rem', overflow: 'hidden' }}>
            {/* header */}
            <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: compReady ? '#22c55e' : '#C8102E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
                {compReady ? '✓ Locked In' : 'Your Composition'}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)' }}>{myName2}</div>
            </div>
            {/* presets */}
            <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {H2H_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => handleCompPreset(p, i)} style={{
                  padding: '0.3rem 0.65rem', background: activePreset === i ? p.color + '22' : 'var(--bg)',
                  border: `1.5px solid ${activePreset === i ? p.color : 'var(--border)'}`,
                  borderRadius: '999px', color: activePreset === i ? p.color : '#64748b',
                  fontSize: '0.7rem', fontWeight: 700, cursor: compReady ? 'default' : 'pointer', opacity: compReady ? 0.4 : 1,
                }}>{p.icon} {p.label}</button>
              ))}
            </div>
            {/* sliders */}
            <div style={{ padding: '0.875rem 1.5rem', opacity: compReady ? 0.45 : 1, pointerEvents: compReady ? 'none' : 'auto' }}>
              <div style={{ fontSize: '0.56rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.65rem' }}>Role Sliders</div>
              {H2H_ROLE_DEFS.map(def => (
                <H2HRoleSlider key={def.key} def={def} value={myCompData[def.key] || 0} onDrag={handleCompDrag} disabled={compReady} />
              ))}
              <div style={{ paddingTop: '0.65rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {total !== 11 && <span style={{ fontSize: '0.7rem', color: total < 11 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{total < 11 ? `${11-total} more` : `${total-11} too many`}</span>}
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: total === 11 ? '#C8102E' : total > 11 ? '#ef4444' : '#f59e0b' }}>{total}/11</span>
                </div>
              </div>
            </div>
            {/* lock / back */}
            <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {!compReady
                ? <button onClick={confirmComposition} disabled={!isValid} style={{ width: '100%', padding: '0.75rem', background: isValid ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'var(--border2)', color: isValid ? '#fff' : '#475569', border: 'none', borderRadius: '0.625rem', fontSize: '0.92rem', fontWeight: 800, cursor: isValid ? 'pointer' : 'not-allowed' }}>
                    {isValid ? '✓ Lock In Composition' : total !== 11 ? (total < 11 ? `${11-total} more to assign` : 'Too many') : 'Need 2+ bowlers'}
                  </button>
                : <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, padding: '0.7rem', background: '#0d1a0d', border: '1px solid #22c55e44', borderRadius: '0.625rem', color: '#86efac', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}>✓ Locked in</div>
                    <button onClick={unlockComposition} style={{ padding: '0.7rem 1rem', background: 'var(--bg)', border: '1px solid #2a2a3a', borderRadius: '0.625rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>← Edit</button>
                  </div>
              }
            </div>
          </div>

          {/* ── OPPONENT CARD ── */}
          <div style={{ background: 'var(--card)', border: `1px solid ${oppReady ? '#22c55e44' : 'var(--border)'}`, borderRadius: '1.25rem', overflow: 'hidden', position: 'relative' }}>
            {/* header */}
            <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: oppReady ? '#22c55e' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
                {oppReady ? '✓ Locked In' : 'In Progress…'}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)' }}>{oppName || 'Opponent'}</div>
            </div>
            {oppReady && oppCompData
              ? <CompSummaryCard comp={oppCompData} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: '0.875rem', opacity: 0.4 }}>
                  <div style={{ fontSize: '3rem' }}>⏳</div>
                  <div style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 700 }}>Opponent is selecting…</div>
                </div>
              )
            }
          </div>
        </div>

        {/* Bottom CTA — both locked */}
        {bothReady && (
          <div style={{ marginTop: '1.5rem' }}>
            {isHost
              ? <button onClick={startAuction} style={{ padding: '1rem 3rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0a0a0f', border: 'none', borderRadius: '0.875rem', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px #f59e0b44' }}>🔨 Go to Auction →</button>
              : <div style={{ padding: '0.875rem 2rem', background: 'var(--card)', border: '1px solid #2a2a3a', borderRadius: '0.875rem', color: '#64748b', fontSize: '0.88rem', fontWeight: 700 }}>⏳ Waiting for host to start…</div>
            }
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
        background: '#0d0d16', border: '1px solid #2a2a3a',
        borderRadius: '1.25rem', padding: '1.75rem',
        animation: 'fade-in-up 0.25s ease both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#e2e8f0' }}>
            {screen === 'waiting'     ? '🔗 Room ' + roomId :
             screen === 'join'        ? '🚪 Join Room'      :
             screen === 'composition' ? '⚖️ Team Composition' : '⚔️ Multiplayer'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Name gate */}
        {!nameSet && (
          <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#13131f', border: '1px solid #2a2a3a', borderRadius: '0.75rem' }}>
            {joinRoomId && (
              <div style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.5rem' }}>
                🏏 You've been invited to a match!
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your display name</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inp, flex: 1 }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && saveName()} autoFocus={!!joinRoomId} />
              <button onClick={saveName} style={{ padding: '0.75rem 1rem', background: '#C8102E', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 800, cursor: 'pointer' }}>
                {joinRoomId ? 'Join →' : '✓'}
              </button>
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
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '2px solid #C8102E', background: '#C8102E18', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.4rem' }}>🔨</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#C8102E' }}>Live Auction</div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', lineHeight: 1.3 }}>Bid on players in real time — highest bid wins</div>
              </div>
            </div>

            {/* ── Room Settings (host only, shown on home screen) ── */}
            <div style={{ padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid #2a2a3a', background: 'var(--card2)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Room Settings</div>

              {/* Player Ratings */}
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem' }}>Player Ratings</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[['overall', '🏏 Season Rating'], ['prime', '⚡ Prime Rating']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setRatingType(val)}
                      style={{
                        flex: 1, padding: '0.45rem 0.5rem',
                        background: ratingType === val ? (val === 'prime' ? '#a855f722' : '#C8102E22') : 'transparent',
                        border: `1.5px solid ${ratingType === val ? (val === 'prime' ? '#a855f7' : '#C8102E') : 'var(--border)'}`,
                        borderRadius: '0.5rem', cursor: 'pointer',
                        fontSize: '0.7rem', fontWeight: ratingType === val ? 800 : 600,
                        color: ratingType === val ? (val === 'prime' ? '#a855f7' : '#C8102E') : '#64748b',
                        transition: 'all 0.15s',
                      }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Season Range */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8' }}>Season Range</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 900, color: '#f59e0b' }}>{seasonMin} – {seasonMax}</div>
                </div>
                {/* Presets */}
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  {[
                    { label: 'All Seasons', min: 2008, max: 2026 },
                    { label: 'Classic (2008–14)', min: 2008, max: 2014 },
                    { label: 'Modern (2015+)', min: 2015, max: 2026 },
                  ].map(p => {
                    const active = seasonMin === p.min && seasonMax === p.max
                    return (
                      <button
                        key={p.label}
                        onClick={() => { setSeasonMin(p.min); setSeasonMax(p.max) }}
                        style={{
                          flex: 1, padding: '0.3rem 0.25rem',
                          background: active ? '#f59e0b22' : 'transparent',
                          border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                          borderRadius: '0.4rem', cursor: 'pointer',
                          fontSize: '0.58rem', fontWeight: active ? 800 : 600,
                          color: active ? '#f59e0b' : '#64748b',
                          transition: 'all 0.15s', whiteSpace: 'nowrap',
                        }}
                      >{p.label}</button>
                    )
                  })}
                </div>
                {/* Dual sliders */}
                <div style={{ position: 'relative', height: 28 }}>
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, background: 'var(--border2)', borderRadius: 2, transform: 'translateY(-50%)' }} />
                  <div style={{
                    position: 'absolute', top: '50%', height: 4, background: '#f59e0b', borderRadius: 2, transform: 'translateY(-50%)',
                    left: `${(seasonMin - 2008) / 18 * 100}%`,
                    right: `${(2026 - seasonMax) / 18 * 100}%`,
                  }} />
                  <input type="range" min={2008} max={2026} value={seasonMin}
                    onChange={e => setSeasonMin(Math.min(+e.target.value, seasonMax - 1))}
                    style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: '100%', top: 0, left: 0 }}
                  />
                  <input type="range" min={2008} max={2026} value={seasonMax}
                    onChange={e => setSeasonMax(Math.max(+e.target.value, seasonMin + 1))}
                    style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: '100%', top: 0, left: 0 }}
                  />
                  {/* Thumb indicators */}
                  <div style={{ position: 'absolute', top: '50%', left: `${(seasonMin - 2008) / 18 * 100}%`, transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: '#f59e0b', border: '2px solid var(--card)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '50%', left: `${(seasonMax - 2008) / 18 * 100}%`, transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: '#f59e0b', border: '2px solid var(--card)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                onClick={createRoom}
                disabled={!nameSet || loading}
                style={{ padding: '0.75rem', background: nameSet ? '#C8102E' : '#2a2a3a', color: nameSet ? '#fff' : '#475569', border: 'none', borderRadius: '0.625rem', fontSize: '0.88rem', fontWeight: 800, cursor: nameSet && !loading ? 'pointer' : 'not-allowed' }}
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
              style={{ padding: '0.875rem', background: '#C8102E', color: 'var(--bg)', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
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
            {/* Invite link card */}
            <div style={{ padding: '1rem', background: 'var(--card)', border: '1px solid #2a2a3a', borderRadius: '0.875rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Invite Link</div>
              <div style={{
                padding: '0.5rem 0.75rem', background: '#13131f', border: '1px solid #2a2a3a',
                borderRadius: '0.5rem', fontSize: '0.75rem', color: '#94a3b8',
                fontFamily: 'monospace', marginBottom: '0.625rem',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {inviteLink ?? '⏳ Generating…'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    if (!inviteLink) return
                    navigator.clipboard.writeText(inviteLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                  }}
                  disabled={!inviteLink}
                  style={{ padding: '0.6rem', background: copied ? '#0d1a0d' : '#13131f', border: `1px solid ${copied ? '#22c55e55' : 'var(--border)'}`, borderRadius: '0.5rem', color: copied ? '#22c55e' : '#94a3b8', fontSize: '0.78rem', fontWeight: 700, cursor: inviteLink ? 'pointer' : 'default' }}
                >
                  {copied ? '✅ Copied!' : '📋 Copy Link'}
                </button>
                <button
                  onClick={() => {
                    if (!inviteLink) return
                    const text = encodeURIComponent(`Join my Cricket 38-0 Multiplayer auction! 🏏\n${inviteLink}`)
                    window.open(`https://wa.me/?text=${text}`, '_blank')
                  }}
                  disabled={!inviteLink}
                  style={{ padding: '0.6rem', background: '#0a1a0a', border: '1px solid #22c55e44', borderRadius: '0.5rem', color: '#22c55e', fontSize: '0.78rem', fontWeight: 700, cursor: inviteLink ? 'pointer' : 'default' }}
                >
                  💬 WhatsApp
                </button>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: '#3a4a5a', textAlign: 'center' }}>
                Room code: <span style={{ fontWeight: 800, letterSpacing: '0.1em', color: '#475569' }}>{roomId}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <PlayerSlot name={room.host_name} label="Host" ready />
              <PlayerSlot name={room.guest_name} label="Guest" ready={!!room.guest_id} />
            </div>

            <div style={{ padding: '0.6rem 0.875rem', background: 'var(--card)', border: '1px solid #2a2a3a', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>{room.draft_mode === 'snake' ? '🐍' : '🔨'}</span>
              <span style={{ fontWeight: 700, color: '#94a3b8' }}>{room.draft_mode === 'snake' ? 'Snake Draft' : 'Live Auction'}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700, color: room.league_mode === 'shared' ? '#f59e0b' : '#64748b' }}>
                {room.league_mode === 'shared' ? '🏟️ Shared League' : '⚔️ Classic Multiplayer'}
              </span>
            </div>

            {/* Room settings summary — visible to both players */}
            <div style={{ padding: '0.75rem 0.875rem', background: 'var(--card2)', border: '1px solid #2a2a3a', borderRadius: '0.625rem' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Auction Settings</div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, padding: '0.4rem 0.6rem', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: '0.4rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, marginBottom: '0.15rem' }}>RATINGS</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: room.rating_type === 'prime' ? '#a855f7' : '#C8102E' }}>
                    {room.rating_type === 'prime' ? '⚡ Prime' : '🏏 Season'}
                  </div>
                </div>
                <div style={{ flex: 2, padding: '0.4rem 0.6rem', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: '0.4rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, marginBottom: '0.15rem' }}>SEASONS</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#f59e0b' }}>
                    {room.season_range?.min ?? 2008} – {room.season_range?.max ?? 2026}
                  </div>
                </div>
              </div>
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
              <div style={{ textAlign: 'center', padding: '0.875rem', background: 'var(--card)', border: '1px solid #2a2a3a', borderRadius: '0.625rem', color: '#64748b', fontSize: '0.875rem', fontWeight: 700 }}>
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
      border: `2px solid ${isMe ? '#C8102E66' : 'var(--card-border)'}`,
      borderRadius: '1.25rem', overflow: 'hidden',
    }}>
      <div style={{ padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: isMe ? '#C8102E' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
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
