/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure Web Audio API effects chain — no Tone.js dependency.
// Tone.js creates its own AudioContext which breaks our worklet signal path.
import Tuna from 'tunajs'

/**
 * Generates a simple reverb impulse response using filtered noise.
 * Decay ~2s, sample-rate aware.
 */
function buildImpulseResponse(ctx: AudioContext, duration = 2.5, decay = 2.0): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay)
    }
  }
  return buf
}

export class EffectsChain {
  private tuna: any
  private nodes: Map<string, any> = new Map()
  private chainOrder: string[] = [
    'distortion',
    'wah',
    'vcf',
    'chorus',
    'reverb',
    'delay'
  ]

  private ctx: AudioContext
  public input: GainNode
  public output: GainNode

  // Native nodes for reverb and delay
  private reverbConvolver!: ConvolverNode
  private reverbGain!: GainNode
  private reverbDryGain!: GainNode

  private delayNode!: DelayNode
  private delayFeedback!: GainNode
  private delayWetGain!: GainNode
  private delayDryGain!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.tuna = new Tuna(ctx)
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.initializeEffects()
    this.rebuildChain()
  }

  private initializeEffects() {
    // 1. Distortion (Tuna Overdrive)
    const overdrive = new this.tuna.Overdrive({
      outputGain: 0.5,
      drive: 0.5,
      curveAmount: 0.8,
      algorithmIndex: 0,
      bypass: true
    })
    this.nodes.set('distortion', overdrive)

    // 2. Wah (Tuna WahWah)
    const wah = new this.tuna.WahWah({
      automode: false,
      baseFrequency: 0.3,
      excursionOctaves: 3,
      sweep: 0.5,
      resonance: 8,
      sensitivity: 0.5,
      bypass: true
    })
    this.nodes.set('wah', wah)

    // 3. VCF (Tuna Moog Filter)
    const vcf = new this.tuna.MoogFilter({
      cutoff: 0.6,
      resonance: 2.5,
      bufferSize: 256,
      bypass: true
    })
    this.nodes.set('vcf', vcf)

    // 4. Chorus (Tuna Chorus — bypass=true initially)
    const chorus = new this.tuna.Chorus({
      rate: 1.5,
      depth: 0.4,
      delay: 0.008,
      bypass: true
    })
    this.nodes.set('chorus', chorus)

    // 5. Reverb — native ConvolverNode with wet/dry mix
    this.reverbConvolver = this.ctx.createConvolver()
    this.reverbConvolver.buffer = buildImpulseResponse(this.ctx)
    this.reverbGain = this.ctx.createGain()
    this.reverbGain.gain.setValueAtTime(0, this.ctx.currentTime) // wet = 0
    this.reverbDryGain = this.ctx.createGain()
    this.reverbDryGain.gain.setValueAtTime(1, this.ctx.currentTime) // dry = 1

    // 6. Delay — native DelayNode with feedback + wet/dry
    this.delayNode = this.ctx.createDelay(2.0)
    this.delayNode.delayTime.setValueAtTime(0.25, this.ctx.currentTime) // ~quarter note at 120bpm
    this.delayFeedback = this.ctx.createGain()
    this.delayFeedback.gain.setValueAtTime(0.3, this.ctx.currentTime)
    this.delayWetGain = this.ctx.createGain()
    this.delayWetGain.gain.setValueAtTime(0, this.ctx.currentTime) // wet = 0
    this.delayDryGain = this.ctx.createGain()
    this.delayDryGain.gain.setValueAtTime(1, this.ctx.currentTime) // dry = 1

    // Self-feedback loop for delay
    this.delayNode.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delayNode)
  }

  public setEffectEnabled(effectId: string, enabled: boolean) {
    if (effectId === 'reverb') {
      const wet = enabled ? 0.35 : 0
      this.reverbGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05)
      return
    }
    if (effectId === 'delay') {
      const wet = enabled ? 0.3 : 0
      this.delayWetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05)
      return
    }

    const node = this.nodes.get(effectId)
    if (!node) return
    // Tuna bypass property
    node.bypass = !enabled
  }

  public setEffectParam(effectId: string, paramName: string, value: number) {
    if (effectId === 'distortion') {
      const node = this.nodes.get('distortion')
      if (!node) return
      if (paramName === 'drive') node.drive = value
      if (paramName === 'gain') node.outputGain = value
      return
    }
    if (effectId === 'wah') {
      const node = this.nodes.get('wah')
      if (!node) return
      if (paramName === 'frequency') node.baseFrequency = value
      return
    }
    if (effectId === 'vcf') {
      const node = this.nodes.get('vcf')
      if (!node) return
      if (paramName === 'cutoff') node.cutoff = value
      if (paramName === 'resonance') node.resonance = value
      return
    }
    if (effectId === 'chorus') {
      const node = this.nodes.get('chorus')
      if (!node) return
      if (paramName === 'depth') node.depth = value
      if (paramName === 'rate') node.rate = value
      return
    }
    if (effectId === 'reverb') {
      if (paramName === 'wet') {
        this.reverbGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
      }
      return
    }
    if (effectId === 'delay') {
      if (paramName === 'wet') {
        this.delayWetGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
      }
      if (paramName === 'feedback') {
        this.delayFeedback.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
      }
      if (paramName === 'time') {
        this.delayNode.delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.05)
      }
      return
    }
  }

  public rebuildChain() {
    // Disconnect everything safely
    try { this.input.disconnect() } catch (_) { /**/ }

    for (const node of this.nodes.values()) {
      try { node.disconnect?.() } catch (_) { /**/ }
    }

    try { this.reverbConvolver.disconnect() } catch (_) { /**/ }
    try { this.reverbGain.disconnect() } catch (_) { /**/ }
    try { this.reverbDryGain.disconnect() } catch (_) { /**/ }
    try { this.delayNode.disconnect() } catch (_) { /**/ }
    try { this.delayWetGain.disconnect() } catch (_) { /**/ }
    try { this.delayDryGain.disconnect() } catch (_) { /**/ }

    // Build Tuna chain
    let prevNode: any = this.input
    const tunaIds = this.chainOrder.filter(id => !['reverb', 'delay'].includes(id))

    for (const id of tunaIds) {
      const node = this.nodes.get(id)
      if (!node) continue
      const inputPort = node.input || node
      const outputPort = node.output || node
      try {
        if (prevNode.connect) prevNode.connect(inputPort)
        else if (prevNode.output?.connect) prevNode.output.connect(inputPort)
        prevNode = outputPort
      } catch (e) {
        console.error(`Error connecting effect ${id}:`, e)
      }
    }

    // Connect Tuna output to reverb wet/dry split
    const connectPrev = (target: AudioNode) => {
      try {
        if (prevNode.connect) prevNode.connect(target)
        else if (prevNode.output?.connect) prevNode.output.connect(target)
      } catch (e) {
        console.error('Chain connect error:', e)
      }
    }

    // Reverb: dry + wet parallel paths
    connectPrev(this.reverbDryGain)
    connectPrev(this.reverbConvolver)
    this.reverbConvolver.connect(this.reverbGain)

    // Delay: dry + wet parallel paths
    // Mix reverb dry+wet first into a summing node before delay
    const reverbSum = this.ctx.createGain()
    this.reverbDryGain.connect(reverbSum)
    this.reverbGain.connect(reverbSum)

    reverbSum.connect(this.delayDryGain)
    reverbSum.connect(this.delayNode)
    this.delayNode.connect(this.delayWetGain)

    // Final sum → output
    this.delayDryGain.connect(this.output)
    this.delayWetGain.connect(this.output)
  }
}
