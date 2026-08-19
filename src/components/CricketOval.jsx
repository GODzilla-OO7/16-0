/**
 * CricketOval — formation lineup card view.
 * Two rows (batsmen top, bowlers bottom) with circles + initials + last name + role tag.
 * Reorder via ▲▼ arrows on each player card. No tap-to-swap, no bottom list.
 *
 * Props:
 *   team        — ordered array of player objects (batting order)
 *   ratingType  — 'season' | 'prime'
 *   onReorder   — (newTeam: player[]) => void   (undefined = read-only)
 */

import { getPrimeRatings } from '../data/players.js'

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
function scalePrime(v)   { return Math.max(1, Math.min(99, v)) }
function scaledOverall(player, ratingType, mode) {
  if (ratingType === 'prime') return scalePrime(getPrimeRatings(mode)[player.name] ?? player.overall)
  return scaleDisplay(player.overall)
}

const roleColor = {
  'opener':        '#C8102E',
  'top-order':     '#C8102E',
  'middle-order':  '#a50d24',
  'wicket-keeper': '#f59e0b',
  'all-rounder':   '#C8102E',
  'pace-bowler':   '#ef4444',
  'spin-bowler':   '#a855f7',
}

const roleTag = {
  'opener':        'OPENER',
  'top-order':     'BATSMAN',
  'middle-order':  'BATSMAN',
  'wicket-keeper': 'KEEPER',
  'all-rounder':   'ALL-RND',
  'pace-bowler':   'SEAM',
  'spin-bowler':   'SPIN',
}

// Position mismatch detection (visual warning only)
const ROLE_RANGE = {
  'opener':        { min: 0, max: 2  },
  'top-order':     { min: 0, max: 5  },
  'middle-order':  { min: 2, max: 7  },
  'wicket-keeper': { min: 2, max: 7  },
  'all-rounder':   { min: 3, max: 8  },
  'pace-bowler':   { min: 5, max: 10 },
  'spin-bowler':   { min: 5, max: 10 },
}

function isMispositioned(player, idx) {
  const r = ROLE_RANGE[player.role]
  if (!r) return false
  return idx < r.min || idx > r.max
}

