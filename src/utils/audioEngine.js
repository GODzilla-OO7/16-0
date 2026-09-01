/**
 * Shared Web Audio context + spin sound.
 * Music is generated procedurally — no file downloads needed.
 */

let ctx = null

export function getAudioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

// ── Spin reel sound ────────────────────────────────────────────────────────────

export function playSpinSound() {
  try {
    const ac = getAudioContext()
    if (ac.state === 'suspended') ac.resume()

    const now    = ac.currentTime
    const clicks = 28
    const dur    = 0.72

    for (let i = 0; i < clicks; i++) {
      // Clicks start slow then rapidly bunch up — like a wheel gaining speed
      const t = now + dur * Math.pow(i / clicks, 0.55)

      // Very short impulsive noise burst (8 ms) — mechanical click character
      const bufLen = Math.ceil(ac.sampleRate * 0.008)
      const buf    = ac.createBuffer(1, bufLen, ac.sampleRate)
      const data   = buf.getChannelData(0)
      for (let j = 0; j < bufLen; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.18))
      }

      const src = ac.createBufferSource()
      src.buffer = buf

      // Bandpass filter → plastic/metal click tone
      const bpf           = ac.createBiquadFilter()
      bpf.type            = 'bandpass'
      bpf.frequency.value = 1400 + (i % 4) * 180  // slight variation per click
      bpf.Q.value         = 2.5

      const g       = ac.createGain()
      g.gain.value  = 0.52

      src.connect(bpf); bpf.connect(g); g.connect(ac.destination)
      src.start(t)
    }
  } catch (_) {
    // Silently fail if audio not available
  }
}

// ── Scroller tick — one sharp click per team shown during spin ────────────────

export function playTickClick() {
  try {
    const ac = getAudioContext()
    if (ac.state === 'suspended') ac.resume()
    const now = ac.currentTime

    // Hard transient: very short noise burst + high-pitched tone = satisfying clicker
    const bufLen = Math.ceil(ac.sampleRate * 0.006)
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate)
    const data   = buf.getChannelData(0)
    for (let j = 0; j < bufLen; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.12))
    }
    const src = ac.createBufferSource()
    src.buffer = buf

    const hpf = ac.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 2200

    const g = ac.createGain()
    g.gain.value = 0.7

    src.connect(hpf); hpf.connect(g); g.connect(ac.destination)
    src.start(now)
  } catch (_) {}
}

// ── Background music — MP3 file, looping ─────────────────────────────────────

let musicAudio  = null
let isPlaying   = false

export function startMusic(volume = 0.45) {
  if (isPlaying) return
  try {
    if (!musicAudio) {
      musicAudio      = new Audio('/bg-music.mp3')
      musicAudio.loop = true
    }
    musicAudio.volume = volume
    musicAudio.play().catch(() => {})
    isPlaying = true
  } catch (_) {}
}

export function stopMusic() {
  isPlaying = false
  if (musicAudio) {
    musicAudio.pause()
    musicAudio.currentTime = 0
  }
}

export function setMusicVolume(v) {
  if (musicAudio) musicAudio.volume = v
}

export function isMusicPlaying() { return isPlaying }

// ── Button click — bat-on-ball sound ──────────────────────────────────────────
let btnAudio = null
export function playBtnClick() {
  try {
    if (!btnAudio) { btnAudio = new Audio('/btn-click.mp3') }
    btnAudio.currentTime = 0
    btnAudio.volume = 0.55
    btnAudio.play().catch(() => {})
  } catch (_) {}
}
