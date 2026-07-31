import { useState, useEffect } from 'react'
import { POSITIONS } from '../data/players.js'

// Same scale as WheelSpin so ratings match before/after pick
function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 3))) }
function primeVal(v)     { return Math.min(99, Math.round(scaleDisplay(v) * 1.055)) }
function scaledOverall(player, ratingType) {
  if (ratingType === 'prime') return scaleDisplay(player.primeOverall ?? player.overall)
  return scaleDisplay(player.overall)
}

const roleLabel = {
  'opener': 'OPN', 'top-order': 'BAT', 'middle-order': 'BAT',
  'wicket-keeper': 'WK', 'all-rounder': 'ALL',
  'pace-bowler': 'PACE', 'spin-bowler': 'SPIN',
}
const roleColor = {
  'opener': '#1F6FEB', 'top-order': '#1F6FEB', 'middle-order': '#0047CC',
  'wicket-keeper': '#f59e0b', 'all-rounder': '#3b82f6',
  'pace-bowler': '#ef4444', 'spin-bowler': '#a855f7',
}

// Composition → ordered flat list of role slots
const COMP_ORDER = ['opener', 'top-order', 'wicket-keeper', 'middle-order', 'all-rounder', 'pace-bowler', 'spin-bowler']
const COMP_FULL_LABEL = {
  'opener': 'Opener', 'top-order': 'Top Order', 'wicket-keeper': 'Wicket-keeper',
  'middle-order': 'Middle Order', 'all-rounder': 'All-rounder',
  'pace-bowler': 'Pace Bowler', 'spin-bowler': 'Spin Bowler',
}
function buildCompSlots(composition) {
  if (!composition) return null
  const slots = []
  for (const role of COMP_ORDER) {
    for (let i = 0; i < (composition[role] || 0); i++) slots.push(role)
  }
  return slots
}

// Batting order: openers first, bowlers last
const BATTING_WEIGHT = {
  'opener': 0, 'top-order': 1, 'wicket-keeper': 2,
  'middle-order': 3, 'all-rounder': 4,
  'pace-bowler': 5, 'spin-bowler': 6,
}

// All positions are freely moveable — bad positioning is penalised in team strength instead

function defaultSort(arr) {
  return [...arr].sort((a, b) => (BATTING_WEIGHT[a.role] ?? 9) - (BATTING_WEIGHT[b.role] ?? 9))
}

