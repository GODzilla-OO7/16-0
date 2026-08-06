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

// ─── Spin rarity ─────────────────────────────────────────────────────────

function spinRarity(entry) {
  if (!entry?.players?.length) return null
  const sorted = [...entry.players].map(p => scaleDisplay(p.overall)).sort((a, b) => b - a)
  const top5   = sorted.slice(0, Math.min(5, sorted.length))
  const avg    = top5.reduce((s, v) => s + v, 0) / top5.length
  if (avg >= 91) return { label: '⚡ GOD TIER',     color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b55' }
  if (avg >= 84) return { label: '🔥 Top 5% pick',  color: '#ef4444', bg: '#ef444418', border: '#ef444455' }
  if (avg >= 77) return { label: '✨ Rare squad',    color: '#a855f7', bg: '#a855f718', border: '#a855f755' }
  if (avg >= 70) return { label: '💫 Solid pull',   color: '#3b82f6', bg: '#3b82f618', border: '#3b82f655' }
  return null
}

// ─── Auction budget ───────────────────────────────────────────────────────

export const STARTING_BUDGET = 110  // ₹110 cr

// Price in crores based on display overall rating (1–99).
// Quadratic curve: unknowns ≈ ₹0.5cr, stars ≈ ₹20-30cr.
export function calcPrice(rating) {
  const raw = 0.5 + Math.pow(Math.max(0, rating - 58) / 41, 2) * 29.5
  return Math.round(Math.min(30, raw) * 2) / 2   // round to nearest 0.5
}

function fmtCr(cr) {
  return cr >= 1 ? `₹${cr}cr` : `₹${Math.round(cr * 100)}L`
}

// ─── Rating scaling + prime ───────────────────────────────────────────────

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
// Prime uses a much more generous curve — elite legends hit 97-99, making prime feel truly special
function scalePrime(v)   { return Math.max(1, Math.min(99, Math.round(v * 0.96 + 14))) }

function displayRating(player, ratingType) {
  if (ratingType === 'prime') return {
    overall: scalePrime(player.primeOverall ?? player.overall),
    batting: scalePrime(player.primeBatting ?? player.batting),
    bowling: scalePrime(player.primeBowling ?? player.bowling),
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
  budget, onSpend, onRetryFromBeginning, onRetryBidding,
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

    // ── Pre-filter entries so we NEVER land on an impossible squad ──────────
    // A squad is valid if it has at least one player we can actually pick:
    //   • not already drafted (by id or name)
    //   • satisfies the current mandatory role (if any)
    //   • role slot not yet full per composition
    //   • not overseas-blocked (IPL: max 4 overseas)

    const draftedNameSet  = new Set(team.map(p => p.name))
    const currentNeeds    = getPositionNeeds(team, composition)
    const currentMust     = currentNeeds.find(n => n.must) || null
    const overseasInTeamNow = isIPLMode ? team.filter(p => isOverseas(p)).length : 0
    const overseasFull    = isIPLMode && overseasInTeamNow >= 4

    const budgetExhausted = budget != null && budget < 0.5

    function playerIsPickable(p) {
      // Already drafted?
      if (draftedIds.has(p.id) || draftedNameSet.has(p.name)) return false
      // Role quota full?
      if (isRoleFull(p, team, composition)) return false
      // Mandatory role not satisfied?
      if (currentMust && !satisfiesNeed(p, currentMust)) return false
      // Overseas blocked?
      if (overseasFull && isOverseas(p)) return false
      // Over budget? (skip check if budget exhausted — must always be able to proceed)
      if (!budgetExhausted && budget != null) {
        const price = calcPrice(displayRating(p, ratingType).overall)
        if (price > budget) return false
      }
      return true
    }

    const spinnable = entries.filter(entry =>
      entry.players.some(playerIsPickable)
    )

    // Tiered fallbacks: relax constraints one at a time so we always spin somewhere
    let pool = spinnable
    if (pool.length === 0) {
      // Relax mustPick (keep overseas + budget)
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          !isRoleFull(p, team, composition) &&
          !(overseasFull && isOverseas(p)) &&
          (budgetExhausted || budget == null || calcPrice(displayRating(p, 'season').overall) <= budget)
        )
      )
    }
    if (pool.length === 0) {
      // Relax overseas too (keep budget)
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          !isRoleFull(p, team, composition) &&
          (budgetExhausted || budget == null || calcPrice(displayRating(p, 'season').overall) <= budget)
        )
      )
    }
    if (pool.length === 0) {
      // Relax budget too — player must just not be drafted
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          !isRoleFull(p, team, composition)
        )
      )
    }
    if (pool.length === 0) pool = entries  // absolute last resort
    const shuffled = shuffle(pool)
    const chosen = shuffled[Math.floor(Math.random() * shuffled.length)]
    const TOTAL_TICKS = 18
    let i = 0

    // Cubic ease-out: starts at 30ms, smoothly decelerates to 220ms over TOTAL_TICKS
    function getInterval(tick) {
      const t = tick / TOTAL_TICKS
      return Math.round(30 + 190 * (t * t * t))
    }

    function tick() {
      i++
      const isLast = i >= TOTAL_TICKS
      // Use shuffled pool so years change throughout the animation
      setCycleEntry(isLast ? chosen : shuffled[i % shuffled.length])
      if (isLast) {
        // Linger on chosen team before opening the player list
        cycleRef.current = setTimeout(() => {
          setLandedEntry(chosen)
          setPhase('selecting')
        }, 350)
      } else {
        cycleRef.current = setTimeout(tick, getInterval(i))
      }
    }
    cycleRef.current = setTimeout(tick, getInterval(0))
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
    if (onSpend && budget != null) {
      const price = calcPrice(displayRating(player, 'season').overall)  // always season price regardless of rating type
      onSpend(Math.min(price, budget))   // never go below 0
    }
    // Attach the IPL squad they came from so TeamSheet can display it
    const enriched = {
      ...player,
      iplTeam: landedEntry?.teamName ?? null,
      iplYear: landedEntry?.season   ?? null,
    }
    onResult(enriched)
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

  const budgetExhaustedDisplay = budget != null && budget < 0.5

  function withBudget(p) {
    const price = budget != null ? calcPrice(displayRating(p, 'season').overall) : null
    const budgetBlocked = price != null && price > budget
    return { ...p, _price: price, _budgetBlocked: budgetBlocked }
  }

  let squadPlayers
  if (mustPick) {
    const eligible   = sortByOvr(rawPlayers.filter(p => satisfiesNeed(p, mustPick) && !isRoleFull(p, team, composition)))
    const ineligible = sortByOvr(rawPlayers.filter(p => !satisfiesNeed(p, mustPick) || isRoleFull(p, team, composition)))
    if (eligible.length === 0) {
      squadPlayers = sortByOvr(rawPlayers).map(p => ({ ...withBudget(p), _eligible: false }))
    } else {
      squadPlayers = [
        ...eligible.map(p => ({ ...withBudget(p), _eligible: true })),
        ...ineligible.map(p => ({ ...withBudget(p), _eligible: false })),
      ]
    }
  } else {
    squadPlayers = sortByOvr(rawPlayers).map(p => ({
      ...withBudget(p),
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

  // Budget truly stuck: no rerolls AND no affordable eligible players
  const isBudgetStuck = rerollsLeft === 0 &&
    squadPlayers.filter(p => p._eligible && !p._budgetBlocked).length === 0

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
          budget={budget}
          onSpin={spin}
        />
      ) : (
        <SelectPhase
          entry={landedEntry}
          players={squadPlayers}
          allDrafted={allDrafted}
          compositionUnlocked={isStuck && rerollsLeft === 0}
          budgetExhausted={budgetExhaustedDisplay}
          budgetStuck={isBudgetStuck}
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
          budget={budget}
          onPick={pickPlayer}
          onSpinAgain={spinAgain}
          onRetryFromBeginning={onRetryFromBeginning}
          onRetryBidding={onRetryBidding}
        />
      )}
    </div>
  )
}

