import { useRef } from 'react'
import processorUrl from './worklets/KarplusStrongProcessor?url'
import { EffectsChain } from '../effects/EffectsChain'

export interface AudioEngine {
  noteOn: (voiceId: number, midiNote: number, keyX: number, keyY: number, keyZ: number) => Promise<void>
  noteUpdate: (voiceId: number, keyX: number, keyY: number, keyZ: number) => void
  noteOff: (voiceId: number) => void
  setEffectEnabled: (effectId: string, enabled: boolean) => void
  setEffectParam: (effectId: string, param: string, value: number) => void
  setMasterVolume: (volume: number) => void
  setPhysicalModelParams: (params: { stiffness?: number; brightness?: number; decay?: number }) => void
}

export function useAudioEngine(): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const effectsChainRef = useRef<EffectsChain | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)

  const physicalParamsRef = useRef({
    stiffness: 0.2,
    brightness: 0.5,
    decay: 0.992
  })

  const ensureContext = async (): Promise<AudioContext> => {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume()
      }
      return ctxRef.current
    }

    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
    
    // Load the compiled worklet module
    await ctx.audioWorklet.addModule(processorUrl)

    const workletNode = new AudioWorkletNode(ctx, 'karplus-strong', {
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })

    // Set up effects chain
    const effectsChain = new EffectsChain(ctx)
    effectsChainRef.current = effectsChain

    // Master output gain
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.8, ctx.currentTime)
    masterGainRef.current = masterGain

    // Wire: Worklet -> EffectsChain -> MasterGain -> Destination
    workletNode.connect(effectsChain.input)
    effectsChain.output.connect(masterGain)
    masterGain.connect(ctx.destination)

    ctxRef.current = ctx
    workletNodeRef.current = workletNode

    return ctx
  }

  const noteOn = async (voiceId: number, midiNote: number, keyX: number, keyY: number, keyZ: number) => {
    await ensureContext()
    const workletNode = workletNodeRef.current
    if (!workletNode) return

    // Standard MIDI frequency mapping
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
    
    // keyX = pitch cents deviation from center (+/- 50 cents)
    const pitchBendCents = (keyX - 0.5) * 100

    workletNode.port.postMessage({
      type: 'noteOn',
      voiceId,
      frequency,
      velocity: 0.1 + keyY * 0.9,
      brightness: physicalParamsRef.current.brightness,
      decay: physicalParamsRef.current.decay
    })

    // Immediately update initial pitchbend offset
    workletNode.port.postMessage({
      type: 'noteUpdate',
      voiceId,
      pitchBendCents,
      keyY,
      keyZ
    })
  }

  const noteUpdate = (voiceId: number, keyX: number, keyY: number, keyZ: number) => {
    const workletNode = workletNodeRef.current
    if (!workletNode) return

    // Map keyX to pitch cents offset from initial note center
    const pitchBendCents = (keyX - 0.5) * 100

    workletNode.port.postMessage({
      type: 'noteUpdate',
      voiceId,
      pitchBendCents,
      keyY,
      keyZ
    })

    // Wah-Wah tracking Y-coordinate movement
    if (effectsChainRef.current) {
      // Modulate wah frequency by Y position (up/down coordinate)
      effectsChainRef.current.setEffectParam('wah', 'frequency', keyY)
    }
  }

  const noteOff = (voiceId: number) => {
    const workletNode = workletNodeRef.current
    if (!workletNode) return

    workletNode.port.postMessage({
      type: 'noteOff',
      voiceId
    })
  }

  const setEffectEnabled = (effectId: string, enabled: boolean) => {
    if (effectsChainRef.current) {
      effectsChainRef.current.setEffectEnabled(effectId, enabled)
    }
  }

  const setEffectParam = (effectId: string, param: string, value: number) => {
    if (effectsChainRef.current) {
      effectsChainRef.current.setEffectParam(effectId, param, value)
    }
  }

  const setMasterVolume = (volume: number) => {
    if (masterGainRef.current && ctxRef.current) {
      masterGainRef.current.gain.setValueAtTime(volume, ctxRef.current.currentTime)
    }
  }

  const setPhysicalModelParams = (params: { stiffness?: number; brightness?: number; decay?: number }) => {
    physicalParamsRef.current = { ...physicalParamsRef.current, ...params }
  }

  return { 
    noteOn, 
    noteUpdate, 
    noteOff,
    setEffectEnabled,
    setEffectParam,
    setMasterVolume,
    setPhysicalModelParams
  }
}
