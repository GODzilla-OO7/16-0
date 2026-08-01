import { useState, useEffect } from 'react'
import { AWARDS, loadProfile, updateEmail, clearProfile } from '../hooks/useProfile.js'

const MODE_LABELS = { ipl: '🏏 IPL', 'odi-wc': '🌍 ODI WC', 't20-wc': '⚡ T20 WC' }

function AwardBadge({ award, earned }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.625rem 0.875rem',
      background: earned ? '#0d2418' : 'var(--card)',
      border: `1px solid ${earned ? '#1F6FEB33' : 'var(--border)'}`,
      borderRadius: '0.75rem',
      opacity: earned ? 1 : 0.45,
      transition: 'all 0.2s',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: earned ? '#1F6FEB18' : 'var(--border2)',
        border: `2px solid ${earned ? '#1F6FEB55' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem', flexShrink: 0,
        filter: earned ? 'none' : 'grayscale(1)',
      }}>
        {award.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: earned ? 'var(--text)' : '#64748b' }}>
          {award.name}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.3 }}>
          {award.desc}
        </div>
      </div>
      {earned && (
        <div style={{ fontSize: '0.6rem', color: '#1F6FEB', fontWeight: 800, flexShrink: 0 }}>✓</div>
      )}
    </div>
  )
}

export default function ProfileModal({ onClose, newlyEarned = [] }) {
  const [profile, setProfile] = useState(() => loadProfile())
  const [emailInput, setEmailInput]   = useState(profile.email ?? '')
  const [nameInput,  setNameInput]    = useState(profile.displayName ?? '')
  const [saved,      setSaved]        = useState(false)
  const [tab,        setTab]          = useState(newlyEarned.length > 0 ? 'awards' : 'profile')

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

  const earnedSet = new Set(profile.awards ?? [])
  const earnedCount = earnedSet.size
  const totalCount  = AWARDS.length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(4px)',
        animation: 'fade-in 0.2s ease both',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '1.25rem',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        animation: 'fade-in-up 0.3s ease both',
      }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#1F6FEB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>Cricket 16-0</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>
              {profile.displayName ? `Hi, ${profile.displayName}` : 'Your Profile'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
              {earnedCount}/{totalCount} awards · {profile.totalSeasons ?? 0} season{profile.totalSeasons !== 1 ? 's' : ''} played
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, padding: '0.25rem' }}>
            ✕
          </button>
        </div>

        {/* New award banner */}
        {newlyEarned.length > 0 && (
          <div style={{
            padding: '0.875rem 1.5rem',
            background: 'linear-gradient(135deg, #0d2010, var(--bg))',
            borderBottom: '1px solid #1e3a2e',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.6rem', color: '#1F6FEB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              🎉 New Award{newlyEarned.length > 1 ? 's' : ''} Unlocked!
            </div>
            {newlyEarned.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>
                <span>{a.icon}</span> {a.name}
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>— {a.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0.5rem', gap: '0.375rem', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            { id: 'awards',  label: `🏅 Awards (${earnedCount}/${totalCount})` },
            { id: 'profile', label: '👤 Profile' },
            { id: 'history', label: '📋 History' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '0.4rem', background: tab === t.id ? '#1F6FEB' : 'transparent',
              color: tab === t.id ? 'var(--bg)' : '#64748b', border: 'none', borderRadius: '0.4rem',
              fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>

          {/* Awards tab */}
          {tab === 'awards' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Progress bar */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginBottom: '0.35rem' }}>
                  <span>Collection progress</span>
                  <span style={{ fontWeight: 700, color: '#1F6FEB' }}>{Math.round(earnedCount / totalCount * 100)}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3 }}>
                  <div style={{ width: `${earnedCount / totalCount * 100}%`, height: '100%', background: 'linear-gradient(90deg,#1F6FEB,#0047CC)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>
              {AWARDS.map(award => (
                <AwardBadge key={award.id} award={award} earned={earnedSet.has(award.id)} />
              ))}
            </div>
          )}

          {/* Profile tab */}
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5, padding: '0.75rem', background: 'var(--border2)', borderRadius: '0.625rem' }}>
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
                    background: 'var(--border2)', border: '1px solid var(--border)',
                    borderRadius: '0.625rem', color: 'var(--text)', fontSize: '0.875rem',
                    outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
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
                    background: 'var(--border2)', border: '1px solid var(--border)',
                    borderRadius: '0.625rem', color: 'var(--text)', fontSize: '0.875rem',
                    outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ fontSize: '0.6rem', color: 'var(--border)', marginTop: '0.3rem' }}>
                  Used to restore progress when hosted online. Never shared.
                </div>
              </div>

              <button
                onClick={handleSave}
                style={{
                  padding: '0.75rem', background: 'linear-gradient(135deg,#1F6FEB,#0047CC)',
                  color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                {saved ? '✓ Saved!' : 'Save Profile'}
              </button>

              <button
                onClick={handleClear}
                style={{
                  padding: '0.5rem', background: 'transparent',
                  color: '#ef4444', border: '1px solid #7f1d1d',
                  borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Reset all profile data
              </button>
            </div>
          )}

          {/* History tab */}
          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(profile.history ?? []).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--border)', fontSize: '0.8rem', padding: '2rem' }}>
                  No seasons played yet.
                </div>
              ) : (profile.history ?? []).map((h, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  background: 'var(--border2)', border: '1px solid var(--border)',
                  borderRadius: '0.625rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>
                      {MODE_LABELS[h.mode] ?? h.mode}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
                      {h.wins}W – {h.losses}L
                      {h.manager ? ` · ${h.manager}` : ''}
                      {h.difficulty === 'hard' ? ' · 🔒 Hard' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color:
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
                    <div style={{ fontSize: '0.55rem', color: 'var(--border)' }}>
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
