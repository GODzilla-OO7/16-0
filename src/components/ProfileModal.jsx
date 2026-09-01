import { useState, useEffect } from 'react'
import { AWARDS, loadProfile, updateEmail, clearProfile } from '../hooks/useProfile.js'

const MODE_LABELS = { ipl: '🏏 IPL', 'odi-wc': '🌍 ODI WC', 't20-wc': '⚡ T20 WC' }

function AwardBadge({ award, earned }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: earned ? 'rgba(200,16,46,0.10)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${earned ? 'rgba(200,16,46,0.40)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '0.75rem',
      opacity: earned ? 1 : 0.42,
      transition: 'all 0.2s',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: earned ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
          border: `2px solid ${earned ? '#f59e0b88' : 'rgba(255,255,255,0.10)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem',
          filter: earned ? 'none' : 'grayscale(1)',
          boxShadow: earned ? '0 0 10px rgba(245,158,11,0.2)' : 'none',
        }}>
          {award.icon}
        </div>
        {earned && (
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: '2px solid var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', lineHeight: 1,
          }}>
            ✓
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: earned ? '#f1f5f9' : '#64748b' }}>
          {award.name}
        </div>
        <div style={{ fontSize: '0.67rem', color: '#64748b', lineHeight: 1.4 }}>
          {award.desc}
        </div>
      </div>
      {earned && (
        <div style={{ fontSize: '0.72rem', flexShrink: 0 }}>🥇</div>
      )}
    </div>
  )
}

// ─── Career stat card ─────────────────────────────────────────────────────────

function StatCard({ value, label, sub, color = '#f59e0b' }) {
  return (
    <div style={{
      flex: '1 1 140px',
      background: 'rgba(10,13,22,0.85)',
      border: '1px solid rgba(200,16,46,0.35)',
      borderRadius: '0.875rem',
      padding: '1rem 1.25rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem', fontWeight: 900, color, lineHeight: 1, marginBottom: '0.2rem' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '0.15rem' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProfileModal({ onClose, newlyEarned = [], user = null, onSignIn }) {
  const [profile, setProfile] = useState(() => loadProfile())
  const [emailInput, setEmailInput] = useState(profile.email ?? '')
  const [nameInput,  setNameInput]  = useState(profile.displayName ?? '')
  const [saved,      setSaved]      = useState(false)
  const [tab,        setTab]        = useState(newlyEarned.length > 0 ? 'awards' : 'profile')

  useEffect(() => {
    if (newlyEarned.length > 0) setTab('awards')
  }, [newlyEarned.length])

  function handleSave() {
    const updated = updateEmail(emailInput, nameInput)
    setProfile(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    if (!confirm('Reset all profile data? This cannot be undone.')) return
    clearProfile()
    setProfile(loadProfile())
    setEmailInput('')
    setNameInput('')
  }

  const earnedSet   = new Set(profile.awards ?? [])
  const earnedCount = earnedSet.size
  const totalCount  = AWARDS.length

  const wins      = profile.totalWins    ?? 0
  const seasons   = profile.totalSeasons ?? 0
  const winRate   = seasons > 0 ? Math.round((wins / (seasons * 16)) * 100) : 0
  const bestSeason = profile.bestSeason ?? null
  const titles    = profile.iplWins ?? 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
      animation: 'fade-in 0.25s ease both',
    }}>
      {/* Dark overlay so content is readable over stadium */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,14,0.82)', zIndex: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>

        {/* Top nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
            ← Back
          </button>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            My Account
          </div>
          <div style={{ width: 60 }} />
        </div>

        {/* Avatar + name */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg,#C8102E,#7f1d1d)',
            border: '3px solid rgba(200,16,46,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.75rem', fontWeight: 900, color: '#fff',
            margin: '0 auto 0.75rem',
            boxShadow: '0 0 24px rgba(200,16,46,0.3)',
          }}>
            {(profile.displayName?.[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.2rem' }}>
            {profile.displayName ?? 'Your Account'}
          </div>
          {profile.email && (
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{profile.email}</div>
          )}
          <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '0.2rem' }}>
            Manager since {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'recently'}
          </div>
        </div>

        {/* New awards banner */}
        {newlyEarned.length > 0 && (
          <div style={{
            padding: '0.875rem 1.25rem', marginBottom: '1.25rem',
            background: 'rgba(200,16,46,0.12)',
            border: '1px solid rgba(200,16,46,0.40)',
            borderRadius: '0.875rem',
          }}>
            <div style={{ fontSize: '0.62rem', color: '#C8102E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              🎉 New Award{newlyEarned.length > 1 ? 's' : ''} Unlocked!
            </div>
            {newlyEarned.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.25rem' }}>
                <span>{a.icon}</span> {a.name}
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>— {a.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Career stats — compact grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <StatCard value={seasons} label="Seasons" color="#C8102E" />
          <StatCard value={wins}    label="All-time wins" color="#f59e0b" />
          <StatCard value={`${winRate}%`} label="Win rate" color="#f59e0b" />
          <StatCard value={bestSeason != null ? `${bestSeason}W` : '—'} label="Best season" sub="wins in one run" color="#C8102E" />
          <StatCard value={titles}  label="Titles" sub={`${titles} IPL 🏆`} color="#f59e0b" />
          <StatCard value={profile.perfectSeasons ?? 0} label="Perfect" sub="zero-loss seasons" color="#22c55e" />
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: '0.375rem', marginBottom: '1rem',
          background: 'rgba(10,13,22,0.85)',
          border: '1px solid rgba(200,16,46,0.35)',
          borderRadius: '0.75rem', padding: '0.4rem',
        }}>
          {[
            { id: 'awards',  label: user ? `🏅 Awards (${earnedCount}/${totalCount})` : `🏅 Awards` },
            { id: 'profile', label: '👤 Profile' },
            { id: 'history', label: '📋 History' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '0.5rem 0.75rem',
              background: tab === t.id ? '#C8102E' : 'transparent',
              color: tab === t.id ? '#fff' : '#64748b',
              border: 'none', borderRadius: '0.5rem',
              fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{
          background: 'rgba(10,13,22,0.85)',
          border: '1px solid rgba(200,16,46,0.35)',
          borderRadius: '1rem',
          padding: '1.25rem',
        }}>

          {/* Awards */}
          {tab === 'awards' && (() => {
            // Logged-out: show up to 2 session medals, lock the rest
            if (!user) {
              const sessionEarned = newlyEarned.slice(0, 2)
              const hiddenCount = AWARDS.length - sessionEarned.length
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sessionEarned.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.82rem', padding: '1rem 0 0.5rem' }}>
                      No medals yet this session.
                    </div>
                  )}
                  {sessionEarned.map(award => (
                    <AwardBadge key={award.id} award={award} earned={true} />
                  ))}
                  {/* Lock card */}
                  <div style={{
                    position: 'relative', marginTop: '0.5rem',
                    borderRadius: '0.875rem', overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {/* Blurred preview of locked badges */}
                    <div style={{ filter: 'blur(4px)', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem' }}>
                      {AWARDS.slice(0, 3).map(award => (
                        <AwardBadge key={award.id} award={award} earned={false} />
                      ))}
                    </div>
                    {/* Overlay */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(6,8,14,0.82)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '1.5rem', textAlign: 'center', gap: '0.75rem',
                    }}>
                      <div style={{ fontSize: '2rem' }}>🔒</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#f1f5f9' }}>
                        {hiddenCount} medal{hiddenCount !== 1 ? 's' : ''} hidden
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5, maxWidth: 260 }}>
                        Sign in to unlock your full medal collection and save your progress across devices.
                      </div>
                      <button
                        onClick={onSignIn}
                        style={{
                          padding: '0.65rem 1.5rem',
                          background: 'linear-gradient(135deg,#C8102E,#a50d24)',
                          color: '#fff', border: 'none', borderRadius: '0.625rem',
                          fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                      >
                        <span>G</span> Sign in with Google
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            // Logged in: show all medals as normal
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginBottom: '0.35rem' }}>
                    <span>Collection progress</span>
                    <span style={{ fontWeight: 700, color: '#C8102E' }}>{Math.round(earnedCount / totalCount * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <div style={{ width: `${earnedCount / totalCount * 100}%`, height: '100%', background: 'linear-gradient(90deg,#C8102E,#a50d24)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
                {AWARDS.map(award => (
                  <AwardBadge key={award.id} award={award} earned={earnedSet.has(award.id)} />
                ))}
              </div>
            )
          })()}

          {/* Profile */}
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5, padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.625rem' }}>
                Save your email to link your progress when the game moves online. Your data stays on this device until then.
              </div>

              <div>
                <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
                  Display Name
                </label>
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="e.g. Ricky Ponting"
                  style={{
                    width: '100%', padding: '0.625rem 0.875rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '0.625rem', color: '#f1f5f9', fontSize: '0.9rem',
                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '0.625rem 0.875rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '0.625rem', color: '#f1f5f9', fontSize: '0.9rem',
                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
                <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.3rem' }}>
                  Used to restore progress when hosted online. Never shared.
                </div>
              </div>

              <button
                onClick={handleSave}
                style={{
                  padding: '0.75rem', background: '#C8102E',
                  color: '#fff', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                {saved ? '✓ Saved!' : 'Save Profile'}
              </button>

              <button
                onClick={handleClear}
                style={{
                  padding: '0.5rem', background: 'transparent',
                  color: '#ef4444', border: '1px solid rgba(127,29,29,0.6)',
                  borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Reset all profile data
              </button>
            </div>
          )}

          {/* History */}
          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(profile.history ?? []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.82rem', padding: '2rem' }}>
                  No seasons played yet.
                </div>
              ) : (profile.history ?? []).map((h, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '0.75rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9' }}>
                      {MODE_LABELS[h.mode] ?? h.mode}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      {h.wins}W – {h.losses}L
                      {h.manager ? ` · ${h.manager}` : ''}
                      {h.difficulty === 'hard' ? ' · 🔒 Hard' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color:
                      (h.stageReached === 'Champion' || h.iplOutcome === 'champion') ? '#f59e0b' :
                      (h.stageReached === 'Runner-up' || h.iplOutcome === 'runner-up') ? '#94a3b8' :
                      '#64748b'
                    }}>
                      {h.stageReached === 'Champion' ? '🏆 Champion' :
                       h.stageReached === 'Runner-up' ? '🥈 Runner-up' :
                       h.iplOutcome === 'champion' ? '🏆 IPL Champ' :
                       h.iplOutcome === 'runner-up' ? '🥈 Finalist' :
                       h.stageReached ?? h.iplOutcome ?? '—'}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: '#475569' }}>
                      {new Date(h.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
