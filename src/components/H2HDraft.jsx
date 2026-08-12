/**
 * H2H Draft Screen — snake and live auction modes.
 *
 * AUCTION FLOW:
 *  1. Host spins a random player → posts current_pick = player, auction_bid = { phase:'interest', ... }
 *  2. Both players see the player card and vote Yes / No
 *  3. Host resolves once both votes are in:
 *     - Both No  → skip player, spin next
 *     - One Yes  → that player gets the player at base price
 *     - Both Yes → move to bidding phase (countdown, each bids ≥ base price)
 *  4. Host resolves auction: highest bid wins; tie → host wins
 *
 * auction_bid schema stored in Supabase:
 *  { phase: 'interest'|'bidding',
 *    host_interest: bool|null, guest_interest: bool|null,
 *    host_bid: number|null,   guest_bid: number|null,
 *    base_price: number }
 *
 * current_pick in auction = individual player object (not a team entry)
 * current_pick in snake   = team entry object (same as before)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase.js'
import { WHEEL_ENTRIES } from '../data/players.js'
import { compFromSlider, roleGroup } from './H2HLobby.jsx'

const TOTAL_SLOTS   = 11
const BID_SECONDS   = 15
const SNAKE_SECONDS = 20   // time limit per pick in snake draft

// ── IPL squad rules ──────────────────────────────────────────────────────────
function overseasCount(team) { return team.filter(p => p.nationality !== 'India').length }
function hasWK(team)         { return team.some(p => p.role === 'wicket-keeper') }

// ── Composition quota check ───────────────────────────────────────────────────
function compCounts(team) {
  let batters = 0, ar = 0, bowlers = 0, wk = 0
  for (const p of team) {
    const g = roleGroup(p.role)
    if (g === 'batter') batters++
    else if (g === 'ar') ar++
    else if (g === 'bowler') bowlers++
    else wk++
  }
  return { batters, ar, bowlers, wk }
}

function compEligible(player, team, comp) {
  if (!comp) return true   // no composition enforced
  const counts  = compCounts(team)
  const group   = roleGroup(player.role)
  const slotsLeft = TOTAL_SLOTS - team.length
  // How many slots must still be filled for other groups
  const minBatters = Math.max(0, comp.batters - counts.batters)
  const minAR      = Math.max(0, comp.ar      - counts.ar)
  const minBowlers = Math.max(0, comp.bowlers - counts.bowlers)
  const minWK      = Math.max(0, comp.wk      - counts.wk)
  const hardMin    = minBatters + minAR + minBowlers + minWK

  if (group === 'batter') {
    // Would this pick leave room for all other required slots?
    if (counts.batters >= comp.batters) return false
    return (slotsLeft - 1) >= (hardMin - minBatters)
  }
  if (group === 'ar') {
    if (counts.ar >= comp.ar) return false
    return (slotsLeft - 1) >= (hardMin - minAR)
  }
  if (group === 'bowler') {
    if (counts.bowlers >= comp.bowlers) return false
    return (slotsLeft - 1) >= (hardMin - minBowlers)
  }
  if (group === 'wk') {
    if (counts.wk >= comp.wk) return false
    return (slotsLeft - 1) >= (hardMin - minWK)
  }
  return true
}

function getEligiblePlayers(players, team) {
  const oc       = overseasCount(team)
  const last     = team.length === TOTAL_SLOTS - 1
  const needsWK  = last && !hasWK(team)
  return players.filter(p => {
    if (needsWK && p.role !== 'wicket-keeper') return false
    if (oc >= 4 && p.nationality !== 'India') return false
    return true
  })
}

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function basePrice(overall) {
  const r = scaleDisplay(overall)
  const raw = 0.5 + Math.pow(Math.max(0, r - 58) / 41, 2) * 29.5
  return Math.max(0.5, Math.round(Math.min(30, raw) * 2) / 2)
}

function roleColor(role) {
  const map = {
    'opener': '#f59e0b', 'top-order': '#f59e0b',
    'middle-order': '#22c55e', 'wicket-keeper': '#a78bfa',
    'all-rounder': '#4169E1', 'pace-bowler': '#ef4444', 'spin-bowler': '#f97316',
  }
  return map[role] ?? '#64748b'
}

// Snake turn order: A B B A A B B A …
function whoseTurnSnake(pickNumber, hostId, guestId) {
  const round = Math.floor(pickNumber / 2)
  const pos   = pickNumber % 2
  return (round % 2 === 0)
    ? (pos === 0 ? hostId : guestId)
    : (pos === 0 ? guestId : hostId)
}

// ── Build deduped player pool for auction ────────────────────────────────────
function buildAuctionPool() {
  const seen = new Set()
  const pool = []
  for (const entry of WHEEL_ENTRIES) {
    const c = entry.competition
    if (c !== 'ipl' && !c?.includes?.('ipl')) continue
    for (const p of entry.players) {
      if (!seen.has(p.name)) {
        seen.add(p.name)
        pool.push({ ...p, teamName: entry.teamName, season: entry.season, color: entry.color })
      }
    }
  }
  return pool
}

// Bias selection toward higher-rated players: 65% chance to pick from 82+ pool
function pickFromPool(available) {
  const stars = available.filter(p => scaleDisplay(p.overall) >= 82)
  const src   = (Math.random() < 0.65 && stars.length > 0) ? stars : available
  return src[Math.floor(Math.random() * src.length)]
}

// ── XI Panel (snake draft — shows both teams' forming XI) ───────────────────
const XI_SLOTS = [
  { role: 'opener',         label: 'OPN', n: 2 },
  { role: 'top-order',      label: 'TOP', n: 1 },
  { role: 'wicket-keeper',  label: 'WK',  n: 1 },
  { role: 'middle-order',   label: 'MID', n: 2 },
  { role: 'all-rounder',    label: 'AR',  n: 2 },
  { role: 'pace-bowler',    label: 'PCE', n: 2 },
  { role: 'spin-bowler',    label: 'SPN', n: 1 },
]

function XIPanel({ name, team, isMe, comp }) {
  const oc   = overseasCount(team)
  const wkOk = hasWK(team)
  const counts = comp ? compCounts(team) : null

  // Expand slots and fill with matching players
  const used  = new Set()
  const slots = []
  for (const s of XI_SLOTS) {
    const matching = team.filter(p => p.role === s.role && !used.has(p.name))
    for (let i = 0; i < s.n; i++) {
      const p = matching[i] ?? null
      if (p) used.add(p.name)
      slots.push({ label: s.label, player: p })
    }
  }
  // Overflow (role doesn't match any slot)
  team.filter(p => !used.has(p.name)).forEach(p => slots.push({ label: '?', player: p }))

  return (
    <div style={{
      background: 'var(--card2)',
      border: `1px solid ${isMe ? '#4169E144' : 'var(--border)'}`,
      borderRadius: '0.75rem', overflow: 'hidden',
      position: 'sticky', top: '4.5rem',
    }}>
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 900, color: isMe ? '#4169E1' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{name}</div>
          <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.6rem', flexShrink: 0 }}>
            <span style={{ color: oc >= 4 ? '#ef4444' : '#475569', fontWeight: 700 }}>🌍{oc}/4</span>
            <span style={{ color: wkOk ? '#22c55e' : team.length > 4 ? '#f59e0b' : '#475569', fontWeight: 700 }}>🧤{wkOk ? '✓' : '?'}</span>
          </div>
        </div>
        {comp && counts && (
          <div style={{ display: 'flex', gap: '0.3rem', fontSize: '0.52rem', fontWeight: 700 }}>
            <span style={{ color: counts.batters >= comp.batters ? '#22c55e' : '#f59e0b' }}>BAT {counts.batters}/{comp.batters}</span>
            <span style={{ color: '#64748b' }}>·</span>
            <span style={{ color: counts.ar >= comp.ar ? '#22c55e' : '#f59e0b' }}>AR {counts.ar}/{comp.ar}</span>
            <span style={{ color: '#64748b' }}>·</span>
            <span style={{ color: counts.bowlers >= comp.bowlers ? '#22c55e' : '#f59e0b' }}>BWL {counts.bowlers}/{comp.bowlers}</span>
          </div>
        )}
      </div>
      {slots.map(({ label, player }, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.6rem',
          borderBottom: i < 10 ? '1px solid var(--card)' : 'none',
          background: player ? 'transparent' : 'var(--bg)',
          minHeight: 28,
        }}>
          <span style={{ fontSize: '0.52rem', fontWeight: 800, color: 'var(--muted)', width: 24, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
          {player ? (
            <>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>{scaleDisplay(player.overall)}</span>
              {player.nationality !== 'India' && <span style={{ fontSize: '0.48rem', color: '#3b82f6', fontWeight: 800, flexShrink: 0 }}>OS</span>}
            </>
          ) : (
            <span style={{ fontSize: '0.6rem', color: 'var(--border)', fontStyle: 'italic' }}>—</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────
export default function H2HDraft({ room: initialRoom, uid, onDone, onBack, onInitSharedLeague, onSharedLeague }) {
  const isSnake = initialRoom.draft_mode === 'snake'
  const isHost  = uid === initialRoom.host_id

  const [room, setRoom]           = useState(initialRoom)
  const [cycleEntry, setCycleEntry] = useState(null)   // cosmetic spin label
  const [spinning, setSpinning]   = useState(false)
  const [lastResult, setLastResult] = useState(null)   // { player, winner, price, skipped }

  // ── Snake-specific ──────────────────────────────────────────────────────────
  const [currentEntry, setCurrentEntry] = useState(
    isSnake ? (initialRoom.current_pick ?? null) : null
  )

  // ── Auction-specific ────────────────────────────────────────────────────────
  const [currentPlayer, setCurrentPlayer] = useState(
    !isSnake ? (initialRoom.current_pick ?? null) : null
  )
  const [auctionPhase, setAuctionPhaseState] = useState(
    !isSnake ? (initialRoom.auction_bid?.phase ?? null) : null
  )
  const auctionPhaseRef = useRef(auctionPhase)
  function setAuctionPhase(p) { auctionPhaseRef.current = p; setAuctionPhaseState(p) }

  const [myInterest, setMyInterest] = useState(null)   // true | false | null
  const [bidsLocal, setBidsLocal]   = useState({ host: null, guest: null })
  const [myBid, setMyBid]           = useState('')
  const [countdown, setCountdown]   = useState(null)
  const [bidSubmitted, setBidSubmitted] = useState(false)
  const [turnTimeLeft, setTurnTimeLeft] = useState(null)  // snake pick timer

  const countdownRef  = useRef(null)
  const snakeTimerRef = useRef(null)
  const spinRef       = useRef(null)
  const channelRef    = useRef(null)
  const roomRef       = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])

  const myTeam   = isHost ? (room.host_team ?? [])  : (room.guest_team ?? [])
  const oppTeam  = isHost ? (room.guest_team ?? []) : (room.host_team  ?? [])
  const myName   = isHost ? room.host_name  : room.guest_name
  const oppName  = isHost ? room.guest_name : room.host_name
  const myBudget  = isHost ? room.host_budget  : room.guest_budget
  const oppBudget = isHost ? room.guest_budget : room.host_budget
  // Composition from lobby slider (null = unconstrained for old rooms without the column)
  const myComp  = compFromSlider(isHost ? (room.host_comp ?? 5) : (room.guest_comp ?? 5))
  const oppComp = compFromSlider(isHost ? (room.guest_comp ?? 5) : (room.host_comp ?? 5))
  // bp must be declared here (before any useEffects) to avoid TDZ ReferenceError
  const bp = room.auction_bid?.base_price ?? 0

  // ── Countdown helper (auction bidding) ───────────────────────────────────────
  function startCountdown() {
    clearInterval(countdownRef.current)
    setCountdown(BID_SECONDS)
    let t = BID_SECONDS
    countdownRef.current = setInterval(() => {
      t--
      setCountdown(t)
      if (t <= 0) {
        clearInterval(countdownRef.current)
        if (isHost) resolveAuctionRef.current?.()
      }
    }, 1000)
  }

  // ── Apply room update (shared by realtime + polling) ────────────────────────
  const applyRoomUpdate = useCallback((updated) => {
    setRoom(prev => {
      if ((updated.pick_number ?? 0) < (prev.pick_number ?? 0)) return prev
      return updated
    })
    if (updated.status === 'done') {
      // Shared league: don't auto-call onDone; DraftDone handles the transition
      if (updated.league_mode !== 'shared') { onDone(updated); return }
      return
    }

    if (isSnake) {
      if (updated.current_pick) {
        setCurrentEntry(updated.current_pick)
      } else {
        setCurrentEntry(null)
        setCycleEntry(null)
      }
    } else {
      // Auction
      if (updated.current_pick) {
        setCurrentPlayer(updated.current_pick)
        const newPhase = updated.auction_bid?.phase ?? null
        if (newPhase === 'interest' && auctionPhaseRef.current !== 'interest') {
          setMyInterest(null)
          setBidSubmitted(false)
          setMyBid('')
          clearInterval(countdownRef.current)
          setCountdown(null)
        }
        if (newPhase === 'bidding' && auctionPhaseRef.current !== 'bidding') {
          setBidsLocal({ host: null, guest: null })
          setBidSubmitted(false)
          setMyBid('')
          startCountdown()
        }
        setAuctionPhase(newPhase)
        if (updated.auction_bid) {
          setBidsLocal({
            host: updated.auction_bid.host_bid ?? null,
            guest: updated.auction_bid.guest_bid ?? null,
          })
        }
      } else {
        // No current pick — waiting for next spin
        setCurrentPlayer(null)
        setAuctionPhase(null)
        setCycleEntry(null)
        clearInterval(countdownRef.current)
        setCountdown(null)
      }
    }
  }, [isSnake])

  // ── Realtime subscription ────────────────────────────────────────────────────
  useEffect(() => {
    getSupabase().then(sb => {
      if (!sb) return
      channelRef.current = sb
        .channel(`draft_${room.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'h2h_rooms', filter: `id=eq.${room.id}`,
        }, payload => applyRoomUpdate(payload.new))
        .subscribe()
    })
    return () => {
      channelRef.current?.unsubscribe()
      clearInterval(countdownRef.current)
      clearTimeout(spinRef.current)
    }
  }, [])

  // ── Polling fallback (every 1s for real-time feel) ───────────────────────────
  useEffect(() => {
    if (room.status === 'done') return
    const interval = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (!data) return
      const r = roomRef.current
      const changed =
        data.pick_number   !== r.pick_number   ||
        data.status        !== r.status        ||
        !!data.current_pick !== !!r.current_pick ||
        JSON.stringify(data.auction_bid) !== JSON.stringify(r.auction_bid)
      if (changed) applyRoomUpdate(data)
    }, 1000)
    return () => clearInterval(interval)
  }, [room.status])

  // ════════════════════════════════════════════════════════════════════════════
  // SNAKE FUNCTIONS
  // ════════════════════════════════════════════════════════════════════════════

  async function postNextPick() {
    const entries  = WHEEL_ENTRIES.filter(e => e.competition === 'ipl' || e.competition?.includes?.('ipl'))
    const latestRoom = roomRef.current
    const allPicked  = new Set([...(latestRoom.host_team ?? []), ...(latestRoom.guest_team ?? [])].map(p => p.name))
    const available  = entries.filter(e => e.players.some(p => !allPicked.has(p.name)))
    if (!available.length) return

    setSpinning(true)
    const chosen = available[Math.floor(Math.random() * available.length)]
    const pool   = shuffle(available)
    let i = 0
    const TICKS = 20

    function tick() {
      i++
      setCycleEntry(i >= TICKS ? chosen : pool[i % pool.length])
      if (i < TICKS) {
        spinRef.current = setTimeout(tick, Math.round(30 + 200 * Math.pow(i / TICKS, 3)))
        return
      }
      setSpinning(false)
      getSupabase().then(async sb => {
        if (!sb) { spinRef.current = setTimeout(() => postNextPickRef.current?.(), 2000); return }
        const { error } = await sb.from('h2h_rooms').update({ current_pick: chosen }).eq('id', latestRoom.id)
        if (error) { spinRef.current = setTimeout(() => postNextPickRef.current?.(), 2000); return }
        setCurrentEntry(chosen)
        setCycleEntry(null)
      })
    }
    spinRef.current = setTimeout(tick, 30)
  }

  async function snakePick(player) {
    const latestRoom = roomRef.current
    if (latestRoom.current_turn !== uid || !latestRoom.current_pick) return
    // IPL rule check
    const lMyTeam = isHost ? (latestRoom.host_team ?? []) : (latestRoom.guest_team ?? [])
    const lOppTeam = isHost ? (latestRoom.guest_team ?? []) : (latestRoom.host_team ?? [])
    const eligible = getEligiblePlayers(
      latestRoom.current_pick.players.filter(p => {
        const all = new Set([...lMyTeam, ...lOppTeam].map(x => x.name))
        return !all.has(p.name)
      }),
      lMyTeam
    )
    if (eligible.length > 0 && !eligible.find(e => e.name === player.name)) return // blocked by IPL rules
    clearInterval(snakeTimerRef.current)
    setTurnTimeLeft(null)
    const sb = await getSupabase()
    const newPick   = (latestRoom.pick_number ?? 0) + 1
    const nextTurn  = whoseTurnSnake(newPick, latestRoom.host_id, latestRoom.guest_id)
    const newMyTeam = [...lMyTeam, player]
    const isDone    = newMyTeam.length >= TOTAL_SLOTS && lOppTeam.length >= TOTAL_SLOTS
    const update = {
      pick_number: newPick, current_turn: nextTurn,
      current_pick: null,
      status: isDone ? 'done' : 'drafting',
    }
    if (isHost) update.host_team = newMyTeam
    else        update.guest_team = newMyTeam
    const { error } = await sb.from('h2h_rooms').update(update).eq('id', latestRoom.id)
    if (!error) applyRoomUpdate({ ...latestRoom, ...update })
  }

  async function autoPickSnake() {
    const latestRoom = roomRef.current
    if (latestRoom.current_turn !== uid || !latestRoom.current_pick) return
    const lMyTeam  = isHost ? (latestRoom.host_team ?? []) : (latestRoom.guest_team ?? [])
    const lOppTeam = isHost ? (latestRoom.guest_team ?? []) : (latestRoom.host_team ?? [])
    const allPicked = new Set([...lMyTeam, ...lOppTeam].map(p => p.name))
    const available = latestRoom.current_pick.players.filter(p => !allPicked.has(p.name))
    if (!available.length) return  // all taken, host skip logic handles this
    // Apply composition constraint first, then IPL rules
    const myCompData = compFromSlider(isHost ? (latestRoom.host_comp ?? 5) : (latestRoom.guest_comp ?? 5))
    let eligible = getEligiblePlayers(
      available.filter(p => compEligible(p, lMyTeam, myCompData)),
      lMyTeam
    )
    if (!eligible.length) eligible = getEligiblePlayers(available, lMyTeam)  // relax comp if nothing fits
    if (!eligible.length) eligible = available  // relax IPL rules as last resort
    // Auto-pick lowest rated eligible player
    const pick = eligible.reduce((a, b) => (a.overall < b.overall ? a : b))
    await snakePickRef.current?.(pick)
  }

  const postNextPickRef  = useRef(postNextPick)
  const snakePickRef     = useRef(snakePick)
  const autoPickSnakeRef = useRef(autoPickSnake)
  useEffect(() => { postNextPickRef.current  = postNextPick  })
  useEffect(() => { snakePickRef.current     = snakePick     })
  useEffect(() => { autoPickSnakeRef.current = autoPickSnake })

  // Auto-spin for snake (host always posts)
  useEffect(() => {
    if (!isSnake || !isHost) return
    if (room.status !== 'drafting' || room.current_pick) return
    if ((room.host_team?.length ?? 0) >= TOTAL_SLOTS && (room.guest_team?.length ?? 0) >= TOTAL_SLOTS) return
    const t = setTimeout(() => postNextPickRef.current?.(), 800)
    return () => clearTimeout(t)
  }, [room.pick_number, room.current_pick, room.current_turn, room.status])

  // Host: if current squad has no players left for ANYONE, force-skip it
  useEffect(() => {
    if (!isSnake || !isHost || !room.current_pick) return
    const allPicked = new Set([...(room.host_team ?? []), ...(room.guest_team ?? [])].map(p => p.name))
    const remaining = room.current_pick.players.filter(p => !allPicked.has(p.name))
    if (remaining.length > 0) return  // still has players — no need to skip
    const t = setTimeout(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const newPick = (roomRef.current.pick_number ?? 0) + 1
      const update = { pick_number: newPick, current_pick: null }
      const { error } = await sb.from('h2h_rooms').update(update).eq('id', room.id)
      if (!error) applyRoomUpdate({ ...roomRef.current, ...update })
    }, 400)
    return () => clearTimeout(t)
  }, [room.current_pick, room.host_team?.length, room.guest_team?.length])

  // Snake pick timer — 20s countdown; auto-pick on timeout if it's my turn
  useEffect(() => {
    if (!isSnake || !currentEntry) { setTurnTimeLeft(null); return }
    setTurnTimeLeft(SNAKE_SECONDS)
    let t = SNAKE_SECONDS
    snakeTimerRef.current = setInterval(() => {
      t--
      setTurnTimeLeft(t)
      if (t <= 0) {
        clearInterval(snakeTimerRef.current)
        const lr = roomRef.current
        if (lr.current_turn === uid) autoPickSnakeRef.current?.()
      }
    }, 1000)
    return () => clearInterval(snakeTimerRef.current)
  }, [isSnake, currentEntry?.teamName, currentEntry?.season])

  // ════════════════════════════════════════════════════════════════════════════
  // AUCTION FUNCTIONS
  // ════════════════════════════════════════════════════════════════════════════

  async function postNextPlayer() {
    const pool       = buildAuctionPool()
    const latestRoom = roomRef.current
    const allPicked  = new Set([...(latestRoom.host_team ?? []), ...(latestRoom.guest_team ?? [])].map(p => p.name))
    const available  = pool.filter(p => !allPicked.has(p.name))
    if (!available.length) return

    const chosen     = pickFromPool(available)
    const bp         = basePrice(chosen.overall)
    const newBid     = { phase: 'interest', host_interest: null, guest_interest: null, host_bid: null, guest_bid: null, base_price: bp }
    const newPickNum = (latestRoom.pick_number ?? 0) + 1   // always bump so stale events get discarded

    const sb = await getSupabase()
    if (!sb) { spinRef.current = setTimeout(() => postNextPlayerRef.current?.(), 2000); return }

    const { error } = await sb.from('h2h_rooms')
      .update({ current_pick: chosen, auction_bid: newBid, pick_number: newPickNum })
      .eq('id', latestRoom.id)

    if (error) {
      console.error('postNextPlayer failed:', error.message)
      spinRef.current = setTimeout(() => postNextPlayerRef.current?.(), 2000)
      return
    }
    // Apply locally immediately — don't wait for poll
    applyRoomUpdate({ ...latestRoom, current_pick: chosen, auction_bid: newBid, pick_number: newPickNum })
  }

  async function submitInterest(interested) {
    setMyInterest(interested)
    const myField = isHost ? 'host_interest' : 'guest_interest'
    const sb = await getSupabase()
    if (!sb) return
    // Retry loop: guards against the race where two simultaneous read-modify-writes
    // overwrite each other's field in the auction_bid JSON.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await sb.from('h2h_rooms').select('auction_bid').eq('id', room.id).single()
      if (!data?.auction_bid || data.auction_bid.phase !== 'interest') return  // phase moved on
      if (data.auction_bid[myField] === interested) return                      // already set
      await sb.from('h2h_rooms').update({
        auction_bid: { ...data.auction_bid, [myField]: interested },
      }).eq('id', room.id)
      await new Promise(r => setTimeout(r, 120 + attempt * 80))               // back off slightly
    }
  }

  const resolvingRef = useRef(false)  // re-entrancy guard

  async function resolveInterest() {
    if (!isHost || resolvingRef.current) return
    resolvingRef.current = true
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (!data?.current_pick || !data?.auction_bid) return
      if (data.auction_bid.phase !== 'interest') return  // already resolved
      const { host_interest, guest_interest, base_price: bp } = data.auction_bid
      if (host_interest === null || host_interest === undefined) return
      if (guest_interest === null || guest_interest === undefined) return
      const player = data.current_pick

      if (!host_interest && !guest_interest) {
        // Both No — skip; must increment pick_number so stale realtime events get discarded
        const newPick = (data.pick_number ?? 0) + 1
        const upd = { ...data, current_pick: null, auction_bid: null, pick_number: newPick }
        const { error } = await sb.from('h2h_rooms').update({ current_pick: null, auction_bid: null, pick_number: newPick }).eq('id', room.id)
        if (!error) { applyRoomUpdate(upd); setLastResult({ player, skipped: true }) }

      } else if (host_interest && !guest_interest) {
        const newTeam   = [...data.host_team, player]
        const newBudget = Math.max(0, data.host_budget - bp)
        const isDone    = newTeam.length >= TOTAL_SLOTS && data.guest_team.length >= TOTAL_SLOTS
        const fields    = { host_team: newTeam, host_budget: newBudget, current_pick: null, auction_bid: null, pick_number: (data.pick_number ?? 0) + 1, status: isDone ? 'done' : 'drafting' }
        const { error } = await sb.from('h2h_rooms').update(fields).eq('id', room.id)
        if (!error) { applyRoomUpdate({ ...data, ...fields }); setLastResult({ player, winner: data.host_name, price: bp }) }

      } else if (!host_interest && guest_interest) {
        const newTeam   = [...data.guest_team, player]
        const newBudget = Math.max(0, data.guest_budget - bp)
        const isDone    = data.host_team.length >= TOTAL_SLOTS && newTeam.length >= TOTAL_SLOTS
        const fields    = { guest_team: newTeam, guest_budget: newBudget, current_pick: null, auction_bid: null, pick_number: (data.pick_number ?? 0) + 1, status: isDone ? 'done' : 'drafting' }
        const { error } = await sb.from('h2h_rooms').update(fields).eq('id', room.id)
        if (!error) { applyRoomUpdate({ ...data, ...fields }); setLastResult({ player, winner: data.guest_name, price: bp }) }

      } else {
        // Both Yes — move to bidding
        const newBid = { ...data.auction_bid, phase: 'bidding', host_bid: null, guest_bid: null }
        const { error } = await sb.from('h2h_rooms').update({ auction_bid: newBid }).eq('id', room.id)
        if (!error) applyRoomUpdate({ ...data, auction_bid: newBid })
      }
    } finally {
      resolvingRef.current = false
    }
  }

  const resolveInterestRef = useRef(resolveInterest)
  useEffect(() => { resolveInterestRef.current = resolveInterest })

  // Trigger interest resolution when both votes are in (host only)
  useEffect(() => {
    if (isSnake || !isHost || !room.current_pick) return
    const bid = room.auction_bid
    if (!bid || bid.phase !== 'interest') return
    if (bid.host_interest === null || bid.host_interest === undefined) return
    if (bid.guest_interest === null || bid.guest_interest === undefined) return
    resolveInterestRef.current?.()
  }, [room.auction_bid?.host_interest, room.auction_bid?.guest_interest])

  async function submitBid() {
    const bp  = room.auction_bid?.base_price ?? 0
    const val = Math.max(bp, Math.min(myBudget, parseFloat(myBid) || bp))
    setBidSubmitted(true)
    const myField = isHost ? 'host_bid' : 'guest_bid'
    const sb = await getSupabase()
    if (!sb) return
    // Same retry pattern as submitInterest to avoid overwriting the other player's bid
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await sb.from('h2h_rooms').select('auction_bid').eq('id', room.id).single()
      if (!data?.auction_bid || data.auction_bid.phase !== 'bidding') return  // phase moved on
      if (data.auction_bid[myField] !== null && data.auction_bid[myField] !== undefined) return  // already set
      await sb.from('h2h_rooms').update({
        auction_bid: { ...data.auction_bid, [myField]: val },
      }).eq('id', room.id)
      await new Promise(r => setTimeout(r, 120 + attempt * 80))
    }
  }

  async function resolveAuction() {
    if (!isHost || resolvingRef.current) return
    resolvingRef.current = true
    try {
      const sb = await getSupabase()
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (!data?.current_pick || !data?.auction_bid) return
      if (data.auction_bid.phase !== 'bidding') return  // already resolved
      const player  = data.current_pick
      const bids    = data.auction_bid
      const hBid    = bids.host_bid  ?? 0
      const gBid    = bids.guest_bid ?? 0
      const hostWon = hBid >= gBid

      const newHostTeam    = hostWon  ? [...data.host_team,  player] : data.host_team
      const newGuestTeam   = !hostWon ? [...data.guest_team, player] : data.guest_team
      const newHostBudget  = hostWon  ? Math.max(0, data.host_budget  - hBid) : data.host_budget
      const newGuestBudget = !hostWon ? Math.max(0, data.guest_budget - gBid) : data.guest_budget
      const isDone  = newHostTeam.length >= TOTAL_SLOTS && newGuestTeam.length >= TOTAL_SLOTS
      const fields  = {
        host_team: newHostTeam, guest_team: newGuestTeam,
        host_budget: newHostBudget, guest_budget: newGuestBudget,
        current_pick: null, auction_bid: null,
        pick_number: (data.pick_number ?? 0) + 1,
        status: isDone ? 'done' : 'drafting',
      }
      const { error } = await sb.from('h2h_rooms').update(fields).eq('id', room.id)
      if (!error) {
        applyRoomUpdate({ ...data, ...fields })
        setLastResult({ player, winner: hostWon ? data.host_name : data.guest_name, price: hostWon ? hBid : gBid })
      }
    } finally {
      resolvingRef.current = false
    }
  }

  const resolveAuctionRef = useRef(resolveAuction)
  useEffect(() => { resolveAuctionRef.current = resolveAuction })

  const postNextPlayerRef = useRef(postNextPlayer)
  useEffect(() => { postNextPlayerRef.current = postNextPlayer })

  // Resolve auction as soon as BOTH bids are in (don't wait for full countdown)
  useEffect(() => {
    if (isSnake || !isHost || !room.current_pick) return
    const bid = room.auction_bid
    if (!bid || bid.phase !== 'bidding') return
    if (bid.host_bid === null || bid.host_bid === undefined) return
    if (bid.guest_bid === null || bid.guest_bid === undefined) return
    resolveAuctionRef.current?.()
  }, [room.auction_bid?.host_bid, room.auction_bid?.guest_bid])

  // Auto-No if team is full or can't afford base price
  useEffect(() => {
    if (isSnake || !currentPlayer || auctionPhase !== 'interest' || myInterest !== null) return
    const myField = isHost ? 'host_interest' : 'guest_interest'
    if (room.auction_bid?.[myField] !== null && room.auction_bid?.[myField] !== undefined) return
    const teamFull   = myTeam.length >= TOTAL_SLOTS
    const cantAfford = (myBudget ?? 0) < bp
    if (teamFull || cantAfford) {
      submitInterest(false)
    }
  }, [currentPlayer, auctionPhase, myInterest, myTeam.length, myBudget, bp])

  // Auto-post next player for auction (host)
  useEffect(() => {
    if (isSnake || !isHost) return
    if (room.status !== 'drafting' || room.current_pick) return
    if ((room.host_team?.length ?? 0) >= TOTAL_SLOTS && (room.guest_team?.length ?? 0) >= TOTAL_SLOTS) return
    const t = setTimeout(() => postNextPlayerRef.current?.(), 800)
    return () => clearTimeout(t)
  }, [room.pick_number, room.current_pick, room.status])

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  if (room.status === 'done') return <DraftDone room={room} uid={uid} onDone={onDone} onInitSharedLeague={onInitSharedLeague} onSharedLeague={onSharedLeague} />

  const snakeMyTurn  = isSnake && room.current_turn === uid
  const allPickedSet = new Set([...myTeam, ...oppTeam].map(p => p.name))
  const snakePlayers = currentEntry
    ? getEligiblePlayers(
        currentEntry.players
          .filter(p => !allPickedSet.has(p.name))
          .filter(p => compEligible(p, myTeam, myComp)),
        myTeam
      )
    : []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--card)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button
          onClick={onBack}
          title="Back to home"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.375rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: '0.3rem 0.6rem', flexShrink: 0, transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#64748b' }}
        >
          ← Exit
        </button>
        <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text)', flex: 1 }}>
          {isSnake ? `🐍 Snake Draft — Pick ${(room.pick_number ?? 0) + 1}/22` : `🔨 Live Auction — ${myTeam.length}/11 players`}
        </div>
        {!isSnake && (
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: (myBudget ?? 80) < 5 ? '#ef4444' : '#22c55e', flexShrink: 0 }}>
            ₹{myBudget ?? 80}cr left
          </div>
        )}
      </div>

      <div style={{ maxWidth: isSnake ? 1100 : 900, margin: '0 auto', padding: '1rem', width: '100%', display: 'grid', gridTemplateColumns: isSnake ? '200px 1fr 200px' : '1fr 220px', gap: '1rem', alignItems: 'start' }}>

        {/* ── Snake: My XI (left) ─────────────────────────────────────────── */}
        {isSnake && <XIPanel name={`${myName} (You)`} team={myTeam} isMe comp={myComp} />}

        {/* ── Center/Left panel ──────────────────────────────────────────── */}
        <div>

          {/* ── SNAKE UI ── */}
          {isSnake && (
            <>
              <div style={{ marginBottom: '0.875rem', padding: '0.6rem 1rem', borderRadius: '0.5rem', background: snakeMyTurn ? '#0d1a0d' : 'var(--card)', border: `1px solid ${snakeMyTurn ? '#22c55e44' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: snakeMyTurn ? '#22c55e' : '#64748b' }}>
                  {snakeMyTurn ? '✅ Your pick' : currentEntry ? `⏳ ${oppName}'s pick` : '⏳ Spinning…'}
                </span>
                {currentEntry && turnTimeLeft != null && (
                  <span style={{ fontWeight: 900, fontSize: '1.1rem', color: turnTimeLeft <= 5 ? '#ef4444' : turnTimeLeft <= 10 ? '#f59e0b' : '#64748b', minWidth: 36, textAlign: 'right' }}>
                    {turnTimeLeft}s
                  </span>
                )}
              </div>

              {(spinning || cycleEntry) && !currentEntry && (
                <div style={{ padding: '1.25rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', textAlign: 'center', marginBottom: '0.875rem' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: cycleEntry?.color ?? '#4169E1' }}>
                    {cycleEntry?.teamName ?? '—'}
                  </div>
                </div>
              )}

              {currentEntry && (
                <div>
                  <div style={{ padding: '0.75rem 1.1rem', background: currentEntry.color + '18', border: `1px solid ${currentEntry.color}44`, borderRadius: '0.75rem 0.75rem 0 0', display: 'flex', alignItems: 'center' }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: '#fff' }}>
                      {currentEntry.teamName}
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>{currentEntry.season}</span>
                    </div>
                  </div>
                  <div style={{ background: 'var(--card)', border: `1px solid ${currentEntry.color}22`, borderTop: 'none', borderRadius: '0 0 0.75rem 0.75rem', overflow: 'hidden' }}>
                    {snakePlayers.length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                        {currentEntry.players.filter(p => !allPickedSet.has(p.name)).length === 0
                          ? 'All players from this squad already taken'
                          : 'No players in this squad fit your composition slots'}
                      </div>
                    ) : snakePlayers.map((p, i) => (
                      <div
                        key={p.id ?? p.name}
                        onClick={snakeMyTurn ? () => snakePick(p) : undefined}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.6rem 1rem',
                          borderBottom: i < snakePlayers.length - 1 ? '1px solid var(--border2)' : 'none',
                          cursor: snakeMyTurn ? 'pointer' : 'default',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (snakeMyTurn) e.currentTarget.style.background = 'var(--border2)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{p.nationality} · {p.role}</div>
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>
                          {scaleDisplay(p.overall)}
                        </div>
                        {snakeMyTurn && <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>→</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── AUCTION UI ── */}
          {!isSnake && (
            <>
              {/* Waiting for next player */}
              {!currentPlayer && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>
                  ⏳ Waiting for next player…
                </div>
              )}

              {/* Player card */}
              {currentPlayer && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>

                  {/* Player header */}
                  <div style={{ padding: '1rem 1.25rem', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>{currentPlayer.name}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: roleColor(currentPlayer.role), background: roleColor(currentPlayer.role) + '22', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                          {currentPlayer.role}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{currentPlayer.nationality}</span>
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{currentPlayer.teamName} · {currentPlayer.season}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1 }}>{scaleDisplay(currentPlayer.overall)}</div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>RATING</div>
                    </div>
                  </div>

                  {/* Base price */}
                  <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Base price</span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>₹{bp}cr</span>
                  </div>

                  {/* Interest phase */}
                  {auctionPhase === 'interest' && (
                    <div style={{ padding: '1rem 1.25rem' }}>
                      {(() => {
                        const teamFull   = myTeam.length >= TOTAL_SLOTS
                        const cantAfford = (myBudget ?? 0) < bp
                        const blocked    = teamFull || cantAfford
                        const voted      = myInterest !== null
                        return (
                          <>
                            {blocked && !voted && (
                              <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem' }}>
                                {teamFull ? '⚠️ Your squad is full — auto-passing' : `⚠️ Can't afford ₹${bp}cr — auto-passing`}
                              </div>
                            )}
                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, textAlign: 'center', marginBottom: '0.875rem' }}>
                              Do you want to bid on this player?
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <button
                                onClick={() => !voted && !blocked && submitInterest(true)}
                                disabled={voted || blocked}
                                style={{
                                  flex: 1, padding: '0.8rem',
                                  background: myInterest === true ? '#0d1a0d' : (voted || blocked) ? 'var(--card)' : '#0d1a0d',
                                  border: `2px solid ${myInterest === true ? '#22c55e' : (voted || blocked) ? 'var(--border2)' : '#22c55e44'}`,
                                  borderRadius: '0.625rem',
                                  color: myInterest === true ? '#22c55e' : (voted || blocked) ? 'var(--border)' : '#22c55e',
                                  fontSize: '1rem', fontWeight: 800,
                                  cursor: (!voted && !blocked) ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.15s',
                                }}
                              >
                                {myInterest === true ? '✅ Yes!' : '✅ Yes'}
                              </button>
                              <button
                                onClick={() => !voted && submitInterest(false)}
                                disabled={voted}
                                style={{
                                  flex: 1, padding: '0.8rem',
                                  background: myInterest === false ? '#1a0d0d' : 'var(--card)',
                                  border: `2px solid ${myInterest === false ? '#ef4444' : voted ? 'var(--border2)' : '#ef444444'}`,
                                  borderRadius: '0.625rem',
                                  color: myInterest === false ? '#ef4444' : voted ? 'var(--border)' : '#ef4444',
                                  fontSize: '1rem', fontWeight: 800,
                                  cursor: !voted ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.15s',
                                }}
                              >
                                {myInterest === false ? '❌ No' : '❌ No'}
                              </button>
                            </div>
                          </>
                        )
                      })()}
                      {/* Show opponent status */}
                      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {[
                          { name: room.host_name, val: room.auction_bid?.host_interest },
                          { name: room.guest_name, val: room.auction_bid?.guest_interest },
                        ].map(({ name, val }) => (
                          <div key={name} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: val === true ? '#0d1a0d' : val === false ? '#1a0d0d' : 'var(--card)', color: val === true ? '#22c55e' : val === false ? '#ef4444' : '#475569', border: `1px solid ${val === true ? '#22c55e44' : val === false ? '#ef444444' : 'var(--border)'}` }}>
                            {name}: {val === true ? 'Yes ✅' : val === false ? 'No ❌' : '…'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bidding phase */}
                  {auctionPhase === 'bidding' && (
                    <div style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>Both interested — bidding war! Min bid: ₹{bp}cr</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 900, color: countdown <= 5 ? '#ef4444' : '#f59e0b' }}>
                          {countdown != null ? `${countdown}s` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <input
                          type="number" min={bp} max={myBudget ?? bp} step={0.5}
                          value={myBid}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v > (myBudget ?? 80)) return  // block over-budget
                            setMyBid(e.target.value)
                          }}
                          disabled={bidSubmitted}
                          placeholder={`Min ₹${bp}cr`}
                          style={{ flex: 1, padding: '0.6rem 0.875rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: 'var(--text)', fontSize: '0.95rem', outline: 'none' }}
                        />
                        <button
                          onClick={submitBid}
                          disabled={bidSubmitted || !myBid || parseFloat(myBid) < bp}
                          style={{ padding: '0.6rem 1rem', background: bidSubmitted ? 'var(--border2)' : 'linear-gradient(135deg, #4169E1, #2952CC)', color: bidSubmitted ? '#475569' : '#fff', border: 'none', borderRadius: '0.4rem', fontWeight: 800, cursor: bidSubmitted ? 'not-allowed' : 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                        >
                          {bidSubmitted ? '✓ Bid placed' : 'Bid'}
                        </button>
                      </div>
                      {/* Bid status */}
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {[
                          { name: room.host_name, val: bidsLocal.host },
                          { name: room.guest_name, val: bidsLocal.guest },
                        ].map(({ name, val }) => (
                          <div key={name} style={{ flex: 1, padding: '0.4rem 0.75rem', borderRadius: '0.4rem', background: val != null ? '#0d1a0d' : 'var(--card)', border: `1px solid ${val != null ? '#22c55e44' : 'var(--border)'}`, fontSize: '0.75rem', fontWeight: 700, color: val != null ? '#22c55e' : '#475569', textAlign: 'center' }}>
                            {name}: {val != null ? `₹${val}cr` : '…'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Last result banner */}
              {lastResult && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 700, animation: 'fade-in 0.3s ease both', background: lastResult.skipped ? 'var(--card)' : '#0d1a0d', border: `1px solid ${lastResult.skipped ? 'var(--border)' : '#22c55e44'}`, color: lastResult.skipped ? '#475569' : '#86efac' }}>
                  {lastResult.skipped
                    ? `⏭ ${lastResult.player.name} skipped — no interest`
                    : `✅ ${lastResult.winner} got ${lastResult.player.name} for ₹${lastResult.price}cr`}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        {isSnake
          ? <XIPanel name={oppName} team={oppTeam} isMe={false} comp={oppComp} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <TeamColumn name={myName}  team={myTeam}  budget={myBudget}  highlight />
              <TeamColumn name={oppName} team={oppTeam} budget={oppBudget} />
            </div>
          )
        }
      </div>
    </div>
  )
}

function TeamColumn({ name, team, budget, highlight }) {
  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${highlight ? '#4169E144' : 'var(--border)'}`, borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: highlight ? '#4169E1' : '#64748b' }}>{name} ({team.length}/11)</div>
        {budget != null && <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#22c55e' }}>₹{budget}cr</div>}
      </div>
      {team.map((p, i) => (
        <div key={p.id ?? p.name ?? i} style={{ padding: '0.3rem 0.75rem', borderBottom: i < team.length - 1 ? '1px solid var(--border2)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>{scaleDisplay(p.overall)}</div>
        </div>
      ))}
    </div>
  )
}

function DraftDone({ room, uid, onDone, onInitSharedLeague, onSharedLeague }) {
  const [loading, setLoading] = useState(false)
  const isHost   = room.host_id === uid
  const isShared = room.league_mode === 'shared'

  // Guest: poll until tournament appears, then transition
  useEffect(() => {
    if (!isShared || isHost) return
    if (room.tournament) { onSharedLeague(room); return }
    const poll = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (data?.tournament) {
        clearInterval(poll)
        onSharedLeague(data)
      }
    }, 2000)
    return () => clearInterval(poll)
  }, [room.id, isShared, isHost])

  // Classic mode
  if (!isShared) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏏</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.5rem' }}>Draft Complete!</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '2rem' }}>Both squads are set. The IPL season begins now.</div>
          <button
            onClick={() => onDone(room)}
            style={{ padding: '0.875rem 2rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}
          >
            🏏 Start Season →
          </button>
        </div>
      </div>
    )
  }

  // Shared league mode
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 360 }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏟️</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.5rem' }}>Draft Complete!</div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.5rem', lineHeight: 1.6 }}>
          Both squads locked in. You're about to compete in the same IPL together — one league, one trophy.
        </div>
        <div style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, marginBottom: '2rem' }}>
          Your teams will clash head-to-head mid-season.
        </div>

        {isHost ? (
          <button
            onClick={async () => {
              setLoading(true)
              await onInitSharedLeague(room)
              // transition handled by parent watching tournament field
            }}
            disabled={loading}
            style={{ padding: '0.875rem 2rem', background: loading ? 'var(--border2)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: loading ? '#64748b' : 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', width: '100%' }}
          >
            {loading ? '⏳ Setting up league…' : '🏟️ Start Shared League →'}
          </button>
        ) : (
          <div style={{ padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem', color: '#64748b', fontSize: '0.88rem', fontWeight: 600 }}>
            ⏳ Waiting for host to start the league…
          </div>
        )}
      </div>
    </div>
  )
}
