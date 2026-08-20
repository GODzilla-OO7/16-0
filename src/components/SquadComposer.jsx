import { useState, useRef, useCallback, useEffect } from 'react'

const ROLE_DEFS = [
  { key: 'opener',        label: 'Openers',       short: 'OPR', icon: '🏏', color: '#f59e0b',  min: 1, max: 4 },
  { key: 'top-order',     label: 'Top Order',      short: 'TOP', icon: '🏏', color: '#fbbf24',  min: 0, max: 4 },
  { key: 'middle-order',  label: 'Middle Order',   short: 'MID', icon: '🏏', color: '#fb923c',  min: 0, max: 4 },
  { key: 'wicket-keeper', label: 'Wicket-keeper',  short: 'WK',  icon: '🧤', color: '#a78bfa',  min: 1, max: 4 },
  { key: 'all-rounder',   label: 'All-rounders',   short: 'AR',  icon: '⚡', color: '#34d399',  min: 0, max: 4 },
  { key: 'pace-bowler',   label: 'Pace Bowlers',   short: 'PAC', icon: '💨', color: '#ef4444',  min: 0, max: 5 },
  { key: 'spin-bowler',   label: 'Spin Bowlers',   short: 'SPN', icon: '🌀', color: '#a855f7',  min: 0, max: 5 },
]

const DEFAULT = {
  opener: 2, 'top-order': 2, 'middle-order': 1,
  'wicket-keeper': 1, 'all-rounder': 2,
  'pace-bowler': 2, 'spin-bowler': 1,
}

const PRESETS = [
  {
    label: 'Balanced', icon: '⚖️', color: '#C8102E',
    comp: { opener: 2, 'top-order': 2, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 2, 'spin-bowler': 1 },
  },
  {
    label: 'Batting Heavy', icon: '💥', color: '#f59e0b',
    comp: { opener: 2, 'top-order': 2, 'middle-order': 2, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 1 },
  },
  {
    label: 'Pace Atk', icon: '💨', color: '#ef4444',
    comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 3, 'spin-bowler': 1 },
  },
  {
    label: 'Spin Web', icon: '🌀', color: '#a855f7',
    comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 3 },
  },
]

const FLEX_ORDER = ['middle-order', 'top-order', 'pace-bowler', 'spin-bowler', 'all-rounder', 'opener', 'wicket-keeper']

