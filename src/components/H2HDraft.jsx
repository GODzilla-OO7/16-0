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
import { WHEEL_ENTRIES, getPrimeRatings } from '../data/players.js'
import { compFromSlider, roleGroup } from './H2HLobby.jsx'

const TOTAL_SLOTS   = 11
const BID_SECONDS   = 14
const SNAKE_SECONDS = 20   // time limit per pick in snake draft

// ── IPL squad rules ──────────────────────────────────────────────────────────
function overseasCount(team) { return team.filter(p => p.nationality !== 'India').length }
function hasWK(team)         { return team.some(p => p.role === 'wicket-keeper') }

// ── Composition quota check ───────────────────────────────────────────────────
// Supports both old format {batters,ar,bowlers,wk} and new per-role format {opener, 'top-order', ...}
function compEligible(player, team, comp) {
  if (!comp) return true
  const slotsLeft = TOTAL_SLOTS - team.length

  if ('batters' in comp) {
    // Legacy format
    const g = roleGroup(player.role)
    let batters = 0, ar = 0, bowlers = 0, wk = 0
    for (const p of team) {
      const pg = roleGroup(p.role)
      if (pg === 'batter') batters++
      else if (pg === 'ar') ar++
      else if (pg === 'bowler') bowlers++
      else wk++
    }
    const minB = Math.max(0, comp.batters - batters)
    const minA = Math.max(0, comp.ar      - ar)
    const minBo= Math.max(0, comp.bowlers - bowlers)
    const minW = Math.max(0, comp.wk      - wk)
    const hardMin = minB + minA + minBo + minW
    if (g === 'batter') { if (batters >= comp.batters) return false; return (slotsLeft-1) >= (hardMin-minB) }
    if (g === 'ar')     { if (ar >= comp.ar)           return false; return (slotsLeft-1) >= (hardMin-minA) }
    if (g === 'bowler') { if (bowlers >= comp.bowlers) return false; return (slotsLeft-1) >= (hardMin-minBo) }
    if (g === 'wk')     { if (wk >= comp.wk)           return false; return (slotsLeft-1) >= (hardMin-minW) }
    return true
  }

  // New per-role format
  const roleCounts = {}
  for (const p of team) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1
  const limit   = comp[player.role] ?? 0
  const current = roleCounts[player.role] ?? 0
  if (current >= limit) return false
  let hardMin = 0
  for (const [role, required] of Object.entries(comp)) {
    hardMin += Math.max(0, required - (roleCounts[role] ?? 0))
  }
  return (slotsLeft - 1) >= (hardMin - 1)
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

// Can this team legally pick this player? (comp + overseas + WK + slots)
function canTeamTakePlayer(player, team, comp) {
  if (team.length >= TOTAL_SLOTS) return false
  if (!compEligible(player, team, comp)) return false
  const oc = overseasCount(team)
  if (oc >= 4 && player.nationality !== 'India') return false
  const last = team.length === TOTAL_SLOTS - 1
  if (last && !hasWK(team) && player.role !== 'wicket-keeper') return false
  return true
}

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }

// H2HDraft is always IPL — use the IPL prime map
const _iplPrimeMap = getPrimeRatings('ipl')

// Returns the correct raw overall for a player given rating type (used for gameplay logic)
function getOverall(player, ratingType) {
  return ratingType === 'prime' ? (_iplPrimeMap[player.name] ?? player.overall) : player.overall
}

// Returns the display number — prime shows IPL career peak, overall uses scaleDisplay
function displayOverall(player, ratingType) {
  if (ratingType === 'prime') return Math.min(99, _iplPrimeMap[player.name] ?? player.overall)
  return scaleDisplay(player.overall)
}

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
  if (r >= 87) return 2.00
  if (r >= 82) return 1.50
  if (r >= 77) return 1.00
  if (r >= 72) return 0.75
  if (r >= 67) return 0.50
  if (r >= 62) return 0.40
  return 0.30
}

