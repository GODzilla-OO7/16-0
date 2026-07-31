import { useState } from 'react'
import { MODE_CONFIG } from '../data/players.js'

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    background: 'radial-gradient(ellipse at 50% 0%, #0a1a3a 0%, #060818 60%)',
    position: 'relative',
    overflow: 'hidden',
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    background: 'rgba(31,111,235,0.15)',
    border: '1px solid rgba(31,111,235,0.3)',
    borderRadius: '999px',
    color: '#1F6FEB',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: 'clamp(3rem, 8vw, 5.5rem)',
    fontWeight: 900,
    letterSpacing: '-0.04em',
    lineHeight: 1,
    textAlign: 'center',
    marginBottom: '0.5rem',
    background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: '3.5rem',
    maxWidth: 480,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
    width: '100%',
    maxWidth: 900,
  },
  card: (color) => ({
    background: '#12121a',
    border: `1px solid #2a2a3a`,
    borderRadius: '1rem',
    padding: '1.75rem',
    cursor: 'pointer',
    transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
    textAlign: 'left',
    position: 'relative',
    overflow: 'hidden',
  }),
  cardIcon: {
    fontSize: '2.5rem',
    marginBottom: '1rem',
    display: 'block',
  },
  cardTitle: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#f1f5f9',
    marginBottom: '0.5rem',
  },
  cardDesc: {
    fontSize: '0.875rem',
    color: '#64748b',
    lineHeight: 1.5,
    marginBottom: '1.25rem',
  },
  cardStats: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  stat: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  statVal: {
    color: '#1F6FEB',
    fontWeight: 700,
  },
  cta: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    fontSize: '1.25rem',
    color: '#2a2a3a',
    transition: 'color 0.2s',
  },
  footer: {
    marginTop: '3rem',
    fontSize: '0.8rem',
    color: '#2a2a3a',
    textAlign: 'center',
  }
}

const STATS = {
  'ipl': ['16 matches', '155+ squads', '2008–2025'],
  'odi-wc': ['11 matches', '120+ squads', '1975–2023'],
  't20-wc': ['9 matches', '125+ squads', '2007–2024'],
}

const HOW_TO_PLAY = [
  { icon: '🎰', title: 'Spin the Wheel', text: 'Each pick, the wheel lands on a random franchise or nation from a random era. You choose one player from that squad to add to your XI.' },
  { icon: '🔄', title: 'Rerolls', text: 'Not happy with the team you landed on? You get 3 rerolls per game — use them wisely to avoid a squad that doesn\'t suit your needs.' },
  { icon: '👨‍✈️', title: 'Pick a Coach', text: 'Once your XI is complete, spin for a coach. Coaches give a strength bonus — and if they\'ve won the tournament you\'re playing, they get an extra +2 boost.' },
  { icon: '📊', title: 'Team Strength', text: 'Your team\'s batting average, bowling average, and overall rating are shown as you build. Batting is weighted by position — openers matter most.' },
  { icon: '⚠️', title: 'Player Positions', text: 'You can place any player anywhere, but openers and bowlers out of their natural positions will reduce your team strength in simulation.' },
  { icon: '🏆', title: 'Win the Season', text: 'In IPL you play 14 league matches. In World Cups you play group stages and knockout rounds. Win as many as possible — and chase that perfect record.' },
  { icon: '🌟', title: 'Tournament Best XI', text: 'At the end of the season, the best performers across all teams are picked for the Tournament XI. How many of your players make it depends on how your team finished.' },
]

