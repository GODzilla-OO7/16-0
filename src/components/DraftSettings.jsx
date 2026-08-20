import { useState, useRef } from 'react'
import { MODE_CONFIG } from '../data/players.js'

function getYear(entry) {
  if (typeof entry.season === 'number') return entry.season
  return parseInt(entry.season?.match(/\d{4}/)?.[0] ?? '2000')
}

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   rerolls: 5, desc: '5 rerolls' },
  { key: 'normal', label: 'Medium', rerolls: 3, desc: '3 rerolls' },
  { key: 'hard',   label: 'Hard',   rerolls: 1, desc: '1 reroll'  },
]

// ─── Dual range slider ────────────────────────────────────────────────────────

function DualRangeSlider({ min, max, low, high, onChange, formatLabel }) {
  const trackRef = useRef(null)
  const lowRef   = useRef(low)
  const highRef  = useRef(high)
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
    e.preventDefault(); e.stopPropagation()
    const onMove = ev => {
      const cx  = ev.touches ? ev.touches[0].clientX : ev.clientX
      const val = getVal(cx)
      if (val === null) return
      if (thumb === 'low') onChange(Math.min(val, highRef.current), highRef.current)
      else                 onChange(lowRef.current, Math.max(val, lowRef.current))
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
    else                     onChange(low, Math.max(val, low))
  }

  const overlap = (high - low) / (max - min) < 0.12

  const thumbStyle = {
    position: 'absolute', top: '50%',
    width: 22, height: 22, borderRadius: '50%',
    background: '#C8102E', border: '3px solid var(--bg)',
    cursor: 'grab', zIndex: 3, boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
  }

  return (
    <div style={{ userSelect: 'none', padding: '2rem 0 0.5rem' }}>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, cursor: 'pointer', overflow: 'visible' }}
        onMouseDown={onTrackClick}
      >
        <div style={{ position: 'absolute', left: pct(low), width: `${((high - low) / (max - min) * 100).toFixed(2)}%`, top: 0, bottom: 0, background: '#C8102E', borderRadius: 3, pointerEvents: 'none' }} />

        <div style={{ ...thumbStyle, left: pct(low) }} onMouseDown={e => startDrag('low', e)} onTouchStart={e => startDrag('low', e)}>
          <div style={{ position: 'absolute', bottom: '130%', left: '50%', transform: overlap ? 'translateX(-140%)' : 'translateX(-50%)', background: '#C8102E', color: 'var(--bg)', fontSize: '0.75rem', fontWeight: 900, padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 6px #00000044' }}>
            {fmt(low)}
          </div>
        </div>

        <div style={{ ...thumbStyle, left: pct(high) }} onMouseDown={e => startDrag('high', e)} onTouchStart={e => startDrag('high', e)}>
          <div style={{ position: 'absolute', bottom: '130%', left: '50%', transform: overlap ? 'translateX(40%)' : 'translateX(-50%)', background: '#C8102E', color: 'var(--bg)', fontSize: '0.75rem', fontWeight: 900, padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 6px #00000044' }}>
            {fmt(high)}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(-25%)' }}>{fmt(min)}</div>
        <div style={{ position: 'absolute', right: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(25%)' }}>{fmt(max)}</div>
      </div>
    </div>
  )
}

// ─── Single range slider (budget) ─────────────────────────────────────────────

function SingleSlider({ min, max, step = 5, value, onChange, formatLabel }) {
  const trackRef = useRef(null)
  const pct = `${((value - min) / (max - min) * 100).toFixed(1)}%`
  const fmt = v => formatLabel ? formatLabel(v) : String(v)

  function getVal(clientX) {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + fraction * (max - min)
    return Math.max(min, Math.min(max, Math.round(raw / step) * step))
  }

  function startDrag(e) {
    e.preventDefault()
    const onMove = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      onChange(getVal(cx))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    onMove(e)
  }

  return (
    <div style={{ userSelect: 'none', padding: '1.75rem 0 0.5rem' }}>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, cursor: 'pointer', overflow: 'visible' }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div style={{ position: 'absolute', left: 0, width: pct, top: 0, bottom: 0, background: '#C8102E', borderRadius: 3, pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct,
          width: 22, height: 22, borderRadius: '50%',
          background: '#C8102E', border: '3px solid var(--bg)',
          cursor: 'grab', zIndex: 3,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 2px 6px #00000044',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', bottom: '130%', left: '50%',
            transform: 'translateX(-50%)',
            background: '#C8102E', color: 'var(--bg)',
            fontSize: '0.75rem', fontWeight: 900,
            padding: '2px 7px', borderRadius: '4px',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px #00000044',
          }}>
            {fmt(value)}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(-25%)' }}>{fmt(min)}</div>
        <div style={{ position: 'absolute', right: 0, top: '150%', fontSize: '0.62rem', color: '#3a3a4a', fontWeight: 600, transform: 'translateX(25%)' }}>{fmt(max)}</div>
      </div>
    </div>
  )
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({ icon, label, desc, value, onChange, isLast }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', padding: '1rem 1.75rem',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.2rem' }}>
          {icon} {label}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: '999px',
          background: value ? '#C8102E' : 'var(--border)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
          flexShrink: 0, border: 'none',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DraftSettings({ mode, onStart, onBack }) {
  const cfg        = MODE_CONFIG[mode]
  const allEntries = cfg.entries
  const allYears   = [...new Set(allEntries.map(getYear))].sort()

  const minYear = allYears[0]
  const maxYear = allYears[allYears.length - 1]

  // ── Settings state ──────────────────────────────────────────────────────────
  const [difficulty,    setDifficulty]    = useState('normal')
  const [ratingType,    setRatingType]    = useState('season')
  const [iplRange,      setIplRange]      = useState([minYear, maxYear])
  const [draftBudget,   setDraftBudget]   = useState(110)

  // WC: checkboxes
  const [checkedYears, setCheckedYears] = useState(new Set())
  const [wcRange, setWcRange]           = useState([0, allYears.length - 1])

  // Toggles
  const [biddingWars,   setBiddingWars]   = useState(true)
  const [overseasLimit, setOverseasLimit] = useState(true)
  const [freePositions, setFreePositions] = useState(false)
  const [hiddenRatings, setHiddenRatings] = useState(false)

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
      const iplEntries = allEntries.filter(e => { const y = getYear(e); return y >= lo && y <= hi })
      return iplEntries.map(e => ({
        ...e,
        players: (e.players ?? []).filter(p => p.nationality !== 'Pakistan'),
      })).filter(e => e.players.length > 0)
    }
    return allEntries.filter(e => checkedYears.has(getYear(e)))
  }

  function handleStart() {
    const filtered = getFilteredEntries()
    const rerolls  = DIFFICULTY.find(d => d.key === difficulty)?.rerolls ?? 3
    onStart({
      hardMode:        hiddenRatings,
      filteredEntries: filtered.length > 0 ? filtered : allEntries,
      difficulty,
      ratingType,
      rerolls,
      freePositions,
      overseasLimit,
      biddingWars,
      budget:          draftBudget,
    })
  }

  const filteredCount = getFilteredEntries().length
  const canStart = mode === 'ipl' ? true : filteredCount > 0

  const S = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem 3rem', position: 'relative', zIndex: 1 },
    card: { width: '100%', maxWidth: 560, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '1.25rem', overflow: 'hidden', backdropFilter: 'blur(8px)' },
    cardHeader: { padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border)' },
    modeTag: { fontSize: '0.72rem', color: '#C8102E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' },
    title: { fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)' },
    section: { padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' },
    label: { fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' },
    row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
    pill: (active) => ({
      padding: '0.45rem 1.1rem',
      background: active ? '#C8102E22' : 'var(--border2)',
      color: active ? '#C8102E' : '#64748b',
      border: `1px solid ${active ? '#C8102E66' : 'var(--border)'}`,
      borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
    }),
    yearChip: (on) => ({
      padding: '0.4rem 0.875rem', background: on ? '#C8102E22' : 'var(--border2)',
      color: on ? '#C8102E' : '#94a3b8', border: `1px solid ${on ? '#C8102E66' : '#3a3a4a'}`,
      borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
    }),
  }

  return (
    <div style={S.page}>

      {/* ── Card 1: Mode Settings ────────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: '0.875rem' }}>

        {/* Header */}
        <div style={S.cardHeader}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.6rem', display: 'block' }}>← Back</button>
          <div style={S.modeTag}>{cfg.icon} {cfg.label}</div>
          <div style={S.title}>Draft Rules</div>
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
            {DIFFICULTY.find(d => d.key === difficulty)?.desc} available · coach always gets 1 spin
          </div>
        </div>

        {/* Rating type */}
        <div style={S.section}>
          <div style={S.label}>Player Ratings</div>
          <div style={S.row}>
            <button style={S.pill(ratingType === 'season')} onClick={() => setRatingType('season')}>📅 Season</button>
            <button style={S.pill(ratingType === 'prime')}  onClick={() => setRatingType('prime')}>⚡ Prime</button>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
            {ratingType === 'prime' ? 'Career-best potential — slightly higher than season form' : 'Reflects actual form during that specific season'}
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
                  { label: 'All Seasons',     range: [minYear, maxYear] },
                  { label: 'Classic (2008–14)', range: [2008, 2014] },
                  { label: 'Modern (2015+)',  range: [2015, maxYear] },
                ].map(({ label, range }) => {
                  const isActive = iplRange[0] === range[0] && iplRange[1] === range[1]
                  return (
                    <button
                      key={label}
                      onClick={() => setIplRange(range)}
                      style={{
                        fontSize: '0.72rem',
                        color: isActive ? '#C8102E' : '#64748b',
                        background: isActive ? 'rgba(200,16,46,0.15)' : 'var(--border2)',
                        border: `1px solid ${isActive ? 'rgba(200,16,46,0.45)' : 'var(--border)'}`,
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
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {allYears.map(y => (
                  <button key={y} style={S.yearChip(checkedYears.has(y))} onClick={() => toggleYear(y)}>{y}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem' }}>
                <button onClick={() => setCheckedYears(new Set(allYears))} style={{ fontSize: '0.72rem', color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Select All</button>
                <button onClick={() => setCheckedYears(new Set())} style={{ fontSize: '0.72rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
              </div>
            </>
          )}
        </div>

        {/* Draft Budget */}
        <div style={{ ...S.section, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={S.label}>Draft Budget</div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#C8102E' }}>₹{draftBudget}cr</div>
          </div>
          <SingleSlider
            min={60} max={150} step={5}
            value={draftBudget}
            onChange={setDraftBudget}
            formatLabel={v => `₹${v}cr`}
          />
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
            Starting auction purse · default ₹110cr
          </div>
        </div>

        {/* Team count */}
        <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', padding: '0.625rem 1.75rem', borderTop: '1px solid var(--border)' }}>
          {filteredCount} team{filteredCount !== 1 ? 's' : ''} on the wheel
        </div>
      </div>

      {/* ── Card 2: Toggles ──────────────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: '1rem' }}>
        <div style={{ padding: '0.875rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mode Options</div>
        </div>

        <ToggleRow
          icon="⚡" label="Bidding Wars"
          desc="Marquee players may trigger a bidding war — pay more or lose them to a rival."
          value={biddingWars}
          onChange={setBiddingWars}
        />
        <ToggleRow
          icon="✈️" label="Overseas Limit"
          desc="IPL rule: max 4 overseas players per XI. Turn off to draft freely across nationalities."
          value={overseasLimit}
          onChange={setOverseasLimit}
        />
        <ToggleRow
          icon="🔓" label="Free Positions"
          desc="Skip composition screen entirely — pick any player from any role, no restrictions."
          value={freePositions}
          onChange={setFreePositions}
        />
        <ToggleRow
          icon="🕶️" label="Hidden Ratings"
          desc="Player ratings are hidden during the draft. Build on instinct alone."
          value={hiddenRatings}
          onChange={setHiddenRatings}
          isLast
        />
      </div>

      {/* ── Next button ───────────────────────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 560 }}>
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: '100%', padding: '1rem',
            background: !canStart ? 'var(--border2)' : '#C8102E',
            color: !canStart ? '#64748b' : '#fff',
            border: 'none', borderRadius: '0.75rem',
            fontSize: '1rem', fontWeight: 800,
            cursor: !canStart ? 'default' : 'pointer',
            letterSpacing: '0.04em', transition: 'background 0.15s, transform 0.1s',
          }}
          onMouseEnter={e => { if (canStart) { e.currentTarget.style.background = '#a50d24'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = !canStart ? 'var(--border2)' : '#C8102E'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          {!canStart ? 'Select editions first' : freePositions ? 'START DRAFT →' : 'NEXT: CHOOSE COMPOSITION →'}
        </button>
      </div>
    </div>
  )
}