function autoBalance(prev, changedKey, newValue) {
  const def = ROLE_DEFS.find(r => r.key === changedKey)
  const clamped = Math.max(def.min, Math.min(def.max, newValue))
  const delta = clamped - (prev[changedKey] || 0)
  if (delta === 0) return prev
  const next = { ...prev, [changedKey]: clamped }
  let remaining = delta
  for (const key of FLEX_ORDER) {
    if (key === changedKey || remaining === 0) continue
    const d = ROLE_DEFS.find(r => r.key === key)
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

function RoleSlider({ def, value, onDrag, isMobile }) {
  const trackRef = useRef(null)

  const getValFromX = useCallback((clientX) => {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.max(def.min, Math.min(def.max, Math.round(frac * def.max)))
  }, [def, value])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    const move = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      onDrag(def.key, getValFromX(cx))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    onDrag(def.key, getValFromX(cx))
  }, [def.key, getValFromX, onDrag])

  const pct = def.max > 0 ? (value / def.max) * 100 : 0
  const dots = Array.from({ length: def.max }, (_, i) => i + 1)
  const trackH = isMobile ? 14 : 10
  const thumbSize = isMobile ? 26 : 20

  return (
    <div style={{ marginBottom: isMobile ? '1.3rem' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: isMobile ? '1.1rem' : '0.95rem', lineHeight: 1 }}>{def.icon}</span>
          <span style={{ fontSize: isMobile ? '0.88rem' : '0.8rem', fontWeight: 700, color: value > 0 ? 'var(--text)' : '#64748b' }}>{def.label}</span>
          {def.min > 0 && (
            <span style={{
              fontSize: '0.52rem', fontWeight: 800, color: def.color,
              background: def.color + '22', border: `1px solid ${def.color}44`,
              borderRadius: '999px', padding: '0.1rem 0.35rem',
            }}>min {def.min}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 5 : 3, alignItems: 'center' }}>
          {dots.map(i => (
            <div key={i} onClick={() => onDrag(def.key, i)} style={{
              width: isMobile ? 13 : 10, height: isMobile ? 13 : 10,
              borderRadius: '50%', cursor: 'pointer',
              background: i <= value ? def.color : 'var(--border2)',
              border: `1.5px solid ${i <= value ? def.color : 'var(--border)'}`,
              transition: 'all 0.15s',
              boxShadow: i <= value ? `0 0 6px ${def.color}66` : 'none',
            }} />
          ))}
          <span style={{
            marginLeft: 6, fontSize: isMobile ? '1.2rem' : '1rem', fontWeight: 900, minWidth: 18, textAlign: 'center',
            color: value > 0 ? def.color : '#475569',
          }}>{value}</span>
        </div>
      </div>

      <div
        ref={trackRef}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        style={{
          position: 'relative', height: trackH, borderRadius: trackH / 2,
          background: 'var(--border2)', cursor: 'pointer', userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: value > 0 ? `linear-gradient(90deg, ${def.color}bb, ${def.color})` : 'transparent',
          borderRadius: trackH / 2, transition: 'width 0.15s ease',
          boxShadow: value > 0 ? `0 0 10px ${def.color}44` : 'none',
        }} />
        {dots.map(i => (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i / def.max) * 100}%`,
            top: '50%', transform: 'translate(-50%, -50%)',
            width: 2, height: trackH + 6,
            background: i <= value ? def.color + '55' : 'var(--border)',
            pointerEvents: 'none',
          }} />
        ))}
        {value > 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            width: thumbSize, height: thumbSize, borderRadius: '50%',
            background: def.color,
            border: '3px solid var(--bg)',
            boxShadow: `0 0 12px ${def.color}88`,
            cursor: 'grab', zIndex: 2,
            transition: 'left 0.15s ease',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <div style={{ position: 'relative', marginTop: '0.3rem', height: 10 }}>
        <span style={{ position: 'absolute', left: 0, fontSize: '0.52rem', color: value === 0 ? def.color : '#475569', fontWeight: value === 0 ? 900 : 400 }}>0</span>
        <span style={{
          position: 'absolute', right: 0,
          fontSize: '0.52rem',
          color: value === def.max ? def.color : '#475569',
          fontWeight: value === def.max ? 900 : 400,
        }}>{def.max}</span>
      </div>
    </div>
  )
}

function CompositionBar({ comp }) {
  return (
    <div>
      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
        Composition
      </div>
      <div style={{ display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {ROLE_DEFS.map(def => {
          const count = comp[def.key] || 0
          if (count === 0) return null
          const pct = (count / 11) * 100
          return (
            <div key={def.key} title={`${def.label}: ${count}`} style={{
              width: `${pct}%`, background: def.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'width 0.25s ease',
              fontSize: '0.58rem', fontWeight: 900, color: '#0a0f1a',
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
              {count >= 2 ? def.short : ''}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
        {ROLE_DEFS.map(def => {
          const count = comp[def.key] || 0
          if (count === 0) return null
          return (
            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: def.color }} />
              <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 600 }}>{count} {def.short}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FormationPreview({ comp, circleSize = 44 }) {
  const ROWS = [
    { roles: ['opener'] },
    { roles: ['top-order'] },
    { roles: ['middle-order', 'wicket-keeper'] },
    { roles: ['all-rounder'] },
    { roles: ['pace-bowler', 'spin-bowler'] },
  ]

  const players = []
  ROLE_DEFS.forEach(def => {
    const count = comp[def.key] || 0
    for (let i = 0; i < count; i++) {
      players.push({ role: def.key, color: def.color, short: def.short, label: def.label })
    }
  })

  const rows = ROWS.map(row => ({
    ...row,
    players: players.filter(p => row.roles.includes(p.role)),
  }))

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(180deg, #083d08 0%, #145214 35%, #145214 65%, #083d08 100%)',
      borderRadius: '50% / 12%',
      border: '2px solid #1e7a1e',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-evenly', alignItems: 'center',
      padding: '8% 6%',
      boxShadow: 'inset 0 0 40px rgba(0,0,0,0.4)',
    }}>
      {/* Pitch */}
      <div style={{
        position: 'absolute', left: '50%', top: '20%', bottom: '20%',
        width: circleSize * 0.65, transform: 'translateX(-50%)',
        background: 'linear-gradient(180deg, #c8a56a, #d4b87a)',
        borderRadius: 4, opacity: 0.75,
        boxShadow: '0 0 8px rgba(0,0,0,0.3)',
      }} />
      {/* Crease lines */}
      <div style={{
        position: 'absolute', left: '50%', top: '22%',
        width: circleSize, height: 2,
        transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.5)',
      }} />
      <div style={{
        position: 'absolute', left: '50%', bottom: '22%',
        width: circleSize, height: 2,
        transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.5)',
      }} />

      {rows.map((row, ri) => (
        <div key={ri} style={{
          display: 'flex', gap: `${Math.max(6, circleSize * 0.18)}px`,
          justifyContent: 'center', zIndex: 1, width: '100%',
        }}>
          {row.players.map((p, pi) => (
            <div key={pi} title={p.label} style={{
              width: circleSize, height: circleSize, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${p.color}ee, ${p.color}99)`,
              border: `2px solid rgba(255,255,255,0.75)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: `${Math.max(9, circleSize * 0.22)}px`,
              fontWeight: 900, color: '#0a0f1a',
              boxShadow: `0 3px 12px ${p.color}77, inset 0 1px 3px rgba(255,255,255,0.3)`,
              letterSpacing: '0.02em', flexShrink: 0,
              transition: 'all 0.2s',
            }}>
              {p.short}
            </div>
          ))}
        </div>
      ))}

      {players.length < 11 && (
        <div style={{
          position: 'absolute', bottom: '8%', right: '8%',
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '0.15rem 0.4rem',
        }}>
          <span style={{ fontSize: '0.6rem', color: '#ffffff99', fontWeight: 700 }}>{11 - players.length} left</span>
        </div>
      )}
    </div>
  )
}

export default function SquadComposer({ onDone, onBack }) {
  const [comp, setComp] = useState({ ...DEFAULT })
  const [activePreset, setActivePreset] = useState(0)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 700)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const total = Object.values(comp).reduce((s, v) => s + v, 0)
  const bowlers = (comp['pace-bowler'] || 0) + (comp['spin-bowler'] || 0)
  const isValid = total === 11 && bowlers >= 2

  const handleDrag = useCallback((key, val) => {
    setComp(prev => {
      const next = autoBalance(prev, key, val)
      setActivePreset(-1)
      return next
    })
  }, [])

  const applyPreset = (preset, idx) => {
    setComp({ ...preset.comp })
    setActivePreset(idx)
  }

  const actionButtons = (
    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
      {isMobile && (
        <button onClick={onBack} style={{
          padding: '0.75rem 1.1rem',
          background: 'transparent',
          border: '1px solid var(--border)', borderRadius: '0.5rem',
          color: '#64748b', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap', touchAction: 'manipulation',
        }}>← Back</button>
      )}
      <button
        onClick={() => isValid && onDone(comp)}
        disabled={!isValid}
        style={{
          flex: 1, padding: isMobile ? '0.85rem 1rem' : '0.75rem 1rem',
          background: isValid ? '#C8102E' : 'var(--border2)',
          border: 'none', borderRadius: '0.5rem',
          color: isValid ? '#ffffff' : '#475569',
          fontSize: isMobile ? '0.95rem' : '0.9rem', fontWeight: 800,
          cursor: isValid ? 'pointer' : 'not-allowed',
          boxShadow: isValid ? '0 4px 20px rgba(200,16,46,0.4)' : 'none',
          transition: 'all 0.2s', touchAction: 'manipulation',
        }}
      >
        {total < 11 ? `${11 - total} more to assign` : total > 11 ? 'Too many' : isValid ? 'Start Draft →' : 'Need 2+ bowlers'}
      </button>
    </div>
  )

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div style={{
        minHeight: '100vh', padding: '1rem 1rem 2rem',
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column', gap: '0.875rem',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '0.2rem 0.75rem',
            background: 'rgba(200,16,46,0.15)', border: '1px solid rgba(200,16,46,0.35)',
            borderRadius: '999px', color: '#C8102E',
            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '0.4rem',
          }}>Build Your XI</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', margin: '0 0 0.25rem', letterSpacing: '-0.03em' }}>
            Choose Composition
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.78rem', margin: 0 }}>Drag sliders · Total = 11 · Min 1 opener, 1 keeper</p>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => applyPreset(p, i)} style={{
              padding: '0.5rem 0.875rem',
              background: activePreset === i ? p.color + '22' : 'var(--card)',
              border: `1.5px solid ${activePreset === i ? p.color : 'var(--border)'}`,
              borderRadius: '999px', color: activePreset === i ? p.color : '#64748b',
              fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              touchAction: 'manipulation',
            }}>
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
        </div>

        {/* Sliders card */}
        <div style={{
          background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.4)',
          borderRadius: '1rem', padding: '1.1rem 1.25rem',
          boxShadow: '0 0 24px rgba(200,16,46,0.06)',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.875rem' }}>
            Role Sliders
          </div>
          {ROLE_DEFS.map(def => (
            <RoleSlider key={def.key} def={def} value={comp[def.key] || 0} onDrag={handleDrag} isMobile={true} />
          ))}
          <div style={{
            paddingTop: '0.75rem', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {total !== 11 && (
                <span style={{ fontSize: '0.72rem', color: total < 11 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                  {total < 11 ? `${11 - total} more` : `${total - 11} too many`}
                </span>
              )}
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: total === 11 ? '#C8102E' : total > 11 ? '#ef4444' : '#f59e0b' }}>
                {total}/11
              </span>
            </div>
          </div>
          {!isValid && total === 11 && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444', fontWeight: 700 }}>
              ⚠️ Need at least 2 bowlers
            </div>
          )}
          {actionButtons}
        </div>

        {/* Formation */}
        <div style={{
          background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.4)',
          borderRadius: '1rem', padding: '0.875rem',
          boxShadow: '0 0 24px rgba(200,16,46,0.06)',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
            Formation
          </div>
          <div style={{ height: 260 }}>
            <FormationPreview comp={comp} circleSize={38} />
          </div>
        </div>

        {/* Breakdown */}
        <div style={{
          background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.4)',
          borderRadius: '1rem', padding: '0.875rem',
          boxShadow: '0 0 24px rgba(200,16,46,0.06)',
        }}>
          <CompositionBar comp={comp} />
        </div>
      </div>
    )
  }

  /* ─── DESKTOP LAYOUT — fits in viewport, no scroll ─── */
  return (
    <div style={{
      height: '100vh', overflow: 'hidden',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      padding: '1rem 1.5rem',
      boxSizing: 'border-box',
      gap: '0.75rem',
    }}>

      {/* Header — full size now that presets live inside the slider card */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <button onClick={onBack} style={{
          display: 'block', margin: '0 auto 0.4rem',
          background: 'none', border: 'none', color: '#64748b',
          fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
        }}>← Back</button>
        <div style={{
          display: 'inline-block', padding: '0.2rem 0.85rem',
          background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.3)',
          borderRadius: '999px', color: '#C8102E',
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: '0.35rem',
        }}>Build Your XI</div>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text)', margin: '0 0 0.2rem', letterSpacing: '-0.03em' }}>
          Choose Your Composition
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.78rem', margin: 0 }}>
          Drag the sliders · Must total exactly 11 · Min 1 opener, 1 keeper
        </p>
      </div>

      {/* Main grid — centred; left column widened 20% left; right column unchanged */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: '100%', maxWidth: 1011,
          display: 'grid', gridTemplateColumns: '1.12fr 1fr',
          gap: '1.5rem',
          minHeight: 0,
        }}>

          {/* LEFT column: presets on far-left | slider card on right */}
          <div style={{ display: 'flex', gap: '0.75rem', minHeight: 0 }}>

            {/* Presets — vertical column, outside & to the left of the card */}
            <div style={{
              flexShrink: 0, width: 82,
              display: 'flex', flexDirection: 'column', gap: '0.45rem',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem', textAlign: 'center' }}>Presets</div>
              {PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset(p, i)} style={{
                  padding: '0.4rem 0.4rem',
                  background: activePreset === i ? p.color + '22' : 'var(--bg)',
                  border: `1.5px solid ${activePreset === i ? p.color : 'rgba(200,16,46,0.3)'}`,
                  borderRadius: '0.75rem',
                  color: activePreset === i ? p.color : '#64748b',
                  fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                  width: '100%', transition: 'all 0.15s',
                  lineHeight: 1.2,
                }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{p.icon}</span>
                  <span style={{ textAlign: 'center', wordBreak: 'break-word' }}>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Slider card */}
            <div style={{
              flex: 1, minHeight: 0,
              background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.45)',
              borderRadius: '1.5rem', padding: '1.5rem 1.75rem',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 0 32px rgba(200,16,46,0.08)',
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', flexShrink: 0 }}>
                Role Sliders
              </div>

              {/* Sliders — full card width, space-between */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {ROLE_DEFS.map(def => (
                  <RoleSlider key={def.key} def={def} value={comp[def.key] || 0} onDrag={handleDrag} isMobile={false} />
                ))}
              </div>

              {/* Total + button */}
              <div style={{ flexShrink: 0, paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {total !== 11 && (
                      <span style={{ fontSize: '0.72rem', color: total < 11 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                        {total < 11 ? `${11 - total} more to add` : `${total - 11} too many`}
                      </span>
                    )}
                    <span style={{ fontSize: '1.6rem', fontWeight: 900, color: total === 11 ? '#C8102E' : total > 11 ? '#ef4444' : '#f59e0b' }}>
                      {total}/11
                    </span>
                  </div>
                </div>
                {!isValid && total === 11 && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>
                    ⚠️ Need at least 2 bowlers (pace or spin)
                  </div>
                )}
                {actionButtons}
              </div>
            </div>
          </div>

          {/* RIGHT — formation (big) + breakdown (small) */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
            overflow: 'hidden', minHeight: 0,
          }}>

            {/* Formation card — takes most of the height */}
            <div style={{
              flex: 1, minHeight: 0,
              background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.45)',
              borderRadius: '1.5rem', padding: '1.25rem',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 0 32px rgba(200,16,46,0.08)',
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', flexShrink: 0 }}>
                Formation
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <FormationPreview comp={comp} circleSize={50} />
              </div>
            </div>

            {/* Composition breakdown */}
            <div style={{
              flexShrink: 0,
              background: 'var(--bg)', border: '1.5px solid rgba(200,16,46,0.45)',
              borderRadius: '1.5rem', padding: '1.1rem 1.35rem',
              boxShadow: '0 0 32px rgba(200,16,46,0.08)',
            }}>
              <CompositionBar comp={comp} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
