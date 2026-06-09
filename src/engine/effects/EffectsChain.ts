import * as Tone from 'tone'
import Tuna from 'tunajs'

export class EffectsChain {
  private tuna: any
  private nodes: Map<string, any> = new Map()
  private chainOrder: string[] = [
    'distortion',
    'wah',
    'vcf',
    'flanger',
    'phaser',
    'chorus',
    'tremolo',
    'reverb',
    'delay'
  ]

  private ctx: AudioContext
  public input: GainNode
  public output: GainNode

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

    // 4. Flanger (Tuna Flanger)
    const flanger = new this.tuna.Flanger({
      delay: 0.005,
      feedback: 0.1,
      frequency: 0.2,
      depth: 0.5,
      feedbackGain: 0.4,
      bypass: true
    })
    this.nodes.set('flanger', flanger)

    // 5. Phaser (Tuna Phaser)
    const phaser = new this.tuna.Phaser({
      rate: 1.2,
      depth: 0.4,
      feedback: 0.3,
      stereoPhase: 30,
      baseModulationFrequency: 700,
      bypass: true
    })
    this.nodes.set('phaser', phaser)

    // 6. Chorus (Tuna Chorus)
    const chorus = new this.tuna.Chorus({
      rate: 1.5,
      depth: 0.4,
      delay: 0.008,
      bypass: true
    })
    this.nodes.set('chorus', chorus)

    // 7. Tremolo (Tuna Tremolo)
    const tremolo = new this.tuna.Tremolo({
      intensity: 0.3,
      rate: 5,
      stereoPhase: 0,
      bypass: true
    })
    this.nodes.set('tremolo', tremolo)

    // 8. Reverb (Tone Reverb - bridged into Web Audio node)
    const reverb = new Tone.Reverb({ decay: 2.5, wet: 0 })
    // Ensure reverb node is ready
    reverb.ready = true as any; 
    this.nodes.set('reverb', reverb)

    // 9. Delay (Tone FeedbackDelay)
    const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 0 })
    this.nodes.set('delay', delay)
  }

  public setEffectEnabled(effectId: string, enabled: boolean) {
    const node = this.nodes.get(effectId)
    if (!node) return

    if (node.bypass !== undefined) {
      node.bypass = !enabled
    } else if (node.wet !== undefined) {
      node.wet.setValueAtTime(enabled ? 0.3 : 0, this.ctx.currentTime)
    }
  }

  public setEffectParam(effectId: string, paramName: string, value: number) {
    const node = this.nodes.get(effectId)
    if (!node) return

    // Special cases for param mappings
    if (effectId === 'distortion') {
      if (paramName === 'drive') node.drive = value
      if (paramName === 'gain') node.outputGain = value
    } else if (effectId === 'wah') {
      if (paramName === 'frequency') node.baseFrequency = value
    } else if (effectId === 'vcf') {
      if (paramName === 'cutoff') node.cutoff = value
      if (paramName === 'resonance') node.resonance = value
    } else if (effectId === 'reverb') {
      if (paramName === 'wet') node.wet.setValueAtTime(value, this.ctx.currentTime)
      if (paramName === 'decay') node.decay = value
    } else if (effectId === 'delay') {
      if (paramName === 'wet') node.wet.setValueAtTime(value, this.ctx.currentTime)
      if (paramName === 'feedback') node.feedback.setValueAtTime(value, this.ctx.currentTime)
    }
  }

  public rebuildChain() {
    // Disconnect everything in the chain
    this.input.disconnect()
    
    for (const node of this.nodes.values()) {
      if (node.disconnect) {
        try {
          node.disconnect()
        } catch (e) {
          // ignore already disconnected nodes
        }
      }
    }

    let prevNode: any = this.input

    for (const id of this.chainOrder) {
      const node = this.nodes.get(id)
      if (!node) continue

      // Tuna effects expose .input and .output, while Tone.js nodes connect directly
      const inputPort = node.input || node
      const outputPort = node.output || node

      try {
        if (prevNode.connect) {
          prevNode.connect(inputPort)
        } else if (prevNode.output && prevNode.output.connect) {
          prevNode.output.connect(inputPort)
        }
        prevNode = outputPort
      } catch (e) {
        console.error(`Error connecting effect ${id}:`, e)
      }
    }

    // Connect final effect to master output gain
    try {
      if (prevNode.connect) {
        prevNode.connect(this.output)
      } else if (prevNode.output && prevNode.output.connect) {
        prevNode.output.connect(this.output)
      }
    } catch (e) {
      console.error('Error connecting final node to output:', e)
    }
  }
}
