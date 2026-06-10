import { useMemo } from 'react'

// The worklet is in /public/karplus-strong-processor.js
// It MUST be served as raw JS — Vite's module bundling breaks AudioWorklet execution.
// Files in /public are served verbatim at the root URL.
const WORKLET_URL = '/karplus-strong-processor.js'

export interface AudioEngine {
  /**
   * Call this SYNCHRONOUSLY from the first pointerdown/touchstart event
   * to unlock the AudioContext within the browser's user-gesture window.
   * Safe to call multiple times (idempotent).
   */
  unlockAudio: () => void
  /**
   * noteOn is now synchronous — queues internally if worklet isn't ready yet.
   */
  noteOn: (
    voiceId: number,
    midiNote: number,
    keyX: number,
    keyY: number,
    keyZ: number,
    options?: { decay?: number; brightness?: number }
  ) => void
  /** pitchBendCents: semitone deviation * 100, relative to the voice's base MIDI note */
  noteUpdate: (voiceId: number, pitchBendCents: number, keyY: number, keyZ: number) => void
  noteOff: (voiceId: number) => void
  setEffectEnabled: (effectId: string, enabled: boolean) => void
  setEffectParam: (effectId: string, param: string, value: number) => void
  setMasterVolume: (volume: number) => void
  setPhysicalModelParams: (params: { stiffness?: number; brightness?: number; decay?: number }) => void
  setVibratoDepth: (depth: number) => void
  setInstrumentParams: (params: { type: string; jawariAmount?: number; jawariThreshold?: number }) => void
  setSympatheticParams: (scaleDegrees: number[], rootMidi: number, gain: number, decay: number) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioEngineImpl — class so the reference is stable across React renders.
// The hook returns the same instance every call, so useMemo([audioEngine])
// never re-fires after the first mount.
// ─────────────────────────────────────────────────────────────────────────────

class AudioEngineImpl implements AudioEngine {
  private ctx: AudioContext | null = null
  private worklet: AudioWorkletNode | null = null
  private workletReady = false
  private loadingWorklet = false
  private masterGain: GainNode | null = null

