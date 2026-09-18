let audioCtx = null

function context() {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

export function unlockWaAlertSound() {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

function tone(ctx, start, freq, duration, gain = 0.16) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, start)
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

export function playWaHandoffAlert() {
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t = ctx.currentTime
    tone(ctx, t, 880, 0.16, 0.18)
    tone(ctx, t + 0.18, 1175, 0.22, 0.2)
    tone(ctx, t + 0.44, 880, 0.28, 0.14)
  } catch {
    // Autoplay may be blocked until a click
  }
}
