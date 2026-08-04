import { useState, useEffect, useRef } from 'react'

const TIMER_SECONDS = 8

// ─── Event definitions ─────────────────────────────────────────────────────
// Each event type has: icon, badge, headline(player,opp), subline, choices[], timeoutIndex (which choice wins on timeout)

const EVENT_DEFS = {

  'half-century': {
    icon: '🏏', badge: 'MATCH MOMENT', accentColor: '#f59e0b',
    headline: (p, opp) => `${p} needs 1 more run for a fifty!`,
    subline:  (p, opp) => `vs ${opp} — the crowd is on their feet`,
    timeoutIndex: 0, // Defend → out on timeout
    choices: [
      { label: 'Defend', icon: '🛡️', desc: 'Safe shot — protect the wicket', successChance: 0.80 },
      { label: 'Drive', icon: '🏏', desc: 'Push through the line for the milestone', successChance: 0.55 },
      { label: 'Clip to leg', icon: '✋', desc: 'Easy single to get there', successChance: 0.88 },
    ],
    successText: (p) => `FIFTY! ${p} raises the bat — what a knock! 🎉`,
    failText:    (p, choice) => `OUT! ${p} falls for 49 trying to ${choice.label.toLowerCase()}. Heartbreak.`,
    timeoutText: (p) => `OUT! ${p} hesitated and was stumped. Gone for 49.`,
  },

  'century': {
    icon: '🏏', badge: 'CENTURY BALL', accentColor: '#f59e0b',
    headline: (p, opp) => `${p} is on 99 — one run from a HUNDRED!`,
    subline:  (p, opp) => `vs ${opp} — can they make history?`,
    timeoutIndex: 0,
    choices: [
      { label: 'Block it', icon: '🛡️', desc: 'Safe push for the single', successChance: 0.78 },
      { label: 'Drive hard', icon: '💥', desc: 'Go for the boundary to get there in style', successChance: 0.50 },
      { label: 'Nudge to midwicket', icon: '🎯', desc: 'Rotate strike for the easy run', successChance: 0.90 },
    ],
    successText: (p) => `HUNDRED! ${p} punches the air — a magnificent century! 🏆`,
    failText:    (p, choice) => `OUT! ${p} perishes for 99 trying to ${choice.label.toLowerCase()}. The crowd can't believe it.`,
    timeoutText: (p) => `OUT! ${p} took too long and was run out going for the single. Gone for 99.`,
  },

  '150': {
    icon: '🔥', badge: 'RARE MOMENT', accentColor: '#ef4444',
    headline: (p, opp) => `${p} is on 149 — a massive 150 in sight!`,
    subline:  (p, opp) => `vs ${opp} — this only happens once in a blue moon`,
    timeoutIndex: 0,
    choices: [
      { label: 'Pick the gap', icon: '🎯', desc: 'Thread the needle — one good shot', successChance: 0.62 },
      { label: 'Slog it!', icon: '💥', desc: 'Go over the top, risk it all', successChance: 0.38 },
    ],
    successText: (p) => `150! ${p} has done it — an extraordinary innings! 🔥`,
    failText:    (p, choice) => `OUT! ${p} falls on 149 trying to ${choice.label.toLowerCase()}. So agonisingly close.`,
    timeoutText: (p) => `OUT! ${p} froze and was bowled trying to play on. Fell on 149.`,
  },

  '200': {
    icon: '⚡', badge: 'HISTORIC MOMENT', accentColor: '#a855f7',
    headline: (p, opp) => `${p} is on 199 — A DOUBLE CENTURY!`,
    subline:  (p, opp) => `vs ${opp} — this is legendary territory`,
    timeoutIndex: 0,
    choices: [
      { label: 'Steal a single', icon: '🏃', desc: 'Scamper through for the historic run', successChance: 0.72 },
      { label: 'Hit for six!', icon: '⚡', desc: 'Make it a six — make history in style', successChance: 0.30 },
    ],
    successText: (p) => `200! ${p} has joined the immortals — a double century! ⚡`,
    failText:    (p, choice) => `OUT! ${p} dismissed for 199 — one run short of glory. Absolutely gutting.`,
    timeoutText: (p) => `OUT! ${p} run out going for the 200th run. History denied.`,
  },

  'hat-trick': {
    icon: '🎳', badge: 'HAT-TRICK BALL', accentColor: '#ef4444',
    headline: (p, opp) => `${p} needs ONE MORE wicket for a hat-trick!`,
    subline:  (p, opp) => `vs ${opp} — the whole ground is holding its breath`,
    timeoutIndex: 0,
    choices: [
      { label: 'Yorker', icon: '🎯', desc: 'Aim for the blockhole — squeeze them out', successChance: 0.50 },
      { label: 'Slower ball', icon: '🌀', desc: 'Deceive them with the change of pace', successChance: 0.60 },
      { label: 'Full toss!', icon: '💥', desc: 'Surprise them — it might just work', successChance: 0.30 },
    ],
    successText: (p) => `HAT-TRICK! ${p} is mobbed by teammates — three in a row! 🔥`,
    failText:    (p, choice) => `No hat-trick. The batsman dug it out off the ${choice.label.toLowerCase()}. ${p} walks back quietly.`,
    timeoutText: (p) => `${p} couldn't decide — delivered a wide. Hat-trick ball wasted.`,
  },

  'catch': {
    icon: '🙌', badge: 'CAUGHT IN THE FIELD', accentColor: '#22c55e',
    headline: (p, opp) => `${p} dives for a sharp catch at slip!`,
    subline:  (p, opp) => `vs ${opp} — the edge flies fast and low`,
    timeoutIndex: 2,
    choices: [
      { label: 'Dive full length', icon: '🙌', desc: 'Give everything — full-length dive', successChance: 0.65 },
      { label: 'Cup it safe', icon: '✋', desc: 'Get both hands under it — no heroics', successChance: 0.80 },
      { label: 'Wait and see', icon: '👀', desc: 'Hold back, let it come to you', successChance: 0.40 },
    ],
    successText: (p) => `CAUGHT! ${p} pulls off a stunner — the fielding highlight of the tournament! 🙌`,
    failText:    (p, choice) => `Dropped! ${p} can't hold on trying to ${choice.label.toLowerCase()}. The batter survives.`,
    timeoutText: (p) => `Dropped! ${p} froze — the ball popped out. Costly miss.`,
  },

  'run-out': {
    icon: '🏃', badge: 'RUN OUT CHANCE', accentColor: '#3b82f6',
    headline: (p, opp) => `${p} has a direct hit chance — run out!`,
    subline:  (p, opp) => `vs ${opp} — the batter is hopelessly out of the crease`,
    timeoutIndex: 1,
    choices: [
      { label: 'Direct throw!', icon: '🏃', desc: 'Go for broke — aim at the stumps', successChance: 0.60 },
      { label: 'Relay it', icon: '🎯', desc: 'Safer — pass to the keeper who\'ll finish it', successChance: 0.82 },
    ],
    successText: (p) => `RUN OUT! ${p} nails the direct hit — brilliant fielding! 💥`,
    failText:    (p, choice) => `Missed! The throw went wide. The batter makes it home safely.`,
    timeoutText: (p) => `${p} hesitated too long — the batter dived home. Chance gone.`,
  },

  'drs': {
    icon: '📺', badge: 'DRS REVIEW', accentColor: '#94a3b8',
    headline: (p, opp) => `GIVEN OUT! — ${p}'s team wants a DRS review`,
    subline:  (p, opp) => `vs ${opp} — umpire raised the finger, looks close`,
    timeoutIndex: 1,
    choices: [
      { label: 'Take DRS', icon: '📺', desc: 'Challenge the decision — burn a review', successChance: 0.55 },
      { label: 'Walk off', icon: '🚶', desc: 'Accept the decision, save the review', successChance: 0 },
    ],
    successText: (p) => `OVERTURNED! ${p} survives — ball tracking shows it was going over! Review saved. 📺`,
    failText:    (p, choice) => `Review failed — ball was hitting leg stump! ${p} is OUT and a DRS is lost.`,
    timeoutText: (p) => `Timeout — DRS not taken in time. ${p} walks back. The decision stands.`,
  },

}