function roleColor(role) {
  const map = {
    'opener': '#f59e0b', 'top-order': '#f59e0b',
    'middle-order': '#22c55e', 'wicket-keeper': '#a78bfa',
    'all-rounder': '#C8102E', 'pace-bowler': '#ef4444', 'spin-bowler': '#f97316',
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
// seasonMin/seasonMax filter which IPL seasons to include.
// Players appearing in multiple seasons are deduplicated — the first entry
// within the filtered range is kept (which reflects that era's rating).
function buildAuctionPool(seasonMin = 2008, seasonMax = 2026) {
  const seen = new Set()
  const pool = []
  for (const entry of WHEEL_ENTRIES) {
    const c = entry.competition
    if (c !== 'ipl' && !c?.includes?.('ipl')) continue
    // Filter by season year
    const year = parseInt(String(entry.season))
    if (!isNaN(year) && (year < seasonMin || year > seasonMax)) continue
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
// ratingType determines which overall value to use for the threshold
function pickFromPool(available, ratingType = 'overall') {
  const stars = available.filter(p => scaleDisplay(getOverall(p, ratingType)) >= 82)
  const src   = (Math.random() < 0.65 && stars.length > 0) ? stars : available
  return src[Math.floor(Math.random() * src.length)]
}

// ── XI Panel (snake + auction — shows both teams' forming XI) ───────────────
const XI_SLOTS_DEFAULT = [
  { role: 'opener',         label: 'OPN', n: 2 },
  { role: 'top-order',      label: 'TOP', n: 1 },
  { role: 'wicket-keeper',  label: 'WK',  n: 1 },
  { role: 'middle-order',   label: 'MID', n: 2 },
  { role: 'all-rounder',    label: 'AR',  n: 2 },
  { role: 'pace-bowler',    label: 'PCE', n: 2 },
  { role: 'spin-bowler',    label: 'SPN', n: 1 },
]

const ROLE_LABEL_MAP = {
  'opener': 'OPN', 'top-order': 'TOP', 'middle-order': 'MID',
  'wicket-keeper': 'WK', 'all-rounder': 'ALL', 'pace-bowler': 'PACE', 'spin-bowler': 'SPIN',
}

function buildSlotsFromComp(comp) {
  if (!comp) return XI_SLOTS_DEFAULT
  // New per-role format
  if (!('batters' in comp)) {
    const order = ['opener','top-order','middle-order','wicket-keeper','all-rounder','pace-bowler','spin-bowler']
    return order.filter(r => (comp[r] || 0) > 0).map(r => ({ role: r, label: ROLE_LABEL_MAP[r] || r.slice(0,3).toUpperCase(), n: comp[r] }))
  }
  return XI_SLOTS_DEFAULT
}

function XIPanel({ name, team, isMe, comp, budget, ratingType = 'overall' }) {
  const oc   = overseasCount(team)
  const wkOk = hasWK(team)

  const slots_def = buildSlotsFromComp(comp)
  const used  = new Set()
  const slots = []
  for (const s of slots_def) {
    const matching = team.filter(p => p.role === s.role && !used.has(p.name))
    for (let i = 0; i < s.n; i++) {
      const p = matching[i] ?? null
      if (p) used.add(p.name)
      slots.push({ label: s.label, role: s.role, player: p })
    }
  }
  team.filter(p => !used.has(p.name)).forEach(p => slots.push({ label: '?', role: p.role, player: p }))

  return (
    <div style={{
      background: 'var(--card2)',
      border: `1px solid ${isMe ? '#C8102E44' : 'var(--card-border)'}`,
      borderRadius: '0.75rem', overflow: 'hidden',
      position: 'sticky', top: '4.5rem',
    }}>
      {/* Header */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 900, color: isMe ? '#C8102E' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{name}</div>
          <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.6rem', flexShrink: 0 }}>
            {budget != null && <span style={{ color: (budget < 5) ? '#ef4444' : '#22c55e', fontWeight: 800 }}>₹{budget}cr</span>}
            <span style={{ color: oc >= 4 ? '#ef4444' : '#475569', fontWeight: 700 }}>🌍{oc}/4</span>
          </div>
        </div>
        <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '0.1rem' }}>{team.length}/11 players</div>
      </div>
      {/* Overseas slots */}
      <div style={{ padding: '0.3rem 0.75rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>✈️ OS</span>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < oc ? '#C8102E' : 'var(--border2)', border: `1.5px solid ${i < oc ? '#C8102E' : 'var(--border)'}` }} />
        ))}
        <span style={{ fontSize: '0.6rem', color: oc >= 4 ? '#ef4444' : '#475569', fontWeight: 700, marginLeft: '0.15rem' }}>{oc}/4</span>
      </div>
      {/* Slots */}
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', padding: '0.25rem 0.75rem', borderBottom: '1px solid var(--border2)' }}>Your XI</div>
      {slots.map(({ label, role, player }, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.28rem 0.6rem',
          borderBottom: i < slots.length - 1 ? '1px solid var(--card)' : 'none',
          background: player ? 'transparent' : 'var(--bg)',
          minHeight: 26,
        }}>
          <span style={{
            fontSize: '0.48rem', fontWeight: 800, color: player ? roleColor(role) : 'var(--muted)',
            width: 28, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em',
            background: player ? roleColor(role) + '22' : 'transparent',
            padding: '0.1rem 0.2rem', borderRadius: 3,
          }}>{label}</span>
          {player ? (
            <>
              <span style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
              <span style={{ fontSize: '0.58rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>{displayOverall(player, ratingType)}</span>
              {player.nationality !== 'India' && <span style={{ fontSize: '0.46rem', color: '#C8102E', fontWeight: 800, flexShrink: 0 }}>OS</span>}
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

  const [myFolded, setMyFolded]         = useState(false)

  const [showManualBid, setShowManualBid] = useState(false)
  const [manualBidVal, setManualBidVal]   = useState('')
  const [countdown, setCountdown]         = useState(null)
  const [skipBanner, setSkipBanner]       = useState(null)   // "Ineligible — skipping X"
  const [turnTimeLeft, setTurnTimeLeft]   = useState(null)  // snake pick timer

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
  // Use new per-role comp_data if available, fall back to legacy slider format
  const myComp  = (isHost ? room.host_comp_data  : room.guest_comp_data)  ?? compFromSlider(isHost ? (room.host_comp ?? 5)  : (room.guest_comp ?? 5))
  const oppComp = (isHost ? room.guest_comp_data : room.host_comp_data)   ?? compFromSlider(isHost ? (room.guest_comp ?? 5) : (room.host_comp ?? 5))
  // bp must be declared here (before any useEffects) to avoid TDZ ReferenceError
  const bp = room.auction_bid?.base_price ?? 0
  // Room-level settings set by host
  const ratingType  = room.rating_type  ?? 'overall'
  const seasonRange = room.season_range ?? { min: 2008, max: 2026 }

  // ── Apply room update (shared by realtime + polling) ────────────────────────
  const applyRoomUpdate = useCallback((updated) => {
    // React calls the functional updater synchronously, so `accepted` is set
    // before any code below runs. If the update is stale (lower pick_number),
    // we must skip ALL side effects — otherwise clearInterval / setCurrentPlayer
    // run on stale data and nuke the live countdown for the current player.
    let accepted = false
    let playerChanged = false  // true when pick_number advances = a new auction round started
    setRoom(prev => {
      if ((updated.pick_number ?? 0) < (prev.pick_number ?? 0)) return prev
      if ((updated.pick_number ?? 0) > (prev.pick_number ?? 0)) playerChanged = true
      accepted = true
      return updated
    })
    if (!accepted) return   // stale subscription — ignore entirely

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
        // Reset fold if DB says we're not folded — catches missed subscriptions and
        // out-of-order updates where phase didn't transition but fold was cleared
        const myFoldKey = isHost ? 'host_folded' : 'guest_folded'
        if (updated.auction_bid && !updated.auction_bid[myFoldKey]) {
          setMyFolded(false)
        }
        // Reset manual bid UI on any phase transition OR when a new player arrives
        // (pick_number advanced). The second condition catches the case where Supabase
        // drops the null-state event and we jump directly from player N to player N+1
        // while both are in 'open' phase — without this, the old bid amount stays in the input.
        if (playerChanged
            || (newPhase === 'open' && auctionPhaseRef.current !== 'open')
            || (newPhase === 'war'  && auctionPhaseRef.current !== 'war')) {
          setShowManualBid(false)
          setManualBidVal('')
        }
        setAuctionPhase(newPhase)
      } else {
        // No current pick — waiting for next player; reset all auction UI state
        setMyFolded(false)
        setCurrentPlayer(null)
        setAuctionPhase(null)
        setCycleEntry(null)
        clearInterval(countdownRef.current)
        setCountdown(null)
        setShowManualBid(false)
        setManualBidVal('')
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
  // lastPollResolveRef: rate-limits the backup resolveAuction call to once per 4s.
  // Without this, polling fires resolveAuction every second, which combined with the
  // countdown's 500ms retry creates too many concurrent resolution attempts and can
  // cause double-resolution on slow networks.
  const lastPollResolveRef = useRef(0)
  useEffect(() => {
    if (room.status === 'done') return
    const interval = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (!data) return
      const r = roomRef.current
      const changed =
        data.pick_number            !== r.pick_number   ||
        data.status                 !== r.status        ||
        data.current_pick?.name     !== r.current_pick?.name ||
        JSON.stringify(data.auction_bid) !== JSON.stringify(r.auction_bid)
      if (changed) applyRoomUpdate(data)

      // Backup resolution: fires at most once every 4s so it doesn't flood alongside
      // the countdown's 500ms retry. The primary trigger is still the countdown — this
      // only catches cases where the countdown itself got stuck or was missed.
      if (!isSnake && data.current_pick && data.auction_bid?.bid_deadline) {
        if (new Date(data.auction_bid.bid_deadline) < new Date()) {
          const now = Date.now()
          if (now - lastPollResolveRef.current > 4000) {
            lastPollResolveRef.current = now
            resolveAuctionRef.current?.()
          }
        }
      }
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
    const myCompData = (isHost ? latestRoom.host_comp_data : latestRoom.guest_comp_data) ?? compFromSlider(isHost ? (latestRoom.host_comp ?? 5) : (latestRoom.guest_comp ?? 5))
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
    if (!isHost) return
    // Mutex: only one postNextPlayer at a time — prevents two concurrent calls from
    // picking different players and writing conflicting states to DB
    if (postingRef.current) return
    postingRef.current = true
    try {
      const sb = await getSupabase()
      if (!sb) { spinRef.current = setTimeout(() => postNextPlayerRef.current?.(), 2000); return }

      // Always read FRESH state from DB — never rely on potentially stale roomRef.
      // This guarantees pickedSet, teams, and pick_number are accurate even if a
      // subscription event hasn't arrived yet on this client.
      const { data: fresh, error: readErr } = await sb.from('h2h_rooms').select('*').eq('id', roomRef.current.id).single()
      if (readErr || !fresh) { spinRef.current = setTimeout(() => postNextPlayerRef.current?.(), 2000); return }
      if (fresh.current_pick) return   // another call already posted — bail
      if (fresh.status !== 'drafting') return

      const rt  = fresh.rating_type  ?? 'overall'
      const sr  = fresh.season_range ?? { min: 2008, max: 2026 }
      const pool = buildAuctionPool(sr.min, sr.max)

      const hComp = fresh.host_comp_data  ?? compFromSlider(fresh.host_comp  ?? 5)
      const gComp = fresh.guest_comp_data ?? compFromSlider(fresh.guest_comp ?? 5)

      // ── Fast-fill teams with ₹0 budget ──────────────────────────────────────
      let hostTeam  = [...(fresh.host_team  ?? [])]
      let guestTeam = [...(fresh.guest_team ?? [])]
      const usedNames = new Set([...hostTeam, ...guestTeam].map(p => p.name))

      function fillFromCheap(team, comp) {
        const filled = [...team]
        while (filled.length < TOTAL_SLOTS) {
          const candidates = pool
            .filter(p => !usedNames.has(p.name))
            .sort((a, b) => getOverall(a, rt) - getOverall(b, rt))
          const idx = candidates.findIndex(p => canTeamTakePlayer(p, filled, comp))
          if (idx === -1) break
          const player = candidates[idx]
          usedNames.add(player.name)
          filled.push(player)
        }
        return filled
      }

      let fastFilled = false
      if ((fresh.host_budget ?? 0) <= 0 && hostTeam.length < TOTAL_SLOTS) {
        hostTeam  = fillFromCheap(hostTeam,  hComp); fastFilled = true
      }
      if ((fresh.guest_budget ?? 0) <= 0 && guestTeam.length < TOTAL_SLOTS) {
        guestTeam = fillFromCheap(guestTeam, gComp); fastFilled = true
      }

      if (fastFilled) {
        const isDone     = hostTeam.length >= TOTAL_SLOTS && guestTeam.length >= TOTAL_SLOTS
        const fastPickNum = (fresh.pick_number ?? 0) + 1
        const upd = {
          host_team: hostTeam, guest_team: guestTeam,
          current_pick: null, auction_bid: null,
          pick_number: fastPickNum,
          status: isDone ? 'done' : 'drafting',
        }
        // Optimistic lock: only write if pick_number hasn't advanced (no concurrent write)
        const { data: written } = await sb.from('h2h_rooms')
          .update(upd).eq('id', fresh.id).eq('pick_number', fresh.pick_number).select('id')
        if (written?.length) applyRoomUpdate({ ...fresh, ...upd })
        return
      }

      // ── Pick next player — exhaustive star-biased ordered search ────────────
      // Split pool into 82+ stars and others, shuffle each tier independently,
      // try stars first. This guarantees we find an eligible player if one exists
      // (no more 50-attempt random cap that could miss eligible players).
      const pickedSet = new Set([...hostTeam, ...guestTeam].map(p => p.name))
      const available = pool.filter(p => !pickedSet.has(p.name))
      if (!available.length) return

      const hT = fresh.host_team  ?? []
      const gT = fresh.guest_team ?? []
      const stars  = shuffle(available.filter(p => scaleDisplay(getOverall(p, rt)) >= 82))
      const others = shuffle(available.filter(p => scaleDisplay(getOverall(p, rt)) <  82))
      const ordered = [...stars, ...others]

      let chosen = null
      for (const candidate of ordered) {
        const hostOk  = hT.length  < TOTAL_SLOTS && canTeamTakePlayer(candidate, hT,  hComp)
        const guestOk = gT.length < TOTAL_SLOTS && canTeamTakePlayer(candidate, gT, gComp)
        if (hostOk || guestOk) { chosen = candidate; break }
      }

      if (!chosen) return  // all remaining players ineligible for both teams — draft ending

      const bp       = basePrice(getOverall(chosen, rt))
      const deadline = new Date(Date.now() + BID_SECONDS * 1000).toISOString()
      const newBid   = {
        phase: 'open', base_price: bp,
        current_bid: null, current_bidder_id: null,
        host_folded: false, guest_folded: false,
        bid_deadline: deadline,
      }
      const newPickNum = (fresh.pick_number ?? 0) + 1

      // Optimistic lock on pick_number: if another postNextPlayer call already wrote
      // (advancing pick_number), this write matches 0 rows and is silently dropped.
      // This eliminates the race condition where two concurrent calls write different
      // players at the same pick_number causing clients to see different players.
      const { data: written, error } = await sb.from('h2h_rooms')
        .update({ current_pick: chosen, auction_bid: newBid, pick_number: newPickNum })
        .eq('id', fresh.id)
        .eq('pick_number', fresh.pick_number)  // only write if nobody else has
        .select('id')

      if (error) {
        spinRef.current = setTimeout(() => postNextPlayerRef.current?.(), 2000)
        return
      }
      if (!written?.length) return  // another call won the race — its result will arrive via subscription

      applyRoomUpdate({ ...fresh, current_pick: chosen, auction_bid: newBid, pick_number: newPickNum })
    } finally {
      postingRef.current = false
    }
  }

  // Place a bid — works in both open (first bid) and war (counter) phases
  async function placeBid(amount) {
    const latestRoom = roomRef.current
    if (!latestRoom.auction_bid) return

    const sb = await getSupabase()
    if (!sb) return

    // Fetch fresh auction_bid from DB so we spread the latest state — this prevents
    // the guest's bid from erasing a concurrent host auto-fold (or vice-versa) that
    // wrote to the DB but whose subscription hasn't arrived at this client yet.
    const { data: fresh } = await sb.from('h2h_rooms')
      .select('auction_bid, host_budget, guest_budget')
      .eq('id', latestRoom.id).single()
    const bid = fresh?.auction_bid
    if (!bid) return  // player was already resolved while we were fetching
    // Bug G fix: if the timer has already expired, refuse the bid.
    // Without this, clicking "Bid" at t=0 (before resolveAuction writes) lands a fresh
    // 14s deadline in DB, resetting the countdown and delaying resolution by another 14s.
    if (bid.bid_deadline && new Date(bid.bid_deadline) < new Date()) return

    // In war phase, only the non-bidder can bid
    if (bid.phase === 'war' && bid.current_bidder_id === uid) return
    const minBid = bid.current_bid != null ? +(bid.current_bid + 0.25).toFixed(2) : bid.base_price
    const myBudget = isHost ? (fresh.host_budget ?? 0) : (fresh.guest_budget ?? 0)
    const val = +Math.max(minBid, Math.min(myBudget, amount)).toFixed(2)
    if (val < minBid) return

    const deadline = new Date(Date.now() + BID_SECONDS * 1000).toISOString()
    // Only clear MY fold flag — spread from FRESH DB state so opponent's fold is preserved
    const myFoldFieldBid = isHost ? 'host_folded' : 'guest_folded'
    const newBid = {
      ...bid,
      phase: 'war',
      current_bid: val,
      current_bidder_id: uid,
      bid_deadline: deadline,
      [myFoldFieldBid]: false,
      prev_bid: bid.current_bid ?? null,
      prev_bidder_id: bid.current_bidder_id ?? null,
    }
    const { error } = await sb.from('h2h_rooms').update({ auction_bid: newBid }).eq('id', latestRoom.id)
    if (!error) applyRoomUpdate({ ...latestRoom, auction_bid: newBid })
    setShowManualBid(false)
    setManualBidVal('')
  }

  // Pass — lock in your current position. If you already bid, that bid STANDS; you're
  // just locked from raising further. The opponent must counter or also pass.
  // No bid retraction — once you bid, you're committed at that price.
  async function foldBid() {
    const latestRoom = roomRef.current
    const bid = latestRoom.auction_bid
    if (!bid) return
    setMyFolded(true)
    const myFoldField = isHost ? 'host_folded' : 'guest_folded'
    const sb = await getSupabase()
    if (!sb) return

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', latestRoom.id).single()
      if (!data?.auction_bid) {
        // Auction already resolved while we were folding — sync screen immediately
        // so we don't stay stuck on the old player waiting for a subscription event
        if (data) applyRoomUpdate(data)
        return
      }
      if (data.auction_bid[myFoldField]) {
        // Already folded in DB — sync in case we missed an intermediate subscription
        applyRoomUpdate(data)
        return
      }

      // Just set the pass flag — bid stays exactly as-is. No retraction.
      // If this player held the current bid, that bid stands and they're locked.
      // Opponent must counter at current_bid+0.25 or also pass; timer resolves.
      const updatedBid = { ...data.auction_bid, [myFoldField]: true }

      const { error } = await sb.from('h2h_rooms').update({ auction_bid: updatedBid }).eq('id', latestRoom.id)
      if (!error) {
        // Update local state immediately so resolve-on-fold fires without waiting for subscription
        applyRoomUpdate({ ...latestRoom, auction_bid: updatedBid })
        break
      }
      await new Promise(r => setTimeout(r, 100 + attempt * 80))
    }
  }

  const resolvingRef  = useRef(false)
  const postingRef    = useRef(false)   // mutex — prevents concurrent postNextPlayer calls

  async function resolveAuction() {
    // Capture the pick_number we expect to resolve — guards against stale countdowns
    // resolving the wrong player when the subscription arrives late
    const targetPickNum = roomRef.current?.pick_number ?? 0
    if (resolvingRef.current) return
    resolvingRef.current = true
    let retryPending = false  // Bug E: track retry so finally doesn't release resolvingRef prematurely
    // Safety timer: if resolveAuction hangs (slow network), release the lock after
    // 15s so the countdown/polling retry mechanism can attempt again.
    // Do NOT recurse here — recursing caused double-resolution where the safety timer's
    // new call and the original in-flight call both proceeded and wrote conflicting state.
    const safetyTimer = setTimeout(() => {
      resolvingRef.current = false
    }, 15000)
    try {
      const sb = await getSupabase()
      const { data, error: fetchErr } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (fetchErr) { console.error('[resolveAuction] fetch error:', fetchErr.message); return }
      // If the DB already advanced past our pick, another client resolved it — bail out
      // and sync our local state immediately so we don't wait a full polling tick
      if ((data?.pick_number ?? 0) !== targetPickNum) { applyRoomUpdate(data); return }
      if (!data?.current_pick || !data?.auction_bid) {
        // No current player in DB — already resolved or never started.
        // Sync local state and let the auto-post effect handle the next player.
        applyRoomUpdate(data)
        return
      }
      const bid    = data.auction_bid
      const player = data.current_pick
      const newPickNum = (data.pick_number ?? 0) + 1

      const noBid      = !bid.current_bid
      const hostFolded = !!bid.host_folded
      const guestFolded = !!bid.guest_folded
      const bothFolded = hostFolded && guestFolded
      const oneFolded  = hostFolded !== guestFolded

      // ── Helper: write a skip (no award) ────────────────────────────────────────
      async function writeSkip() {
        const upd = { current_pick: null, auction_bid: null, pick_number: newPickNum }
        const { error } = await sb.from('h2h_rooms').update(upd).eq('id', data.id)
        if (!error) {
          applyRoomUpdate({ ...data, ...upd })
          setLastResult({ player, skipped: true })
        } else {
          console.error('[resolveAuction] skip DB write failed:', error.message)
          retryPending = true
          clearTimeout(spinRef.current)
          spinRef.current = setTimeout(() => { resolvingRef.current = false; resolveAuctionRef.current?.() }, 1500)
        }
      }

      // Skip only if nobody bid. Both passing with a standing bid is not a skip —
      // whoever holds current_bidder_id wins at their price (their bid stayed when they passed).
      if (noBid) {
        await writeSkip()
        return
      }

      // A bid exists — award to whoever bid last (current_bidder_id).
      // Safety net: verify the winner can legally take this player under their
      // composition, overseas limit and WK-last-slot rules. If they can't
      // (auto-fold may have raced and missed), skip the player instead of
      // creating a "?" slot in their XI.
      const winnerId = bid.current_bidder_id
      const hostWon  = winnerId === data.host_id
      const price    = bid.current_bid

      if (!winnerId) { await writeSkip(); return }  // no bidder on record — skip

      const winnerTeam = hostWon ? (data.host_team ?? []) : (data.guest_team ?? [])
      const winnerComp = hostWon
        ? (data.host_comp_data  ?? compFromSlider(data.host_comp  ?? 5))
        : (data.guest_comp_data ?? compFromSlider(data.guest_comp ?? 5))

      if (!canTeamTakePlayer(player, winnerTeam, winnerComp)) {
        // Winner can't fit this player — skip rather than create a "?" in their XI
        await writeSkip()
        return
      }

      const newHostTeam    = hostWon  ? [...(data.host_team  ?? []), player] : (data.host_team  ?? [])
      const newGuestTeam   = !hostWon ? [...(data.guest_team ?? []), player] : (data.guest_team ?? [])
      const newHostBudget  = hostWon  ? Math.max(0, (data.host_budget  ?? 0) - price) : (data.host_budget  ?? 0)
      const newGuestBudget = !hostWon ? Math.max(0, (data.guest_budget ?? 0) - price) : (data.guest_budget ?? 0)
      const isDone = newHostTeam.length >= TOTAL_SLOTS && newGuestTeam.length >= TOTAL_SLOTS
      const fields = {
        host_team: newHostTeam, guest_team: newGuestTeam,
        host_budget: newHostBudget, guest_budget: newGuestBudget,
        current_pick: null, auction_bid: null,
        pick_number: newPickNum,
        status: isDone ? 'done' : 'drafting',
      }
      const { error } = await sb.from('h2h_rooms').update(fields).eq('id', data.id)
      if (!error) {
        applyRoomUpdate({ ...data, ...fields })
        setLastResult({ player, winner: hostWon ? data.host_name : data.guest_name, price })
        // auto-post effect handles next player
      } else {
        console.error('[resolveAuction] award DB write failed:', error.message)
        retryPending = true
        clearTimeout(spinRef.current)
        spinRef.current = setTimeout(() => { resolvingRef.current = false; resolveAuctionRef.current?.() }, 1500)
        return
      }
    } finally {
      clearTimeout(safetyTimer)
      // Bug E fix: only release the lock if we're NOT waiting for a retry.
      // On retry path: resolvingRef stays true until the setTimeout fires and resets it.
      if (!retryPending) resolvingRef.current = false
    }
  }

  const resolveAuctionRef = useRef(resolveAuction)
  useEffect(() => { resolveAuctionRef.current = resolveAuction })

  const postNextPlayerRef = useRef(postNextPlayer)
  useEffect(() => { postNextPlayerRef.current = postNextPlayer })

  // Countdown driven by bid_deadline from DB — accurate even after page refresh
  useEffect(() => {
    if (isSnake || !room.auction_bid?.bid_deadline) {
      clearInterval(countdownRef.current)
      setCountdown(null)
      return
    }
    clearInterval(countdownRef.current)
    function tick() {
      const remaining = Math.max(0, Math.ceil((new Date(room.auction_bid.bid_deadline) - Date.now()) / 1000))
      setCountdown(remaining)
      // When timer hits 0, keep the interval running — it retries resolveAuction every 500ms
      // until bid_deadline clears (i.e. resolution succeeds), at which point the effect
      // re-runs and the cleanup below clears this interval.
      // Both players attempt resolution — first write wins, second is a no-op
      if (remaining <= 0) { resolveAuctionRef.current?.() }
    }
    tick()
    countdownRef.current = setInterval(tick, 500)
    return () => clearInterval(countdownRef.current)
  }, [room.auction_bid?.bid_deadline])

  // Resolve when a fold is detected (host only)
  useEffect(() => {
    if (isSnake || !isHost || !room.current_pick) return
    const bid = room.auction_bid
    if (!bid) return
    // Open phase, both passed with no bid: resolve immediately → skip (noBid=true).
    // Open phase, both passed but one had a bid: resolve immediately → bid wins.
    // Single pass in open phase: do NOT resolve early. The other player still has
    // remaining countdown time to bid. Timer expiry calls resolveAuction naturally.
    if (bid.phase === 'open' && bid.host_folded && bid.guest_folded) {
      const t = setTimeout(() => resolveAuctionRef.current?.(), 200)
      return () => clearTimeout(t)
    }
    // War phase: non-bidder folded → award to bidder immediately
    if (bid.phase === 'war' && bid.current_bidder_id) {
      const bidderIsHost   = bid.current_bidder_id === room.host_id
      const opponentFolded = bidderIsHost ? bid.guest_folded : bid.host_folded
      if (opponentFolded) resolveAuctionRef.current?.()
    }
  }, [room.auction_bid?.host_folded, room.auction_bid?.guest_folded, room.auction_bid?.phase, room.current_pick])

  // Auto-fold when team is full, can't afford, or player is ineligible (comp/overseas/WK)
  useEffect(() => {
    if (isSnake || !currentPlayer || !auctionPhase || myFolded) return
    const myFoldField = isHost ? 'host_folded' : 'guest_folded'
    if (room.auction_bid?.[myFoldField]) return
    if (auctionPhase === 'war' && room.auction_bid?.current_bidder_id === uid) return
    const teamFull = myTeam.length >= TOTAL_SLOTS
    // Bug F fix: in war phase use the actual minimum counter-bid, not base_price.
    // Without this, a player whose budget is above base_price but below currentBid+0.25
    // gets stuck unable to bid but not auto-folded, blocking the auction until the timer runs out.
    const minRequired = (auctionPhase === 'war' && room.auction_bid?.current_bid != null)
      ? +(room.auction_bid.current_bid + 0.25).toFixed(2)
      : (room.auction_bid?.base_price ?? 0)
    const cantAfford = (myBudget ?? 0) < minRequired
    // Eligibility: overseas cap, last-slot WK rule, composition quota
    const oc              = overseasCount(myTeam)
    const last            = myTeam.length === TOTAL_SLOTS - 1
    const overseasBlocked = oc >= 4 && currentPlayer.nationality !== 'India'
    const wkBlocked       = last && !hasWK(myTeam) && currentPlayer.role !== 'wicket-keeper'
    const compBlocked     = !compEligible(currentPlayer, myTeam, myComp)
    if (teamFull || cantAfford || overseasBlocked || wkBlocked || compBlocked) foldBid()
  }, [currentPlayer, auctionPhase, myFolded, myTeam.length, myBudget, room.auction_bid?.current_bid, room.auction_bid?.current_bidder_id])

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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem', width: '100%', display: 'grid', gridTemplateColumns: '220px 1fr 220px', gap: '1rem', alignItems: 'start' }}>

        {/* ── Left XI Panel (me) ──────────────────────────────────────────── */}
        <XIPanel name={`${myName} (You)`} team={myTeam} isMe comp={myComp} budget={!isSnake ? myBudget : undefined} ratingType={ratingType} />

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
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: cycleEntry?.color ?? '#C8102E' }}>
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
                          {displayOverall(p, ratingType)}
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
              {/* Room settings badge */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                <div style={{ padding: '0.3rem 0.65rem', background: ratingType === 'prime' ? '#a855f722' : '#C8102E22', border: `1px solid ${ratingType === 'prime' ? '#a855f755' : '#C8102E55'}`, borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, color: ratingType === 'prime' ? '#a855f7' : '#C8102E', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {ratingType === 'prime' ? '⚡' : '🏏'} {ratingType === 'prime' ? 'Prime Ratings' : 'Season Ratings'}
                </div>
                <div style={{ padding: '0.3rem 0.65rem', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  📅 {seasonRange.min}–{seasonRange.max}
                </div>
              </div>

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
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1 }}>{displayOverall(currentPlayer, ratingType)}</div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>RATING</div>
                    </div>
                  </div>

                  {/* Base price + countdown row */}
                  {(() => {
                    const bid = room.auction_bid
                    const currentBid      = bid?.current_bid ?? null
                    const currentBidderId = bid?.current_bidder_id ?? null
                    const iAmBidder       = currentBidderId === uid
                    const myFoldField     = isHost ? 'host_folded' : 'guest_folded'
                    const oppFoldField    = isHost ? 'guest_folded' : 'host_folded'
                    // Use local myFolded state immediately (before DB propagates) so UI responds on first press
                    const iHaveFolded     = (bid?.[myFoldField] ?? false) || myFolded
                    const oppHasFolded    = bid?.[oppFoldField] ?? false
                    const teamFull        = myTeam.length >= TOTAL_SLOTS
                    const oc2             = overseasCount(myTeam)
                    const last2           = myTeam.length === TOTAL_SLOTS - 1
                    const overseasBlocked = oc2 >= 4 && currentPlayer.nationality !== 'India'
                    const wkBlocked       = last2 && !hasWK(myTeam) && currentPlayer.role !== 'wicket-keeper'
                    const compBlocked     = !compEligible(currentPlayer, myTeam, myComp)
                    // minNextBid defined first so cantAfford can use it for the war-phase check.
                    // In war phase you need currentBid+0.25, not just base price — matches the auto-fold effect.
                    const minNextBid      = currentBid != null ? +(currentBid + 0.25).toFixed(2) : bp
                    const cantAfford      = (myBudget ?? 0) < minNextBid
                    const autoBlocked     = teamFull || cantAfford || overseasBlocked || wkBlocked || compBlocked
                    const canBid          = !autoBlocked && !iHaveFolded && (auctionPhase === 'open' || (auctionPhase === 'war' && !iAmBidder))
                    // Have I placed at least one bid this round? Determines Pass vs Stand label.
                    const iHaveEverBid    = currentBidderId === uid || (bid?.prev_bidder_id === uid)

                    return (
                      <>
                        {/* Base price + timer */}
                        <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Base </span>
                            <span style={{ fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>₹{bp}cr</span>
                            {currentBid && (
                              <span style={{ marginLeft: '0.75rem', fontSize: '0.72rem', color: '#64748b' }}>
                                Current: <span style={{ color: '#f59e0b', fontWeight: 900 }}>₹{currentBid}cr</span>
                              </span>
                            )}
                          </div>
                          {countdown != null && (
                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: countdown <= 4 ? '#ef4444' : countdown <= 8 ? '#f59e0b' : '#64748b', minWidth: 48, textAlign: 'right' }}>
                              {countdown}s
                            </span>
                          )}
                        </div>

                        {/* Status bar */}
                        <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--border2)', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>
                            {auctionPhase === 'open' && !currentBid && '🔔 Open — place the first bid or pass'}
                            {auctionPhase === 'war' && iAmBidder && `⏳ Your bid of ₹${currentBid}cr — waiting for ${oppName}…`}
                            {auctionPhase === 'war' && !iAmBidder && currentBid && `🔥 ${oppName} bid ₹${currentBid}cr — ${iHaveEverBid ? 'counter or stand' : 'counter or pass'}`}
                          </span>
                          {oppHasFolded && <span style={{ color: '#ef4444', fontSize: '0.68rem' }}>{oppName} passed</span>}
                        </div>

                        {/* Bid actions */}
                        <div style={{ padding: '0.875rem 1.25rem' }}>
                          {(countdown !== null && countdown <= 0) ? (
                            // Timer expired — show resolving state until DB state arrives.
                            // Driven by countdown (= room.auction_bid.bid_deadline from DB),
                            // so it resets automatically the moment applyRoomUpdate fires
                            // with a new player or null pick. Cannot get permanently stuck.
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textAlign: 'center', padding: '0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                              ⏳ Resolving auction…
                            </div>
                          ) : autoBlocked ? (
                            <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, textAlign: 'center', padding: '0.6rem', background: '#1a0d00', border: '1px solid #f59e0b33', borderRadius: '0.5rem' }}>
                              {teamFull        ? '⚠️ Squad full — auto-passed'
                              : cantAfford     ? `⚠️ Can't afford ₹${minNextBid}cr — auto-passed`
                              : overseasBlocked ? '⚠️ Overseas limit reached — auto-passed'
                              : wkBlocked      ? '⚠️ Last slot needs a WK — auto-passed'
                              :                  '⚠️ Composition full for this role — auto-passed'}
                            </div>
                          ) : iHaveFolded ? (
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, textAlign: 'center', padding: '0.6rem', background: '#1a0d0d', border: '1px solid #ef444433', borderRadius: '0.5rem' }}>
                              {iAmBidder && currentBid
                                ? `⏸️ Bid standing — ₹${currentBid}cr`
                                : '⏸️ You passed'}
                            </div>
                          ) : iAmBidder && auctionPhase === 'war' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ fontSize: '0.75rem', color: '#C8102E', fontWeight: 700, textAlign: 'center', padding: '0.5rem', background: '#0d1020', border: '1px solid #C8102E33', borderRadius: '0.4rem' }}>
                                ✅ You bid ₹{currentBid}cr — waiting for {oppName}
                              </div>
                              <button onClick={foldBid} style={{ width: '100%', padding: '0.5rem', background: '#1a0d0d', border: '1px solid #ef444444', borderRadius: '0.4rem', color: '#ef4444', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
                                ⏸️ Stand — lock bid at ₹{currentBid}cr
                              </button>
                            </div>
                          ) : currentBid == null ? (
                            <>
                              {/* No bid yet — show single "Make opening bid" button */}
                              <button
                                onClick={() => canBid && placeBid(bp)}
                                disabled={!canBid}
                                style={{
                                  width: '100%', padding: '0.75rem', marginBottom: '0.5rem',
                                  background: canBid ? '#C8102E' : 'var(--border2)',
                                  color: canBid ? '#fff' : '#475569',
                                  border: 'none', borderRadius: '0.5rem',
                                  fontSize: '0.9rem', fontWeight: 900,
                                  cursor: canBid ? 'pointer' : 'not-allowed',
                                  boxShadow: canBid ? '0 4px 16px rgba(200,16,46,0.35)' : 'none',
                                  transition: 'all 0.12s',
                                }}
                              >
                                🔨 Make opening bid — ₹{bp}cr
                              </button>

                              {/* Stand / Pass button — label depends on whether user has bid before */}
                              <button
                                onClick={foldBid}
                                style={{ width: '100%', padding: '0.6rem', background: '#1a0d0d', border: '1px solid #ef444444', borderRadius: '0.4rem', color: '#ef4444', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
                              >
                                {iHaveEverBid ? "⏸️ Stand — don't counter" : '⏸️ Pass — skip this player'}
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Opening bid placed — show quick-raise buttons */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                {[1, 2, 3, 5].map(inc => {
                                  const actualBid = +((currentBid ?? bp) + inc).toFixed(2)
                                  const affordable = actualBid <= (myBudget ?? 0)
                                  return (
                                    <button
                                      key={inc}
                                      onClick={() => canBid && affordable && placeBid(actualBid)}
                                      disabled={!canBid || !affordable}
                                      style={{
                                        padding: '0.65rem 0.25rem', fontWeight: 900, fontSize: '0.78rem',
                                        background: (!canBid || !affordable) ? 'var(--border2)' : 'linear-gradient(135deg, #22c55e22, #22c55e11)',
                                        color: (!canBid || !affordable) ? '#475569' : '#22c55e',
                                        border: `1px solid ${(!canBid || !affordable) ? 'var(--border)' : '#22c55e55'}`,
                                        borderRadius: '0.4rem', cursor: (!canBid || !affordable) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.12s',
                                      }}
                                    >
                                      +₹{inc}cr
                                    </button>
                                  )
                                })}
                              </div>

                              {/* Manual bid */}
                              {!showManualBid ? (
                                <button
                                  onClick={() => setShowManualBid(true)}
                                  style={{ width: '100%', padding: '0.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', marginBottom: '0.5rem' }}
                                >
                                  ✏️ Manual Bid
                                </button>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                  <input
                                    type="number" step={0.25} min={minNextBid} max={myBudget ?? minNextBid}
                                    value={manualBidVal}
                                    onChange={e => setManualBidVal(e.target.value)}
                                    autoFocus
                                    placeholder={`Min ₹${minNextBid}cr`}
                                    style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' }}
                                  />
                                  <button
                                    onClick={() => { const v = parseFloat(manualBidVal); if (!isNaN(v) && v >= minNextBid) placeBid(v) }}
                                    disabled={!manualBidVal || parseFloat(manualBidVal) < minNextBid || parseFloat(manualBidVal) > (myBudget ?? 0)}
                                    style={{ padding: '0.5rem 0.875rem', background: '#C8102E', color: '#fff', border: 'none', borderRadius: '0.4rem', fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                                  >
                                    Bid
                                  </button>
                                  <button onClick={() => { setShowManualBid(false); setManualBidVal('') }} style={{ padding: '0.5rem 0.5rem', background: 'none', border: '1px solid var(--border)', borderRadius: '0.4rem', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                                </div>
                              )}

                              {/* Stand / Pass button — when a bid exists and it's opponent's turn */}
                              <button
                                onClick={foldBid}
                                style={{ width: '100%', padding: '0.6rem', background: '#1a0d0d', border: '1px solid #ef444444', borderRadius: '0.4rem', color: '#ef4444', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
                              >
                                {iHaveEverBid
                                  ? '⏸️ Stand — done bidding'
                                  : '⏸️ Pass — skip this player'}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Last result banner */}
              {lastResult && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 700, animation: 'fade-in 0.3s ease both', background: lastResult.skipped ? 'var(--card)' : '#0d1a0d', border: `1px solid ${lastResult.skipped ? 'var(--border)' : '#22c55e44'}`, color: lastResult.skipped ? '#475569' : '#86efac' }}>
                  {lastResult.skipped
                    ? `⏭ ${lastResult.player.name} — skipped`
                    : `✅ ${lastResult.winner} got ${lastResult.player.name} for ₹${lastResult.price}cr`}
                </div>
              )}

              {/* Skip banner — shown briefly when a player is ineligible for all teams */}
              {skipBanner && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700, animation: 'fade-in 0.2s ease both', background: 'var(--card)', border: '1px solid var(--border)', color: '#64748b' }}>
                  ⏭ {skipBanner}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right XI Panel (opponent) ────────────────────────────────── */}
        <XIPanel name={oppName} team={oppTeam} isMe={false} comp={oppComp} budget={!isSnake ? oppBudget : undefined} ratingType={ratingType} />
      </div>
    </div>
  )
}

function TeamColumn({ name, team, budget, highlight }) {
  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${highlight ? '#C8102E44' : 'var(--border)'}`, borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: highlight ? '#C8102E' : '#64748b' }}>{name} ({team.length}/11)</div>
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
