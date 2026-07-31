import { useState, useRef, useEffect } from 'react'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Role display ─────────────────────────────────────────────────────────

function roleCategory(role) {
  if (role === 'wicket-keeper') return 'WK'
  if (role === 'all-rounder')  return 'ALL-RDR'
  if (['pace-bowler','spin-bowler'].includes(role)) return role === 'pace-bowler' ? 'PACE' : 'SPIN'
  return 'BATTER'
}

const CAT_COLOR = {
  'BATTER':  '#1F6FEB',
  'WK':      '#f59e0b',
  'ALL-RDR': '#3b82f6',
  'PACE':    '#ef4444',
  'SPIN':    '#a855f7',
}

// ─── Rating scaling + prime ───────────────────────────────────────────────

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 3))) }
function primeVal(v)     { return Math.min(99, Math.round(scaleDisplay(v) * 1.055)) }

function displayRating(player, ratingType) {
  if (ratingType === 'prime') return {
    overall: scaleDisplay(player.primeOverall ?? player.overall),
    batting: scaleDisplay(player.primeBatting ?? player.batting),
    bowling: scaleDisplay(player.primeBowling ?? player.bowling),
  }
  return { overall: scaleDisplay(player.overall), batting: scaleDisplay(player.batting), bowling: scaleDisplay(player.bowling) }
}

// ─── IPL overseas rule ────────────────────────────────────────────────────

// In IPL only India-nationality players count as domestic; all others are overseas
const isOverseas = (p) => p.nationality !== 'India'

// ─── Position enforcement ─────────────────────────────────────────────────

// With composition: returns which roles are over-quota (should be locked out)
// and which roles are strictly needed right now (must-pick)
function getPositionNeeds(team, composition) {
  const remaining = 11 - team.length
  const needs = []

  if (composition) {
    // Count how many of each role are already drafted
    const filled = {}
    for (const p of team) filled[p.role] = (filled[p.role] || 0) + 1
    // Find roles that still have quota and haven't been filled
    for (const [role, quota] of Object.entries(composition)) {
      const have = filled[role] || 0
      const still = quota - have
      if (still > 0) {
        // Is it a must-pick? Yes if remaining slots === total still needed across all roles
        const totalStillNeeded = Object.entries(composition)
          .reduce((s, [r, q]) => s + Math.max(0, q - (filled[r] || 0)), 0)
        needs.push({ role, label: roleName(role), must: remaining <= totalStillNeeded && still >= remaining })
      }
    }
  } else {
    // Fallback: original hard-coded rules
    const hasWK   = team.some(p => p.role === 'wicket-keeper')
    const openers = team.filter(p => p.role === 'opener').length
    const bowlers = team.filter(p => ['pace-bowler','spin-bowler'].includes(p.role)).length
    if (!hasWK)      needs.push({ role: 'wicket-keeper', label: 'WK',    must: remaining <= 1 })
    if (openers < 2) needs.push({ role: 'opener',        label: 'Opener', must: remaining <= (2 - openers) })
    if (bowlers < 3) needs.push({ role: 'bowler',        label: 'Bowler', must: remaining <= (3 - bowlers) })
  }
  return needs
}

// Is a player's role already full per the composition?
function isRoleFull(player, team, composition) {
  if (!composition) return false
  const quota = composition[player.role] || 0
  const have  = team.filter(p => p.role === player.role).length
  return have >= quota
}

function roleName(role) {
  const m = { 'opener': 'Opener', 'top-order': 'Top Order', 'middle-order': 'Mid Order',
    'wicket-keeper': 'WK', 'all-rounder': 'All-Rdr', 'pace-bowler': 'Pace', 'spin-bowler': 'Spin' }
  return m[role] || role
}

function isBowler(p) { return ['pace-bowler','spin-bowler'].includes(p.role) }
function satisfiesNeed(player, need) {
  if (need.role === 'bowler') return isBowler(player)
  return player.role === need.role
}

