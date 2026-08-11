import { useState, useRef } from 'react'
import { MODE_CONFIG } from '../data/players.js'

function getYear(entry) {
  if (typeof entry.season === 'number') return entry.season
  return parseInt(entry.season?.match(/\d{4}/)?.[0] ?? '2000')
}

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   rerolls: 5, desc: '5 rerolls' },
  { key: 'normal', label: 'Normal', rerolls: 3, desc: '3 rerolls' },
  { key: 'hard',   label: 'Hard',   rerolls: 1, desc: '1 reroll'  },
]

// ─── Dual range slider (custom pointer-drag — no broken overlapping inputs) ─

function DualRangeSlider({ min, max, low, high, onChange, formatLabel }) {
  const trackRef = useRef(null)
  const lowRef  = useRef(low)
  const highRef = useRef(high)
  lowRef.current  = low
  highRef.current = high

  const pct = v => `${((v - min) / (max - min) * 100).toFixed(2)}%`
  const fmt = v => formatLabel ? formatLabel(v) : String(v)

  function getVal(clientX) {
    if (!trackRef.current) return null
    const rect = trackRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(min + fraction * (max - min))
  }

  function startDrag(thumb, e) {
    e.preventDefault()
    e.stopPropagation()
    const onMove = ev => {
      const cx  = ev.touches ? ev.touches[0].clientX : ev.clientX
      const val = getVal(cx)
      if (val === null) return
      if (thumb === 'low') onChange(Math.min(val, highRef.current), highRef.current)
      else                  onChange(lowRef.current, Math.max(val, lowRef.current))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
  }

  function onTrackClick(e) {
    const val = getVal(e.clientX)
    if (val === null) return
    const lowDist  = Math.abs(val - low)
    const highDist = Math.abs(val - high)
    if (lowDist <= highDist) onChange(Math.min(val, high), high)
    else                      onChange(low, Math.max(val, low))
  }

  // Are the thumbs close enough that labels would collide?
  const overlap = (high - low) / (max - min) < 0.12

  const thumbStyle = {
    position: 'absolute', top: '50%',
    width: 22, height: 22, borderRadius: '50%',
    background: '#4169E1', border: '3px solid var(--bg)',
    cursor: 'grab', zIndex: 3, boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
  }

  return (
    <div style={{ userSelect: 'none', padding: '2rem 0 0.5rem' }}>
      {/* Track — overflow visible so labels above thumbs don't clip */}
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, cursor: 'pointer', overflow: 'visible' }}
        onMouseDown={onTrackClick}
      >
        {/* Active fill */}
        <div style={{ position: 'absolute', left: pct(low), width: `${((high - low) / (max - min) * 100).toFixed(2)}%`, top: 0, bottom: 0, background: '#4169E1', borderRadius: 3, pointerEvents: 'none' }} />

        {/* Low thumb + floating label */}
        <div
          style={{ ...thumbStyle, left: pct(low) }}
          onMouseDown={e => startDrag('low', e)}
          onTouchStart={e => startDrag('low', e)}
        >
          <div style={{
            position: 'absolute', bottom: '130%', left: '50%',
            transform: overlap ? 'translateX(-140%)' : 'translateX(-50%)',
            background: '#4169E1', color: 'var(--bg)',
            fontSize: '0.75rem', fontWeight: 900,
            padding: '2px 7px', borderRadius: '4px',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 6px #00000044',
          }}>
            {fmt(low)}
          </div>
        </div>

        {/* High thumb + floating label */}
        <div
          style={{ ...thumbStyle, left: pct(high) }}
          onMouseDown={e => startDrag('high', e)}
          onTouchStart={e => startDrag('high', e)}
        >
          <div style={{
            position: 'absolute', bottom: '130%', left: '50%',
            transform: overlap ? 'translateX(40%)' : 'translateX(-50%)',
            background: '#4169E1', color: 'var(--bg)',
            fontSize: '0.75rem', fontWeight: 900,
            padding: '2px 7px', borderRadius: '4px',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 6px #00000044',
          }}>
            {fmt(high)}
          </div>
        </div>

        {/* Track end labels */}
        <div style={{ position: 'absolute', left: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(-25%)' }}>{fmt(min)}</div>
        <div style={{ position: 'absolute', right: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(25%)' }}>{fmt(max)}</div>
      </div>
    </div>
  )
}

export default function DraftSettings({ mode, onStart, onBack }) {
  const cfg        = MODE_CONFIG[mode]
  const allEntries = cfg.entries
  const allYears   = [...new Set(allEntries.map(getYear))].sort()

  // ── Settings state ────────────────────────────────────────────────────────
  const [difficulty,  setDifficulty]  = useState('normal')
  const [ratingType,  setRatingType]  = useState('season')
  const [hardMode,    setHardMode]    = useState(false)

  // IPL: year range slider
  const minYear = allYears[0]
  const maxYear = allYears[allYears.length - 1]
  const [iplRange, setIplRange]       = useState([minYear, maxYear])

  // WC: checkboxes — start with NONE selected (user picks editions)
  const [checkedYears, setCheckedYears] = useState(new Set())
  const [wcRange, setWcRange]           = useState([0, allYears.length - 1])

  function toggleYear(y) {
    setCheckedYears(prev => {
      const next = new Set(prev)
      if (next.has(y)) next.delete(y)
      else next.add(y)
      return next
    })
  }

  function applyWcRange([lo, hi]) {
    setWcRange([lo, hi])
    setCheckedYears(new Set(allYears.slice(lo, hi + 1)))
  }

  function getFilteredEntries() {
    if (mode === 'ipl') {
      const [lo, hi] = iplRange
      return allEntries.filter(e => { const y = getYear(e); return y >= lo && y <= hi })
    }
    return allEntries.filter(e => checkedYears.has(getYear(e)))
  }

  function handleStart() {
    const filtered = getFilteredEntries()
    const rerolls = DIFFICULTY.find(d => d.key === difficulty)?.rerolls ?? 3
    onStart({
      hardMode,
      filteredEntries: filtered.length > 0 ? filtered : allEntries,
      difficulty,
      ratingType,
      rerolls,
    })
  }

  const filteredCount = getFilteredEntries().length

  const S = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: 'var(--bg)' },
    card: { width: '100%', maxWidth: 560, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1.25rem', overflow: 'hidden' },
    cardHeader: { padding: '1.5rem 1.75rem', borderBottom: '1px solid var(--border)' },
    modeTag: { fontSize: '0.72rem', color: '#4169E1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' },
    title: { fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' },
    section: { padding: '1.1rem 1.75rem', borderBottom: '1px solid var(--border)' },
    label: { fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' },
    row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
    pill: (active, color = '#4169E1') => ({
      padding: '0.45rem 1rem', background: active ? color + '22' : 'var(--border2)',
      color: active ? color : '#64748b', border: `1px solid ${active ? color + '66' : 'var(--border)'}`,
      borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
    }),
    yearChip: (on) => ({
      padding: '0.4rem 0.875rem', background: on ? '#4169E122' : 'var(--border2)',
      color: on ? '#4169E1' : '#94a3b8', border: `1px solid ${on ? '#4169E166' : '#3a3a4a'}`,
      borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
    }),
    toggle: (on) => ({ width: 44, height: 24, borderRadius: '999px', background: on ? '#4169E1' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, border: 'none' }),
    toggleKnob: (on) => ({ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }),
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Header */}
        <div style={S.cardHeader}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.75rem', display: 'block' }}>← Back</button>
          <div style={S.modeTag}>{cfg.icon} {cfg.label}</div>
          <div style={S.title}>Set Your Draft Rules</div>
        </div>

        {/* Difficulty */}
        <div style={S.section}>
          <div style={S.label}>Difficulty</div>
          <div style={S.row}>
            {DIFFICULTY.map(d => (
              <button key={d.key} style={S.pill(difficulty === d.key)} onClick={() => setDifficulty(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
            {DIFFICULTY.find(d => d.key === difficulty)?.desc} total · coach always gets 1 spin, no respin
          </div>
        </div>

        {/* Rating type */}
        <div style={S.section}>
          <div style={S.label}>Player Ratings</div>
          <div style={S.row}>
            <button style={S.pill(ratingType === 'season')} onClick={() => setRatingType('season')}>
              📅 Season Rating
            </button>
            <button style={S.pill(ratingType === 'prime')} onClick={() => setRatingType('prime')}>
              ⚡ Prime Rating
            </button>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
            {ratingType === 'prime' ? 'Shows career-best potential — slightly higher than season form' : 'Ratings reflect actual form during that specific season'}
          </div>
        </div>

        {/* Year filter */}
        <div style={S.section}>
          <div style={S.label}>{mode === 'ipl' ? 'Season Range' : 'Editions'}</div>

          {mode === 'ipl' ? (
            <>
              <DualRangeSlider
                min={minYear} max={maxYear}
                low={iplRange[0]} high={iplRange[1]}
                onChange={(lo, hi) => setIplRange([lo, hi])}
                formatLabel={v => String(v)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'All Seasons', range: [minYear, maxYear] },
                  { label: 'Classic (2008–14)', range: [2008, 2014] },
                  { label: 'Modern (2015+)', range: [2015, maxYear] },
                ].map(({ label, range }) => {
                  const isActive = iplRange[0] === range[0] && iplRange[1] === range[1]
                  return (
                    <button
                      key={label}
                      onClick={() => setIplRange(range)}
                      style={{
                        fontSize: '0.72rem',
                        color: isActive ? '#4169E1' : '#64748b',
                        background: isActive ? 'rgba(31,111,235,0.15)' : 'var(--border2)',
                        border: `1px solid ${isActive ? 'rgba(31,111,235,0.45)' : 'var(--border)'}`,
                        borderRadius: '0.4rem',
                        padding: '0.3rem 0.6rem',
                        cursor: 'pointer',
                        fontWeight: isActive ? 700 : 600,
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <><>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {allYears.map(y => (
                      <button key={y} style={S.yearChip(checkedYears.has(y))} onClick={() => toggleYear(y)}>{y}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem' }}>
                    <button onClick={() => setCheckedYears(new Set(allYears))} style={{ fontSize: '0.72rem', color: '#4169E1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Select All</button>
                    <button onClick={() => setCheckedYears(new Set())} style={{ fontSize: '0.72rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
                  </div>
                </>
            </>
          )}
        </div>

        {/* Hard mode */}
        <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.2rem' }}>🔒 Hard Mode</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>Player ratings are hidden during the draft. Build on instinct alone.</div>
            </div>
            <button style={S.toggle(hardMode)} onClick={() => setHardMode(h => !h)}>
              <div style={S.toggleKnob(hardMode)} />
            </button>
          </div>
        </div>

        {/* Count note */}
        <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', padding: '0.75rem 1.75rem' }}>
          {filteredCount} team{filteredCount !== 1 ? 's' : ''} on the wheel
        </div>

        {/* Footer */}
        <div style={{ padding: '1.25rem 1.75rem', display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={onBack} style={{ padding: '0.875rem 1.25rem', background: 'transparent', color: '#64748b', border: '1px solid var(--border)', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            ← Back
          </button>
          <button
            onClick={handleStart}
            disabled={mode !== 'ipl' && filteredCount === 0}
            style={{ flex: 1, padding: '0.875rem', background: (mode !== 'ipl' && filteredCount === 0) ? 'var(--border2)' : 'linear-gradient(135deg, #4169E1, #2952CC)', color: (mode !== 'ipl' && filteredCount === 0) ? '#64748b' : 'var(--bg)', border: 'none', borderRadius: '0.625rem', fontSize: '0.95rem', fontWeight: 800, cursor: (mode !== 'ipl' && filteredCount === 0) ? 'default' : 'pointer' }}
          >
            {(mode !== 'ipl' && filteredCount === 0) ? 'Select editions first' : 'Start Draft →'}
          </button>
        </div>
      </div>
    </div>
  )
}
