import { useRef } from 'react'

// The worklet is in /public/karplus-strong-processor.js
// It MUST be served as raw JS — Vite's module bundling breaks AudioWorklet execution.
// Files in /public are served verbatim at the root URL.
const WORKLET_URL = '/karplus-strong-processor.js'

export interface AudioEngine {
  noteOn: (
    voiceId: number,
    midiNote: number,
    keyX: number,
    keyY: number,
    keyZ: number,
    options?: { decay?: number; brightness?: number }
  ) => Promise<void>
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

/**
 * Minimal, dependency-free audio engine.
 * Signal path: KarplusStrong Worklet → MasterGain → Destination
 */
export function useAudioEngine(): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)

  // Keep params in sync even before context exists
  const pendingVolume = useRef(0.8)
  const physParams = useRef({ brightness: 0.5, decay: 0.992 })
  const instParams = useRef({ type: 'guitar', jawariAmount: 0.0, jawariThreshold: 0.2 })
  const pendingSympathetic = useRef<{ scaleDegrees: number[]; rootMidi: number; gain: number; decay: number } | null>(null)

  async function ensureCtx(): Promise<AudioContext> {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume()
      }
      return ctxRef.current
    }

    console.log('[AudioEngine] Creating AudioContext...')
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
    console.log('[AudioEngine] AudioContext state:', ctx.state)

    try {
      console.log('[AudioEngine] Loading worklet from:', WORKLET_URL)
      await ctx.audioWorklet.addModule(WORKLET_URL)
      console.log('[AudioEngine] Worklet module loaded OK')
    } catch (err) {
      console.error('[AudioEngine] FAILED to load worklet:', err)
      throw err
    }

    const worklet = new AudioWorkletNode(ctx, 'karplus-strong', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],  // stereo output
    })

    worklet.onprocessorerror = (err) => {
      console.error('[AudioEngine] Worklet processor error:', err)
    }

    // Simple chain: Worklet → MasterGain → Speakers
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(pendingVolume.current, ctx.currentTime)

    worklet.connect(masterGain)
    masterGain.connect(ctx.destination)

    ctxRef.current = ctx
    workletRef.current = worklet
    masterGainRef.current = masterGain

    // Sync pending state to the worklet on creation
    if (pendingSympathetic.current) {
      worklet.port.postMessage({
        type: 'setSympatheticParams',
        ...pendingSympathetic.current,
      })
    }

    worklet.port.postMessage({
      type: 'setInstrumentParams',
      instrumentType: instParams.current.type,
      jawariAmount: instParams.current.jawariAmount,
      jawariThreshold: instParams.current.jawariThreshold,
    })

    console.log('[AudioEngine] Audio graph connected. State:', ctx.state)
    return ctx
  }

  const noteOn = async (
    voiceId: number,
    midiNote: number,
    _keyX: number,
    keyY: number,
    _keyZ: number,
    options?: { decay?: number; brightness?: number }
  ) => {
    await ensureCtx()
    const worklet = workletRef.current
    if (!worklet) { console.error('[AudioEngine] No worklet after ensureCtx!'); return }

    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
    const velocity = 0.6 + keyY * 0.4

    worklet.port.postMessage({
      type: 'noteOn',
      voiceId,
      frequency,
      velocity,
      brightness: options?.brightness !== undefined ? options.brightness : physParams.current.brightness,
      decay: options?.decay !== undefined ? options.decay : physParams.current.decay,
      instrumentType: instParams.current.type,
      jawariAmount: instParams.current.jawariAmount,
      jawariThreshold: instParams.current.jawariThreshold,
    })
  }

  const noteUpdate = (voiceId: number, pitchBendCents: number, keyY: number, _keyZ: number) => {
    const worklet = workletRef.current
    if (!worklet) return
    worklet.port.postMessage({
      type: 'noteUpdate',
      voiceId,
      pitchBendCents,
      keyY,
      instrumentType: instParams.current.type,
      jawariAmount: instParams.current.jawariAmount,
      jawariThreshold: instParams.current.jawariThreshold,
    })
  }

  const noteOff = (voiceId: number) => {
    const worklet = workletRef.current
    if (!worklet) return
    worklet.port.postMessage({ type: 'noteOff', voiceId })
  }

  const setEffectEnabled = (_effectId: string, _enabled: boolean) => {
    // Effects disabled until audio works — stubs for API compatibility
  }

  const setEffectParam = (_effectId: string, _param: string, _value: number) => {
    // Stub
  }

  const setMasterVolume = (volume: number) => {
    pendingVolume.current = volume
    if (masterGainRef.current && ctxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.05)
    }
  }

  const setPhysicalModelParams = (params: { stiffness?: number; brightness?: number; decay?: number }) => {
    if (params.brightness !== undefined) physParams.current.brightness = params.brightness
    if (params.decay !== undefined) physParams.current.decay = params.decay

    const worklet = workletRef.current
    if (worklet) {
      worklet.port.postMessage({
        type: 'setGlobalParams',
        brightness: physParams.current.brightness,
        decay: physParams.current.decay,
      })
    }
  }

  const setInstrumentParams = (params: { type: string; jawariAmount?: number; jawariThreshold?: number }) => {
    instParams.current.type = params.type
    if (params.jawariAmount !== undefined) instParams.current.jawariAmount = params.jawariAmount
    if (params.jawariThreshold !== undefined) instParams.current.jawariThreshold = params.jawariThreshold

    const worklet = workletRef.current
    if (worklet) {
      worklet.port.postMessage({
        type: 'setInstrumentParams',
        instrumentType: instParams.current.type,
        jawariAmount: instParams.current.jawariAmount,
        jawariThreshold: instParams.current.jawariThreshold,
      })
    }
  }

  const setSympatheticParams = (scaleDegrees: number[], rootMidi: number, gain: number, decay: number) => {
    pendingSympathetic.current = { scaleDegrees, rootMidi, gain, decay }

    const worklet = workletRef.current
    if (worklet) {
      worklet.port.postMessage({
        type: 'setSympatheticParams',
        scaleDegrees,
        rootMidi,
        sympatheticGain: gain,
        sympatheticDecay: decay,
      })
    }
  }

  const setVibratoDepth = (_depth: number) => {
    // Stub — add chorus/vibrato after base sound works
  }

  return {
    noteOn,
    noteUpdate,
    noteOff,
    setEffectEnabled,
    setEffectParam,
    setMasterVolume,
    setPhysicalModelParams,
    setInstrumentParams,
    setSympatheticParams,
    setVibratoDepth,
  }
}