export default function ModeSelect({ onSelect }) {
  const modes = Object.entries(MODE_CONFIG).filter(([key]) => key === 'ipl')
  const [showHTP, setShowHTP] = useState(false)

  return (
    <div style={s.page}>
      {/* Cricket pitch background — very faded, purely decorative */}
      <svg
        viewBox="0 0 900 620"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%', maxWidth: 900,
          opacity: 0.055,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        aria-hidden="true"
      >
        {/* Outer boundary oval */}
        <ellipse cx="450" cy="310" rx="420" ry="285" fill="none" stroke="#1F6FEB" strokeWidth="2.5" />
        {/* 30-yard inner circle */}
        <ellipse cx="450" cy="310" rx="210" ry="175" fill="none" stroke="#1F6FEB" strokeWidth="1.5" strokeDasharray="8 6" />
        {/* The pitch — narrow central rectangle */}
        <rect x="432" y="165" width="36" height="290" rx="3" fill="none" stroke="#1F6FEB" strokeWidth="2" />
        {/* Bowling crease — top end */}
        <line x1="414" y1="200" x2="486" y2="200" stroke="#1F6FEB" strokeWidth="1.5" />
        {/* Bowling crease — bottom end */}
        <line x1="414" y1="420" x2="486" y2="420" stroke="#1F6FEB" strokeWidth="1.5" />
        {/* Popping crease — top */}
        <line x1="412" y1="212" x2="488" y2="212" stroke="#1F6FEB" strokeWidth="1" />
        {/* Popping crease — bottom */}
        <line x1="412" y1="408" x2="488" y2="408" stroke="#1F6FEB" strokeWidth="1" />
        {/* Stumps — top end (3 dots) */}
        <circle cx="444" cy="197" r="2.5" fill="#1F6FEB" />
        <circle cx="450" cy="197" r="2.5" fill="#1F6FEB" />
        <circle cx="456" cy="197" r="2.5" fill="#1F6FEB" />
        {/* Stumps — bottom end */}
        <circle cx="444" cy="423" r="2.5" fill="#1F6FEB" />
        <circle cx="450" cy="423" r="2.5" fill="#1F6FEB" />
        <circle cx="456" cy="423" r="2.5" fill="#1F6FEB" />
        {/* Centre dot */}
        <circle cx="450" cy="310" r="3" fill="#1F6FEB" />
        {/* Long-on / long-off field marking lines — subtle radiating lines */}
        <line x1="450" y1="25" x2="450" y2="165" stroke="#1F6FEB" strokeWidth="0.8" strokeDasharray="4 8" opacity="0.5" />
        <line x1="450" y1="455" x2="450" y2="595" stroke="#1F6FEB" strokeWidth="0.8" strokeDasharray="4 8" opacity="0.5" />
        <line x1="30" y1="310" x2="240" y2="310" stroke="#1F6FEB" strokeWidth="0.8" strokeDasharray="4 8" opacity="0.5" />
        <line x1="660" y1="310" x2="870" y2="310" stroke="#1F6FEB" strokeWidth="0.8" strokeDasharray="4 8" opacity="0.5" />
      </svg>

      <div style={s.badge}>Unofficial Fan Game</div>
      <h1 style={s.title}>Cricket 16-0</h1>
      <p style={s.subtitle}>
        Spin the wheel. Draft legends from any era. Chase the perfect season.
      </p>

      <div style={s.grid}>
        {modes.map(([key, cfg]) => (
          <button
            key={key}
            style={s.card()}
            onClick={() => onSelect(key)}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1F6FEB'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(31,111,235,0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#2a2a3a'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={s.cardIcon}>{cfg.icon}</span>
            <div style={s.cardTitle}>{cfg.label}</div>
            <div style={s.cardDesc}>{cfg.description}</div>
            <div style={s.cardStats}>
              {STATS[key].map(stat => (
                <span key={stat} style={s.stat}>{stat}</span>
              ))}
            </div>
            <span style={s.cta}>→</span>
          </button>
        ))}
      </div>

      {/* How to Play */}
      <div style={{ marginTop: '2.5rem', width: '100%', maxWidth: 900 }}>
        <button
          onClick={() => setShowHTP(v => !v)}
          style={{
            width: '100%', padding: '0.875rem 1.25rem',
            background: '#12121a', border: '1px solid #2a2a3a',
            borderRadius: showHTP ? '1rem 1rem 0 0' : '1rem',
            color: '#94a3b8', fontSize: '0.875rem', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#1F6FEB'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a3a'}
        >
          <span>❓ How to Play</span>
          <span style={{ fontSize: '0.75rem', color: '#2a2a3a' }}>{showHTP ? '▲ hide' : '▼ show'}</span>
        </button>
        {showHTP && (
          <div style={{
            background: '#0e0e18', border: '1px solid #2a2a3a', borderTop: 'none',
            borderRadius: '0 0 1rem 1rem', padding: '1.5rem',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem',
          }}>
            {HOW_TO_PLAY.map(item => (
              <div key={item.title} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '0.25rem' }}>{item.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.55 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={s.footer}>
        Unofficial fan game · Not affiliated with any cricket board or league
      </p>
    </div>
  )
}
