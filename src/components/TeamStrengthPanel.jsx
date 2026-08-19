import { calcTeamStrength } from '../utils/simulator.js'
import { getPrimeRatings } from '../data/players.js'

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
function scalePrime(v)   { return Math.max(1, Math.min(99, v)) }
function getRating(player, ratingType, mode) {
  if (ratingType === 'prime') {
    const primeMap = getPrimeRatings(mode)
    return {
      overall: scalePrime(primeMap[player.name] ?? player.overall),
      batting: scalePrime(player.primeBatting ?? player.batting),
      bowling: scalePrime(player.primeBowling ?? player.bowling),
    }
  }
  return { overall: scaleDisplay(player.overall), batting: scaleDisplay(player.batting), bowling: scaleDisplay(player.bowling) }
}
const isOverseas = (p) => p.nationality !== 'India'

function getPredictedRank(str, mode) {
  if (mode === 'ipl') {
    if (str >= 85) return { pos: '1st–2nd',  label: 'Champions contender', color: '#f59e0b' }
    if (str >= 80) return { pos: 'Top 4',    label: 'Playoff favourite',   color: '#4169E1' }
    if (str >= 75) return { pos: '5th–6th',  label: 'On the bubble',       color: '#3b82f6' }
    if (str >= 68) return { pos: '7th–8th',  label: 'Mid-table side',      color: '#94a3b8' }
    return               { pos: 'Bottom 3',  label: 'Uphill battle',        color: '#ef4444' }
  }
  if (str >= 84) return { pos: 'Champions',    label: 'Tournament favourite', color: '#f59e0b' }
  if (str >= 78) return { pos: 'Semi-final',   label: 'Deep run expected',   color: '#4169E1' }
  if (str >= 70) return { pos: 'Quarter-final',label: 'Competitive side',    color: '#3b82f6' }
  return               { pos: 'Group stage',   label: 'Underdog story',      color: '#94a3b8' }
}

function getWriteup(avgBat, avgBowl, str) {
  const gap = avgBat - avgBowl
  if (gap > 6) {
    if (str >= 80) return 'A batting-heavy powerhouse — your top order will put up big totals.'
    return 'Strong batting; the bowling will need to punch above its weight.'
  }
  if (gap < -6) {
    if (str >= 80) return 'A bowling-first machine — contain the opposition and let the bowlers win it.'
    return 'Solid bowling unit; runs will need to come from unlikely heroes.'
  }
  if (str >= 82) return 'A well-balanced, top-quality XI — dangerous in all conditions.'
  if (str >= 76) return 'Solid all-round side. Capable of a deep run on your day.'
  return 'Balanced team — key match-winners will need to rise to the occasion.'
}

// ─── Overseas Slots Visual ───────────────────────────────────────────────────

