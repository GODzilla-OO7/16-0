import { useState } from 'react'

const ROLE_DEFS = [
  { key: 'opener',         label: 'Openers',        icon: '🏏', color: '#f59e0b',  min: 1, max: 4 },
  { key: 'top-order',      label: 'Top Order',       icon: '🏏', color: '#fbbf24',  min: 0, max: 4 },
  { key: 'middle-order',   label: 'Middle Order',    icon: '🏏', color: '#fb923c',  min: 0, max: 4 },
  { key: 'wicket-keeper',  label: 'Wicket-keeper',   icon: '🧤', color: '#a78bfa',  min: 1, max: 2 },
  { key: 'all-rounder',    label: 'All-rounders',    icon: '⚡', color: '#34d399',  min: 0, max: 4 },
  { key: 'pace-bowler',    label: 'Pace Bowlers',    icon: '💨', color: '#ef4444',  min: 0, max: 5 },
  { key: 'spin-bowler',    label: 'Spin Bowlers',    icon: '🌀', color: '#a855f7',  min: 0, max: 5 },
]

const DEFAULT = {
  opener: 2, 'top-order': 2, 'middle-order': 1,
  'wicket-keeper': 1, 'all-rounder': 2,
  'pace-bowler': 2, 'spin-bowler': 1,
}

// Expand composition into an ordered flat list of role slots
function buildSlots(comp) {
  const order = ROLE_DEFS.map(r => r.key)
  const slots = []
  for (const key of order) {
    for (let i = 0; i < (comp[key] || 0); i++) slots.push(key)
  }
  return slots
}

export default function SquadComposer({ onDone, onBack }) {
  const [comp, setComp] = useState({ ...DEFAULT })

  const total = Object.values(comp).reduce((s, v) => s + v, 0)
  const slots = buildSlots(comp)
  const bowlers = (comp['pace-bowler'] || 0) + (comp['spin-bowler'] || 0)
  const isValid = total === 11 && bowlers >= 2

  function adjust(key, delta) {
    setComp(prev => {
      const def = ROLE_DEFS.find(r => r.key === key)
      const current = prev[key] || 0
      const next = Math.max(def.min, Math.min(def.max, current + delta))
      if (next === current) return prev
      const newTotal = total + (next - current)
      if (delta > 0 && newTotal > 11) return prev
      return { ...prev, [key]: next }
    })
  }

  const roleDef = key => ROLE_DEFS.find(r => r.key === key)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0a1a3a 0%, #060818 60%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem 1rem',
    }}>
      <div style={{ width: '100%', maxWidth: 860 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-block', padding: '0.25rem 0.75rem',
            background: 'rgba(31,111,235,0.15)', border: '1px solid rgba(31,111,235,0.3)',
            borderRadius: '999px', color: '#1F6FEB',
            fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: '0.75rem',
          }}>Build Your XI</div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 900, color: '#f1f5f9', margin: 0, letterSpacing: '-0.03em' }}>
            Choose Your Composition
          </h2>
          <p style={{ color: '#475569', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Select how many of each role you want. Total must be 11.
          </p>
        </div>

        {/* Main layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

          {/* Left — role steppers */}
          <div style={{
            background: '#0d1229', border: '1px solid #1a2550',
            borderRadius: '1rem', padding: '1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.625rem',
          }}>
            {ROLE_DEFS.map(def => {
              const count = comp[def.key] || 0
              const atMin = count <= def.min
              const atMax = count >= def.max || total >= 11
              return (
                <div key={def.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.625rem 0.875rem',
                  background: count > 0 ? `rgba(${hexToRgb(def.color)},0.07)` : 'transparent',
                  border: `1px solid ${count > 0 ? def.color + '33' : '#1a2550'}`,
                  borderRadius: '0.625rem', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{def.icon}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: count > 0 ? '#f1f5f9' : '#475569' }}>
                      {def.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <button
                      onClick={() => adjust(def.key, -1)}
                      disabled={atMin}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: 'none',
                        background: atMin ? '#1a2550' : '#1a2550',
                        color: atMin ? '#334155' : '#94a3b8',
                        cursor: atMin ? 'default' : 'pointer', fontSize: '1rem',
                        fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!atMin) e.currentTarget.style.background = '#1F6FEB33' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1a2550' }}
                    >−</button>
                    <span style={{
                      fontSize: '1.1rem', fontWeight: 900, width: 20, textAlign: 'center',
                      color: count > 0 ? def.color : '#334155',
                    }}>{count}</span>
                    <button
                      onClick={() => adjust(def.key, 1)}
                      disabled={atMax}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: 'none',
                        background: atMax ? '#1a2550' : '#1a2550',
                        color: atMax ? '#334155' : '#94a3b8',
                        cursor: atMax ? 'default' : 'pointer', fontSize: '1rem',
                        fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!atMax) e.currentTarget.style.background = '#1F6FEB33' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1a2550' }}
                    >+</button>
                  </div>
                </div>
              )
            })}

            {/* Total counter */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem 0.875rem', borderTop: '1px solid #1a2550', marginTop: '0.25rem',
            }}>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
              <span style={{
                fontSize: '1.5rem', fontWeight: 900,
                color: total === 11 ? '#1F6FEB' : total > 11 ? '#ef4444' : '#64748b',
              }}>{total}/11</span>
            </div>
          </div>

          {/* Right — XI slots preview */}
          <div style={{
            background: '#0d1229', border: '1px solid #1a2550',
            borderRadius: '1rem', padding: '1.25rem',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem' }}>
              Your XI Preview
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {Array.from({ length: 11 }).map((_, i) => {
                const key = slots[i]
                const def = key ? roleDef(key) : null
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.45rem 0.75rem',
                    background: def ? `rgba(${hexToRgb(def.color)},0.08)` : '#080d1f',
                    border: `1px solid ${def ? def.color + '33' : '#1a2550'}`,
                    borderRadius: '0.4rem', transition: 'all 0.2s',
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: def ? def.color : '#1a2550',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 900, color: '#0a0f1a', flexShrink: 0,
                    }}>{i + 1}</span>
                    {def ? (
                      <>
                        <span style={{ fontSize: '0.9rem' }}>{def.icon}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9' }}>{def.label.replace(/s$/, '')}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#1a2550', fontStyle: 'italic' }}>— empty slot</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Validation hint */}
        {!isValid && total === 11 && (
          <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.82rem', color: '#ef4444' }}>
            You need at least 2 bowlers (pace or spin).
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={onBack}
            style={{
              padding: '0.75rem 1.5rem', background: 'transparent',
              border: '1px solid #1a2550', borderRadius: '0.625rem',
              color: '#64748b', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            }}
          >← Back</button>
          <button
            onClick={() => isValid && onDone(comp)}
            disabled={!isValid}
            style={{
              padding: '0.875rem 2.5rem',
              background: isValid ? 'linear-gradient(135deg, #1F6FEB, #0047CC)' : '#1a2550',
              border: 'none', borderRadius: '0.625rem',
              color: isValid ? '#ffffff' : '#334155',
              fontSize: '1rem', fontWeight: 800,
              cursor: isValid ? 'pointer' : 'not-allowed',
              boxShadow: isValid ? '0 4px 20px rgba(31,111,235,0.35)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {total < 11 ? `${11 - total} more to assign` : isValid ? 'Start Draft →' : 'Need 2+ bowlers'}
          </button>
        </div>
      </div>
    </div>
  )
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