// ─── Spin phase ───────────────────────────────────────────────────────────

function BudgetBar({ budget }) {
  if (budget == null) return null
  const pct = Math.max(0, Math.min(100, (budget / STARTING_BUDGET) * 100))
  const color = budget < 20 ? '#ef4444' : budget < 40 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>💰 Budget</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 900, color, transition: 'color 0.3s' }}>{fmtCr(budget)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s, background 0.3s' }} />
      </div>
    </div>
  )
}

function SpinPhase({ phase, cycleEntry, slotIndex, totalSlots, needs, mustPick, rerollsLeft, budget, onSpin }) {
  const isSpinning = phase === 'spinning'
  const year = cycleEntry ? extractYear(cycleEntry.season) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 1rem', animation: 'fade-in 0.3s ease both' }}>
      {budget != null && <BudgetBar budget={budget} />}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '0.3rem' }}>
          Pick {slotIndex + 1} of {totalSlots}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.3rem' }}>
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
      <div className="wheel-ticker" style={{
        width: '100%', maxWidth: 360, minHeight: 110, borderRadius: '1rem',
        border: `2px solid ${cycleEntry ? cycleEntry.color + '88' : 'var(--border)'}`,
        background: cycleEntry ? cycleEntry.color + '14' : 'var(--card)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        boxShadow: cycleEntry && isSpinning ? `0 0 30px ${cycleEntry.color}33` : 'none',
      }}>
        {cycleEntry ? (
          <>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: cycleEntry.color, marginBottom: '0.15rem' }}>{cycleEntry.badge}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
              {cycleEntry.teamName}
            </div>
            {year && (
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', marginTop: '0.25rem' }}>
                {year}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>Spin to land on a team</div>
        )}
      </div>

      <button
        className="spin-btn"
        onClick={onSpin}
        disabled={isSpinning}
        style={{
          padding: '0.875rem 2.75rem',
          background: isSpinning ? 'transparent' : 'linear-gradient(135deg, #1F6FEB, #0047CC)',
          color: isSpinning ? '#64748b' : 'var(--bg)',
          border: isSpinning ? '1px solid var(--border)' : 'none',
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

function SelectPhase({ entry, players, allDrafted, compositionUnlocked, budgetExhausted, budgetStuck, hardMode, ratingType, needs, mustPick, slotIndex, totalSlots, rerollsLeft, overseasInTeam, overseasLimitReached, isIPLMode, budget, onPick, onSpinAgain, onRetryFromBeginning, onRetryBidding }) {
  const canReroll = rerollsLeft > 0
  const year      = extractYear(entry.season)
  const rarity    = spinRarity(entry)

  return (
    <div style={{ animation: 'fade-in 0.2s ease both', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Budget stuck overlay */}
      {budgetStuck && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--card)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', textAlign: 'center', borderRadius: '0.5rem',
          animation: 'fade-in 0.3s ease both',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💸</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.6rem' }}>
            Full team cannot be made.
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: 280 }}>
            Your remaining budget can't cover any available player. Pick a path forward.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', width: '100%', maxWidth: 260 }}>
            <button
              onClick={onRetryBidding}
              style={{
                padding: '0.875rem', background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              🔄 Start team pick from scratch
            </button>
            <div style={{ fontSize: '0.65rem', color: '#475569', margin: '0.1rem 0' }}>
              Keeps your tournament &amp; mode — resets squad &amp; budget
            </div>
            <button
              onClick={onRetryFromBeginning}
              style={{
                padding: '0.75rem', background: 'transparent',
                color: '#94a3b8', border: '1px solid var(--border)', borderRadius: '0.625rem',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              🏠 Go to home page
            </button>
            <div style={{ fontSize: '0.65rem', color: '#475569', margin: '0.1rem 0' }}>
              Back to the beginning
            </div>
          </div>
        </div>
      )}
      {/* Header — shows "TeamName · YEAR" prominently */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: entry.color + '18', borderBottom: `1px solid ${entry.color}33` }}>
        <div>
          <div style={{ fontSize: '0.62rem', color: entry.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
            Pick {slotIndex + 1} of {totalSlots}
          </div>
          {/* Team + year as one combined prominent line */}
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {entry.teamName}
            <span style={{
              padding: '0.15rem 0.6rem',
              background: 'var(--border2)',
              border: '1.5px solid var(--border)',
              borderRadius: '999px',
              fontSize: '0.8rem', fontWeight: 900, color: 'var(--text)',
            }}>
              {year}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: entry.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: entry.textColor }}>
            {entry.badge}
          </div>
          {rarity && (
            <div style={{
              padding: '0.15rem 0.6rem',
              background: rarity.bg, border: `1px solid ${rarity.border}`,
              borderRadius: '999px', color: rarity.color,
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}>
              {rarity.label}
            </div>
          )}
        </div>
      </div>

      {/* Budget bar */}
      {budget != null && (
        <div style={{ padding: '0.5rem 1.25rem', background: 'var(--card2)', borderBottom: '1px solid var(--border2)' }}>
          <BudgetBar budget={budget} />
          {budgetExhausted && (
            <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, marginTop: '0.3rem', textAlign: 'center' }}>
              💸 Budget exhausted — only free agents available
            </div>
          )}
        </div>
      )}

      {/* Info bar */}
      <div style={{ padding: '0.45rem 1.25rem', background: 'var(--card)', borderBottom: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: compositionUnlocked ? '#ef4444' : mustPick ? '#f59e0b' : '#64748b' }}>
          {compositionUnlocked
            ? '⚠ No matching players — pick anyone'
            : mustPick
            ? `⚠ Must pick a ${mustPick.label} — others shown below`
            : hardMode ? '🔒 Hard Mode'
            : `${players.filter(p => p._eligible && !p._budgetBlocked).length} affordable · ${ratingType === 'prime' ? '⚡ Prime' : '📅 Season'} ratings`
          }
          {isIPLMode && <span style={{ marginLeft: '0.5rem', color: '#64748b', fontSize: '0.62rem' }}>✈ {overseasInTeam}/4 overseas</span>}
        </span>
        {canReroll ? (
          <button onClick={onSpinAgain} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
            ↺ Different team ({rerollsLeft} left)
          </button>
        ) : (
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>No rerolls left</span>
        )}
      </div>

      {/* Player list */}
      <div style={{ background: 'var(--card)', overflowY: 'auto', maxHeight: '55vh' }}>
        {allDrafted ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>All players from this squad are already in your XI.</div>
            {canReroll && (
              <button onClick={onSpinAgain} style={{ padding: '0.75rem 1.5rem', background: 'var(--border2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>
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
            const budgetBlock   = !!player._budgetBlocked

            // Divider between eligible+affordable and rest
            const showDivider = i > 0 && (
              (mustPick && !player._eligible && players[i-1]._eligible) ||
              (!mustPick && budgetBlock && !players[i-1]._budgetBlocked && players[i-1]._eligible)
            )

            return (
              <div key={player.id}>
                {showDivider && (
                  <div style={{ padding: '0.3rem 1.25rem', background: 'var(--bg)', fontSize: '0.6rem', color: 'var(--border)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', borderTop: '1px solid var(--border2)', borderBottom: '1px solid var(--border2)' }}>
                    {mustPick && !player._eligible ? 'Other players — wrong role' : 'Over budget'}
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
                  isIneligible={isIneligible || budgetBlock}
                  isOverseas={overseas}
                  isOverseasBlocked={overseasBlock}
                  isBudgetBlocked={budgetBlock}
                  onPick={isIneligible || overseasBlock || budgetBlock ? null : () => onPick(player)}
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

function PlayerRow({ player, hardMode, ratingType, teamColor, isLast, isNeeded, isMustPick, isIneligible, isOverseas, isOverseasBlocked, isBudgetBlocked, onPick }) {
  const [hovered, setHovered] = useState(false)
  const cat     = roleCategory(player.role)
  const catClr  = CAT_COLOR[cat]
  const ratings = displayRating(player, ratingType)
  const highlight = isMustPick ? '#f59e0b' : isNeeded ? '#1F6FEB' : null
  const blocked = isIneligible || isOverseasBlocked || isBudgetBlocked

  const opacity = blocked ? 0.38 : 1

  return (
    <div
      className="player-row"
      onClick={blocked ? undefined : onPick}
      onMouseEnter={() => !blocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '0.75rem 1.25rem',
        borderBottom: isLast ? 'none' : '1px solid var(--border2)',
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
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {player.name}
          {isOverseas && <span style={{ fontSize: '0.7rem' }} title="Overseas player">✈️</span>}
          {isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#f59e0b', fontWeight: 800 }}>NEEDED</span>}
          {isNeeded && !isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#1F6FEB', fontWeight: 800 }}>NEED</span>}
        </div>
        <div style={{ fontSize: '0.67rem', color: '#64748b' }}>
          {player.nationality}
          {isOverseasBlocked && <span style={{ marginLeft: '0.4rem', color: '#ef444488', fontWeight: 700 }}>· Overseas limit reached</span>}
          {isBudgetBlocked && <span style={{ marginLeft: '0.4rem', color: '#ef444488', fontWeight: 700 }}>· Over budget</span>}
        </div>
      </div>

      {/* Ratings + Price */}
      {hardMode ? (
        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--border)', letterSpacing: '0.1em' }}>???</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexShrink: 0 }}>
          <MiniBar label="Bat"  value={ratings.batting} color="#1F6FEB" />
          <MiniBar label="Bowl" value={ratings.bowling} color="#3b82f6" />
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', minWidth: 26, textAlign: 'right' }}>
            {ratings.overall}
          </div>
          {player._price != null && (
            <div style={{
              padding: '0.15rem 0.4rem', borderRadius: '0.3rem',
              background: isBudgetBlocked ? '#ef444420' : '#22c55e18',
              border: `1px solid ${isBudgetBlocked ? '#ef444455' : '#22c55e44'}`,
              fontSize: '0.62rem', fontWeight: 800,
              color: isBudgetBlocked ? '#ef4444' : '#22c55e',
              whiteSpace: 'nowrap',
            }}>
              {fmtCr(player._price)}
            </div>
          )}
        </div>
      )}

      {!blocked && (
        <div style={{ color: hovered ? (highlight || teamColor) : 'var(--border)', fontSize: '1rem', transition: 'color 0.12s', flexShrink: 0 }}>→</div>
      )}
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', width: 42 }}>
      <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2, marginBottom: 2 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 600 }}>{label} {value}</div>
    </div>
  )
}
