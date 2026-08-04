import { useState, useRef, useEffect } from 'react'
import { WHEEL_ENTRIES } from '../data/players.js'

// ─── Legendary icon players — appear with 0.05% chance in player spin ────────

const ICON_PLAYERS = [
  { id: 'icon-bradman',  name: 'Sir Donald Bradman', role: 'top-order',   nationality: 'Australia',  batting: 99, bowling: 20, fielding: 85, overall: 99, _isIcon: true },
  { id: 'icon-sobers',   name: 'Sir Garfield Sobers', role: 'all-rounder', nationality: 'W. Indies',  batting: 97, bowling: 95, fielding: 90, overall: 99, _isIcon: true },
  { id: 'icon-viv',      name: 'Sir Viv Richards',    role: 'top-order',   nationality: 'W. Indies',  batting: 98, bowling: 38, fielding: 88, overall: 98, _isIcon: true },
]

// ─── Event types that can land on the wheel ──────────────────────────────────

const EVENTS = [
  {
    id: 'team-raid',
    icon: '🎯',
    label: 'Team Raid',
    color: '#1F6FEB',
    desc: 'You raid a rival squad. A new player spins in — replaces your weakest of the same role.',
    replaceTarget: 'weakest',
  },
  {
    id: 'best-is-lost',
    icon: '💔',
    label: 'Best is Lost',
    color: '#ef4444',
    desc: 'Your highest-rated player walks out. Spin for a replacement of the same role.',
    replaceTarget: 'best',
  },
  {
    id: 'rising-star',
    icon: '⭐',
    label: 'Rising Star',
    color: '#f59e0b',
    desc: 'A rising star joins your camp. Replaces your lowest-rated player of the same role.',
    replaceTarget: 'weakest',
  },
  {
    id: 'rival-sends',
    icon: '🔄',
    label: 'Rival Sends',
    color: '#a855f7',
    desc: 'A rival team offloads their 12th man to you. Whoever spins in replaces your weakest of that role.',
    replaceTarget: 'weakest',
  },
  {
    id: 'wildcard',
    icon: '🎲',
    label: 'Wildcard',
    color: '#22c55e',
    desc: 'Complete chaos. Anyone can spin in — replaces your worst player of that role.',
    replaceTarget: 'weakest',
  },
]

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
const isOverseas = p => p.nationality !== 'India'

// ─── Build candidate replacement pool ────────────────────────────────────────

function getReplacementPool(team, role, mode) {
  const teamIds   = new Set(team.map(p => p.id))
  const teamNames = new Set(team.map(p => p.name))
  const overseasCount = team.filter(p => isOverseas(p)).length

  const allPlayers = []
  for (const entry of WHEEL_ENTRIES) {
    if (!entry.competition?.includes(mode)) continue
    for (const p of entry.players) {
      if (p.role !== role) continue
      if (teamIds.has(p.id) || teamNames.has(p.name)) continue
      // Overseas quota: if full and outgoing player is domestic, only domestic can come in
      // (handled per-call based on who's going out)
      allPlayers.push(p)
    }
  }
  // Deduplicate by name (same player can appear in multiple seasons)
  const seen = new Set()
  return allPlayers.filter(p => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })
}

function pickOutgoing(team, event, incomingRole) {
  const sameRole = team.filter(p => p.role === incomingRole)
  if (!sameRole.length) return team.reduce((a, b) => (a.overall < b.overall ? a : b))
  if (event.replaceTarget === 'best') {
    return sameRole.reduce((a, b) => (a.overall > b.overall ? a : b))
  }
  return sameRole.reduce((a, b) => (a.overall < b.overall ? a : b))
}

