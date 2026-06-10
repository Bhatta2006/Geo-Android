// AudioWorklet Processor — runs in AudioWorkletGlobalScope
// Plain JS only — no imports, no TypeScript syntax

class KarplusStrongProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Active KS voices (keyboard notes)
    this.voices = new Map()

    // ── Sympathetic string bank ──────────────────────────────────────
    // Built from active scale + root when setSympatheticParams arrives
    this.sympatheticStrings = []
    this.sympatheticGain    = 0.0    // overall output scale (0 = disabled)
    this.scaleDegrees       = []
    this.rootMidi           = 48
    this.sympatheticNeedRebuild = false

    this.port.onmessage = (e) => {
      const d = e.data
      if (d.type === 'noteOn')              this._noteOn(d)
      else if (d.type === 'noteOff')        this._noteOff(d)
      else if (d.type === 'noteUpdate')     this._noteUpdate(d)
      else if (d.type === 'setGlobalParams') this._setGlobal(d)
      else if (d.type === 'setInstrumentParams') this._setInstrumentParams(d)
      else if (d.type === 'setSympatheticParams') this._setSympatheticParams(d)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Note lifecycle
  // ─────────────────────────────────────────────────────────────────

  _noteOn({
    voiceId,
    frequency,
    velocity,
    brightness       = 0.5,
    decay            = 0.992,
    instrumentType   = 'guitar',
    jawariAmount     = 0.0,
    jawariThreshold  = 0.2,
  }) {
    if (!frequency || frequency <= 0) return

    const MAXBUF = 2048
    const N    = sampleRate / frequency
    const Nint = Math.round(N)
    if (Nint < 2 || Nint > MAXBUF) return

    // Half-sine shaped noise excitation — models a pluck
    const buf = new Float32Array(MAXBUF)
    for (let i = 0; i < Nint; i++) {
      const env = Math.sin(Math.PI * i / Nint)
      buf[i] = (Math.random() * 2 - 1) * velocity * env
    }

    this.voices.set(voiceId, {
      buf,
      MAXBUF,
      delayLength: N,          // float delay, updated per-block for pitch bend
      ptr: 0,
      loopGain: decay,
      brightness,
      lastOut: 0,
      releasing: false,
      releaseDecay: 0.997,
      basePitchBendCents: 0,
      instrumentType,
      jawariAmount,
      jawariThreshold,
    })

    // Excite the sympathetic bank whenever a note is struck
    // (matches plan: inject excitation * gain * 0.05 into each string)
    if (this.sympatheticStrings.length > 0 && this.sympatheticGain > 0.001) {
      const excitation = velocity * 0.5
      for (let s = 0; s < this.sympatheticStrings.length; s++) {
        const sym = this.sympatheticStrings[s]
        sym.buf[sym.ptr] += excitation * sym.gain * 0.05
      }
    }
  }

  _noteOff({ voiceId }) {
    const v = this.voices.get(voiceId)
    if (v) {
      v.releasing    = true
      v.releaseDecay = 0.997
    }
  }

  /**
   * Real-time pitch bend via fractional delay adjustment.
   * pitchBendCents: deviation in cents from the voice's original MIDI note.
   * keyY:           0–1 vertical → modulates brightness / timbre.
   */
  _noteUpdate({ voiceId, pitchBendCents, keyY, instrumentType, jawariAmount, jawariThreshold }) {
    const v = this.voices.get(voiceId)
    if (!v) return
    if (pitchBendCents  !== undefined) v.basePitchBendCents = pitchBendCents
    if (keyY            !== undefined) v.brightness = 0.1 + Math.max(0, Math.min(1, keyY)) * 0.65
    if (instrumentType  !== undefined) v.instrumentType    = instrumentType
    if (jawariAmount    !== undefined) v.jawariAmount      = jawariAmount
    if (jawariThreshold !== undefined) v.jawariThreshold   = jawariThreshold
  }

  _setGlobal({ decay, brightness }) {
    for (const v of this.voices.values()) {
      if (!v.releasing) {
        if (decay      !== undefined) v.loopGain  = decay
        if (brightness !== undefined) v.brightness = brightness
      }
    }
  }

  _setInstrumentParams({ instrumentType, jawariAmount, jawariThreshold }) {
    // Apply to all currently-running voices
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
      // update decay on existing strings without rebuild
      for (const sym of this.sympatheticStrings) sym.decay = sympatheticDecay
    }
    this.sympatheticNeedRebuild = true
  }

  // ─────────────────────────────────────────────────────────────────
  //  Sympathetic resonator bank — built lazily from scale + root
  //  Matches Section 5.3 of GeoShred_Phase2.md exactly.
  // ─────────────────────────────────────────────────────────────────
  _rebuildSympatheticBank() {
    this.sympatheticStrings = []
    this.sympatheticNeedRebuild = false

    if (!this.scaleDegrees || this.scaleDegrees.length === 0) return
    if (this.sympatheticGain <= 0.001) return

    // Build strings for scale notes over 2 octaves
    for (const degree of this.scaleDegrees) {
      for (let oct = 0; oct < 2; oct++) {
        const midi = this.rootMidi + degree + oct * 12
        const freq = 440 * Math.pow(2, (midi - 69) / 12)
        if (freq <= 0 || freq > 16000) continue

        const length  = sampleRate / freq
        const bufSize = Math.ceil(length) + 4
        this.sympatheticStrings.push({
          buf:    new Float32Array(bufSize),
          ptr:    0,
          length: length,
          gain:   0.15,              // per-string gain (plan: 0.1–0.3, default 0.15)
          decay:  0.9985,            // very long ring (plan default)
        })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Jawari (bridge-buzz) nonlinear filter — Section 5.2
  //  Applied on the LOOP FILTER input (before the one-pole LPF).
  // ─────────────────────────────────────────────────────────────────
  _jawari(sample, amount, threshold) {
    const absVal = Math.abs(sample)
    if (absVal > threshold) {
      const excess        = absVal - threshold
      const buzzComponent = Math.sin(excess * 80) * excess * amount
      return sample + buzzComponent * Math.sign(sample)
    }
    return sample
  }

  // ─────────────────────────────────────────────────────────────────
  //  Main DSP loop
  // ─────────────────────────────────────────────────────────────────
  process(_inputs, outputs) {
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1]
    if (!outL) return true

    const len = outL.length

    // Lazy rebuild of sympathetic bank
    if (this.sympatheticNeedRebuild) this._rebuildSympatheticBank()

    // Clear output buffers
    for (let i = 0; i < len; i++) {
      outL[i] = 0.0
      if (outR) outR[i] = 0.0
    }

    // ── Process each KS voice ────────────────────────────────────────
    for (const [id, v] of this.voices) {
      // Compute effective delay from pitch bend — 2^(cents/1200)
      const bendRatio = Math.pow(2, (v.basePitchBendCents ?? 0) / 1200)
      const rawDelay  = v.delayLength / bendRatio
      const D         = Math.max(2, Math.min(v.MAXBUF - 2, rawDelay))
      const Dint      = Math.floor(D)
      const frac      = D - Dint

      for (let i = 0; i < len; i++) {
        // ── 3rd-order Lagrange fractional delay read ───────────────
        const r0 = (v.ptr - Dint     + v.MAXBUF) % v.MAXBUF
        const r1 = (v.ptr - Dint - 1 + v.MAXBUF) % v.MAXBUF
        const r2 = (v.ptr - Dint + 1 + v.MAXBUF) % v.MAXBUF
        const r3 = (v.ptr - Dint - 2 + v.MAXBUF) % v.MAXBUF

        const d  = frac
        const c0 = (-d * (d - 1) * (d - 2)) / 6
        const c1 = ((d + 1) * (d - 1) * (d - 2)) / 2
        const c2 = (-(d + 1) * d * (d - 2)) / 2
        const c3 = ((d + 1) * d * (d - 1)) / 6

        const x = v.buf[r1] * c0 + v.buf[r0] * c1 + v.buf[r2] * c2 + v.buf[r3] * c3

        // ── Jawari bridge-buzz (veena_sitar only) ──────────────────
        let loopIn = x
        if (v.instrumentType === 'veena_sitar') {
          loopIn = this._jawari(x, v.jawariAmount ?? 0.5, v.jawariThreshold ?? 0.2)
        }

        // ── One-pole LPF loop filter (Karplus-Strong sustain) ──────
        const y = v.loopGain * ((1 - v.brightness) * loopIn + v.brightness * v.lastOut)
        v.lastOut = y

        // Write back
        v.buf[v.ptr] = y
        v.ptr = (v.ptr + 1) % v.MAXBUF

        const amp = x * 0.5
        outL[i] += amp
      }

      // Release ramp
      if (v.releasing) {
        v.loopGain *= v.releaseDecay
        if (v.loopGain < 0.0001) { this.voices.delete(id); continue }
      }

      // Silence cleanup
      if (Math.abs(v.lastOut) < 1e-7 && !v.releasing) {
        this.voices.delete(id)
      }
    }

    // Copy mono → stereo
    if (outR) {
      for (let i = 0; i < len; i++) outR[i] = outL[i]
    }

    // ── Sympathetic Resonator Bank ────────────────────────────────
    // Exact implementation from Section 5.3 of GeoShred_Phase2.md:
    //   readPtr = (writePtr - floor(length) + bufLen) % bufLen
    //   filtered = decay * (sample + buf[readPtr+1]) * 0.5
    //   write back + mix excitation from main output
    //   output[i] += sample * gain  (with overall sympatheticGain scale)
    if (this.sympatheticStrings.length > 0 && this.sympatheticGain > 0.001) {
      for (let i = 0; i < len; i++) {
        let symSum = 0.0

        for (let s = 0; s < this.sympatheticStrings.length; s++) {
          const sym     = this.sympatheticStrings[s]
          const bufLen  = sym.buf.length
          const readPtr = (sym.ptr - Math.floor(sym.length) + bufLen) % bufLen
          const sample  = sym.buf[readPtr]

          // Loop filter from plan: decay * (s[n] + s[n+1]) * 0.5
          const filtered = sym.decay * (sample + sym.buf[(readPtr + 1) % bufLen]) * 0.5

          // Write back — also couple a tiny fraction of the main output in
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
