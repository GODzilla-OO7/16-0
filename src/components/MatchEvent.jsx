import { useState } from 'react'

// ─── Ball type generators ──────────────────────────────────────────────────

const BALLS_FACING = [
  { label: 'Fast Yorker',  desc: '140kph aimed at the toes', risk: 'high',   batSucc: 0.38, bowlSucc: 0.62 },
  { label: 'Leg Spin',     desc: 'Loopy googly on a full length', risk: 'med', batSucc: 0.55, bowlSucc: 0.48 },
  { label: 'Off Cutter',   desc: 'Slower through the air', risk: 'low',    batSucc: 0.70, bowlSucc: 0.35 },
]

const BATTING_MOMENTS = [
  { label: 'The Last Run',   desc: 'A single to midwicket — easy pickings' },
  { label: 'Cover Drive',    desc: 'Full ball outside off — perfect for the drive' },
  { label: 'Glance to Fine', desc: 'Pitched on the pads, room to clip away' },
]

const BATTING_CHOICES = [
  { label: 'Defend',   icon: '🛡️', desc: 'Play it safe — protect the wicket', successChance: 0.82 },
  { label: 'Drive',    icon: '🏏', desc: 'Push through the line for the milestone', successChance: 0.55 },
  { label: 'Sweep',    icon: '💥', desc: 'Go aerial — high risk, high reward', successChance: 0.35 },
]

const BOWLING_CHOICES = [
  { label: 'Yorker',     icon: '🎯', desc: 'Aim for the blockhole at pace', successChance: 0.48 },
  { label: 'Slower ball', icon: '🌀', desc: 'Change of pace to deceive the batsman', successChance: 0.60 },
  { label: 'Bumper',     icon: '💨', desc: 'Short-pitched — make them play', successChance: 0.42 },
]

// ─── Outcome messages ──────────────────────────────────────────────────────

function outcomeText(event, choice, success) {
  if (event.type === 'half-century') {
    return success
      ? `FIFTY! ${event.playerName} raises the bat to the crowd. What a knock! 🎉`
      : `OUT! ${event.playerName} falls for ${event.milestone} trying to ${choice.label.toLowerCase()}. So close.`
  }
  if (event.type === 'century') {
    return success
      ? `HUNDRED! ${event.playerName} punches the air — a magnificent century! 🏆`
      : `OUT! ${event.playerName} perishes for ${event.milestone} — the crowd can't believe it.`
  }
  if (event.type === 'hat-trick') {
    return success
      ? `HAT-TRICK! ${event.playerName} is mobbed by teammates — three in a row! 🔥`
      : `No hat-trick. The batsman digs it out and runs a single. ${event.playerName} walks back quietly.`
  }
  return ''
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function MatchEvent({ event, opponent, onContinue }) {
  const [phase, setPhase]       = useState('reveal')    // reveal → choose → outcome
  const [chosen, setChosen]     = useState(null)
  const [success, setSuccess]   = useState(null)

  if (!event) return null

  const isBatting = event.type !== 'hat-trick'
  const choices   = isBatting ? BATTING_CHOICES : BOWLING_CHOICES

  const ballType  = isBatting
    ? BATTING_MOMENTS[Math.floor(Math.random() * BATTING_MOMENTS.length)]
    : BALLS_FACING[Math.floor(Math.random() * BALLS_FACING.length)]

  function pick(choice) {
    const roll = Math.random()
    const succeeded = roll < choice.successChance
    setChosen(choice)
    setSuccess(succeeded)
    setPhase('outcome')
  }

  const accentColor = isBatting ? '#f59e0b' : '#ef4444'
  const headline =
    event.type === 'half-century' ? `${event.playerName} is on ${event.milestone}!` :
    event.type === 'century'      ? `${event.playerName} is on ${event.milestone}!` :
                                    `${event.playerName} is on a hat-trick!`

  const subline =
    event.type === 'half-century' ? `One run away from a half-century vs ${opponent}` :
    event.type === 'century'      ? `One run away from a century vs ${opponent}` :
                                    `Takes the next wicket and it's a hat-trick vs ${opponent}`

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
      animation: 'fade-in 0.3s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#0d1229', border: `1px solid ${accentColor}44`,
        borderRadius: '1.25rem', padding: '2rem',
        boxShadow: `0 0 60px ${accentColor}22`,
        animation: 'fade-in-up 0.35s ease both',
      }}>

        {phase === 'reveal' && (
          <>
            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                {isBatting ? '🏏' : '🎳'}
              </div>
              <div style={{
                display: 'inline-block', padding: '0.2rem 0.75rem',
                background: `${accentColor}22`, border: `1px solid ${accentColor}55`,
                borderRadius: '999px', color: accentColor,
                fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}>
                {isBatting ? 'Match Moment' : 'Hat-Trick Ball'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2 }}>
                {headline}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.4rem' }}>
                {subline}
              </div>
            </div>

            {/* Ball info */}
            <div style={{
              background: '#060818', border: '1px solid #1a2550',
              borderRadius: '0.75rem', padding: '0.875rem 1rem',
              marginBottom: '1.5rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                {isBatting ? 'The opportunity' : 'Next ball'}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>
                {ballType.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.15rem' }}>
                {ballType.desc}
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', textAlign: 'center', marginBottom: '1rem' }}>
              {isBatting ? 'How does your batsman play it?' : 'What does your bowler send down?'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {choices.map(c => (
                <button
                  key={c.label}
                  onClick={() => pick(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.875rem',
                    padding: '0.875rem 1rem',
                    background: '#060818', border: '1px solid #1a2550',
                    borderRadius: '0.625rem', cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    textAlign: 'left', width: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}0f` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2550'; e.currentTarget.style.background = '#060818' }}
                >
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{c.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f1f5f9' }}>{c.label}</div>
                    <div style={{ fontSize: '0.72rem', color: '#475569' }}>{c.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'outcome' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem', animation: 'fade-in 0.4s ease both' }}>
              {success ? '🎉' : '😔'}
            </div>
            <div style={{
              fontSize: '1.1rem', fontWeight: 800,
              color: success ? accentColor : '#ef4444',
              lineHeight: 1.4, marginBottom: '0.75rem',
              animation: 'fade-in-up 0.4s ease both',
            }}>
              {outcomeText(event, chosen, success)}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '1.5rem' }}>
              You played: <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{chosen?.label}</span>
            </div>
            <button
              onClick={() => onContinue(success, chosen?.label)}
              style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                border: 'none', borderRadius: '0.625rem',
                color: '#fff', fontSize: '0.95rem', fontWeight: 800,
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
