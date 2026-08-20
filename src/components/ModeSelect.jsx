import { useState, useEffect } from 'react'
import { fetchTotalPlays, subscribeToPlays } from '../hooks/useAuth.js'

const PLAY_COUNT_OFFSET = 103

function formatCount(n) {
  if (n == null) return null
  const total = n + PLAY_COUNT_OFFSET
  if (total >= 1000) return (total / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(total)
}

export default function ModeSelect({
  onSelect, onH2H, onDailyChallenge,
  user, onSignIn, onGoogleSignIn, onAccount, onMedals,
  newAwards = [], streak = 0, streakBonus = 0,
}) {
  const [totalPlays, setTotalPlays] = useState(null)

  useEffect(() => {
    fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    const unsub = subscribeToPlays(n => { if (n != null) setTotalPlays(n) })
    const poll = setInterval(() => {
      fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    }, 8000)
    return () => { unsub(); clearInterval(poll) }
  }, [])

  const RED = '#C8102E'
  const RED_HOV = '#a50d24'

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>

      {/* ── Stadium background ───────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(/stadium.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }} />
      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(160deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.80) 100%)',
      }} />

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        height: 58,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Left: logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo.png" alt="16-0" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>16-0</span>
        </div>

        {/* Right: nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{
            fontSize: '0.82rem', fontWeight: 800, color: '#fff',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            borderBottom: '2px solid #fff', paddingBottom: '2px',
          }}>Home</span>
          <button
            onClick={user ? onAccount : onMedals}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '0.82rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            My Stats
            {newAwards.length > 0 && (
              <span style={{
                background: '#f59e0b', color: '#000', borderRadius: '999px',
                fontSize: '0.55rem', fontWeight: 900, padding: '0.1rem 0.35rem',
              }}>
                {newAwards.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Main hero ───────────────────────────────────────────────────── */}
      <main style={{
        position: 'relative', zIndex: 5,
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '2.5rem 1.5rem 2rem',
      }}>

        {/* Logo */}
        <img
          src="/logo.png"
          alt="16-0"
          style={{ height: 76, width: 76, objectFit: 'contain', marginBottom: '1.25rem' }}
        />

        {/* Headline */}
        <h1 style={{
          fontStyle: 'italic',
          fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)',
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1.1,
          textAlign: 'center',
          margin: '0 0 0.5rem',
        }}>
          Can you go <span style={{ color: RED }}>16-0?</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(0.85rem, 1.5vw, 1rem)',
          color: 'rgba(255,255,255,0.65)',
          textAlign: 'center',
          margin: '0 0 1.1rem',
        }}>
          How do you want to build your all-time XI?
        </p>

        {/* Live counter */}
        {totalPlays != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1.1rem',
            fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#22c55e', display: 'inline-block',
              boxShadow: '0 0 6px #22c55e', flexShrink: 0,
            }} />
            <span>
              <span style={{ color: '#fff', fontWeight: 800 }}>{formatCount(totalPlays)}</span>
              {' '}seasons played globally
            </span>
          </div>
        )}

        {/* CHOOSE YOUR MODE label */}
        <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: RED,
            borderBottom: `2px solid ${RED}`,
            paddingBottom: '3px',
          }}>
            Choose Your Mode
          </span>
        </div>

        {/* ── 3 Mode cards ──────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.25rem',
          width: '100%', maxWidth: 960,
          marginBottom: '1.25rem',
        }}>

          {/* IPL — active */}
          <div
            style={{
              background: 'rgba(8,8,14,0.78)',
              border: '1.5px solid rgba(255,255,255,0.18)',
              borderRadius: '1rem',
              padding: '2rem 1.25rem 1.5rem',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.625rem',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(200,16,46,0.55)'
              e.currentTarget.style.boxShadow = '0 0 32px rgba(200,16,46,0.12)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: '3.25rem', lineHeight: 1, marginBottom: '0.25rem' }}>🏆</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>IPL</div>
            <div style={{
              fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)',
              textAlign: 'center', lineHeight: 1.55, flex: 1,
            }}>
              Draft with full player stats visible — make informed picks across all IPL eras.
            </div>
            <button
              onClick={() => onSelect('ipl')}
              style={{
                marginTop: '0.75rem', width: '100%',
                padding: '0.7rem 0',
                background: RED, border: 'none',
                borderRadius: '999px',
                color: '#fff', fontSize: '0.85rem', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '0.05em',
                transition: 'background 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = RED_HOV; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = RED; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              PLAY IPL
            </button>
          </div>

          {/* ODI WC — Coming Soon */}
          <div style={{
            background: 'rgba(8,8,14,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1rem',
            padding: '2rem 1.25rem 1.5rem',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.625rem',
            opacity: 0.6,
          }}>
            <span style={{ fontSize: '3.25rem', lineHeight: 1, marginBottom: '0.25rem' }}>🌍</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>ODI WC</div>
            <div style={{
              fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)',
              textAlign: 'center', lineHeight: 1.55, flex: 1,
            }}>
              Build the greatest ODI World Cup XI of all time.
            </div>
            <div style={{
              marginTop: '0.75rem',
              fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0.55rem 1.75rem',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '999px',
            }}>
              Coming Soon
            </div>
          </div>

          {/* T20 WC — Coming Soon */}
          <div style={{
            background: 'rgba(8,8,14,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1rem',
            padding: '2rem 1.25rem 1.5rem',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.625rem',
            opacity: 0.6,
          }}>
            <span style={{ fontSize: '3.25rem', lineHeight: 1, marginBottom: '0.25rem' }}>⚡</span>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>T20 WC</div>
            <div style={{
              fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)',
              textAlign: 'center', lineHeight: 1.55, flex: 1,
            }}>
              Pick your nation's finest T20 internationals across every edition.
            </div>
            <div style={{
              marginTop: '0.75rem',
              fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0.55rem 1.75rem',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '999px',
            }}>
              Coming Soon
            </div>
          </div>
        </div>

        {/* ── Multiplayer banner ─────────────────────────────────────────── */}
        <button
          onClick={onH2H}
          style={{
            width: '100%', maxWidth: 960,
            padding: '1rem 1.5rem',
            background: 'rgba(8,8,14,0.72)',
            border: '1.5px solid rgba(255,255,255,0.13)',
            borderRadius: '0.875rem',
            color: '#fff', fontSize: '0.95rem', fontWeight: 800,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.625rem',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            letterSpacing: '0.05em',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(200,16,46,0.45)'
            e.currentTarget.style.boxShadow = '0 0 24px rgba(200,16,46,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>⚔️</span>
          MULTIPLAYER
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0' }}>
            — Draft vs a friend
          </span>
        </button>

        {/* Footer */}
        <p style={{
          marginTop: '1.75rem',
          fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
        }}>
          Unofficial fan game · Not affiliated with any cricket board or league
        </p>
      </main>
    </div>
  )
}