// ─── Outcome text (generic fallback) ─────────────────────────────────────────

function getOutcomeText(def, event, choice, success) {
  if (success) return def.successText(event.playerName, choice)
  if (!choice) return def.timeoutText(event.playerName)
  return def.failText(event.playerName, choice)
}

// ─── Countdown bar ────────────────────────────────────────────────────────────

function CountdownBar({ seconds, total }) {
  const pct = (seconds / total) * 100
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          ⏱ React fast
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s' }}>
          {seconds}s
        </span>
      </div>
      <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: color, borderRadius: 3,
          width: `${pct}%`,
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MatchEvent({ event, opponent, onContinue }) {
  const [phase, setPhase]     = useState('choose')   // choose → outcome
  const [chosen, setChosen]   = useState(null)       // null = timeout
  const [success, setSuccess] = useState(null)
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS)
  const timerRef = useRef(null)

  const def = event ? EVENT_DEFS[event.type] : null

  // countdown tick
  useEffect(() => {
    if (phase !== 'choose' || !def) return
    if (timeLeft <= 0) {
      handleTimeout()
      return
    }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [timeLeft, phase])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!event || !def) return null

  const accentColor = def.accentColor

  function pick(choice, index) {
    clearTimeout(timerRef.current)
    const roll    = Math.random()
    const succeeded = roll < choice.successChance
    setChosen(choice)
    setSuccess(succeeded)
    setPhase('outcome')
  }

  function handleTimeout() {
    clearTimeout(timerRef.current)
    // Timeout = negative outcome (no choice)
    setChosen(null)
    setSuccess(false)
    setPhase('outcome')
  }

  const outcomeText = getOutcomeText(def, event, chosen, success)
  const isTimeout   = phase === 'outcome' && !chosen

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.93)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
      animation: 'fade-in 0.25s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#0d1229', border: `1px solid ${accentColor}44`,
        borderRadius: '1.25rem', padding: '1.75rem',
        boxShadow: `0 0 60px ${accentColor}20`,
        animation: 'fade-in-up 0.3s ease both',
      }}>

        {phase === 'choose' && (
          <>
            {/* Badge + headline */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>{def.icon}</div>
              <div style={{
                display: 'inline-block', padding: '0.2rem 0.75rem',
                background: `${accentColor}22`, border: `1px solid ${accentColor}55`,
                borderRadius: '999px', color: accentColor,
                fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: '0.6rem',
              }}>
                {def.badge}
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.25 }}>
                {def.headline(event.playerName, opponent)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.3rem' }}>
                {def.subline(event.playerName, opponent)}
              </div>
            </div>

            {/* Countdown */}
            <CountdownBar seconds={timeLeft} total={TIMER_SECONDS} />

            {/* Choices */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {def.choices.map((c, i) => (
                <button
                  key={c.label}
                  onClick={() => pick(c, i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.875rem',
                    padding: '0.8rem 1rem',
                    background: '#060818', border: '1px solid #1a2550',
                    borderRadius: '0.625rem', cursor: 'pointer',
                    textAlign: 'left', width: '100%',
                    transition: 'border-color 0.12s, background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}0f` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2550'; e.currentTarget.style.background = '#060818' }}
                >
                  <span style={{ fontSize: '1.35rem', flexShrink: 0 }}>{c.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f1f5f9' }}>{c.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#475569' }}>{c.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'outcome' && (
          <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.875rem', animation: 'fade-in 0.35s ease both' }}>
              {isTimeout ? '⏰' : success ? '🎉' : '😔'}
            </div>
            {isTimeout && (
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
                Time's up!
              </div>
            )}
            <div style={{
              fontSize: '1.05rem', fontWeight: 800,
              color: success ? accentColor : '#ef4444',
              lineHeight: 1.45, marginBottom: '0.75rem',
              animation: 'fade-in-up 0.35s ease both',
            }}>
              {outcomeText}
            </div>
            {chosen && (
              <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '1.25rem' }}>
                You chose: <span style={{ color: '#94a3b8', fontWeight: 700 }}>{chosen.label}</span>
              </div>
            )}
            <button
              onClick={() => onContinue(success, chosen?.label ?? 'timeout')}
              style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                border: 'none', borderRadius: '0.625rem',
                color: '#fff', fontSize: '0.92rem', fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(31,111,235,0.3)',
              }}
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
