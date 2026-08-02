import { useState } from 'react'
import { getSupabase } from '../lib/supabase'

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [sent, setSent]       = useState(false)       // for email confirmation

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    const sb = await getSupabase()
    if (!sb) { setError('Auth not available.'); setGoogleLoading(false); return }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
    // On success, browser redirects — no need to call onSuccess manually
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const sb = await getSupabase()
    if (!sb) { setError('Auth not available. Please try again.'); setLoading(false); return }

    if (mode === 'signup') {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setSent(true)
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      onSuccess?.()
      onClose()
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '0.5rem', color: 'var(--text)',
    fontSize: '0.95rem', outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '1.25rem', padding: '2rem',
        width: '100%', maxWidth: 380,
        animation: 'fade-in-up 0.25s ease both',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏏</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
            {mode === 'signin' ? 'Sign in to save your stats online' : 'Save your stats and compete on leaderboards'}
          </div>
        </div>

        {/* Google button — always visible unless email confirmation sent */}
        {!sent && (
          <>
            <button
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              style={{
                width: '100%', padding: '0.8rem 1rem',
                background: 'var(--card2)', border: '1px solid var(--border)',
                borderRadius: '0.625rem', cursor: googleLoading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)',
                marginBottom: '1.25rem', transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#1F6FEB'; e.currentTarget.style.background = 'var(--card)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card2)' }}
            >
              {/* Google icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
              </svg>
              {googleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>or use email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          </>
        )}

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📧</div>
            <div style={{ fontWeight: 800, color: '#1F6FEB', marginBottom: '0.5rem' }}>Check your email</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
              We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>. Click it to activate your account, then come back and sign in.
            </div>
            <button
              onClick={() => { setMode('signin'); setSent(false) }}
              style={{ marginTop: '1.25rem', padding: '0.75rem 1.5rem', background: 'var(--border2)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'var(--text)', cursor: 'pointer', fontWeight: 700 }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#1F6FEB'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#1F6FEB'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.6rem 0.875rem', background: '#1a0505', border: '1px solid #ef444433', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#f87171' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.875rem',
                background: loading ? '#1a2e1a' : 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                color: loading ? '#64748b' : 'var(--bg)',
                border: 'none', borderRadius: '0.625rem',
                fontSize: '1rem', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Toggle */}
        {!sent && (
          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.83rem', color: '#64748b' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
              style={{ background: 'none', border: 'none', color: '#1F6FEB', fontWeight: 700, cursor: 'pointer', fontSize: '0.83rem' }}
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </div>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: 'none', color: '#475569',
            fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
