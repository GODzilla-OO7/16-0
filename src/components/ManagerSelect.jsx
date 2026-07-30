import { useState, useRef, useEffect, useMemo } from 'react'
import { getInterleavedManagers } from '../data/managers.js'
import { MODE_CONFIG } from '../data/players.js'
import { calcTeamStrength } from '../utils/simulator.js'

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 3))) }

function getPredictedRank(str, mode) {
  if (mode === 'ipl') {
    if (str >= 85) return { pos: '1st–2nd',  label: 'Champions contender', color: '#f59e0b' }
    if (str >= 80) return { pos: 'Top 4',    label: 'Playoff favourite',   color: '#22c55e' }
    if (str >= 75) return { pos: '5th–6th',  label: 'On the bubble',       color: '#3b82f6' }
    if (str >= 68) return { pos: '7th–8th',  label: 'Mid-table side',      color: '#94a3b8' }
    return               { pos: 'Bottom 3',  label: 'Uphill battle',        color: '#ef4444' }
  }
  if (str >= 84) return { pos: 'Champions',     label: 'Tournament favourite', color: '#f59e0b' }
  if (str >= 78) return { pos: 'Semi-final',    label: 'Deep run expected',    color: '#22c55e' }
  if (str >= 70) return { pos: 'Quarter-final', label: 'Competitive side',     color: '#3b82f6' }
  return               { pos: 'Group stage',    label: 'Underdog story',        color: '#94a3b8' }
}

function getStoryPrediction(team, manager, mode, str) {
  const rank = getPredictedRank(str, mode)
  const avgBatRaw  = team.reduce((s, p) => s + p.batting, 0) / team.length
  const top5Bowl   = [...team].map(p => p.bowling).sort((a, b) => b - a).slice(0, Math.min(5, team.length))
  const avgBowlRaw = top5Bowl.reduce((s, v) => s + v, 0) / top5Bowl.length
  const avgBat     = scaleDisplay(avgBatRaw)
  const avgBowl    = scaleDisplay(avgBowlRaw)

  const coachName = manager.name.split(' ').pop()
  const isWCWinner = manager.wcWinnerFor?.includes(mode)
  const coachLine = isWCWinner
    ? `${manager.name} knows what it takes to win this tournament — and he's brought that mentality here.`
    : `${manager.name} has built a reputation for getting the most out of every player in the squad.`

  // Mode-specific flavour
  const modeLabel = mode === 'ipl' ? 'season' : 'tournament'

  // Build the narrative based on strength and balance
  const gap = avgBat - avgBowl

  let battleLine
  if (rank.pos === 'Champions' || rank.pos === '1st–2nd') {
    battleLine = gap > 5
      ? `The batting is exceptional, and if the bowlers hold their nerve, this side has everything it needs to go all the way.`
      : gap < -5
      ? `This bowling attack is capable of dismantling any line-up, and on their day, the runs will follow.`
      : `With balance across the XI and a clear identity under ${coachName}, they look like genuine title challengers.`
  } else if (rank.pos === 'Top 4' || rank.pos === 'Semi-final') {
    battleLine = `A deep run feels very much on the cards — though a moment of brilliance from an individual may be the difference in the big games.`
  } else if (rank.pos === '5th–6th' || rank.pos === 'Quarter-final') {
    battleLine = `There's enough quality to cause an upset or two, but consistent performances across the ${modeLabel} will be crucial for a late push.`
  } else {
    battleLine = `It will be a tough road ahead — but stranger things have happened in cricket, and a few inspired performances could change everything.`
  }

  return { narrative: `${coachLine} ${battleLine}`, predictedPos: rank.pos, predictedColor: rank.color }
}

function getSubtitle(mode) {
  if (mode === 'ipl')    return <>Spin the wheel to get a coach. IPL-winning coaches give an extra <span style={{ color: '#f59e0b', fontWeight: 700 }}>🏆 +2 strength</span> bonus.</>
  if (mode === 'odi-wc') return <>Spin the wheel to get a coach. ODI World Cup-winning coaches give an extra <span style={{ color: '#f59e0b', fontWeight: 700 }}>🏆 +2 strength</span> bonus.</>
  if (mode === 't20-wc') return <>Spin the wheel to get a coach. T20 World Cup-winning coaches give an extra <span style={{ color: '#f59e0b', fontWeight: 700 }}>🏆 +2 strength</span> bonus.</>
  return 'Spin the wheel to get a coach.'
}