// Cubic ease-out animation helper (same as WheelSpin)
function getInterval(tick, total) {
  const t = tick / total
  return Math.round(30 + 270 * (t * t * t))
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImpactSub({ team, mode, onComplete, onSkip }) {
  const [phase, setPhase] = useState('offer')  // offer → event-spin → event-landed → player-spin → player-landed → confirm
  const [eventEntry, setEventEntry]   = useState(null)   // landed event
  const [cycleEvent, setCycleEvent]   = useState(null)   // currently cycling event (spin anim)
  const [playerEntry, setPlayerEntry] = useState(null)   // landed player
  const [cyclePlayer, setCyclePlayer] = useState(null)   // currently cycling player
  const [outgoing, setOutgoing]       = useState(null)   // player being replaced
  const [pool, setPool]               = useState([])     // candidates for replacement

  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // ── Phase 1: spin for event type ─────────────────────────────────────────
  function spinEvent() {
    setPhase('event-spin')
    const chosen = EVENTS[Math.floor(Math.random() * EVENTS.length)]
    const TICKS = 28
    let i = 0

    function tick() {
      i++
      const last = i >= TICKS
      setCycleEvent(last ? chosen : EVENTS[i % EVENTS.length])
      if (last) {
        timerRef.current = setTimeout(() => {
          setEventEntry(chosen)
          setPhase('event-landed')
        }, 500)
      } else {
        timerRef.current = setTimeout(tick, getInterval(i, TICKS))
      }
    }
    timerRef.current = setTimeout(tick, getInterval(0, TICKS))
  }

  // ── Phase 2: spin for replacement player ─────────────────────────────────
  function spinPlayer() {
    setPhase('player-spin')

    const teamIds   = new Set(team.map(p => p.id))
    const teamNames = new Set(team.map(p => p.name))

    // For "best-is-lost": determine who walks out FIRST (highest overall in team),
    // then restrict incoming to the same role.
    let requiredRole = null
    let preOut = null
    if (eventEntry.id === 'best-is-lost') {
      preOut = [...team].sort((a, b) => b.overall - a.overall)[0] ?? null
      requiredRole = preOut?.role ?? null
      if (preOut) setOutgoing(preOut)
    }

    // Build filtered candidate pool based on event rules:
    //   team-raid   → quality acquisition  (overall ≥ 78 scaled)
    //   rising-star → breakthrough player  (overall ≤ 80 scaled)
    //   rival-sends → fringe/backup player (overall ≤ 76 scaled)
    //   best-is-lost→ same role as outgoing (no rating restriction)
    //   wildcard    → no restriction
    const seen = new Set()
    const fullPool = []
    for (const entry of WHEEL_ENTRIES) {
      if (!entry.competition?.includes(mode)) continue
      for (const p of entry.players) {
        if (teamIds.has(p.id) || teamNames.has(p.name)) continue
        if (seen.has(p.name)) continue
        if (requiredRole && p.role !== requiredRole) continue
        const scaled = scaleDisplay(p.overall)
        if (eventEntry.id === 'rising-star' && scaled > 80) continue
        if (eventEntry.id === 'team-raid'   && scaled < 78) continue
        if (eventEntry.id === 'rival-sends' && scaled > 76) continue
        seen.add(p.name)
        fullPool.push(p)
      }
    }

    // If filters yield nothing, fall back to full unfiltered pool (safety net)
    if (!fullPool.length) {
      const seen2 = new Set()
      for (const entry of WHEEL_ENTRIES) {
        if (!entry.competition?.includes(mode)) continue
        for (const p of entry.players) {
          if (teamIds.has(p.id) || teamNames.has(p.name)) continue
          if (seen2.has(p.name)) continue
          seen2.add(p.name)
          fullPool.push(p)
        }
      }
    }

    if (!fullPool.length) { onSkip(); return }

    // Shuffle + pick
    const shuffled = [...fullPool].sort(() => Math.random() - 0.5)
    let chosen = shuffled[Math.floor(Math.random() * shuffled.length)]

    // ── 0.05% chance of a legendary icon player appearing ─────────────────
    if (Math.random() < 0.0005) {
      const eligible = ICON_PLAYERS
        .filter(ic => !teamIds.has(ic.id) && !teamNames.has(ic.name))
        .filter(ic => !requiredRole || ic.role === requiredRole)
      if (eligible.length > 0) {
        chosen = eligible[Math.floor(Math.random() * eligible.length)]
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    setPool(shuffled)

    const TICKS = 30
    let i = 0
    function tick() {
      i++
      const last = i >= TICKS
      // Cycle through normal pool visually; land on chosen (could be icon)
      setCyclePlayer(last ? chosen : shuffled[i % shuffled.length])
      if (last) {
        timerRef.current = setTimeout(() => {
          // For best-is-lost: outgoing was already set to team's best player.
          // For all others: outgoing is the weakest/best of same role as incoming.
          if (eventEntry.id !== 'best-is-lost') {
            const out = pickOutgoing(team, eventEntry, chosen.role)
            setOutgoing(out)
          }
          setPlayerEntry(chosen)
          setPool(shuffled)
          setPhase('player-landed')
        }, 500)
      } else {
        timerRef.current = setTimeout(tick, getInterval(i, TICKS))
      }
    }
    timerRef.current = setTimeout(tick, getInterval(0, TICKS))
  }

  function confirmSub() {
    if (!playerEntry || !outgoing) return
    const newTeam = team.map(p => p.id === outgoing.id ? { ...playerEntry, _impactSub: true } : p)
    onComplete(newTeam, outgoing, playerEntry, eventEntry)
  }

  // ── Renders ───────────────────────────────────────────────────────────────

  const displayed = phase === 'event-spin' ? cycleEvent : eventEntry
  const displayedPlayer = phase === 'player-spin' ? cyclePlayer : playerEntry
  const isEventSpinning  = phase === 'event-spin'
  const isPlayerSpinning = phase === 'player-spin'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', animation: 'fade-in 0.3s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '1.25rem', padding: '1.75rem',
        animation: 'fade-in-up 0.3s ease both',
      }}>

        {/* ── Offer screen ──────────────────────────────────────────────── */}
        {phase === 'offer' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔁</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.4rem' }}>
                Impact Sub Window
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                The transfer window is open before the playoffs. Spin the wheel — fate decides who comes in and who goes out.
              </div>
            </div>
            <button
              onClick={spinEvent}
              style={{
                width: '100%', padding: '0.9rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              🎰 Spin the Impact Sub Wheel
            </button>
          </>
        )}

        {/* ── Event spin + landed ──────────────────────────────────────── */}
        {(phase === 'event-spin' || phase === 'event-landed') && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                Impact Sub Event
              </div>
            </div>

            {/* Event reel */}
            <div style={{
              background: displayed ? displayed.color + '18' : 'var(--card)',
              border: `2px solid ${displayed ? displayed.color + '66' : 'var(--border)'}`,
              borderRadius: '0.875rem', padding: '1.25rem',
              textAlign: 'center', marginBottom: '1.25rem',
              minHeight: 110, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s, background 0.15s',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem', filter: isEventSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
                {displayed?.icon ?? '🎰'}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', filter: isEventSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
                {displayed?.label ?? '—'}
              </div>
              {phase === 'event-landed' && displayed?.desc && (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.5rem', lineHeight: 1.5, animation: 'fade-in 0.3s ease both' }}>
                  {displayed.desc}
                </div>
              )}
            </div>

            {phase === 'event-landed' && (
              <button
                onClick={spinPlayer}
                style={{
                  width: '100%', padding: '0.875rem',
                  background: `linear-gradient(135deg, ${eventEntry.color}, ${eventEntry.color}cc)`,
                  color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                🎰 Spin for Your Player
              </button>
            )}

            {isEventSpinning && (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>Spinning…</div>
            )}
          </>
        )}

        {/* ── Player spin + landed ─────────────────────────────────────── */}
        {(phase === 'player-spin' || phase === 'player-landed') && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '0.875rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.75rem', background: (eventEntry?.color ?? '#1F6FEB') + '22', border: `1px solid ${(eventEntry?.color ?? '#1F6FEB')}44`, borderRadius: '999px', marginBottom: '0.5rem' }}>
                <span>{eventEntry?.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: eventEntry?.color ?? '#1F6FEB' }}>{eventEntry?.label}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Spinning for your replacement player…</div>
            </div>

            {/* Player reel */}
            <div style={{
              background: 'var(--card)', border: '2px solid var(--border)',
              borderRadius: '0.875rem', padding: '1rem 1.25rem',
              marginBottom: '1rem', minHeight: 80,
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              transition: 'border-color 0.15s',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)', filter: isPlayerSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
                  {displayedPlayer?.name ?? '—'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', filter: isPlayerSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
                  {displayedPlayer ? `${displayedPlayer.nationality} · ${displayedPlayer.role}` : '—'}
                </div>
              </div>
              {displayedPlayer && !isPlayerSpinning && (
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>
                  {scaleDisplay(displayedPlayer.overall)}
                </div>
              )}
            </div>

            {/* Who goes out */}
            {phase === 'player-landed' && outgoing && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--loss-bg)', border: '1px solid var(--loss-border)', borderRadius: '0.625rem', animation: 'fade-in 0.3s ease both' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Out</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f87171' }}>{outgoing.name}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>{outgoing.nationality} · {outgoing.role}</div>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#ef4444' }}>{scaleDisplay(outgoing.overall)}</div>
                </div>
                <div style={{ borderTop: '1px solid #ef444422', margin: '0.5rem 0' }} />
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>In</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#86efac' }}>{playerEntry?.name}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>{playerEntry?.nationality} · {playerEntry?.role}</div>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>{playerEntry ? scaleDisplay(playerEntry.overall) : '—'}</div>
                </div>
              </div>
            )}

            {/* Icon player special badge */}
            {phase === 'player-landed' && playerEntry?._isIcon && (
              <div style={{
                marginBottom: '1rem', padding: '0.75rem 1rem',
                background: 'linear-gradient(135deg, #78350f22, #92400e22)',
                border: '2px solid #f59e0b66',
                borderRadius: '0.75rem',
                textAlign: 'center',
                animation: 'fade-in 0.4s ease both',
              }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.2rem' }}>⭐</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  LEGEND APPEARED
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  A once-in-a-lifetime signing. This player will be remembered.
                </div>
              </div>
            )}

            {phase === 'player-landed' && (
              <button
                onClick={confirmSub}
                style={{
                  width: '100%', padding: '0.875rem',
                  background: playerEntry?._isIcon
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                {playerEntry?._isIcon ? '⭐ Confirm Legend Sub' : '✓ Confirm Impact Sub'}
              </button>
            )}

            {isPlayerSpinning && (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>Spinning…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