  // ── Pending state (applied as soon as worklet becomes ready) ────────────
  private pendingNotes: Array<() => void> = []
  private pendingVolume = 0.8
  private physParams = { brightness: 0.5, decay: 0.992 }
  private instParams = { type: 'guitar', jawariAmount: 0.0, jawariThreshold: 0.2 }
  private pendingSympathetic: { scaleDegrees: number[]; rootMidi: number; gain: number; decay: number } | null = null

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: unlockAudio — MUST be called synchronously in a pointer/touch event
  // ─────────────────────────────────────────────────────────────────────────
  unlockAudio(): void {
    if (!this.ctx) {
      console.log('[AudioEngine] Creating AudioContext (first unlock)')
      // Intentionally NOT awaited — just calling the constructor unlocks the context
      // synchronously for modern browsers.
      this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
      console.log('[AudioEngine] AudioContext state after creation:', this.ctx.state)
    }

    // resume() must be called synchronously inside the gesture, NOT after any await
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        console.log('[AudioEngine] AudioContext resumed, state:', this.ctx!.state)
      })
    }

    // Now kick off the async worklet load in the background
    if (!this.loadingWorklet && !this.workletReady) {
      this._loadWorklet()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: async worklet load — runs AFTER the context is already running
  // ─────────────────────────────────────────────────────────────────────────
  private async _loadWorklet(): Promise<void> {
    if (!this.ctx || this.loadingWorklet || this.workletReady) return
    this.loadingWorklet = true

    try {
      console.log('[AudioEngine] Loading AudioWorklet module…')
      await this.ctx.audioWorklet.addModule(WORKLET_URL)
      console.log('[AudioEngine] Worklet module loaded')

      this.worklet = new AudioWorkletNode(this.ctx, 'karplus-strong', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })

      this.worklet.onprocessorerror = (err) => {
        console.error('[AudioEngine] Worklet processor error:', err)
      }

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.pendingVolume, this.ctx.currentTime)

      this.worklet.connect(this.masterGain)
      this.masterGain.connect(this.ctx.destination)

      // Apply any parameters that arrived before the worklet was ready
      this._syncParams()

      this.workletReady = true
      console.log('[AudioEngine] Audio graph connected, worklet ready')

      // Flush queued noteOn events
      const pending = this.pendingNotes.splice(0)
      for (const fn of pending) fn()

    } catch (err) {
      console.error('[AudioEngine] Failed to load worklet:', err)
      this.loadingWorklet = false
    }
  }

  private _syncParams(): void {
    if (!this.worklet) return
    this.worklet.port.postMessage({
      type: 'setGlobalParams',
      brightness: this.physParams.brightness,
      decay: this.physParams.decay,
    })
    this.worklet.port.postMessage({
      type: 'setInstrumentParams',
      instrumentType: this.instParams.type,
      jawariAmount: this.instParams.jawariAmount,
      jawariThreshold: this.instParams.jawariThreshold,
    })
    if (this.pendingSympathetic) {
      const s = this.pendingSympathetic
      this.worklet.port.postMessage({
        type: 'setSympatheticParams',
        scaleDegrees: s.scaleDegrees,
        rootMidi: s.rootMidi,
        sympatheticGain: s.gain,
        sympatheticDecay: s.decay,
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: audio events — synchronous, queue if worklet not ready yet
  // ─────────────────────────────────────────────────────────────────────────
  noteOn(
    voiceId: number,
    midiNote: number,
    _keyX: number,
    _keyY: number,
    _keyZ: number,
    options?: { decay?: number; brightness?: number }
  ): void {
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
    // Use a consistent, warm velocity — not driven by keyY position
    // (keyY varies with where on the key you touch, not how hard — hardware
    //  pressure is unreliable on most devices, so keep it uniform)
    const velocity = 0.82

    const doNoteOn = () => {
      if (!this.worklet) return
      this.worklet.port.postMessage({
        type: 'noteOn',
        voiceId,
        frequency,
        velocity,
        brightness: options?.brightness !== undefined ? options.brightness : this.physParams.brightness,
        decay: options?.decay !== undefined ? options.decay : this.physParams.decay,
        instrumentType: this.instParams.type,
        jawariAmount: this.instParams.jawariAmount,
        jawariThreshold: this.instParams.jawariThreshold,
      })
    }

    if (this.workletReady) {
      doNoteOn()
    } else {
      // Queue for when the worklet finishes loading
      this.pendingNotes.push(doNoteOn)
      // Also ensure audio is unlocked (handles the case where unlockAudio was
      // never explicitly called — e.g. if noteOn fires before the canvas pointerdown)
      if (!this.ctx) this.unlockAudio()
    }
  }

  noteUpdate(voiceId: number, pitchBendCents: number, keyY: number, _keyZ: number): void {
    if (!this.worklet) return
    // Clamp to ±24 semitones (2400 cents) max
    const clampedCents = Math.max(-2400, Math.min(2400, pitchBendCents))
    this.worklet.port.postMessage({
      type: 'noteUpdate',
      voiceId,
      pitchBendCents: clampedCents,
      keyY,
      // Do NOT send instrument params here — only needed on noteOn / setInstrumentParams
      // Sending them on every pointermove causes unnecessary message overhead
    })
  }

  noteOff(voiceId: number): void {
    if (!this.worklet) return
    this.worklet.port.postMessage({ type: 'noteOff', voiceId })
  }

  setEffectEnabled(_effectId: string, _enabled: boolean): void {
    // Stub — add effects chain after base sound works
  }

  setEffectParam(_effectId: string, _param: string, _value: number): void {
    // Stub
  }

  setMasterVolume(volume: number): void {
    this.pendingVolume = volume
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05)
    }
  }

  setPhysicalModelParams(params: { stiffness?: number; brightness?: number; decay?: number }): void {
    if (params.brightness !== undefined) this.physParams.brightness = params.brightness
    if (params.decay !== undefined) this.physParams.decay = params.decay

    if (this.worklet) {
      this.worklet.port.postMessage({
        type: 'setGlobalParams',
        brightness: this.physParams.brightness,
        decay: this.physParams.decay,
      })
    }
  }

  setInstrumentParams(params: { type: string; jawariAmount?: number; jawariThreshold?: number }): void {
    this.instParams.type = params.type
    if (params.jawariAmount !== undefined) this.instParams.jawariAmount = params.jawariAmount
    if (params.jawariThreshold !== undefined) this.instParams.jawariThreshold = params.jawariThreshold

    if (this.worklet) {
      this.worklet.port.postMessage({
        type: 'setInstrumentParams',
        instrumentType: this.instParams.type,
        jawariAmount: this.instParams.jawariAmount,
        jawariThreshold: this.instParams.jawariThreshold,
      })
    }
  }

  setSympatheticParams(scaleDegrees: number[], rootMidi: number, gain: number, decay: number): void {
    this.pendingSympathetic = { scaleDegrees, rootMidi, gain, decay }

    if (this.worklet) {
      this.worklet.port.postMessage({
        type: 'setSympatheticParams',
        scaleDegrees,
        rootMidi,
        sympatheticGain: gain,
        sympatheticDecay: decay,
      })
    }
  }

  setVibratoDepth(_depth: number): void {
    // Stub — add chorus/vibrato after base sound works
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook — always returns the same AudioEngineImpl instance per component tree.
// useMemo with [] ensures the class is created exactly once per mount.
// This means useMemo([audioEngine]) in App.tsx never re-fires unintentionally.
// ─────────────────────────────────────────────────────────────────────────────
export function useAudioEngine(): AudioEngine {
  return useMemo(() => new AudioEngineImpl(), [])
}
