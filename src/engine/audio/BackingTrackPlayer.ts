export class BackingTrackPlayer {
  private ctx: AudioContext
  private sourceNode: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private gainNode: GainNode

  constructor(ctx: AudioContext, outputNode: AudioNode) {
    this.ctx = ctx
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 0.7
    this.gainNode.connect(outputNode)
  }

  async loadFile(file: File) {
    const arrayBuffer = await file.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
  }

  async loadUrl(url: string) {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
    } catch (e) {
      console.error(`Failed to load backing track URL: ${url}`, e)
    }
  }

  play(loop = false, offset = 0) {
    if (!this.buffer) return
    this.sourceNode?.stop()
    
    this.sourceNode = this.ctx.createBufferSource()
    this.sourceNode.buffer = this.buffer
    this.sourceNode.loop = loop
    this.sourceNode.connect(this.gainNode)
    this.sourceNode.start(0, offset)
  }

  stop() {
    try {
      this.sourceNode?.stop()
    } catch (_e) {
      // ignore if already stopped
    }
    this.sourceNode = null
  }

  setVolume(v: number) {
    this.gainNode.gain.setValueAtTime(v, this.ctx.currentTime)
  }
}
