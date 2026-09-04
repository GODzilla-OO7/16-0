import { useState, useEffect, useRef } from 'react'
import { startMusic, stopMusic, setMusicVolume, isMusicPlaying } from '../utils/audioEngine.js'

const VOLUME_KEY = 'cricket-music-volume'
const MUTED_KEY  = 'cricket-music-muted'

export default function MusicPlayer() {
  const [open,   setOpen]   = useState(false)
  const [muted,  setMuted]  = useState(() => localStorage.getItem(MUTED_KEY) === 'true')
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY))
    return isNaN(saved) ? 0.45 : saved
  })
  const [started, setStarted] = useState(false)
  const panelRef = useRef(null)

  // Start music on first real user interaction (browser requirement)
  useEffect(() => {
    function onFirst() {
      if (!started && !muted) {
        startMusic(volume)
        setStarted(true)
      } else if (!started) {
        setStarted(true) // started (but in muted state, don't play)
      }
      window.removeEventListener('click', onFirst)
      window.removeEventListener('keydown', onFirst)
    }
    window.addEventListener('click', onFirst)
    window.addEventListener('keydown', onFirst)
    return () => {
      window.removeEventListener('click', onFirst)
      window.removeEventListener('keydown', onFirst)
    }
  }, [started, muted, volume])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    localStorage.setItem(MUTED_KEY, String(next))
    if (next) {
      stopMusic()
    } else {
      startMusic(volume)
    }
  }

  function handleVolume(e) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    localStorage.setItem(VOLUME_KEY, String(v))
    if (muted && v > 0) {
      setMuted(false)
      localStorage.setItem(MUTED_KEY, 'false')
      if (!isMusicPlaying()) startMusic(v)
    }
    setMusicVolume(v)
  }

  const icon = muted || volume === 0 ? '🔇' : volume < 0.3 ? '🔈' : '🔊'

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', bottom: '1.25rem', right: '1.25rem',
        zIndex: 8000,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem',
      }}
    >
      {/* Expanded panel */}
      {open && (
        <div style={{
          background: 'rgba(10,13,22,0.95)',
          border: '1px solid rgba(200,16,46,0.45)',
          borderRadius: '0.875rem',
          padding: '0.875rem 1rem',
          display: 'flex', flexDirection: 'column', gap: '0.6rem',
          minWidth: 180,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'fade-in-up 0.15s ease both',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            🎵 Music
          </div>
          {/* Volume row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', minWidth: 18 }}>{icon}</span>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolume}
              style={{
                flex: 1, height: 4, cursor: 'pointer',
                accentColor: '#C8102E',
              }}
            />
          </div>
          {/* Play/stop row */}
          <button
            onClick={toggleMute}
            style={{
              padding: '0.4rem 0.75rem',
              background: muted ? 'rgba(200,16,46,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${muted ? 'rgba(200,16,46,0.45)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '0.5rem',
              color: muted ? '#C8102E' : '#94a3b8',
              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            {muted ? '▶ Play music' : '⏹ Stop music'}
          </button>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={muted ? 'Music off — click to open controls' : 'Music on — click to open controls'}
        style={{
          width: 40, height: 40, borderRadius: '50%',
          background: muted
            ? 'rgba(10,13,22,0.92)'
            : 'rgba(200,16,46,0.80)',
          border: `1.5px solid ${muted ? 'rgba(255,255,255,0.15)' : 'rgba(200,16,46,0.7)'}`,
          boxShadow: muted ? 'none' : '0 4px 16px rgba(200,16,46,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.05rem', cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {icon}
      </button>
    </div>
  )
}
