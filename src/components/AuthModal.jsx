import { useState } from 'react'
import { getSupabase } from '../lib/supabase'

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [sent, setSent]       = useState(false)       // for email confirmation

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const sb = await getSupabase()
    if (!sb) { setError('Auth not available. Please try again.'); setLoading(false); return }

    if (mode === 'signup') {
      const { error } = await sb.auth.signUp({ email, password })
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
    background: '#0a0a0f', border: '1px solid #2a2a3a',
    borderRadius: '0.5rem', color: '#f1f5f9',
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
        background: '#12121a', border: '1px solid #2a2a3a',
        borderRadius: '1.25rem', padding: '2rem',
        width: '100%', maxWidth: 380,
        animation: 'fade-in-up 0.25s ease both',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏏</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f1f5f9' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
            {mode === 'signin' ? 'Sign in to save your stats online' : 'Save your stats and compete on leaderboards'}
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📧</div>
            <div style={{ fontWeight: 800, color: '#22c55e', marginBottom: '0.5rem' }}>Check your email</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
              We sent a confirmation link to <strong style={{ color: '#f1f5f9' }}>{email}</strong>. Click it to activate your account, then come back and sign in.
            </div>
            <button
              onClick={() => { setMode('signin'); setSent(false) }}
              style={{ marginTop: '1.25rem', padding: '0.75rem 1.5rem', background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: '0.5rem', color: '#f1f5f9', cursor: 'pointer', fontWeight: 700 }}
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
                onFocus={e => e.target.style.borderColor = '#22c55e'}
                onBlur={e => e.target.style.borderColor = '#2a2a3a'}
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
                onFocus={e => e.target.style.borderColor = '#22c55e'}
                onBlur={e => e.target.style.borderColor = '#2a2a3a'}
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
                background: loading ? '#1a2e1a' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: loading ? '#64748b' : '#0a0a0f',
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
              style={{ background: 'none', border: 'none', color: '#22c55e', fontWeight: 700, cursor: 'pointer', fontSize: '0.83rem' }}
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
