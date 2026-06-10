// AudioWorklet Processor — runs in AudioWorkletGlobalScope
// Plain JS only — no imports, no TypeScript syntax

class KarplusStrongProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.voices = new Map()
    this.port.onmessage = (e) => {
      const d = e.data
      if (d.type === 'noteOn')          this._noteOn(d)
      if (d.type === 'noteOff')         this._noteOff(d)
      if (d.type === 'noteUpdate')      this._noteUpdate(d)
      if (d.type === 'setGlobalParams') this._setGlobal(d)
    }
  }

  _noteOn({ voiceId, frequency, velocity, brightness = 0.5, decay = 0.992 }) {
    if (!frequency || frequency <= 0) return

    // Use a large fixed-size ring buffer for pitch-bending headroom
    const MAXBUF = 2048
    const N = sampleRate / frequency   // floating-point delay length
    const Nint = Math.round(N)
    if (Nint < 2 || Nint > MAXBUF) return

    // Pre-fill with half-sine shaped noise (pluck excitation)
    const buf = new Float32Array(MAXBUF)
    for (let i = 0; i < Nint; i++) {
      const env = Math.sin(Math.PI * i / Nint)
      buf[i] = (Math.random() * 2 - 1) * velocity * env
    }

    this.voices.set(voiceId, {
      buf,
      MAXBUF,
      // Floating-point delay length (updated in real time for pitch bend)
      delayLength: N,
      ptr: 0,
      loopGain: decay,
      brightness,
      lastOut: 0,
      releasing: false,
      releaseDecay: 0.9995,
      basePitchBendCents: 0,
    })
  }

  _noteOff({ voiceId }) {
    const v = this.voices.get(voiceId)
    if (v) {
      v.releasing = true
      v.releaseDecay = 0.997
    }
  }

  /**
   * Real-time pitch bend via fractional delay length adjustment.
   * pitchBendCents: deviation in cents from the voice's original MIDI note.
   * keyY: 0–1 vertical position, maps to brightness (expression).
   */
  _noteUpdate({ voiceId, pitchBendCents, keyY }) {
    const v = this.voices.get(voiceId)
    if (!v) return

    // Store bend; the process() loop applies it per-block via delay length
    if (pitchBendCents !== undefined) {
      v.basePitchBendCents = pitchBendCents
    }
    if (keyY !== undefined) {
      // Vertical position modulates brightness (timbre expression)
      v.brightness = 0.1 + Math.max(0, Math.min(1, keyY)) * 0.65
    }
  }

  _setGlobal({ decay, brightness }) {
    for (const v of this.voices.values()) {
      if (!v.releasing) {
        if (decay !== undefined)      v.loopGain = decay
        if (brightness !== undefined) v.brightness = brightness
      }
    }
  }

  process(_inputs, outputs) {
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1]
    if (!outL) return true

    for (const [id, v] of this.voices) {
      const len = outL.length

      // Compute effective delay length from stored pitch bend (applied per block)
      // bendRatio = 2^(cents/1200)
      const bendRatio = Math.pow(2, (v.basePitchBendCents ?? 0) / 1200)
      // Clamp delay to valid range
      const rawDelay = v.delayLength / bendRatio
      const D = Math.max(2, Math.min(v.MAXBUF - 2, rawDelay))
      const Dint = Math.floor(D)
      const frac = D - Dint   // fractional part for Lagrange interpolation

      for (let i = 0; i < len; i++) {
        // ── Read with 3rd-order Lagrange fractional delay ──────────────────
        //    Prevents the stepped-pitch artifacts you'd get with integer-only delays.
        const r0 = (v.ptr - Dint - 0 + v.MAXBUF) % v.MAXBUF
        const r1 = (v.ptr - Dint - 1 + v.MAXBUF) % v.MAXBUF
        const r2 = (v.ptr - Dint + 1 + v.MAXBUF) % v.MAXBUF
        const r3 = (v.ptr - Dint - 2 + v.MAXBUF) % v.MAXBUF

        const d = frac
        const c0 = (-d * (d - 1) * (d - 2)) / 6
        const c1 = ((d + 1) * (d - 1) * (d - 2)) / 2
        const c2 = (-(d + 1) * d * (d - 2)) / 2
        const c3 = ((d + 1) * d * (d - 1)) / 6

        const x = v.buf[r1] * c0 + v.buf[r0] * c1 + v.buf[r2] * c2 + v.buf[r3] * c3

        // ── One-pole low-pass loop filter (Karplus-Strong sustain) ─────────
        const y = v.loopGain * ((1 - v.brightness) * x + v.brightness * v.lastOut)
        v.lastOut = y

        // Write back — integer write pointer advances by 1 per sample
        v.buf[v.ptr] = y
        v.ptr = (v.ptr + 1) % v.MAXBUF

        const amp = x * 0.5
        outL[i] += amp
        if (outR) outR[i] += amp
      }

      // Release: accelerate decay
      if (v.releasing) {
        v.loopGain *= v.releaseDecay
        if (v.loopGain < 0.0001) {
          this.voices.delete(id)
          continue
        }
      }

      // Auto-cleanup when energy is exhausted
      if (Math.abs(v.lastOut) < 1e-7 && !v.releasing) {
        this.voices.delete(id)
      }
    }

    return true
  }
}

registerProcessor('karplus-strong', KarplusStrongProcessor)