// Extract year from season string or number ("2024" → "2024", "2019 ODI WC" → "2019", 2019 → "2019")
function extractYear(season) {
  if (typeof season === 'number') return String(season)
  return season?.match(/\d{4}/)?.[0] ?? String(season ?? '')
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function WheelSpin({
  mode, settings, composition, slotIndex, totalSlots,
  draftedIds, team, rerollsLeft, onReroll, onResult,
}) {
  const [phase, setPhase]             = useState('idle')
  const [landedEntry, setLandedEntry] = useState(null)
  const [cycleEntry, setCycleEntry]   = useState(null)
  const cycleRef = useRef(null)

  const entries    = settings.filteredEntries
  const hardMode   = settings.hardMode
  const ratingType = settings.ratingType || 'season'
  const needs      = getPositionNeeds(team, composition)
  const mustPick   = needs.find(n => n.must) || null

  // IPL overseas rule
  const isIPLMode = mode === 'ipl'
  const overseasInTeam = isIPLMode ? team.filter(p => isOverseas(p)).length : 0
  const overseasLimitReached = isIPLMode && overseasInTeam >= 4

  useEffect(() => () => clearTimeout(cycleRef.current), [])

  function startSpin() {
    setPhase('spinning')
    setLandedEntry(null)

    const shuffled = shuffle(entries)
    const chosen = shuffled[Math.floor(Math.random() * shuffled.length)]
    let i = 0, interval = 60

    function tick() {
      i++
      const isLast = i >= 30
      const entry = isLast ? chosen : shuffled[i % shuffled.length]
      setCycleEntry(entry)
      if (isLast) {
        cycleRef.current = setTimeout(() => {
          setLandedEntry(chosen)
          setPhase('selecting')
        }, 900)
      } else {
        if (i > 20) interval = Math.min(interval + 12, 220)
        cycleRef.current = setTimeout(tick, interval)
      }
    }
    cycleRef.current = setTimeout(tick, interval)
  }

  function spin() {
    if (phase === 'spinning') return
    startSpin()
  }

  function spinAgain() {
    if (rerollsLeft <= 0) return
    clearTimeout(cycleRef.current)
    onReroll()
    setLandedEntry(null)
    setCycleEntry(null)
    // Auto-spin immediately on reroll
    startSpin()
  }

  function pickPlayer(player) {
    onResult(player)
    setPhase('idle')
    setLandedEntry(null)
    setCycleEntry(null)
  }

  // Build + sort player list — always descending overall, eligible first when mustPick
  const draftedNames = new Set(team.map(p => p.name))
  const rawPlayers = landedEntry
    ? landedEntry.players.filter(p => !draftedIds.has(p.id) && !draftedNames.has(p.name))
    : []

  // Always sort by overall descending
  const sortByOvr = arr => [...arr].sort((a, b) =>
    displayRating(b, ratingType).overall - displayRating(a, ratingType).overall
  )

  let squadPlayers
  if (mustPick) {
    // Show ALL players: eligible (matching mustPick) on top, ineligible faded below
    // Each group independently sorted by overall desc
    const eligible   = sortByOvr(rawPlayers.filter(p => satisfiesNeed(p, mustPick) && !isRoleFull(p, team, composition)))
    const ineligible = sortByOvr(rawPlayers.filter(p => !satisfiesNeed(p, mustPick) || isRoleFull(p, team, composition)))
    // Safety: if no eligible players exist in this squad, fall back to showing all
    if (eligible.length === 0) {
      squadPlayers = sortByOvr(rawPlayers).map(p => ({ ...p, _eligible: !isRoleFull(p, team, composition) }))
    } else {
      squadPlayers = [
        ...eligible.map(p => ({ ...p, _eligible: true })),
        ...ineligible.map(p => ({ ...p, _eligible: false })),
      ]
    }
  } else {
    // No mustPick but still respect composition quotas
    squadPlayers = sortByOvr(rawPlayers).map(p => ({
      ...p,
      _eligible: !isRoleFull(p, team, composition),
    }))
  }

  const allDrafted = landedEntry && rawPlayers.length === 0

  // Detect stuck state: all players ineligible (role-full per composition)
  const hasAnyEligible = squadPlayers.some(p => p._eligible)
  const isStuck = !allDrafted && squadPlayers.length > 0 && !hasAnyEligible

  // When stuck with no rerolls → unlock all so user can always proceed
  if (isStuck && rerollsLeft === 0) {
    squadPlayers = squadPlayers.map(p => ({ ...p, _eligible: true }))
  }

  // Auto-reroll when stuck but rerolls are available
  useEffect(() => {
    if (phase === 'selecting' && isStuck && rerollsLeft > 0) {
      spinAgain()
    }
  }, [phase, landedEntry])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: '100%' }}>
      {phase !== 'selecting' ? (
        <SpinPhase
          phase={phase}
          cycleEntry={cycleEntry}
          slotIndex={slotIndex}
          totalSlots={totalSlots}
          needs={needs}
          mustPick={mustPick}
          rerollsLeft={rerollsLeft}
          onSpin={spin}
        />
      ) : (
        <SelectPhase
          entry={landedEntry}
          players={squadPlayers}
          allDrafted={allDrafted}
          compositionUnlocked={isStuck && rerollsLeft === 0}
          hardMode={hardMode}
          ratingType={ratingType}
          needs={needs}
          mustPick={mustPick}
          slotIndex={slotIndex}
          totalSlots={totalSlots}
          rerollsLeft={rerollsLeft}
          overseasInTeam={overseasInTeam}
          overseasLimitReached={overseasLimitReached}
          isIPLMode={isIPLMode}
          onPick={pickPlayer}
          onSpinAgain={spinAgain}
        />
      )}
    </div>
  )
}