function initials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function lastName(name) {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

// ─── Single player card ───────────────────────────────────────────────────────

function PlayerCard({ player, idx, isMispos, ratingType, mode, onMoveUp, onMoveDown, isFirst, isLast }) {
  const color  = roleColor[player.role]  ?? '#94a3b8'
  const tag    = roleTag[player.role]    ?? '—'
  const rating = scaledOverall(player, ratingType, mode)
  const canLeft  = !isFirst && !!onMoveUp
  const canRight = !isLast  && !!onMoveDown

  const arrowBtn = (enabled, label, onClick) => ({
    width: 22, height: 18,
    background: enabled ? '#C8102E18' : 'transparent',
    border: `1px solid ${enabled ? '#C8102E44' : 'transparent'}`,
    borderRadius: '3px',
    fontSize: '0.55rem', fontWeight: 900,
    color: enabled ? '#C8102E' : 'var(--border)',
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, padding: 0,
  })

  return (
    <div
      title={isMispos ? `⚠️ ${player.name} may be out of ideal position` : player.name}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
        minWidth: 60,
        padding: '0.25rem 0.1rem',
      }}
    >
      {/* Circle */}
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: color + '22',
        border: `2.5px solid ${isMispos ? '#f59e0b' : color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        boxShadow: isMispos ? `0 0 10px #f59e0b44` : 'none',
        transition: 'all 0.2s',
      }}>
        <span style={{
          fontSize: '0.95rem', fontWeight: 900, letterSpacing: '-0.03em',
          color, fontFamily: 'Inter, sans-serif', userSelect: 'none',
        }}>
          {initials(player.name)}
        </span>

        {/* Position number badge */}
        <div style={{
          position: 'absolute', top: -6, left: -6,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--bg)', border: `1.5px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.5rem', fontWeight: 900, color,
        }}>
          {idx + 1}
        </div>

        {/* Misposition warning */}
        {isMispos && (
          <div style={{ position: 'absolute', top: -6, right: -6, fontSize: '0.7rem', lineHeight: 1 }}>⚠️</div>
        )}
      </div>

      {/* Last name */}
      <div style={{
        fontSize: '0.65rem', fontWeight: 800, color: 'var(--text)',
        textAlign: 'center', maxWidth: 60,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {lastName(player.name)}
      </div>

      {/* Role tag */}
      <div style={{
        fontSize: '0.5rem', fontWeight: 800, textTransform: 'uppercase',
        color, background: color + '18', border: `1px solid ${color}44`,
        borderRadius: '3px', padding: '1px 4px', letterSpacing: '0.04em',
      }}>
        {tag}
      </div>

      {/* Rating */}
      <div style={{ fontSize: '0.58rem', fontWeight: 900, color: '#f59e0b', marginBottom: '0.1rem' }}>
        {rating}
      </div>

      {/* ◀ ▶ reorder arrows — below the full card */}
      {(onMoveUp || onMoveDown) && (
        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.1rem' }}>
          <button
            onClick={() => canLeft && onMoveUp(idx)}
            disabled={!canLeft}
            style={arrowBtn(canLeft)}
            title="Move earlier in batting order"
          >◀</button>
          <button
            onClick={() => canRight && onMoveDown(idx)}
            disabled={!canRight}
            style={arrowBtn(canRight)}
            title="Move later in batting order"
          >▶</button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CricketOval({ team = [], ratingType = 'season', mode = 'ipl', onReorder }) {
  if (!team || team.length === 0) return null

  const topRow    = team.slice(0, 6)
  const bottomRow = team.slice(6)
  const hasMispos = team.some((p, i) => isMispositioned(p, i))

  function moveUp(i) {
    if (i === 0 || !onReorder) return
    const next = [...team]
    ;[next[i], next[i - 1]] = [next[i - 1], next[i]]
    onReorder(next)
  }

  function moveDown(i) {
    if (i >= team.length - 1 || !onReorder) return
    const next = [...team]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    onReorder(next)
  }

  return (
    <div style={{
      background: '#0d1a0d',
      border: '1px solid #1e3a2e',
      borderRadius: '1.25rem',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.875rem 1.25rem 0.5rem',
        textAlign: 'center',
        borderBottom: '1px solid #1a2a1a',
      }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.2rem' }}>
          🏏 Your XI — Batting Lineup
        </div>
        {onReorder && (
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
            Use ◀▶ below each player to reorder
          </div>
        )}
      </div>

      {/* Formation */}
      <div style={{ padding: '1rem 0.5rem 0.75rem', background: 'linear-gradient(to bottom, #0d1a0d, #0a130a)' }}>
        {/* Top row: positions 1–6 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.2rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {topRow.map((player, ri) => (
            <PlayerCard
              key={player.id}
              player={player}
              idx={ri}
              isMispos={isMispositioned(player, ri)}
              onMoveUp={onReorder ? moveUp : null}
              onMoveDown={onReorder ? moveDown : null}
              isFirst={ri === 0}
              isLast={ri === team.length - 1}
              ratingType={ratingType}
              mode={mode}
            />
          ))}
        </div>

        {/* Pitch divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', opacity: 0.5 }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #C8102E44)' }} />
          <div style={{ fontSize: '0.55rem', color: '#C8102E', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            ┃ Pitch ┃
          </div>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #C8102E44)' }} />
        </div>

        {/* Bottom row: positions 7–11 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.2rem', flexWrap: 'wrap' }}>
          {bottomRow.map((player, ri) => {
            const absIdx = ri + 6
            return (
              <PlayerCard
                key={player.id}
                player={player}
                idx={absIdx}
                isMispos={isMispositioned(player, absIdx)}
                onMoveUp={onReorder ? moveUp : null}
                onMoveDown={onReorder ? moveDown : null}
                isFirst={absIdx === 0}
                isLast={absIdx === team.length - 1}
                ratingType={ratingType}
              />
            )
          })}
        </div>
      </div>

      {/* Misposition warning */}
      {hasMispos && (
        <div style={{
          margin: '0 0.875rem 0.75rem',
          padding: '0.5rem 0.875rem',
          background: '#1a1200',
          border: '1px solid #f59e0b33',
          borderRadius: '0.5rem',
          fontSize: '0.62rem',
          color: '#f59e0b',
          fontWeight: 600,
        }}>
          ⚠️ Some players are out of position — team strength is reduced.
        </div>
      )}
    </div>
  )
}
