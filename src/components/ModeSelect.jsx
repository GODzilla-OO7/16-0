import { useState, useEffect } from 'react'
import { fetchTotalPlays, subscribeToPlays } from '../hooks/useAuth.js'

const HOW_TO_PLAY = [
  { icon: '🎰', title: 'Spin the Wheel', text: 'Each pick, the wheel lands on a random franchise or nation from a random era. You choose one player from that squad to add to your XI.' },
  { icon: '🔄', title: 'Rerolls', text: 'Not happy with the team you landed on? You get 3 rerolls per game — use them wisely.' },
  { icon: '👨‍✈️', title: 'Pick a Coach', text: 'Once your XI is complete, spin for a coach. Coaches give a strength bonus — +2 if they won the tournament you\'re playing.' },
  { icon: '📊', title: 'Team Strength', text: 'Batting average, bowling average, and overall rating shown as you build. Batting weighted by position — openers matter most.' },
  { icon: '⚠️', title: 'Player Positions', text: 'Openers and bowlers out of position reduce team strength in simulation.' },
  { icon: '🏆', title: 'Win the Season', text: 'In IPL you play 14 league matches then playoffs. Win as many as possible — chase that perfect record.' },
  { icon: '🌟', title: 'Tournament Best XI', text: 'At the end of the season, best performers across all teams are picked for the Tournament XI.' },
]

const LIGHT = {
  bg:         '#f4f7ff',
  cardBg:     '#ffffff',
  cardBorder: '#D4172C',
  cardHover:  '#f0f4ff',
  htpBg:      '#f8faff',
  accent:     '#4169E1',
  accentHov:  '#2952CC',
  accentDim:  'rgba(65,105,225,0.1)',
  accentBrd:  'rgba(65,105,225,0.3)',
  text:       '#0f172a',
  muted:      '#64748b',
  dimText:    '#94a3b8',
  sectionLbl: '#94a3b8',
}

const DARK = {
  bg:         '#0a0a0f',
  cardBg:     '#12121a',
  cardBorder: '#2a2a3a',
  cardHover:  '#1a1a28',
  htpBg:      '#0d0d18',
  accent:     '#4169E1',
  accentHov:  '#2952CC',
  accentDim:  'rgba(65,105,225,0.12)',
  accentBrd:  'rgba(65,105,225,0.25)',
  text:       '#f1f5f9',
  muted:      '#64748b',
  dimText:    '#475569',
  sectionLbl: '#475569',
}

const PLAY_COUNT_OFFSET = 103  // seed count — real plays add on top