export default function TeamSheet({ team, currentSlot, onSimulate, onReorder, compact = false, ratingType = 'season', mode = 'ipl', composition = null }) {
  const filled = team.length
  const total  = POSITIONS.length
  const isDone = filled === total

  // Maintain ordered list — auto-sorted when new player added, user-reorderable when full
  const [orderedTeam, setOrderedTeam] = useState(() => defaultSort(team))
  const [highlight, setHighlight]     = useState(null) // index of last moved player

  useEffect(() => {
    setOrderedTeam(prev => {
      // Find any new players (just been added)
      const prevIds = new Set(prev.map(p => p.id))
      const added   = team.filter(p => !prevIds.has(p.id))
      if (added.length === 0) return prev.filter(p => team.some(t => t.id === p.id))
      // Insert new players in default batting order position
      const merged = [...prev, ...added]
      return defaultSort(merged)
    })
  }, [team])

  function move(fromIdx, dir) {
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= orderedTeam.length) return
    const next = [...orderedTeam]
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    setOrderedTeam(next)
    setHighlight(toIdx)
    setTimeout(() => setHighlight(null), 600)
    onReorder?.(next)
  }

  const emptyCount = total - filled
  const compSlots = buildCompSlots(composition)

  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #2a2a3a',
      borderRadius: '1rem',
      overflow: 'hidden',
      minWidth: compact ? 0 : 240,
    }}>
      {/* Header */}
      <div style={{
        padding: compact ? '0.875rem 1rem' : '1rem 1.25rem',
        borderBottom: '1px solid #2a2a3a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 800, fontSize: compact ? '0.875rem' : '1rem', color: '#f1f5f9' }}>
          Your XI
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isDone && onReorder && (
            <span style={{ fontSize: '0.55rem', color: '#2a2a3a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              reorder ↕
            </span>
          )}
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: filled === total ? '#1F6FEB' : '#64748b' }}>
            {filled}/{total}
          </span>
        </div>
      </div>

      {/* Slots */}
      <div style={{ padding: compact ? '0.5rem' : '0.75rem' }}>
        {orderedTeam.map((player, i) => {
          const isHighlit = highlight === i
          const canUp   = i > 0
          const canDown = i < orderedTeam.length - 1

          return (
            <div
              key={player.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: compact ? '0.375rem 0.5rem' : '0.5rem 0.625rem',
                borderRadius: '0.5rem', marginBottom: '2px',
                background: isHighlit ? '#0047CC18' : '#1a1a26',
                border: `1px solid ${isHighlit ? '#1F6FEB44' : 'transparent'}`,
                transition: 'all 0.25s',
                animation: 'fade-in-up 0.3s ease both',
              }}
            >
              {/* Position number */}
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: (roleColor[player.role] ?? '#64748b') + '22',
                border: `1px solid ${(roleColor[player.role] ?? '#64748b') + '44'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 900,
                color: roleColor[player.role] ?? '#64748b',
              }}>
                {i + 1}
              </div>

              {/* Player info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: compact ? '0.75rem' : '0.8rem', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {player.name}
                  {mode === 'ipl' && player.nationality !== 'India' && <span style={{ fontSize: '0.7rem' }} title="Overseas player">✈️</span>}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{player.nationality}</div>
              </div>

              {/* Role + rating */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, background: (roleColor[player.role] ?? '#64748b') + '22', color: roleColor[player.role] ?? '#64748b', padding: '1px 4px', borderRadius: '3px' }}>
                  {roleLabel[player.role] ?? '—'}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b' }}>{scaledOverall(player, ratingType)}</span>
              </div>

              {/* Reorder arrows — only when XI is complete */}
              {isDone && onReorder && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0, marginLeft: '0.125rem' }}>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={!canUp}
                    title="Move up"
                    style={{
                      width: 18, height: 18,
                      background: canUp ? '#1F6FEB22' : 'transparent',
                      border: `1px solid ${canUp ? '#1F6FEB44' : '#1a1a26'}`,
                      borderRadius: '3px', fontSize: '0.55rem', fontWeight: 900,
                      color: canUp ? '#1F6FEB' : '#2a2a3a',
                      cursor: canUp ? 'pointer' : 'default',
                      lineHeight: 1, padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >▲</button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={!canDown}
                    title="Move down"
                    style={{
                      width: 18, height: 18,
                      background: canDown ? '#1F6FEB22' : 'transparent',
                      border: `1px solid ${canDown ? '#1F6FEB44' : '#1a1a26'}`,
                      borderRadius: '3px', fontSize: '0.55rem', fontWeight: 900,
                      color: canDown ? '#1F6FEB' : '#2a2a3a',
                      cursor: canDown ? 'pointer' : 'default',
                      lineHeight: 1, padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >▼</button>
                </div>
              )}
            </div>
          )
        })}

        {/* Empty slots */}
        {Array.from({ length: emptyCount }, (_, j) => {
          const slotIdx    = filled + j
          const posSlot    = POSITIONS[slotIdx]
          const isActive   = currentSlot === slotIdx
          const roleForSlot = compSlots ? compSlots[slotIdx] : null
          const slotLabel   = roleForSlot ? COMP_FULL_LABEL[roleForSlot] : (posSlot?.description ?? 'Player')
          const slotBadge   = roleForSlot ? (roleLabel[roleForSlot] ?? '—') : null
          const slotColor   = roleForSlot ? (roleColor[roleForSlot] ?? '#64748b') : '#2a2a3a'
          return (
            <div
              key={`empty-${j}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: compact ? '0.375rem 0.5rem' : '0.5rem 0.75rem',
                borderRadius: '0.5rem', marginBottom: '2px',
                background: isActive ? '#ddeaff' : 'transparent',
                border: isActive ? '1px solid #1F6FEB44' : '1px solid transparent',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: roleForSlot ? slotColor + '18' : '#1a1a26',
                border: `1px solid ${roleForSlot ? slotColor + '44' : '#2a2a3a'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.52rem', fontWeight: 900, color: slotColor,
              }}>
                {slotBadge ?? (slotIdx + 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: roleForSlot ? slotColor : '#2a2a3a', fontWeight: roleForSlot ? 600 : 400 }}>
                  {slotLabel}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Simulate button */}
      {filled === total && onSimulate && (
        <div style={{ padding: '0.75rem', borderTop: '1px solid #2a2a3a' }}>
          <button
            onClick={onSimulate}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: '0.625rem',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              animation: 'pulse-glow 2s ease infinite',
            }}
          >
            Simulate Season →
          </button>
        </div>
      )}
    </div>
  )
}
