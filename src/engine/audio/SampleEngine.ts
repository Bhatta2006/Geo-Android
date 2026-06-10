/**
 * SampleEngine — plays a user-uploaded audio sample pitched to any MIDI note.
 *
 * The user provides a WAV/MP3 of a single C4 note. The engine uses
 * AudioBufferSourceNode.playbackRate to pitch-shift to any target note:
 *   playbackRate = 2^((targetMidi - baseMidi) / 12)
 *
 * This is the standard sampler approach — pitch AND duration change together,
 * which sounds natural for plucked/struck instruments.
 */
export class SampleEngine {
  private ctx: AudioContext | null = null
  private sampleBuffer: AudioBuffer | null = null
  private baseMidi = 60  // C4 — the assumed note of the uploaded sample
  private activeVoices = new Map<number, AudioBufferSourceNode>()
  private gainNode: GainNode | null = null

  /** Connect to an existing AudioContext (shared with the KS engine) */
  setContext(ctx: AudioContext): void {
    this.ctx = ctx
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 0.8
    this.gainNode.connect(ctx.destination)
  }

  /** Load a user-uploaded audio file and decode it into an AudioBuffer */
  async loadSample(file: File): Promise<void> {
    if (!this.ctx) throw new Error('SampleEngine: AudioContext not set')

    const arrayBuffer = await file.arrayBuffer()
    this.sampleBuffer = await this.ctx.decodeAudioData(arrayBuffer)
    console.log(
      `[SampleEngine] Loaded sample: ${file.name}, ` +
      `duration=${this.sampleBuffer.duration.toFixed(2)}s, ` +
      `sampleRate=${this.sampleBuffer.sampleRate}, ` +
      `channels=${this.sampleBuffer.numberOfChannels}`
    )
  }

  /** Trigger a note: pitch-shift the C4 sample to the target MIDI note */
  noteOn(voiceId: number, midiNote: number, velocity: number): void {
    if (!this.ctx || !this.sampleBuffer || !this.gainNode) return

    // Stop any existing voice with this ID
    this.noteOff(voiceId)

    const source = this.ctx.createBufferSource()
    source.buffer = this.sampleBuffer

    // Pitch ratio: 2^((target - base) / 12)
    source.playbackRate.value = Math.pow(2, (midiNote - this.baseMidi) / 12)

    // Velocity scaling via a per-voice gain
    const voiceGain = this.ctx.createGain()
    voiceGain.gain.value = velocity * 0.9
    source.connect(voiceGain)
    voiceGain.connect(this.gainNode)

    source.start()
    this.activeVoices.set(voiceId, source)

    // Auto-cleanup when sample finishes playing
    source.onended = () => {
      this.activeVoices.delete(voiceId)
    }
  }

  /** Apply pitch bend to a playing voice (for slide support) */
  noteUpdate(voiceId: number, midiNote: number, pitchBendCents: number): void {
    const source = this.activeVoices.get(voiceId)
    if (!source) return

    // Total pitch in semitones = (midiNote - baseMidi) + (pitchBendCents / 100)
    const totalSemitones = (midiNote - this.baseMidi) + (pitchBendCents / 100)
    source.playbackRate.value = Math.pow(2, totalSemitones / 12)
  }

  /** Stop a playing voice */
  noteOff(voiceId: number): void {
    const source = this.activeVoices.get(voiceId)
    if (source) {
      try { source.stop() } catch { /* already stopped */ }
      this.activeVoices.delete(voiceId)
    }
  }

  /** Check if a sample is loaded and ready to play */
  get isLoaded(): boolean {
    return this.sampleBuffer !== null
  }

  /** Set master volume for sample playback */
  setVolume(vol: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = vol
    }
  }

  /** Set the base MIDI note of the uploaded sample (default C4 = 60) */
  setBaseMidi(midi: number): void {
    this.baseMidi = midi
  }
}