function OverseasTracker({ team }) {
  const overseas = team.filter(p => isOverseas(p))
  const count = overseas.length
  const limit = 4
  const pct = (count / limit) * 100
  const barColor = count >= limit ? '#ef4444' : count >= 3 ? '#f59e0b' : '#3b82f6'

  return (
    <div style={{ marginTop: '0.875rem', padding: '0.75rem 0.875rem', background: '#0e0e18', border: '1px solid #1e1e2e', borderRadius: '0.625rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          ✈️ Overseas Slots
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 900, color: barColor }}>
          {count}/{limit} used
        </span>
      </div>

      {/* 4 slot indicators */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem' }}>
        {[0, 1, 2, 3].map(i => {
          const player = overseas[i]
          const filled = i < count
          return (
            <div
              key={i}
              title={player ? `${player.name} (${player.nationality})` : 'Empty slot'}
              style={{
                flex: 1,
                height: 28,
                borderRadius: '0.35rem',
                background: filled ? barColor + '22' : 'var(--border2)',
                border: `1.5px solid ${filled ? barColor : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.62rem', fontWeight: 700,
                color: filled ? barColor : 'var(--border)',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
              }}
            >
              {filled ? '✈️' : '·'}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>

      {count >= limit && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.62rem', color: '#ef4444', fontWeight: 700 }}>
          Overseas limit reached — no more overseas picks
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function TeamStrengthPanel({ team, manager, mode, ratingType = 'season', showPenalty = false, onStart }) {
  if (!team || team.length === 0) return null

  const rawStr = calcTeamStrength(team, manager, mode, ratingType === 'prime' ? 'prime' : 'overall')

  // ── New formula: batsmen avg | bowlers avg | all-rounders split 50/50 ──
  // Batting side: openers, top-order, middle-order, wk + half of AR
  // Bowling side: pace-bowler, spin-bowler + half of AR
  const BAT_ROLES  = new Set(['opener','top-order','middle-order','wicket-keeper'])
  const BOWL_ROLES = new Set(['pace-bowler','spin-bowler'])

  let batSum = 0, batCount = 0
  let bowlSum = 0, bowlCount = 0

  team.forEach(p => {
    const r = getRating(p, ratingType, mode)
    if (p.role === 'all-rounder') {
      const mid = (r.batting + r.bowling) / 2
      batSum  += mid / 2;  batCount  += 0.5
      bowlSum += mid / 2;  bowlCount += 0.5
    } else if (BAT_ROLES.has(p.role)) {
      batSum  += r.batting;  batCount++
    } else if (BOWL_ROLES.has(p.role)) {
      bowlSum += r.bowling;  bowlCount++
    }
  })

  const avgBat  = batCount  > 0 ? Math.round(batSum  / batCount)  : 50
  const avgBowl = bowlCount > 0 ? Math.round(bowlSum / bowlCount) : 50

  // ── Positioning penalty: only applied (and displayed) when showPenalty=true ──
  // Rule 1: any opener not in positions 1-3 → flat -3
  // Rule 2: any pure batsman behind any pure bowler → flat -2
  let penaltyPts = 0
  let openerPenalty = 0
  let batsmanPenalty = 0
  if (showPenalty) {
    const PURE_BAT_ROLES = new Set(['opener','top-order','middle-order'])
    const BOWL_ROLES_P   = new Set(['pace-bowler','spin-bowler'])
    const numOpeners    = team.filter(p => p.role === 'opener').length
    const openersInTop3 = team.slice(0, 3).filter(p => p.role === 'opener').length
    openerPenalty = (Math.max(0, Math.min(numOpeners, 2) - openersInTop3) > 0) ? 3 : 0

    // Only pure batters (opener/top-order/middle-order) trigger "batsman below bowler"
    // WK and all-rounders can bat anywhere — no penalty
    const firstBowlerIdx = team.findIndex(p => BOWL_ROLES_P.has(p.role))
    const lastPureBatIdx = team.reduce((acc, p, i) => PURE_BAT_ROLES.has(p.role) ? i : acc, -1)
    batsmanPenalty = (firstBowlerIdx !== -1 && lastPureBatIdx > firstBowlerIdx) ? 2 : 0

    penaltyPts = openerPenalty + batsmanPenalty
  }
  // Bonus only applies if the coach has won this specific competition (matches simulator.js logic)
  const managerBonus = (manager && manager.wcWinnerFor?.includes(mode)) ? (manager.bonus?.strength ?? 0) : 0
  const baseOvr = Math.round((avgBat + avgBowl) / 2)
  const avgOvr  = Math.max(1, Math.min(99, baseOvr - penaltyPts + managerBonus))

  const rank    = getPredictedRank(rawStr, mode)
  const writeup = getWriteup(avgBat, avgBowl, rawStr)
  const hasPenalty = showPenalty && penaltyPts > 0
  const hasBonus   = managerBonus > 0

  const Bar = ({ label, value, color }) => (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 900, color }}>{value}</span>
      </div>
      <div style={{ height: 5, background: 'var(--border2)', borderRadius: 3 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '1rem', padding: '1rem 1.1rem', marginTop: '0.75rem', animation: 'fade-in 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Team Strength</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--border)' }}>{team.length}/11</span>
      </div>

      <Bar label="Batting avg"  value={avgBat}  color="#4169E1" />
      <Bar label="Bowling avg"  value={avgBowl} color="#3b82f6" />
      {/* Overall bar — shows penalty/bonus adjustments inline when active */}
      <div style={{ marginBottom: (hasPenalty || hasBonus) ? '0.25rem' : '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall avg</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {(hasPenalty || hasBonus) && (
              <span style={{ color: '#475569', textDecoration: 'line-through', fontSize: '0.65rem' }}>{baseOvr}</span>
            )}
            <span style={{ color: '#f59e0b' }}>{avgOvr}</span>
            {hasPenalty && (
              <span style={{ color: '#ef4444', fontSize: '0.6rem', fontWeight: 800 }}>−{penaltyPts}</span>
            )}
            {hasBonus && (
              <span style={{ color: '#4169E1', fontSize: '0.6rem', fontWeight: 800 }}>+{managerBonus}</span>
            )}
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--border2)', borderRadius: 3 }}>
          <div style={{ width: `${avgOvr}%`, height: '100%', background: '#f59e0b', borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
      </div>
      {(hasPenalty || hasBonus) && (
        <div style={{ fontSize: '0.6rem', fontWeight: 700, marginBottom: '0.4rem', lineHeight: 1.5 }}>
          {openerPenalty > 0 && <div style={{ color: '#f59e0b' }}>⬇️ −3: openers not in positions 1–3</div>}
          {batsmanPenalty > 0 && <div style={{ color: '#f59e0b' }}>⬇️ −2: pure batsman below a bowler</div>}
          {hasBonus && <div style={{ color: '#4169E1' }}>⬆️ +{managerBonus}: coach bonus</div>}
        </div>
      )}

      {/* Manager bonus display */}
      {manager && (
        <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.65rem', background: 'var(--border2)', borderRadius: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem' }}>{manager.icon}</span>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{manager.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.62rem', fontWeight: 700 }}>
            {manager.wcWinnerFor?.includes(mode)
              ? <span style={{ color: '#4169E1' }}>+{manager.bonus?.strength ?? 0} <span style={{ color: '#f59e0b' }}>🏆</span></span>
              : <span style={{ color: '#64748b' }}>No mode bonus</span>
            }
          </span>
        </div>
      )}

      {/* Predicted rank — only shown once coach is selected */}
      {manager ? (
        <>
          <div style={{ marginTop: '0.875rem', padding: '0.625rem 0.875rem', background: rank.color + '12', border: `1px solid ${rank.color}33`, borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Predicted Finish</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 900, color: rank.color }}>{rank.pos}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: rank.color, fontWeight: 600, opacity: 0.8 }}>{rank.label}</div>
          </div>
          <div style={{ marginTop: '0.625rem', fontSize: '0.68rem', color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>
            {writeup}
          </div>
        </>
      ) : null}

      {/* Start Season button — shown once coach is confirmed */}
      {onStart && manager && (
        <button
          onClick={onStart}
          style={{
            marginTop: '0.875rem',
            width: '100%', padding: '0.875rem',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
            fontSize: '1rem', fontWeight: 800,
            cursor: 'pointer', letterSpacing: '0.03em',
            animation: 'pulse-glow 2s ease infinite',
          }}
        >
          🏏 Start Season →
        </button>
      )}
    </div>
  )
}
