import { useState, useEffect, useRef } from 'react'

const TIMER_SECONDS = 14

// ─── Choice pool helper ────────────────────────────────────────────────────────
// Randomly shuffles a pool and returns `count` choices.
function pickFromPool(pool, count = 3) {
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

// ─── Event definitions ────────────────────────────────────────────────────────
// `choicePool` contains 4-6 options; the component randomly picks 2-3 each time.

const EVENT_DEFS = {

  'half-century': {
    icon: '🏏', badge: 'FIFTY ALERT', accentColor: '#f59e0b',
    headline: (p) => `${p} on 49 — one more!`,
    subline:  (p, opp) => `vs ${opp} · Middle overs, team needs this fifty to keep the innings alive`,
    choiceCount: 3,
    choicePool: [
      { label: 'Clip to leg',     icon: '✋', desc: 'Easy single to leg side',            successChance: 0.88 },
      { label: 'Nudge to mid-on', icon: '🎯', desc: 'Rotate strike for the single',       successChance: 0.85 },
      { label: 'Drive hard',      icon: '🏏', desc: 'Push through covers for the run',    successChance: 0.55 },
      { label: 'Defend it',       icon: '🛡️', desc: 'Safe shot — protect the wicket',     successChance: 0.80 },
      { label: 'Sweep shot',      icon: '🌀', desc: 'Sweep to fine leg — easy single',    successChance: 0.78 },
      { label: 'Quick single!',   icon: '🏃', desc: 'Call yes — steal a tight single',    successChance: 0.65 },
    ],
    successText: (p) => `FIFTY! ${p} raises the bat — what a knock! 🎉`,
    failText:    (p, c) => `OUT! ${p} falls for 49 trying to ${c.label.toLowerCase()}. Heartbreak.`,
    timeoutText: (p) => `OUT! ${p} hesitated and was stumped. Gone for 49.`,
  },

  'century': {
    icon: '💯', badge: 'CENTURY BALL', accentColor: '#f59e0b',
    headline: (p) => `${p} on 99 — the hundred!`,
    subline:  (p, opp) => `vs ${opp} · Team is building a big score — this ton could win the match`,
    choiceCount: 3,
    choicePool: [
      { label: 'Nudge to midwicket', icon: '🎯', desc: 'Rotate strike for the easy run',       successChance: 0.90 },
      { label: 'Block it',           icon: '🛡️', desc: 'Safe push for the single',             successChance: 0.78 },
      { label: 'Drive hard',         icon: '💥', desc: 'Go for the boundary to do it in style', successChance: 0.50 },
      { label: 'Glance to fine leg', icon: '✋', desc: 'Tickle it round the corner',           successChance: 0.82 },
      { label: 'Quick yes!',         icon: '🏃', desc: 'Sprint through for the single',        successChance: 0.72 },
      { label: 'Hit for six!',       icon: '⚡', desc: 'Make it a six — do it in style',       successChance: 0.35 },
    ],
    successText: (p) => `HUNDRED! ${p} punches the air — a magnificent century! 🏆`,
    failText:    (p, c) => `OUT! ${p} perishes for 99 trying to ${c.label.toLowerCase()}. The crowd can't believe it.`,
    timeoutText: (p) => `OUT! ${p} took too long and was run out going for the single. Gone for 99.`,
  },

  '150': {
    icon: '🔥', badge: 'RARE MOMENT', accentColor: '#ef4444',
    headline: (p) => `${p} on 149 — extraordinary!`,
    subline:  (p, opp) => `vs ${opp} · Dominating the attack — a 150 would be a career-defining knock`,
    choiceCount: 2,
    choicePool: [
      { label: 'Pick the gap',  icon: '🎯', desc: 'Thread the needle — one good shot',   successChance: 0.62 },
      { label: 'Slog it!',      icon: '💥', desc: 'Go over the top, risk it all',        successChance: 0.38 },
      { label: 'Steal a quick', icon: '🏃', desc: 'Run hard, beat the throw',             successChance: 0.70 },
      { label: 'Step and loft', icon: '⚡', desc: 'Create space and lift over mid-off',  successChance: 0.45 },
    ],
    successText: (p) => `150! ${p} has done it — an extraordinary innings! 🔥`,
    failText:    (p, c) => `OUT! ${p} falls on 149 trying to ${c.label.toLowerCase()}. So agonisingly close.`,
    timeoutText: (p) => `OUT! ${p} froze and was bowled trying to play on. Fell on 149.`,
  },

  '200': {
    icon: '⚡', badge: 'HISTORIC MOMENT', accentColor: '#a855f7',
    headline: (p) => `${p} on 199 — all-time stuff!`,
    subline:  (p, opp) => `vs ${opp} · One run from a double hundred — fewer than 10 ever done in Tests`,
    choiceCount: 2,
    choicePool: [
      { label: 'Steal a single', icon: '🏃', desc: 'Scamper through for the historic run',   successChance: 0.72 },
      { label: 'Hit for six!',   icon: '⚡', desc: 'Make it a six — make history in style',  successChance: 0.30 },
      { label: 'Drive to cover', icon: '🏏', desc: 'Timing and placement — thread the gap',  successChance: 0.55 },
    ],
    successText: (p) => `200! ${p} has joined the immortals — a double century! ⚡`,
    failText:    (p, c) => `OUT! ${p} dismissed for 199 — one run short of glory. Absolutely gutting.`,
    timeoutText: (p) => `OUT! ${p} run out going for the 200th run. History denied.`,
  },

  'hat-trick': {
    icon: '🎳', badge: 'HAT-TRICK BALL', accentColor: '#ef4444',
    headline: (p) => `Hat-trick ball — ${p}!`,
    subline:  (p, opp) => `vs ${opp} · Two wickets in two balls — one more ends the innings`,
    choiceCount: 3,
    choicePool: [
      { label: 'Yorker',        icon: '🎯', desc: 'Aim for the blockhole — squeeze them out',  successChance: 0.50 },
      { label: 'Slower ball',   icon: '🌀', desc: 'Deceive them with the change of pace',      successChance: 0.60 },
      { label: 'Full toss!',    icon: '💥', desc: 'Surprise them — it might just work',        successChance: 0.30 },
      { label: 'Leg-cutter',    icon: '🔄', desc: 'Move it away late — edge to keeper',        successChance: 0.52 },
      { label: 'Short and fast',icon: '⚡', desc: 'Bounce them out — target the body',         successChance: 0.42 },
      { label: 'Googly',        icon: '🌀', desc: 'Turn it the other way — beat the inside edge', successChance: 0.48 },
    ],
    successText: (p) => `HAT-TRICK! ${p} is mobbed by teammates — three in a row! 🔥`,
    failText:    (p, c) => `No hat-trick. The batter dug out the ${c.label.toLowerCase()}. ${p} walks back quietly.`,
    timeoutText: (p) => `${p} couldn't decide — delivered a wide. Hat-trick ball wasted.`,
  },

  'catch': {
    icon: '🙌', badge: 'CAUGHT IN THE FIELD', accentColor: '#22c55e',
    headline: (p) => `Catch! Sharp chance — ${p}!`,
    subline:  (p, opp) => `vs ${opp} · Edge flying low — take it, the batter's gone`,
    choiceCount: 3,
    choicePool: [
      { label: 'Dive full length', icon: '🙌', desc: 'Give everything — full-length dive',    successChance: 0.65 },
      { label: 'Cup it safe',      icon: '✋', desc: 'Get both hands under it — no heroics', successChance: 0.80 },
      { label: 'Wait and see',     icon: '👀', desc: 'Hold back, let it come to you',         successChance: 0.40 },
      { label: 'Fingertip grab',   icon: '🤏', desc: 'Last-ditch effort at full stretch',     successChance: 0.55 },
      { label: 'Tumbling catch',   icon: '🌀', desc: 'Roll into it, keep your eye on the ball', successChance: 0.60 },
    ],
    successText: (p) => `CAUGHT! ${p} pulls off a stunner — the fielding highlight of the tournament! 🙌`,
    failText:    (p, c) => `Dropped! ${p} can't hold on trying to ${c.label.toLowerCase()}. The batter survives.`,
    timeoutText: (p) => `Dropped! ${p} froze — the ball popped out. Costly miss.`,
  },

  'run-out': {
    icon: '🏃', badge: 'RUN OUT CHANCE', accentColor: '#3b82f6',
    headline: (p) => `Run out! ${p} — pick your end!`,
    subline:  (p, opp) => `vs ${opp} · Batter stranded mid-pitch — direct hit wins the wicket`,
    choiceCount: 2,
    choicePool: [
      { label: 'Direct throw!', icon: '🏃', desc: 'Go for broke — aim at the stumps',              successChance: 0.60 },
      { label: 'Relay it',      icon: '🎯', desc: 'Pass to the keeper who\'ll finish it',           successChance: 0.82 },
      { label: 'Underarm flick',icon: '✋', desc: 'Quick flick — keeper ready at the end',          successChance: 0.70 },
      { label: 'Quick throw low',icon: '💨', desc: 'Flat and hard — aim below the stumps',          successChance: 0.55 },
      { label: 'Call for backup',icon: '📢', desc: 'Alert the fielder behind — cover all bases',    successChance: 0.75 },
    ],
    successText: (p) => `RUN OUT! ${p} nails it — brilliant fielding! 💥`,
    failText:    (p, c) => `Missed! The throw went wide. The batter dives home safely.`,
    timeoutText: (p) => `${p} hesitated too long — the batter dived home. Chance gone.`,
  },

  'drs': {
    icon: '📺', badge: 'DRS REVIEW', accentColor: '#94a3b8',
    headline: (p) => `OUT given — DRS or walk?`,
    subline:  (p, opp) => `vs ${opp} · Umpire raised the finger — ball-tracking will decide ${p}'s fate`,
    choiceCount: 2,
    choicePool: [
      { label: 'Take DRS now!',    icon: '📺', desc: 'Challenge — burn a review, ball tracking will decide', successChance: 0.55 },
      { label: 'Walk off',         icon: '🚶', desc: 'Accept the decision, save the review',               successChance: 0 },
      { label: 'Captain confers',  icon: '🤔', desc: 'Quick chat — is it worth the review?',               successChance: 0.48 },
      { label: 'Ask the umpire',   icon: '☝️', desc: 'Check for a potential no-ball first',                successChance: 0.45 },
    ],
    successText: (p) => `OVERTURNED! ${p} survives — ball tracking shows it was going over! 📺`,
    failText:    (p, c) => `Review failed — ball was hitting leg stump! ${p} is OUT and a review is lost.`,
    timeoutText: (p) => `Timeout — DRS not taken in time. ${p} walks back. Decision stands.`,
  },

  'stumping': {
    icon: '🧤', badge: 'STUMPING CHANCE', accentColor: '#f97316',
    headline: (p) => `Stumping chance — ${p}!`,
    subline:  (p, opp) => `vs ${opp} · Batter danced down the track — bails are off, is the foot in?`,
    choiceCount: 3,
    choicePool: [
      { label: 'Whip the bails!',  icon: '⚡', desc: 'Lightning hands — go for it instantly',           successChance: 0.60 },
      { label: 'Take your time',   icon: '😌', desc: 'Compose yourself — clean take first',             successChance: 0.75 },
      { label: 'Collect & break',  icon: '✋', desc: 'Safe and sure — take it then break the stumps',   successChance: 0.80 },
      { label: 'Flick one bail',   icon: '🤏', desc: 'Stylish and fast — one bail is enough',           successChance: 0.50 },
      { label: 'Dive forward',     icon: '🙌', desc: 'Dive down the leg side — full stretch',           successChance: 0.55 },
    ],
    successText: (p) => `STUMPED! ${p} whips the bails off in a flash — the batter is miles out! 🧤`,
    failText:    (p, c) => `Missed! ${p} couldn't complete the stumping. The batter drags their foot back just in time.`,
    timeoutText: (p) => `${p} hesitated and the batter got back. Stumping chance wasted.`,
  },

  'no-ball': {
    icon: '⚠️', badge: 'NO-BALL CALL', accentColor: '#f59e0b',
    headline: (p) => `No-ball? ${p}'s foot is close!`,
    subline:  (p, opp) => `vs ${opp} · Square leg checking replays — free hit on the line`,
    choiceCount: 3,
    choicePool: [
      { label: 'Appeal strongly', icon: '📢', desc: 'Captain pushes the umpire to check',             successChance: 0.50 },
      { label: 'Accept it calmly',icon: '🤝', desc: 'Trust the umpire — stay composed',               successChance: 0.45 },
      { label: 'Check the screen',icon: '📺', desc: 'Point to the replay screen on the boundary',     successChance: 0.55 },
      { label: 'Argue your case', icon: '💬', desc: 'Captain calmly explains what they saw',          successChance: 0.48 },
      { label: 'Wait in silence', icon: '🤫', desc: 'Don\'t get fined — let the officials decide',    successChance: 0.52 },
    ],
    successText: (p) => `NO-BALL confirmed! ${p}'s foot was over the line — FREE HIT next ball! ⚠️`,
    failText:    (p, c) => `Legal delivery. The foot was just in. ${p} bowls on — wicket stands.`,
    timeoutText: (p) => `No decision in time — umpire calls it legal. The play continues.`,
  },

  'last-over': {
    icon: '🏁', badge: 'FINAL OVER', accentColor: '#a855f7',
    headline: (p) => `${p} — last over, hold it!`,
    subline:  (p, opp) => `vs ${opp} · Death overs — every run saved here could win the match`,
    choiceCount: 3,
    choicePool: [
      { label: 'Attack with yorkers', icon: '🎯', desc: 'Bowl them out — aim for the blockhole every ball', successChance: 0.52 },
      { label: 'Pack the boundary',   icon: '🛡️', desc: 'Stop the big shots — spread the field',          successChance: 0.58 },
      { label: 'Mix it up',           icon: '🌀', desc: 'Variation is key — keep them guessing',           successChance: 0.62 },
      { label: 'Go for the wicket',   icon: '🎳', desc: 'Aggressive — try to take wickets, not give runs', successChance: 0.48 },
      { label: 'Bowl wide off stump', icon: '📐', desc: 'Force them to reach — reduce boundaries',         successChance: 0.55 },
      { label: 'Leg-side trap',       icon: '🪤', desc: 'Bowl to the plan — midwicket and fine leg up',    successChance: 0.50 },
    ],
    successText: (p) => `Brilliant over! ${p} holds their nerve — brilliant bowling in the death! 🏁`,
    failText:    (p, c) => `Expensive over. The batter got on top of ${p}'s ${c.label.toLowerCase()}. Runs flow.`,
    timeoutText: (p) => `${p} froze at the top of the mark — no-ball called. Pressure gets to the best of them.`,
  },

  'powerplay': {
    icon: '⚡', badge: 'POWERPLAY TIME', accentColor: '#4169E1',
    headline: (p) => `Powerplay — ${p} opens up!`,
    subline:  (p, opp) => `vs ${opp} · Fielding circle on — first 6 overs set the total`,
    choiceCount: 3,
    choicePool: [
      { label: 'Attack from ball 1',    icon: '💥', desc: 'Maximum intent — go hard from the start',          successChance: 0.58 },
      { label: 'Steady then attack',    icon: '📈', desc: 'See off 2 overs then accelerate',                  successChance: 0.68 },
      { label: 'Manufacture boundaries',icon: '🎯', desc: 'Placement over power — find the gaps',             successChance: 0.62 },
      { label: 'Take singles first',    icon: '🏃', desc: 'Rotate strike — don\'t give away cheap wickets',   successChance: 0.72 },
      { label: 'Pick your spots',       icon: '🧠', desc: 'Smart cricket — attack only the bad balls',        successChance: 0.70 },
    ],
    successText: (p) => `Brilliant powerplay! ${p} takes full advantage — strong platform set! ⚡`,
    failText:    (p, c) => `Powerplay wasted. ${p} fell trying to ${c.label.toLowerCase()}. Wicket in hand gone early.`,
    timeoutText: (p) => `${p} was slow to get started — bowled out in the powerplay without scoring. Poor start.`,
  },

  'dropped-catch': {
    icon: '🌞', badge: 'DOLLY DROPPED!', accentColor: '#fbbf24',
    headline: (p) => `Skier! ${p} under the ball!`,
    subline:  (p, opp) => `vs ${opp} · High and swirling — hold it and they lose a big batter`,
    choiceCount: 3,
    choicePool: [
      { label: 'Steady the nerves',  icon: '😤', desc: 'Block everything out — focus on the ball',       successChance: 0.72 },
      { label: 'Two hands!',         icon: '🙌', desc: 'Cup it safely — don\'t spill a dolly',           successChance: 0.80 },
      { label: 'Dive for it',        icon: '🤿', desc: 'Spectacular if you get there — big risk',        successChance: 0.48 },
      { label: 'Signal to teammate', icon: '📢', desc: 'Call off the teammate — own it',                 successChance: 0.65 },
      { label: 'Move into position', icon: '👣', desc: 'Reposition early — take the easy route',         successChance: 0.75 },
      { label: 'Watch it all the way',icon: '👁️', desc: 'Track it with your eyes — don\'t look away',   successChance: 0.70 },
    ],
    successText: (p) => `Caught! ${p} holds on under pressure — what a moment of composure! ✅`,
    failText:    (p, c) => `DROPPED! ${p} put it down — the batter is reprieved. The crowd groans.`,
    timeoutText: (p) => `${p} lost it in the sun — ball falls to the ground. Costly drop.`,
  },

  'free-hit': {
    icon: '🆓', badge: 'FREE HIT!', accentColor: '#22c55e',
    headline: (p) => `FREE HIT — swing it, ${p}!`,
    subline:  (p, opp) => `vs ${opp} · No wicket possible — field is scrambled, boundary on`,
    choiceCount: 3,
    choicePool: [
      { label: 'Go downtown!',    icon: '💥', desc: 'Maximum power — swing for the stands',          successChance: 0.52 },
      { label: 'Find the gap',    icon: '🎯', desc: 'Smart placement — take the boundary',            successChance: 0.70 },
      { label: 'Scoop over fine', icon: '🥄', desc: 'Unconventional — over the keeper\'s head',      successChance: 0.58 },
      { label: 'Step and loft',   icon: '⚡', desc: 'Create room — loft over mid-off',               successChance: 0.60 },
      { label: 'Reverse sweep',   icon: '🔄', desc: 'Stylish — wrong-foot the field',                successChance: 0.48 },
      { label: 'Running between', icon: '🏃', desc: 'Safe — call for 2 or 3, don\'t miss it',        successChance: 0.85 },
    ],
    successText: (p) => `SIX! ${p} absolutely nails it — the free hit is dispatched into the crowd! 🆓`,
    failText:    (p, c) => `Missed connection! ${p} tried to ${c.label.toLowerCase()} but mishit it. Just 1 run.`,
    timeoutText: (p) => `${p} didn't read the line — bowled through the gate. Just a dot on a free hit!`,
  },

}

// ─── Outcome text ─────────────────────────────────────────────────────────────

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
  const [phase, setPhase]   = useState('choose')
  const [chosen, setChosen] = useState(null)
  const [success, setSuccess] = useState(null)
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS)
  const timerRef = useRef(null)

  const def = event ? EVENT_DEFS[event.type] : null

  // Pick random choices from pool once on mount (so they don't re-shuffle on re-render)
  const [activeChoices] = useState(() => {
    if (!def) return []
    return pickFromPool(def.choicePool, def.choiceCount ?? 3)
  })

  // Countdown tick
  useEffect(() => {
    if (phase !== 'choose' || !def) return
    if (timeLeft <= 0) { handleTimeout(); return }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [timeLeft, phase])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!event || !def) return null

  const accentColor = def.accentColor

  function pick(choice) {
    clearTimeout(timerRef.current)
    const succeeded = Math.random() < choice.successChance
    setChosen(choice)
    setSuccess(succeeded)
    setPhase('outcome')
  }

  function handleTimeout() {
    clearTimeout(timerRef.current)
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
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.25 }}>
                {def.headline(event.playerName, opponent)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem' }}>
                {def.subline(event.playerName, opponent)}
              </div>
            </div>

            {/* Countdown */}
            <CountdownBar seconds={timeLeft} total={TIMER_SECONDS} />

            {/* Choices — randomly selected from pool */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activeChoices.map(c => (
                <button
                  key={c.label}
                  onClick={() => pick(c)}
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
                background: '#C8102E',
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