function getWCChipLabel(mode) {
  if (mode === 'ipl')    return '🏆 +2 IPL title bonus'
  if (mode === 'odi-wc') return '🏆 +2 ODI WC bonus'
  if (mode === 't20-wc') return '🏆 +2 T20 WC bonus'
  return '🏆 +2 WC bonus'
}

function getSpinChipLabel(mode) {
  if (mode === 'ipl')    return '🏆 IPL Champion'
  if (mode === 'odi-wc') return '🏆 ODI WC Winner'
  if (mode === 't20-wc') return '🏆 T20 WC Winner'
  return '🏆 WC Winner'
}

export default function ManagerSelect({ mode, team, onSelect, onBack, inline = false, onLand }) {
  const [phase, setPhase] = useState('idle') // idle | spinning | landed | confirmed
  const [displayIdx, setDisplayIdx] = useState(0)
  const [landed, setLanded] = useState(null)
  const timerRef = useRef(null)
  const cfg = MODE_CONFIG[mode]

  // Stable interleaved list for this mode — winners spread evenly through the reel
  const managers = useMemo(() => getInterleavedManagers(mode), [mode])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function spin() {
    if (phase === 'spinning') return
    setPhase('spinning')
    setLanded(null)
    onLand?.(null)
    let i = 0
    let interval = 70

    // Pre-determine winner so last tick always shows the right name
    const chosen = managers[Math.floor(Math.random() * managers.length)]

    function tick() {
      i++
      const isLast = i >= 28
      if (isLast) {
        setDisplayIdx(managers.indexOf(chosen) >= 0 ? managers.indexOf(chosen) : 0)
        setTimeout(() => {
          setLanded(chosen)
          setPhase('landed')
          onLand?.(chosen)
        }, 900)
        return
      }
      setDisplayIdx(prev => (prev + 1) % managers.length)
      if (i > 18) interval = Math.min(interval + 18, 320)
      timerRef.current = setTimeout(tick, interval)
    }
    timerRef.current = setTimeout(tick, interval)
  }

  const displayed = phase === 'landed' ? landed : managers[displayIdx]
  const isSpinning = phase === 'spinning'
  const isWCWinner = landed?.wcWinnerFor?.includes(mode)
  const isDisplayedWCWinner = displayed?.wcWinnerFor?.includes(mode)

  // Predicted strength & story (only when landed)
  const predictedStr = landed && team
    ? calcTeamStrength(team, landed, mode)
    : null
  const storyData = landed && team && predictedStr !== null
    ? getStoryPrediction(team, landed, mode, predictedStr)
    : null

  // ── Shared inner content (used in both inline and full-page) ────────────────
  const reelCard = (
    <div style={{
      position: 'relative',
      background: '#12121a',
      border: `2px solid ${phase === 'landed' ? '#22c55e66' : '#2a2a3a'}`,
      borderRadius: inline ? '0.875rem' : '1.25rem',
      overflow: 'hidden',
      marginBottom: '1rem',
      minHeight: inline ? 140 : 220,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: inline ? '1.1rem 1rem' : '1.75rem 1.5rem',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: phase === 'landed' ? '0 0 40px #22c55e18' : 'none',
    }}>
      {isSpinning && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to bottom, #12121a, transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to top, #12121a, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        </>
      )}
      {displayed && (
        <div style={{ textAlign: 'center', zIndex: 3 }}>
          <div style={{ fontSize: inline ? '2.2rem' : '3.5rem', lineHeight: 1, marginBottom: '0.5rem', filter: isSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
            {displayed.icon}
          </div>
          <div style={{ fontSize: inline ? '1.1rem' : '1.5rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.2rem', letterSpacing: '-0.02em' }}>
            {displayed.name}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: phase === 'landed' ? '0.75rem' : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {displayed.nationality} · {displayed.style}
            {isDisplayedWCWinner && <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem', background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '999px', color: '#f59e0b', fontWeight: 800 }}>{getSpinChipLabel(mode)}</span>}
          </div>
          {phase === 'landed' && landed && (
            <div style={{ animation: 'fade-in 0.3s ease both' }}>
              <div style={{ fontSize: inline ? '0.72rem' : '0.875rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '0.625rem', maxWidth: 280, margin: '0 auto 0.625rem' }}>
                {landed.description}
              </div>
              {isWCWinner && (
                <div style={{ display: 'inline-block', padding: '0.25rem 0.7rem', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800 }}>
                  {getWCChipLabel(mode)}
                </div>
              )}
            </div>
          )}
          {phase === 'idle' && (
            <div style={{ fontSize: '0.72rem', color: '#2a2a3a', marginTop: '0.4rem' }}>
              Hit spin to get your coach
            </div>
          )}
        </div>
      )}
    </div>
  )

  const storyBlock = phase === 'landed' && storyData && (
    <div style={{
      background: '#0e1820', border: '1px solid #1e3a2e',
      borderRadius: '0.75rem', padding: inline ? '0.875rem 1rem' : '1.1rem 1.25rem',
      marginBottom: '1rem', animation: 'fade-in 0.4s ease both',
    }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
        📖 Season Outlook
      </div>
      <p style={{ fontSize: inline ? '0.75rem' : '0.82rem', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 0.75rem', fontStyle: 'italic' }}>
        {storyData.narrative}
      </p>
      <div style={{ borderTop: '1px solid #1e3a2e', paddingTop: '0.625rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
          Predicted Finish
        </div>
        <div style={{ fontSize: inline ? '1.3rem' : '1.6rem', fontWeight: 900, color: storyData.predictedColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {storyData.predictedPos}
        </div>
      </div>
    </div>
  )

  const buttons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', alignItems: 'center' }}>
      {isSpinning ? (
        <div style={{ width: '100%', padding: '0.875rem', background: 'transparent', border: '1px solid #2a2a3a', borderRadius: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', fontWeight: 700 }}>
          Spinning…
        </div>
      ) : phase === 'confirmed' ? (
        <div style={{ width: '100%', padding: '0.8rem', background: '#22c55e1a', border: '1px solid #22c55e44', borderRadius: '0.75rem', textAlign: 'center', color: '#22c55e', fontSize: '0.85rem', fontWeight: 800 }}>
          ✓ Coach confirmed — click Start Season on the left
        </div>
      ) : phase === 'landed' ? (
        <button
          onClick={() => {
            if (inline) { setPhase('confirmed'); onSelect(landed) }
            else onSelect(landed)
          }}
          style={{ width: '100%', padding: inline ? '0.8rem' : '0.9rem', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0a0a0f', border: 'none', borderRadius: '0.75rem', fontSize: inline ? '0.85rem' : '0.9rem', fontWeight: 800, cursor: 'pointer' }}
        >
          ✓ Pick {landed?.name?.split(' ').pop()} as Coach
        </button>
      ) : (
        <button
          onClick={spin}
          style={{ width: '100%', padding: inline ? '0.875rem' : '1rem', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0a0a0f', border: 'none', borderRadius: '0.75rem', fontSize: inline ? '0.9rem' : '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          🎰 Spin for Coach
        </button>
      )}
      {phase !== 'confirmed' && (
        <button
          onClick={() => onSelect(null)}
          style={{ background: 'none', border: 'none', color: '#2a2a3a', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Continue without a manager
        </button>
      )}
    </div>
  )

  // ── Inline mode (embedded in draft screen right column) ─────────────────────
  if (inline) {
    return (
      <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '1rem', padding: '1rem', animation: 'fade-in 0.3s ease both' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center' }}>
          🎽 Pick Your Coach
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', marginBottom: '1rem', lineHeight: 1.5 }}>
          {getSubtitle(mode)}
        </div>
        {reelCard}
        {storyBlock}
        {buttons}
      </div>
    )
  }

  // ── Full-page mode (standalone screen) ──────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          ← Back
        </button>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
            {cfg.icon} {cfg.label}
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.3rem' }}>
            Pick Your Coach
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {getSubtitle(mode)}
          </div>
        </div>
        {reelCard}
        {storyBlock}
        {buttons}
      </div>
    </div>
  )
}
