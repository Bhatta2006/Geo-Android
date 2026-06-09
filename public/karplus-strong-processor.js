// AudioWorklet Processor — runs in AudioWorkletGlobalScope
// Plain JS only — no imports, no TypeScript syntax

class KarplusStrongProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.voices = new Map()
    this.port.onmessage = (e) => {
      const d = e.data
      if (d.type === 'noteOn')   this._noteOn(d)
      if (d.type === 'noteOff')  this._noteOff(d)
      if (d.type === 'noteUpdate') this._noteUpdate(d)
      if (d.type === 'setGlobalParams') this._setGlobal(d)
    }
  }

  _noteOn({ voiceId, frequency, velocity, brightness = 0.5, decay = 0.992 }) {
    if (!frequency || frequency <= 0) return

    // Integer delay length — keeps the math correct and simple
    const N = Math.round(sampleRate / frequency)
    if (N < 2 || N > 44100) return

    // Ring buffer of exactly N samples, pre-filled with shaped noise
    const buf = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      // Half-sine envelope weights the pluck position naturally
      const env = Math.sin(Math.PI * i / N)
      buf[i] = (Math.random() * 2 - 1) * velocity * env
    }

    this.voices.set(voiceId, {
      buf,
      N,
      ptr: 0,          // write pointer — also the read pointer (same in KS)
      loopGain: decay,
      brightness,
      lastOut: 0,
      releasing: false,
      releaseDecay: 0.9995,
    })
  }

  _noteOff({ voiceId }) {
    const v = this.voices.get(voiceId)
    if (v) {
      v.releasing = true
      v.releaseDecay = 0.997   // accelerate decay on release
    }
  }

  _noteUpdate({ voiceId, keyY }) {
    const v = this.voices.get(voiceId)
    if (v && keyY !== undefined) {
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
      const { buf, N } = v
      const len = outL.length

      for (let i = 0; i < len; i++) {
        //  ╔══════════════════════════════════════════════╗
        //  ║  KARPLUS-STRONG CORE (integer delay)         ║
        //  ║  ptr is both read AND write pointer.         ║
        //  ║  buf[ptr] holds the sample N steps ago.      ║
        //  ╚══════════════════════════════════════════════╝

        const x = buf[v.ptr]                                // read oldest sample

        // One-pole low-pass loop filter
        // Higher brightness → more HF energy preserved → brighter string
        const y = v.loopGain * ((1 - v.brightness) * x + v.brightness * v.lastOut)
        v.lastOut = y

        buf[v.ptr] = y                                      // write filtered back
        v.ptr = (v.ptr + 1) % N                             // advance ring pointer

        const amp = x * 0.5                                  // the OUTPUT is the sample before filtering
        outL[i] += amp
        if (outR) outR[i] += amp
      }

      // Apply release decay multiplier to loopGain on every block
      if (v.releasing) {
        v.loopGain *= v.releaseDecay
        if (v.loopGain < 0.0001) {
          this.voices.delete(id)
        }
      }

      // Auto-cleanup when energy drops to nothing
      if (Math.abs(v.lastOut) < 1e-7 && !v.releasing) {
        // Natural decay complete
        this.voices.delete(id)
      }
    }

    return true
  }
}

registerProcessor('karplus-strong', KarplusStrongProcessor)
