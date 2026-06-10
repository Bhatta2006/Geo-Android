// AudioWorklet Processor — runs in AudioWorkletGlobalScope
// Plain JS only — no imports, no TypeScript syntax
//
// Clean Karplus-Strong string synthesis:
//  - Warm bandlimited excitation (multi-pass smoothed noise burst)
//  - One-pole LPF feedback loop with frequency-dependent damping
//  - Smooth pitch bend via sample-accurate delay interpolation (linear interpolation)
//  - Pitch bend smoothing: fast lerp toward target — slides feel live, not laggy
//  - Soft note-on envelope to prevent click on attack
//  - No harsh metallic artifacts

const MAXBUF = 4096  // large enough for lowest notes (~20 Hz @ 44.1 kHz = 2205 samples)

class KarplusStrongProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Active KS voices
    this.voices = new Map()

    // Sympathetic string bank (disabled by default — guitar preset has gain=0)
    this.sympatheticStrings = []
    this.sympatheticGain    = 0.0
    this.scaleDegrees       = []
    this.rootMidi           = 48
    this.sympatheticNeedRebuild = false

    this.port.onmessage = (e) => {
      const d = e.data
      if      (d.type === 'noteOn')               this._noteOn(d)
      else if (d.type === 'noteOff')              this._noteOff(d)
      else if (d.type === 'noteUpdate')           this._noteUpdate(d)
      else if (d.type === 'setGlobalParams')      this._setGlobal(d)
      else if (d.type === 'setInstrumentParams')  this._setInstrumentParams(d)
      else if (d.type === 'setSympatheticParams') this._setSympatheticParams(d)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Note lifecycle
  // ─────────────────────────────────────────────────────────────────

  _noteOn({
    voiceId,
    frequency,
    velocity       = 0.8,
    brightness     = 0.5,
    decay          = 0.992,
    instrumentType = 'guitar',
    jawariAmount   = 0.0,
    jawariThreshold = 0.2,
  }) {
    if (!frequency || frequency <= 0) return

    // Delay length in samples — this is the "string length"
    const N    = sampleRate / frequency
    const Nint = Math.round(N)
    if (Nint < 2 || Nint > MAXBUF - 4) return

    // ── Warm bandlimited noise excitation ──────────────────────────
    // Step 1: fill with white noise shaped by a raised-cosine (Hann) envelope
    // Step 2: apply 3 passes of a two-point averager → very smooth, warm pluck
    // This removes the harsh high-frequency content that causes metallic attack
    const buf = new Float32Array(MAXBUF)
    const gain = velocity * 0.7  // conservative initial amplitude to prevent clipping

    // Raw shaped noise
    for (let i = 0; i < Nint; i++) {
      const env = 0.5 * (1 - Math.cos(2 * Math.PI * i / Nint))  // Hann window
      buf[i] = (Math.random() * 2 - 1) * env * gain
    }

    // Multi-pass smoothing — 3 passes of two-point average
    // Each pass is a one-pole low-pass at Nyquist/2 → removes most aliasing
    for (let pass = 0; pass < 3; pass++) {
      let prev = buf[Nint - 1]  // wrap-around for circularity
      for (let i = 0; i < Nint; i++) {
        const cur  = buf[i]
        buf[i] = (cur + prev) * 0.5
        prev   = cur
      }
    }

    // Compute loop filter coefficient from brightness
    // brightness=0 → warm/dark (high damping), brightness=1 → bright (low damping)
    // Standard KS one-pole LPF: y[n] = g * ((1-b)*x[n] + b*y[n-1])
    // coefficient b controls how quickly HF energy is lost each loop
    const loopCoeff = this._brightnessToCoeff(brightness, frequency)

    this.voices.set(voiceId, {
      buf,
      N,               // float delay length (original, without pitch bend)
      ptr: 0,          // write pointer into circular buffer
      loopGain: decay,
      loopCoeff,       // LPF coefficient (b in the one-pole formula above)
      lastOut: 0,

      // Pitch bend state
      // smoothPitchBend is in CENTS relative to original frequency
      // We smooth it toward targetPitchBendCents per-sample inside process()
      targetPitchBendCents: 0,
      smoothPitchBend: 0,
      pitchBendActive: false,  // set true once first noteUpdate arrives

      // Release state
      releasing: false,
      releaseDecay: 0.9975,

      // Instrument type / jawari
      instrumentType,
      jawariAmount,
      jawariThreshold,

      // Amplitude envelope — short soft-attack to prevent click at onset
      // Rises from 0 to 1 over ~5ms (220 samples @ 44.1kHz)
      ampEnv: 0.0,
      ampAttackRate: 1 / (sampleRate * 0.006),  // fully on in ~6ms
    })

    // Excite sympathetic bank on note strike
    if (this.sympatheticStrings.length > 0 && this.sympatheticGain > 0.001) {
      const excitation = velocity * 0.4
      for (const sym of this.sympatheticStrings) {
        sym.buf[sym.ptr] += excitation * sym.gain * 0.04
      }
    }
  }

  _noteOff({ voiceId }) {
    const v = this.voices.get(voiceId)
    if (v) {
      v.releasing    = true
      v.releaseDecay = 0.9975
    }
  }

  /**
   * pitchBendCents: cents relative to voice's original MIDI note.
   *   0 = no bend, +100 = one semitone up, -100 = one semitone down.
   * keyY: 0–1 vertical → modulates brightness (expression)
   */
  _noteUpdate({ voiceId, pitchBendCents, keyY, instrumentType, jawariAmount, jawariThreshold }) {
    const v = this.voices.get(voiceId)
    if (!v) return

    if (pitchBendCents !== undefined) {
      // Clamp to ±24 semitones (2400 cents) maximum
      v.targetPitchBendCents = Math.max(-2400, Math.min(2400, pitchBendCents))
      v.pitchBendActive = true
    }
    if (keyY !== undefined) {
      // keyY=1 (top of key, near nut) → brighter tone
      // keyY=0 (bottom of key, near soundhole) → warmer, darker tone
      // Keep within a warm range (0.2 to 0.70) to avoid harshness at extremes
      const targetBrightness = 0.20 + Math.max(0, Math.min(1, keyY)) * 0.50
      v.loopCoeff = this._brightnessToCoeff(targetBrightness, sampleRate / v.N)
    }
    if (instrumentType  !== undefined) v.instrumentType  = instrumentType
    if (jawariAmount    !== undefined) v.jawariAmount    = jawariAmount
    if (jawariThreshold !== undefined) v.jawariThreshold = jawariThreshold
  }

  _setGlobal({ decay, brightness }) {
    for (const v of this.voices.values()) {
      if (!v.releasing) {
        if (decay      !== undefined) v.loopGain  = decay
        if (brightness !== undefined) {
          const freq = sampleRate / v.N
          v.loopCoeff = this._brightnessToCoeff(brightness, freq)
        }
      }
    }
  }

  _setInstrumentParams({ instrumentType, jawariAmount, jawariThreshold }) {
    for (const v of this.voices.values()) {
      if (instrumentType  !== undefined) v.instrumentType  = instrumentType
      if (jawariAmount    !== undefined) v.jawariAmount    = jawariAmount
      if (jawariThreshold !== undefined) v.jawariThreshold = jawariThreshold
    }
  }

  _setSympatheticParams({ scaleDegrees, rootMidi, sympatheticGain, sympatheticDecay }) {
    if (scaleDegrees    !== undefined) this.scaleDegrees = scaleDegrees
    if (rootMidi        !== undefined) this.rootMidi     = rootMidi
    if (sympatheticGain !== undefined) this.sympatheticGain = sympatheticGain
    if (sympatheticDecay !== undefined) {
      for (const sym of this.sympatheticStrings) sym.decay = sympatheticDecay
    }
    this.sympatheticNeedRebuild = true
  }

  // ─────────────────────────────────────────────────────────────────
  //  Brightness → one-pole LPF coefficient
  //  Maps user-facing "brightness" (0=dark, 1=bright) to the
  //  feedback coefficient b in: y = g * ((1-b)*x + b*y_prev)
  //  At low frequencies the string needs more HF damping to sound right.
  // ─────────────────────────────────────────────────────────────────
  _brightnessToCoeff(brightness, frequency) {
    // Base coefficient: brightness=0 → b=0.85 (dark), brightness=1 → b=0.45 (bright)
    const base = 0.85 - brightness * 0.40

    // Frequency correction: lower strings need more HF damping
    // A string at 82 Hz (E2) should sound warmer than 1318 Hz (E6)
    const freqFactor = Math.max(0, Math.min(0.12, (400 - frequency) / 4000))
    return Math.max(0.1, Math.min(0.92, base + freqFactor))
  }

  // ─────────────────────────────────────────────────────────────────
  //  Jawari (bridge-buzz) nonlinear effect — veena/sitar only
  // ─────────────────────────────────────────────────────────────────
  _jawari(sample, amount, threshold) {
    const absVal = Math.abs(sample)
    if (absVal > threshold) {
      const excess = absVal - threshold
      const buzz   = Math.sin(excess * 60) * excess * amount
      return sample + buzz * Math.sign(sample)
    }
    return sample
  }

  // ─────────────────────────────────────────────────────────────────
  //  Sympathetic resonator bank
  // ─────────────────────────────────────────────────────────────────
  _rebuildSympatheticBank() {
    this.sympatheticStrings = []
    this.sympatheticNeedRebuild = false

    if (!this.scaleDegrees || this.scaleDegrees.length === 0) return
    if (this.sympatheticGain <= 0.001) return

    for (const degree of this.scaleDegrees) {
      for (let oct = 0; oct < 2; oct++) {
        const midi  = this.rootMidi + degree + oct * 12
        const freq  = 440 * Math.pow(2, (midi - 69) / 12)
        if (freq <= 0 || freq > 8000) continue

        const length  = sampleRate / freq
        const bufSize = Math.ceil(length) + 4
        this.sympatheticStrings.push({
          buf:    new Float32Array(bufSize),
          ptr:    0,
          length: length,
          gain:   0.12,
          decay:  0.9985,
        })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Main DSP loop
  // ─────────────────────────────────────────────────────────────────
  process(_inputs, outputs) {
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1]
    if (!outL) return true

    const len = outL.length

    if (this.sympatheticNeedRebuild) this._rebuildSympatheticBank()

    // Clear outputs
    outL.fill(0)
    if (outR) outR.fill(0)

    // ── Process each KS voice ────────────────────────────────────────
    for (const [id, v] of this.voices) {

      // Per-sample pitch bend smoothing
      // Use a fast lerp rate so slides feel live:
      // ~15% per sample when pitch bend is active → reaches target in ~20 samples (~0.5ms)
      // This is fast enough to feel like a continuous slide, slow enough to avoid clicks
      const bendLerpRate = v.pitchBendActive ? 0.15 : 1.0

      for (let i = 0; i < len; i++) {
        // ── Smooth pitch bend ──────────────────────────────────────
        v.smoothPitchBend += (v.targetPitchBendCents - v.smoothPitchBend) * bendLerpRate

        // Effective delay length = original / frequency ratio from bend
        // pitchBendCents: +100 = up one semitone → shorter delay = higher pitch
        const bendRatio = Math.pow(2, v.smoothPitchBend / 1200)
        const D = Math.max(2, Math.min(MAXBUF - 2, v.N / bendRatio))

        // ── Linear interpolated delay read ────────────────────────
        // More efficient than Lagrange for real-time slides, and sounds identical
        // to the ear during continuous pitch glide
        const Dint = Math.floor(D)
        const frac = D - Dint

        const r0 = (v.ptr - Dint     + MAXBUF) % MAXBUF
        const r1 = (v.ptr - Dint - 1 + MAXBUF) % MAXBUF

        const x = v.buf[r0] + frac * (v.buf[r1] - v.buf[r0])

        // ── Jawari (veena/sitar buzz) ──────────────────────────────
        let loopIn = x
        if (v.instrumentType === 'veena_sitar') {
          loopIn = this._jawari(x, v.jawariAmount ?? 0.0, v.jawariThreshold ?? 0.2)
        }

        // ── One-pole LPF loop filter ───────────────────────────────
        // y[n] = loopGain * ((1 - b) * x[n] + b * y[n-1])
        // b = loopCoeff controls warmth/brightness of string decay
        const y = v.loopGain * ((1 - v.loopCoeff) * loopIn + v.loopCoeff * v.lastOut)
        v.lastOut = y

        // Write filtered output back into delay line
        v.buf[v.ptr] = y
        v.ptr = (v.ptr + 1) % MAXBUF

        // ── Soft amplitude attack (prevents click on note-on) ──────
        if (v.ampEnv < 1.0) {
          v.ampEnv = Math.min(1.0, v.ampEnv + v.ampAttackRate)
        }

        // Output: use filtered signal (y) for a warmer, smoother sound
        // Slightly scale L/R differently for stereo width
        const amp = y * v.ampEnv * 0.65
        outL[i] += amp
        if (outR) outR[i] += amp * 0.98
      }

      // Release ramp — applied per-block (not per-sample) for efficiency
      if (v.releasing) {
        v.loopGain *= Math.pow(v.releaseDecay, len)
        if (v.loopGain < 0.0001) {
          this.voices.delete(id)
          continue
        }
      }

      // Silence cleanup
      if (Math.abs(v.lastOut) < 5e-8 && !v.releasing) {
        this.voices.delete(id)
      }
    }

    // ── Sympathetic Resonator Bank ────────────────────────────────
    if (this.sympatheticStrings.length > 0 && this.sympatheticGain > 0.001) {
      for (let i = 0; i < len; i++) {
        let symSum = 0.0

        for (const sym of this.sympatheticStrings) {
          const bufLen  = sym.buf.length
          const readPtr = (sym.ptr - Math.floor(sym.length) + bufLen) % bufLen
          const sample  = sym.buf[readPtr]

          // Simple two-point averaged loop filter
          const filtered = sym.decay * (sample + sym.buf[(readPtr + 1) % bufLen]) * 0.5

          sym.buf[sym.ptr] = filtered
          sym.ptr = (sym.ptr + 1) % bufLen

          symSum += sample * sym.gain
        }

        const symMix = symSum * this.sympatheticGain
        outL[i] += symMix
        if (outR) outR[i] += symMix
      }
    }

    return true
  }
}

registerProcessor('karplus-strong', KarplusStrongProcessor)
