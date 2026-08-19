import { useState, useRef, useEffect, useMemo } from 'react'
import { getInterleavedManagers } from '../data/managers.js'
import { MODE_CONFIG } from '../data/players.js'
import { calcTeamStrength } from '../utils/simulator.js'

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }

function getPredictedRank(str, mode) {
  if (mode === 'ipl') {
    if (str >= 85) return { pos: '1st–2nd',  label: 'Champions contender', color: '#f59e0b' }
    if (str >= 80) return { pos: 'Top 4',    label: 'Playoff favourite',   color: '#4169E1' }
    if (str >= 75) return { pos: '5th–6th',  label: 'On the bubble',       color: '#3b82f6' }
    if (str >= 68) return { pos: '7th–8th',  label: 'Mid-table side',      color: '#94a3b8' }
    return               { pos: 'Bottom 3',  label: 'Uphill battle',        color: '#ef4444' }
  }
  if (str >= 84) return { pos: 'Champions',     label: 'Tournament favourite', color: '#f59e0b' }
  if (str >= 78) return { pos: 'Semi-final',    label: 'Deep run expected',    color: '#4169E1' }
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

export default function ManagerSelect({ mode, team, onSelect, onBack, inline = false, onLand, onStart }) {
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

  // ── Full-page reel card ────────────────────────────────────────────────────
  const reelCard = (
    <div style={{
      position: 'relative',
      background: 'var(--card)',
      border: `2px solid ${phase === 'landed' ? '#4169E166' : 'var(--border)'}`,
      borderRadius: '1.25rem',
      overflow: 'hidden',
      marginBottom: '1rem',
      minHeight: 220,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '1.75rem 1.5rem',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: phase === 'landed' ? '0 0 40px #4169E118' : 'none',
    }}>
      {isSpinning && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to bottom, var(--card), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to top, var(--card), transparent)', zIndex: 2, pointerEvents: 'none' }} />
        </>
      )}
      {displayed && (
        <div style={{ textAlign: 'center', zIndex: 3 }}>
          <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: '0.5rem', filter: isSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
            {displayed.icon}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem', letterSpacing: '-0.02em' }}>
            {displayed.name}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: phase === 'landed' ? '0.75rem' : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {displayed.nationality} · {displayed.style}
            {isDisplayedWCWinner && <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem', background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '999px', color: '#f59e0b', fontWeight: 800 }}>{getSpinChipLabel(mode)}</span>}
          </div>
          {phase === 'landed' && landed && (
            <div style={{ animation: 'fade-in 0.3s ease both' }}>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '0.625rem', maxWidth: 280, margin: '0 auto 0.625rem' }}>
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
            <div style={{ fontSize: '0.72rem', color: 'var(--border)', marginTop: '0.4rem' }}>
              Hit spin to get your coach
            </div>
          )}
        </div>
      )}
    </div>
  )

  const storyBlock = phase === 'landed' && storyData && (
    <div style={{
      background: 'var(--card2)', border: '1px solid var(--border)',
      borderRadius: '0.75rem', padding: '1.1rem 1.25rem',
      marginBottom: '1rem', animation: 'fade-in 0.4s ease both',
    }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#4169E1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
        📖 Season Outlook
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 0.75rem', fontStyle: 'italic' }}>
        {storyData.narrative}
      </p>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.625rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
          Predicted Finish
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: storyData.predictedColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {storyData.predictedPos}
        </div>
      </div>
    </div>
  )

  const fullPageButtons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', alignItems: 'center' }}>
      {isSpinning ? (
        <div style={{ width: '100%', padding: '0.875rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', fontWeight: 700 }}>
          Spinning…
        </div>
      ) : phase === 'landed' ? (
        <button
          onClick={() => onSelect(landed)}
          style={{ width: '100%', padding: '0.9rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer' }}
        >
          ✓ Pick {landed?.name?.split(' ').pop()} as Coach
        </button>
      ) : (
        <button
          onClick={spin}
          style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          🎰 Spin for Coach
        </button>
      )}
      <button
        onClick={() => onSelect(null)}
        style={{ background: 'none', border: 'none', color: 'var(--border)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
      >
        Continue without a manager
      </button>
    </div>
  )

  // ── Inline (compact) mode — embedded in draft screen right column ───────────
  if (inline) {
    // Confirmed: show coach summary (2 short sentences max) — Start Season is in TeamStrengthPanel
    if (phase === 'confirmed' && landed) {
      const shortDesc = landed.description?.split(/[.!]/).filter(Boolean).slice(0, 2).join('. ').trim() + '.'
      return (
        <div style={{ background: 'var(--card)', border: '1px solid #4169E144', borderRadius: '0.875rem', padding: '0.75rem 0.875rem', animation: 'fade-in 0.3s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>{landed.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {landed.name}
                {isWCWinner && <span style={{ fontSize: '0.58rem', padding: '0.1rem 0.3rem', background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '999px', color: '#f59e0b', fontWeight: 800 }}>🏆</span>}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{landed.nationality} · {landed.style}</div>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#4169E1', fontWeight: 800, flexShrink: 0 }}>✓</span>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.5 }}>
            {shortDesc}
          </div>
        </div>
      )
    }

    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.75rem 0.875rem', animation: 'fade-in 0.3s ease both' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#4169E1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>
          🎽 Coach
        </div>

        {/* Compact reel */}
        <div style={{
          position: 'relative',
          background: 'var(--bg)',
          border: `1.5px solid ${phase === 'landed' ? '#4169E166' : 'var(--border2)'}`,
          borderRadius: '0.625rem',
          overflow: 'hidden',
          marginBottom: '0.625rem',
          padding: '0.625rem 0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          minHeight: 52,
          transition: 'border-color 0.3s',
        }}>
          {isSpinning && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--bg), transparent 20%, transparent 80%, var(--bg))', zIndex: 2, pointerEvents: 'none' }} />
          )}
          <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0, filter: isSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s', zIndex: 3 }}>
            {displayed?.icon ?? '🎽'}
          </span>
          <div style={{ flex: 1, minWidth: 0, zIndex: 3 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', filter: isSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
              {displayed?.name ?? '—'}
            </div>
            <div style={{ fontSize: '0.6rem', color: '#64748b', filter: isSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
              {displayed ? `${displayed.nationality} · ${displayed.style}` : '—'}
              {isDisplayedWCWinner && <span style={{ marginLeft: '0.3rem', color: '#f59e0b' }}>🏆</span>}
            </div>
          </div>
        </div>

        {/* Landed coach brief description */}
        {phase === 'landed' && landed && (
          <div style={{ fontSize: '0.67rem', color: '#94a3b8', lineHeight: 1.45, marginBottom: '0.625rem', animation: 'fade-in 0.3s ease both' }}>
            {landed.description?.split(/[.!]/).filter(Boolean)[0]}.
            {isWCWinner && <span style={{ color: '#f59e0b', fontWeight: 700 }}> {getWCChipLabel(mode)}.</span>}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {isSpinning ? (
            <div style={{ padding: '0.6rem', background: 'transparent', border: '1px solid var(--border2)', borderRadius: '0.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
              Spinning…
            </div>
          ) : phase === 'landed' ? (
            <button
              onClick={() => { setPhase('confirmed'); onSelect(landed) }}
              style={{ width: '100%', padding: '0.625rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
            >
              ✓ Confirm {landed?.name?.split(' ').pop()}
            </button>
          ) : (
            <button
              onClick={spin}
              style={{ width: '100%', padding: '0.625rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
            >
              🎰 Spin for Coach
            </button>
          )}
        </div>
      </div>
    )
  }

  const buttons = fullPageButtons

  // ── Full-page mode (standalone screen) ──────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          ← Back
        </button>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#4169E1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
            {cfg.icon} {cfg.label}
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.3rem' }}>
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