function formatCount(n) {
  if (n == null) return null
  const total = n + PLAY_COUNT_OFFSET
  if (total >= 1000) return (total / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(total)
}

function ModeCard({ icon, title, desc, onClick, disabled, comingSoon, C }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        padding: '0.875rem 1rem',
        background: disabled ? C.cardBg : hov ? C.cardHover : C.cardBg,
        border: `1px solid ${disabled ? C.cardBorder : hov ? C.accentBrd : C.cardBorder}`,
        borderRadius: '0.625rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        textAlign: 'left',
        opacity: disabled ? 0.45 : 1,
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '0.5rem',
        background: C.accentDim, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.25rem',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: C.text, marginBottom: '0.15rem' }}>
          {title}
          {comingSoon && (
            <span style={{
              marginLeft: '0.5rem', fontSize: '0.6rem', fontWeight: 700,
              background: C.cardBorder, color: C.muted,
              padding: '0.1rem 0.4rem', borderRadius: '999px',
              verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Soon</span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.4 }}>{desc}</div>
      </div>
      <span style={{ color: disabled ? C.dimText : hov ? C.accent : C.muted, fontSize: '1rem', flexShrink: 0, transition: 'color 0.15s' }}>→</span>
    </button>
  )
}

// ─── Cricket Facts ────────────────────────────────────────────────────────────
const CRICKET_FACTS = [
  "Sachin Tendulkar is the only player in history to score 100 international centuries — he finished with 100 exactly.",
  "Virat Kohli scored 973 runs in a single IPL season (2016), the highest ever by any batter in one edition.",
  "India won the 1983 World Cup as 66:1 outsiders. The squad was so underfunded that players paid for their own kits.",
  "MS Dhoni's six off Nuwan Kulasekara to win the 2011 World Cup Final at Wankhede is the most-watched moment in Indian cricket history.",
  "Yuvraj Singh hit 6 consecutive sixes off Stuart Broad in the 2007 T20 WC — then completed a T20 fifty in just 12 balls.",
  "Rajasthan Royals won the very first IPL in 2008 under Shane Warne, despite being considered the weakest team on paper.",
  "The IPL was valued at $16.4 billion in 2024, making it the most valuable cricket competition — and one of the richest sports leagues — in the world.",
  "Mumbai Indians have won 5 IPL titles, more than any other franchise.",
  "Rohit Sharma holds the ODI record for highest individual score: 264* vs Sri Lanka in 2014.",
  "Harbhajan Singh took the IPL's first-ever hat-trick — against Deccan Chargers in 2008.",
  "Jasprit Bumrah is entirely self-taught. He learnt his action bowling alone in his backyard in Ahmedabad.",
  "AB de Villiers holds the records for the fastest ODI 50 (16 balls), 100 (31 balls), and 150 (64 balls) — all set in a single innings.",
  "MS Dhoni was once dropped from India's ODI team for playing too slowly in 2005. He responded with a 123-ball 183* in his very next series.",
  "The 2007 T20 WC final was so tense that India gave the last over to Joginder Sharma — an uncapped bowler — and it worked.",
  "Lasith Malinga is the only bowler to take two hat-tricks in IPL history.",
  "Chennai Super Kings reached the IPL Final in all 9 seasons they were eligible (they were banned for 2 years).",
  "Eden Gardens in Kolkata can hold over 68,000 fans. It once hosted a Test where 100,000 fans had to be turned away.",
  "Shane Warne was the first bowler to 700 Test wickets. He retired in 2007 with 708.",
  "Anil Kumble is the only Indian to take all 10 wickets in a Test innings — 10/74 vs Pakistan in Delhi, 1999.",
  "Virender Sehwag is the only Indian to score 300 in a Test match. He did it twice: 309 and 319.",
  "Rohit Sharma has scored 5 centuries in World Cup history — the most by any player in the tournament's history.",
  "Suresh Raina was the first Indian to score centuries in all three international formats.",
  "The fastest T20I fifty by an Indian is Yuvraj Singh's 12-ball knock vs England — in the same over-of-sixes against Broad.",
  "Sachin Tendulkar scored 618 runs in the 2010 IPL to win the Orange Cap — at the age of 36.",
  "India's first-ever Test match win in Pakistan came in 2004. They had toured without a single Test win for the prior 15 years.",
  "MS Dhoni has never been dismissed for a duck in an IPL final — across 10+ appearances.",
  "Hardik Pandya holds the record for the most expensive player in an IPL auction (₹15.25 crore, 2023).",
  "Muttiah Muralitharan's 800 Test wickets is a record that no active bowler is anywhere near breaking.",
  "Mumbai Indians are the only IPL franchise to win back-to-back titles — they did it in 2019 and 2020.",
  "India's 2023 World Test Championship win was their first-ever WTC title, defeating Australia in The Oval final.",
  "Virat Kohli holds the record for most Test centuries while chasing — converting more 4th-innings run chases than any captain in history.",
  "The Duckworth-Lewis-Stern method has been used in over 200 international matches since its introduction in 1997.",
  "Gautam Gambhir scored 97 in the 2011 WC Final (the innings often overshadowed by Dhoni's six) — it was arguably the match-winning knock.",
  "The IPL earned ₹48,390 crore in broadcast rights from 2023–2027 — more than the IPL's entire first decade combined.",
  "Saurav Ganguly's captaincy from 2000–2005 transformed India from a home-only side to one of the world's best away teams.",
  "India's record T20I score is 297/6 — set against Bangladesh in 2024. Rohit Sharma top-scored with 69 off 41 balls.",
  "KL Rahul is the only IPL player to score an Orange Cap–winning number of runs without his team winning a single title.",
  "Chris Gayle's 175* for RCB in 2013 remains the highest score in IPL history.",
  "The first IPL match was played on April 18, 2008, between Kolkata Knight Riders and Royal Challengers Bangalore at the DY Patil Stadium.",
  "Jasprit Bumrah is one of the few fast bowlers who can bowl a full yorker at 145 km/h consistently in the death overs — he calls it 'Plan A, B, and C'.",
]

function getDayFact() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const doy   = Math.floor((now - start) / 86400000)
  return CRICKET_FACTS[doy % CRICKET_FACTS.length]
}

// ─── Google G Logo ────────────────────────────────────────────────────────────
function GoogleLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71C3.784 10.17 3.682 9.593 3.682 9s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function ModeSelect({ onSelect, onH2H, onDailyChallenge, user, onSignIn, onGoogleSignIn, onAccount, onMedals, newAwards = [], streak = 0, streakBonus = 0 }) {
  const [showHTP, setShowHTP] = useState(false)
  const [totalPlays, setTotalPlays] = useState(null)
  const [htpHov, setHtpHov] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('cricket-theme') === 'dark' } catch { return false }
  })

  const C = dark ? DARK : LIGHT

  function toggleTheme() {
    setDark(d => {
      const next = !d
      try {
        localStorage.setItem('cricket-theme', next ? 'dark' : 'light')
        document.body.classList.toggle('light', !next)
        window.dispatchEvent(new Event('cricket-theme-change'))
      } catch {}
      return next
    })
  }

  useEffect(() => {
    // Initial fetch
    fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    // Realtime subscription (works when Supabase replication is enabled)
    const unsub = subscribeToPlays(n => { if (n != null) setTotalPlays(n) })
    // Polling fallback every 8s so the counter stays fresh
    const poll = setInterval(() => {
      fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    }, 8000)
    return () => { unsub(); clearInterval(poll) }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 1.25rem',
      background: C.bg,
      position: 'relative',
      overflow: 'hidden',
    }}>

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        {/* Top bar: My Account (left) + Theme toggle (right) — inside content column */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.5rem' }}>
          <button
            onClick={user ? onAccount : onMedals}
            title={user ? 'My Account' : 'My Medals'}
            style={{
              height: 40, borderRadius: '999px',
              padding: '0 0.875rem',
              background: dark ? '#1e2235' : C.cardBg,
              border: `1.5px solid ${dark ? '#4169E155' : C.cardBorder}`,
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              color: C.muted,
              transition: 'border-color 0.15s, background 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dark ? '#4169E155' : C.cardBorder; e.currentTarget.style.color = C.muted }}
          >
            <span style={{ fontSize: '1rem' }}>👤</span>
            My Account
            {newAwards.length > 0 && (
              <span style={{ background: '#f59e0b', color: '#0a0a0f', borderRadius: '999px', fontSize: '0.55rem', fontWeight: 900, padding: '0.1rem 0.35rem', minWidth: 14, textAlign: 'center' }}>
                {newAwards.length}
              </span>
            )}
          </button>

          <button
            onClick={toggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to night mode'}
            style={{
              height: 40, borderRadius: '999px',
              padding: '0 0.875rem',
              background: dark ? '#1e2235' : C.cardBg,
              border: `1.5px solid ${dark ? '#4169E155' : C.cardBorder}`,
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              color: C.muted,
              transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
              boxShadow: dark ? '0 0 12px #4169E118' : '0 1px 6px rgba(0,0,0,0.1)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dark ? '#4169E155' : C.cardBorder; e.currentTarget.style.color = C.muted }}
          >
            <span style={{ fontSize: '1rem' }}>{dark ? '☀️' : '🌙'}</span>
            {dark ? 'Light' : 'Night'}
          </button>
        </div>

        {/* 🔥 Login streak banner — always shown; rewards only granted when signed in */}
        {(() => {
          const isLight = document.body.classList.contains('light')
          const isHot   = streak >= 7
          const noStreak = streak === 0
          const bg   = noStreak
            ? (isLight ? 'linear-gradient(135deg,#f8faff,#f0f4ff)' : 'linear-gradient(135deg,#12121a,#1a1a28)')
            : isLight
              ? (isHot ? 'linear-gradient(135deg,#fff7ed,#ffedd5)' : 'linear-gradient(135deg,#fff7ed,#fef3c7)')
              : (isHot ? 'linear-gradient(135deg,#78350f28,#92400e28)' : 'linear-gradient(135deg,#431407,#7c2d1228)')
          const bdr  = noStreak
            ? (isLight ? C.cardBorder : '#2a2a3a')
            : isLight
              ? (isHot ? '#f59e0b' : '#f97316')
              : (isHot ? '#f59e0b55' : '#f9741644')
          const subColor = isLight ? '#78350f' : '#94a3b8'
          const nextColor = isLight
            ? (streak >= 14 ? '#b45309' : '#92400e')
            : (streak >= 14 ? '#f59e0b' : '#94a3b8')
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.6rem 1rem',
              marginBottom: '1rem',
              background: bg,
              border: `1.5px solid ${bdr}`,
              borderRadius: '0.875rem',
              animation: 'fade-in-up 0.4s ease both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>
                  {noStreak ? '🔥' : '🔥'.repeat(Math.min(streak >= 14 ? 3 : streak >= 7 ? 2 : 1, 3))}
                </span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 900, color: noStreak ? C.muted : isHot ? '#f59e0b' : '#fb923c' }}>
                    {noStreak ? 'No streak yet' : `${streak}-day streak`}
                  </div>
                  {noStreak ? (
                    <div style={{ fontSize: '0.62rem', color: C.muted }}>Login daily to build your streak</div>
                  ) : streakBonus > 0 ? (
                    <div style={{ fontSize: '0.64rem', color: '#16a34a', fontWeight: 700 }}>+₹{streakBonus}cr bonus ready — login to claim it!</div>
                  ) : (
                    <div style={{ fontSize: '0.62rem', color: subColor }}>
                      {streak >= 14 ? 'Max milestone reached 🏆' : 'Login daily to keep it alive'}
                    </div>
                  )}
                </div>
              </div>
              {!noStreak && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.58rem', color: isLight ? '#92400e' : '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Next reward</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: nextColor }}>
                    {streak >= 14 ? '🏆 Max' : streak >= 7 ? '+₹15cr at 14' : streak >= 3 ? '+₹10cr at 7' : '+₹5cr at 3'}
                  </div>
                </div>
              )}
              {noStreak && (
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: C.accent, opacity: 0.7 }}>
                  Sign in →
                </div>
              )}
            </div>
          )
        })()}

        {/* Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <span style={{
            display: 'inline-block',
            padding: '0.2rem 0.75rem',
            background: C.accentDim,
            border: `1px solid ${C.accentBrd}`,
            borderRadius: '999px',
            color: C.accent,
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>Unofficial Fan Game</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(2.6rem, 10vw, 4rem)',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          textAlign: 'center',
          marginBottom: '0.6rem',
          color: C.text,
        }}>Cricket 16-0</h1>

        <p style={{
          fontSize: '0.95rem',
          color: C.muted,
          textAlign: 'center',
          marginBottom: '0.75rem',
          lineHeight: 1.5,
        }}>
          Spin the wheel. Draft legends from any era. Chase the perfect season.
        </p>

        {/* Live counter */}
        {totalPlays != null && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            marginBottom: '2rem',
            fontSize: '0.78rem', fontWeight: 600, color: C.muted,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 5px #22c55e', flexShrink: 0 }} />
            <span><span style={{ color: C.text, fontWeight: 800 }}>{formatCount(totalPlays)}</span> seasons played globally</span>
          </div>
        )}

        {/* Cricket Fact of the Day */}
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          background: C.accentDim,
          border: `1px solid ${C.accentBrd}`,
          borderRadius: '0.625rem',
          display: 'flex',
          gap: '0.625rem',
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '0.05rem' }}>🏏</span>
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Fact of the day</div>
            <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5, fontWeight: 500 }}>{getDayFact()}</div>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => onSelect('ipl')}
          style={{
            width: '100%',
            padding: '0.9rem 1.5rem',
            background: C.accent,
            border: 'none',
            borderRadius: '0.625rem',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            marginBottom: '0.625rem',
            transition: 'background 0.15s, transform 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.accentHov; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          Play Cricket 16-0 <span style={{ fontSize: '1.1rem' }}>→</span>
        </button>

        {/* Sign-in prompt — only for signed-out users */}
        {!user && (
          <div style={{
            marginBottom: '0.625rem',
            padding: '1rem',
            background: dark ? '#0a1525' : '#f0f6ff',
            border: `1px solid ${C.accentBrd}`,
            borderRadius: '0.625rem',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.text, marginBottom: '0.2rem' }}>
              🔐 Your progress isn't being saved
            </div>
            <div style={{ fontSize: '0.7rem', color: C.muted, marginBottom: '0.875rem', lineHeight: 1.4 }}>
              Sign in to keep your medals and match history across sessions.
            </div>
            {/* Google button */}
            <button
              onClick={onGoogleSignIn}
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                background: dark ? '#fff' : '#fff',
                border: '1px solid #dadce0',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.625rem',
                fontSize: '0.88rem',
                fontWeight: 700,
                color: '#3c4043',
                marginBottom: '0.5rem',
                transition: 'box-shadow 0.15s, background 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'; e.currentTarget.style.background = '#f8f9fa' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)'; e.currentTarget.style.background = '#fff' }}
            >
              <GoogleLogo size={18} />
              Sign in with Google
            </button>
            <button
              onClick={onSignIn}
              style={{
                width: '100%',
                padding: '0.45rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                color: C.muted,
                textAlign: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.color = C.accent}
              onMouseLeave={e => e.currentTarget.style.color = C.muted}
            >
              Or sign in with email →
            </button>
          </div>
        )}

        {/* How it works */}
        <button
          onClick={() => setShowHTP(v => !v)}
          onMouseEnter={() => setHtpHov(true)}
          onMouseLeave={() => setHtpHov(false)}
          style={{
            width: '100%',
            padding: '0.8rem 1.25rem',
            background: C.cardBg,
            border: `1px solid ${htpHov ? C.accentBrd : C.cardBorder}`,
            borderRadius: showHTP ? '0.625rem 0.625rem 0 0' : '0.625rem',
            color: C.muted,
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            marginBottom: showHTP ? 0 : '1.75rem',
            transition: 'border-color 0.15s',
          }}
        >
          <span>❓</span> How it works <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: C.dimText }}>{showHTP ? '▲' : '▼'}</span>
        </button>

        {showHTP && (
          <div style={{
            background: C.htpBg,
            border: `1px solid ${C.cardBorder}`,
            borderTop: 'none',
            borderRadius: '0 0 0.625rem 0.625rem',
            padding: '1.25rem',
            marginBottom: '1.75rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
          }}>
            {HOW_TO_PLAY.map(item => (
              <div key={item.title} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: C.text, marginBottom: '0.2rem' }}>{item.title}</div>
                  <div style={{ fontSize: '0.72rem', color: C.muted, lineHeight: 1.5 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PLAY WITH MATES */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{
            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.sectionLbl,
            marginBottom: '0.625rem', paddingLeft: '0.125rem',
          }}>Play with mates</div>

          <ModeCard
            icon="⚔️"
            title="Multiplayer"
            desc="Draft your XI vs a friend — snake or live auction. Most points wins."
            onClick={onH2H}
            C={C}
          />
        </div>

        {/* MORE WAYS TO PLAY */}
        <div>
          <div style={{
            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.sectionLbl,
            marginBottom: '0.625rem', paddingLeft: '0.125rem',
          }}>More ways to play</div>

          <ModeCard
            icon="📅"
            title="Daily Challenge"
            desc="Today's puzzle: one go, fresh every day."
            onClick={onDailyChallenge}
            C={C}
          />

          <ModeCard
            icon="🌍"
            title="World Cup Modes"
            desc="ODI & T20 World Cups · 1975–2024."
            disabled
            comingSoon
            C={C}
          />
        </div>

        {/* ACCOUNT — only shown when signed in */}
        {user && (
        <div style={{ marginTop: '1.75rem', borderTop: `1px solid ${C.cardBorder}`, paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
              <button
                onClick={onAccount}
                style={{
                  flex: 1, padding: '0.7rem 1rem',
                  background: C.accentDim, border: `1px solid ${C.accentBrd}`,
                  borderRadius: '0.625rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.accentBrd}
              >
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.accent, color: '#fff', fontWeight: 900, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {user.email?.[0]?.toUpperCase() ?? '?'}
                </span>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  <div style={{ fontSize: '0.65rem', color: C.heroMuted }}>Signed in · progress saved</div>
                </div>
              </button>
            </div>
        </div>
        )}

        <p style={{ marginTop: '1.5rem', fontSize: '0.72rem', color: C.sectionLbl, textAlign: 'center' }}>
          Unofficial fan game · Not affiliated with any cricket board or league
        </p>
      </div>
    </div>
  )
}
