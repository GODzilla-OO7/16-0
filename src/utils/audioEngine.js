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

    const now = ac.currentTime
    const dur  = 0.45

    // Rising pitch sweep (reel effect)
    const osc   = ac.createOscillator()
    const gain  = ac.createGain()
    osc.connect(gain)
    gain.connect(ac.destination)

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.exponentialRampToValueAtTime(520, now + dur * 0.7)
    osc.frequency.exponentialRampToValueAtTime(340, now + dur)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.03)
    gain.gain.linearRampToValueAtTime(0.08, now + dur * 0.6)
    gain.gain.linearRampToValueAtTime(0, now + dur)

    osc.start(now)
    osc.stop(now + dur)

    // Short tick clicks during spin
    for (let i = 0; i < 6; i++) {
      const t = now + i * (dur / 7)
      const buf = ac.createBuffer(1, ac.sampleRate * 0.015, ac.sampleRate)
      const data = buf.getChannelData(0)
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (data.length * 0.4))
      const src = ac.createBufferSource()
      src.buffer = buf
      const g = ac.createGain()
      g.gain.value = 0.12
      src.connect(g)
      g.connect(ac.destination)
      src.start(t)
    }
  } catch (_) {
    // Silently fail if audio not available
  }
}

// ── Procedural background music ───────────────────────────────────────────────
// 130 BPM, 4/4, 4-bar loop
// Instruments: kick, snare, closed hi-hat, open hi-hat, bass synth, pad stab

const BPM     = 130
const BEAT    = 60 / BPM          // seconds per beat
const BAR     = BEAT * 4          // seconds per bar
const LOOP    = BAR * 4           // 4-bar loop

let musicNodes   = []
let loopTimer    = null
let masterGain   = null
let isPlaying    = false

function noiseBuffer(ac, len = 0.02) {
  const buf  = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function scheduleKick(ac, t, mg) {
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain); gain.connect(mg)
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.25)
  gain.gain.setValueAtTime(0.85, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  osc.start(t); osc.stop(t + 0.4)
}

function scheduleSnare(ac, t, mg) {
  // Tone component
  const osc  = ac.createOscillator()
  const og   = ac.createGain()
  osc.type   = 'triangle'
  osc.connect(og); og.connect(mg)
  osc.frequency.setValueAtTime(220, t)
  og.gain.setValueAtTime(0.35, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  osc.start(t); osc.stop(t + 0.15)
  // Noise component
  const src  = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 0.18)
  const ng   = ac.createGain()
  ng.gain.setValueAtTime(0.38, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  src.connect(ng); ng.connect(mg)
  src.start(t)
}

function scheduleHihat(ac, t, open, mg) {
  const src  = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, open ? 0.12 : 0.025)
  const bpf  = ac.createBiquadFilter()
  bpf.type   = 'bandpass'
  bpf.frequency.value = 8000
  bpf.Q.value = 0.8
  const gain = ac.createGain()
  gain.gain.setValueAtTime(open ? 0.15 : 0.09, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.12 : 0.022))
  src.connect(bpf); bpf.connect(gain); gain.connect(mg)
  src.start(t)
}

function scheduleBass(ac, t, freq, dur, mg) {
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type   = 'sawtooth'
  const lp   = ac.createBiquadFilter()
  lp.type    = 'lowpass'
  lp.frequency.value = 380
  osc.connect(lp); lp.connect(gain); gain.connect(mg)
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.32, t)
  gain.gain.setValueAtTime(0.28, t + dur * 0.7)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.start(t); osc.stop(t + dur + 0.01)
}

function scheduleStab(ac, t, freq, mg) {
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type   = 'square'
  const lp   = ac.createBiquadFilter()
  lp.type    = 'lowpass'
  lp.frequency.value = 1800
  osc.connect(lp); lp.connect(gain); gain.connect(mg)
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.18, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  osc.start(t); osc.stop(t + 0.15)
}

// Bass line: root-fifth-root-fifth pattern in D (D2=73Hz, A2=110Hz)
const BASS_PATTERN = [
  [73,  BEAT * 1.0],
  [110, BEAT * 0.5],
  [73,  BEAT * 0.5],
  [98,  BEAT * 0.5],
  [73,  BEAT * 0.5],
  [110, BEAT * 0.5],
  [87,  BEAT * 0.5],
  [73,  BEAT * 0.5],
  [82,  BEAT * 1.0],
  [110, BEAT * 0.5],
  [73,  BEAT * 0.5],
  [98,  BEAT * 0.5],
  [73,  BEAT * 0.5],
  [110, BEAT * 0.5],
  [73,  BEAT * 0.5],
  [65,  BEAT * 0.5],
]

function scheduleLoop(ac, startTime, mg) {
  const t0 = startTime

  for (let bar = 0; bar < 4; bar++) {
    const b = t0 + bar * BAR
    const isLast = bar === 3

    // Kick: beats 1 + 3 every bar, plus extra on beat 4.5 in last bar
    scheduleKick(ac, b, mg)
    scheduleKick(ac, b + BEAT * 2, mg)
    if (isLast) scheduleKick(ac, b + BEAT * 3.5, mg)

    // Snare: beats 2 + 4
    scheduleSnare(ac, b + BEAT, mg)
    scheduleSnare(ac, b + BEAT * 3, mg)

    // Hi-hats: every 8th note; open on beat 2.5
    for (let i = 0; i < 8; i++) {
      const isOpen = i === 5
      scheduleHihat(ac, b + i * BEAT * 0.5, isOpen, mg)
    }

    // Synth stabs: beat 1 of bars 1 and 3
    if (bar === 0 || bar === 2) {
      scheduleStab(ac, b, 293.66, mg)           // D4
      scheduleStab(ac, b + BEAT * 0.5, 220, mg) // A3
    }
    if (bar === 1 || bar === 3) {
      scheduleStab(ac, b, 261.63, mg)            // C4
      scheduleStab(ac, b + BEAT * 0.5, 196, mg)  // G3
    }
  }

  // Bass line across full loop
  let cursor = t0
  for (const [freq, dur] of BASS_PATTERN) {
    scheduleBass(ac, cursor, freq, dur, mg)
    cursor += dur
  }
}

export function startMusic(volume = 0.45) {
  if (isPlaying) return
  try {
    const ac = getAudioContext()
    if (ac.state === 'suspended') ac.resume()

    masterGain = ac.createGain()
    masterGain.gain.value = volume
    masterGain.connect(ac.destination)

    isPlaying = true

    function scheduleNext() {
      if (!isPlaying) return
      const now  = ac.currentTime
      const when = now + 0.05   // 50ms lookahead
      scheduleLoop(ac, when, masterGain)
      loopTimer = setTimeout(scheduleNext, (LOOP - 0.1) * 1000)
    }
    scheduleNext()
  } catch (_) {}
}

export function stopMusic() {
  isPlaying = false
  clearTimeout(loopTimer)
  if (masterGain) {
    try {
      masterGain.gain.setValueAtTime(masterGain.gain.value, getAudioContext().currentTime)
      masterGain.gain.linearRampToValueAtTime(0, getAudioContext().currentTime + 0.3)
      setTimeout(() => { try { masterGain.disconnect() } catch (_) {} masterGain = null }, 400)
    } catch (_) {}
  }
}

export function setMusicVolume(v) {
  if (masterGain) {
    try { masterGain.gain.setTargetAtTime(v, getAudioContext().currentTime, 0.05) } catch (_) {}
  }
}

export function isMusicPlaying() { return isPlaying }