// ─── Spin phase ───────────────────────────────────────────────────────────

function SpinPhase({ phase, cycleEntry, slotIndex, totalSlots, needs, mustPick, rerollsLeft, onSpin }) {
  const isSpinning = phase === 'spinning'
  const year = cycleEntry ? extractYear(cycleEntry.season) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 1rem', animation: 'fade-in 0.3s ease both' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '0.3rem' }}>
          Pick {slotIndex + 1} of {totalSlots}
        </div>
        <div style={{ fontSize: '0.68rem', color: '#2a2a3a', fontWeight: 600, marginBottom: '0.3rem' }}>
          {rerollsLeft} reroll{rerollsLeft !== 1 ? 's' : ''} remaining
        </div>
        {mustPick && (
          <div style={{ display: 'inline-block', padding: '0.2rem 0.75rem', background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '999px', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            ⚠ Must pick a {mustPick.label} this round
          </div>
        )}
        {!mustPick && needs.length > 0 && (
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Still need: {needs.map(n => n.label).join(', ')}</div>
        )}
      </div>

      {/* Ticker — now shows "Team Year" prominently */}
      <div style={{
        width: '100%', maxWidth: 360, minHeight: 110, borderRadius: '1rem',
        border: `2px solid ${cycleEntry ? cycleEntry.color + '88' : '#2a2a3a'}`,
        background: cycleEntry ? cycleEntry.color + '14' : '#12121a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        boxShadow: cycleEntry && isSpinning ? `0 0 30px ${cycleEntry.color}33` : 'none',
      }}>
        {cycleEntry ? (
          <>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: cycleEntry.color, marginBottom: '0.15rem' }}>{cycleEntry.badge}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ffffff', textAlign: 'center', lineHeight: 1.2 }}>
              {cycleEntry.teamName}
            </div>
            {year && (
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', marginTop: '0.25rem', opacity: 0.75 }}>
                {year}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.9rem', color: '#2a2a3a', fontWeight: 600 }}>Spin to land on a team</div>
        )}
      </div>

      <button
        onClick={onSpin}
        disabled={isSpinning}
        style={{
          padding: '0.875rem 2.75rem',
          background: isSpinning ? 'transparent' : 'linear-gradient(135deg, #1F6FEB, #0047CC)',
          color: isSpinning ? '#64748b' : '#0a0a0f',
          border: isSpinning ? '1px solid #2a2a3a' : 'none',
          borderRadius: '0.75rem', fontSize: '0.95rem', fontWeight: 800,
          cursor: isSpinning ? 'default' : 'pointer', minWidth: 180,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        {isSpinning ? 'Spinning…' : 'Spin Wheel'}
      </button>
    </div>
  )
}

// ─── Select phase ─────────────────────────────────────────────────────────

function SelectPhase({ entry, players, allDrafted, compositionUnlocked, hardMode, ratingType, needs, mustPick, slotIndex, totalSlots, rerollsLeft, overseasInTeam, overseasLimitReached, isIPLMode, onPick, onSpinAgain }) {
  const canReroll = rerollsLeft > 0
  const year = extractYear(entry.season)

  return (
    <div style={{ animation: 'fade-in 0.2s ease both', display: 'flex', flexDirection: 'column' }}>
      {/* Header — shows "TeamName · YEAR" prominently */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: entry.color + '18', borderBottom: `1px solid ${entry.color}33` }}>
        <div>
          <div style={{ fontSize: '0.62rem', color: entry.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
            Pick {slotIndex + 1} of {totalSlots}
          </div>
          {/* Team + year as one combined prominent line */}
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {entry.teamName}
            <span style={{
              padding: '0.15rem 0.6rem',
              background: 'rgba(255,255,255,0.15)',
              border: '1.5px solid rgba(255,255,255,0.35)',
              borderRadius: '999px',
              fontSize: '0.8rem', fontWeight: 900, color: '#ffffff',
            }}>
              {year}
            </span>
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: entry.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: entry.textColor }}>
          {entry.badge}
        </div>
      </div>

      {/* Info bar */}
      <div style={{ padding: '0.45rem 1.25rem', background: '#12121a', borderBottom: '1px solid #1a1a26', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: compositionUnlocked ? '#ef4444' : mustPick ? '#f59e0b' : '#64748b' }}>
          {compositionUnlocked
            ? '⚠ No matching players — pick anyone'
            : mustPick
            ? `⚠ Must pick a ${mustPick.label} — others shown below`
            : hardMode ? '🔒 Hard Mode'
            : `${players.filter(p => p._eligible).length} eligible · ${ratingType === 'prime' ? '⚡ Prime' : '📅 Season'} ratings`
          }
          {isIPLMode && <span style={{ marginLeft: '0.5rem', color: '#64748b', fontSize: '0.62rem' }}>✈ {overseasInTeam}/4 overseas</span>}
        </span>
        {canReroll ? (
          <button onClick={onSpinAgain} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
            ↺ Different team ({rerollsLeft} left)
          </button>
        ) : (
          <span style={{ fontSize: '0.68rem', color: '#2a2a3a', fontWeight: 600 }}>No rerolls left</span>
        )}
      </div>

      {/* Player list */}
      <div style={{ background: '#12121a', overflowY: 'auto', maxHeight: '55vh' }}>
        {allDrafted ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>All players from this squad are already in your XI.</div>
            {canReroll && (
              <button onClick={onSpinAgain} style={{ padding: '0.75rem 1.5rem', background: '#1a1a26', color: '#f1f5f9', border: '1px solid #2a2a3a', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>
                ↺ Spin again
              </button>
            )}
          </div>
        ) : (
          players.map((player, i) => {
            const isNeeded      = !mustPick && needs.some(n => satisfiesNeed(player, n))
            const isMustPick    = mustPick ? satisfiesNeed(player, mustPick) : false
            const isIneligible  = !player._eligible
            const overseas      = isIPLMode && isOverseas(player)
            const overseasBlock = overseasLimitReached && overseas

            // Divider between eligible and ineligible sections
            const showDivider = mustPick && i > 0 && !player._eligible && players[i-1]._eligible

            return (
              <div key={player.id}>
                {showDivider && (
                  <div style={{ padding: '0.3rem 1.25rem', background: '#0a0a0f', fontSize: '0.6rem', color: '#2a2a3a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', borderTop: '1px solid #1a1a26', borderBottom: '1px solid #1a1a26' }}>
                    Other players — ineligible this pick
                  </div>
                )}
                <PlayerRow
                  player={player}
                  hardMode={hardMode}
                  ratingType={ratingType}
                  teamColor={entry.color}
                  isLast={i === players.length - 1}
                  isNeeded={isNeeded}
                  isMustPick={isMustPick}
                  isIneligible={isIneligible}
                  isOverseas={overseas}
                  isOverseasBlocked={overseasBlock}
                  onPick={isIneligible || overseasBlock ? null : () => onPick(player)}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Player row ───────────────────────────────────────────────────────────

function PlayerRow({ player, hardMode, ratingType, teamColor, isLast, isNeeded, isMustPick, isIneligible, isOverseas, isOverseasBlocked, onPick }) {
  const [hovered, setHovered] = useState(false)
  const cat     = roleCategory(player.role)
  const catClr  = CAT_COLOR[cat]
  const ratings = displayRating(player, ratingType)
  const highlight = isMustPick ? '#f59e0b' : isNeeded ? '#1F6FEB' : null
  const blocked = isIneligible || isOverseasBlocked

  const opacity = blocked ? 0.32 : 1

  return (
    <div
      onClick={blocked ? undefined : onPick}
      onMouseEnter={() => !blocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '0.75rem 1.25rem',
        borderBottom: isLast ? 'none' : '1px solid #1a1a26',
        cursor: blocked ? 'not-allowed' : 'pointer',
        background: blocked ? 'transparent' : hovered ? (highlight ? highlight + '15' : teamColor + '10') : highlight ? highlight + '08' : 'transparent',
        transition: 'background 0.12s',
        borderLeft: highlight && !blocked ? `3px solid ${highlight}` : '3px solid transparent',
        opacity,
      }}
    >
      {/* Role category badge */}
      <div style={{
        padding: '0.2rem 0.45rem', borderRadius: '0.3rem', flexShrink: 0,
        background: catClr + '20', border: `1px solid ${catClr}44`,
        fontSize: '0.52rem', fontWeight: 900, color: catClr, letterSpacing: '0.06em',
        minWidth: 42, textAlign: 'center',
      }}>
        {cat}
      </div>

      {/* Name + nationality + indicators */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {player.name}
          {isOverseas && <span style={{ fontSize: '0.7rem' }} title="Overseas player">✈️</span>}
          {isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#f59e0b', fontWeight: 800 }}>NEEDED</span>}
          {isNeeded && !isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#1F6FEB', fontWeight: 800 }}>NEED</span>}
        </div>
        <div style={{ fontSize: '0.67rem', color: '#64748b' }}>
          {player.nationality}
          {isOverseasBlocked && <span style={{ marginLeft: '0.4rem', color: '#ef444488', fontWeight: 700 }}>· Overseas limit reached</span>}
        </div>
      </div>

      {/* Ratings */}
      {hardMode ? (
        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#2a2a3a', letterSpacing: '0.1em' }}>???</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexShrink: 0 }}>
          <MiniBar label="Bat"  value={ratings.batting} color="#1F6FEB" />
          <MiniBar label="Bowl" value={ratings.bowling} color="#3b82f6" />
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', minWidth: 26, textAlign: 'right' }}>
            {ratings.overall}
          </div>
        </div>
      )}

      {!blocked && (
        <div style={{ color: hovered ? (highlight || teamColor) : '#2a2a3a', fontSize: '1rem', transition: 'color 0.12s', flexShrink: 0 }}>→</div>
      )}
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', width: 42 }}>
      <div style={{ height: 4, background: '#1a1a26', borderRadius: 2, marginBottom: 2 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 600 }}>{label} {value}</div>
    </div>
  )
}
