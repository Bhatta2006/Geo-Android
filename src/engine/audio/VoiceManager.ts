import type { AudioEngine } from './useAudioEngine'
import { type SampleEngine } from './SampleEngine'
import { SlideEngine, type SlideEngineConfig } from '../pitch/SlideEngine'

export interface TouchState {
  pointerId: number
  row: number
  col: number
  midiNote: number
  keyX: number
  keyY: number
  keyZ: number
}

// Config exposed to VoiceManager — maps 1:1 to SlideEngineConfig fields it owns
export interface VoiceManagerConfig {
  snapEnabled: boolean
  roundEnabled: boolean
  slideSpeed: number
  scale: number[]
  temperamentOffsets: number[]
  /** Starting MIDI note of the bottom-left key — must match the active LayoutConfig */
  startMidiNote?: number
  /** Row interval semitones — must match the active LayoutConfig */
  rowIntervals?: number[]
}

export class VoiceManager {
  private readonly audioEngine: AudioEngine
  private playMode: 'mono' | 'string' | 'poly'
  private slideEngine: SlideEngine

  /** Maps pointerId → voiceId for active touches */
  private pointerToVoice = new Map<number, number>()
  /** Maps row → list of active touches on that row (for String mode HOPO/pull-off) */
  private rowTouches = new Map<number, TouchState[]>()

  private nextVoiceId = 1

  /** Optional SampleEngine for user-uploaded sample playback */
  private sampleEngine: SampleEngine | null = null
  private sampleMode = false
  /** Track which voiceId maps to which midiNote for sample pitch bending */
  private voiceMidiMap = new Map<number, number>()

  constructor(
    audioEngine: AudioEngine,
    playMode: 'mono' | 'string' | 'poly' = 'string',
    config?: Partial<VoiceManagerConfig>
  ) {
    this.audioEngine = audioEngine
    this.playMode = playMode

    const slideConfig = this.buildSlideConfig(config)
    this.slideEngine = new SlideEngine(slideConfig)
  }

  setPlayMode(mode: 'mono' | 'string' | 'poly'): void {
    this.playMode = mode
    this.allNotesOff()
  }

  setConfig(config: Partial<VoiceManagerConfig>): void {
    this.slideEngine.updateConfig(this.buildSlideConfig(config))
  }

  /** Attach a SampleEngine for user-uploaded sample playback */
  setSampleEngine(engine: SampleEngine | null): void {
    this.sampleEngine = engine
  }

  /** Toggle between KS synthesis and sample playback */
  setSampleMode(enabled: boolean): void {
    this.sampleMode = enabled
  }

  handleTouchDown(touch: TouchState): void {
    const { pointerId, midiNote, row, col, keyX, keyY, keyZ } = touch

    if (this.playMode === 'mono') {
      this.allNotesOff()
      this.startNewVoice(pointerId, midiNote, row, col, keyX, keyY, keyZ)
      return
    }

    if (this.playMode === 'poly') {
      this.startNewVoice(pointerId, midiNote, row, col, keyX, keyY, keyZ)
      return
    }

    // String mode: HOPO when adding a finger to an existing row
    const rowList = this.rowTouches.get(row) ?? []
    rowList.push(touch)
    rowList.sort((a, b) => a.col - b.col)
    this.rowTouches.set(row, rowList)

    if (rowList.length === 1) {
      // First finger on this row — start a fresh voice
      this.startNewVoice(pointerId, midiNote, row, col, keyX, keyY, keyZ)
    } else {
      // Additional finger (hammer-on) — re-use the existing voice
      const existingVoiceId = this.pointerToVoice.get(rowList[0].pointerId)
      if (existingVoiceId !== undefined) {
        this.pointerToVoice.set(pointerId, existingVoiceId)
        this.slideEngine.initVoice(existingVoiceId, midiNote, keyX)
        // Re-trigger without full repluck
        this.audioEngine.noteOn(existingVoiceId, midiNote, keyX, keyY, keyZ)
      }
    }
  }

  handleTouchMove(pointerId: number, _unusedCentsOffset: number, keyY: number, keyZ: number): void {
    // Note: centsOffset is no longer used — the SlideEngine owns all pitch math.
    // The gesture hook still calculates dx but we need keyX for the slide update.
    // VoiceManager receives the raw gesture parameters; SlideEngine processes them.
    //
    // LIMITATION: currently handleTouchMove only receives centsOffset (legacy API).
    // We need raw keyX, newColumn, newRow from the gesture layer.
    // This is handled via handleTouchMoveDetailed below; the legacy path is a no-op.
    const voiceId = this.pointerToVoice.get(pointerId)
    if (voiceId === undefined) return
    this.audioEngine.noteUpdate(voiceId, 0, keyY, keyZ)
  }

  /**
   * Full-detail move handler called by useKeyboardGesture.
   * Replaces the legacy handleTouchMove and carries all data SlideEngine needs.
   */
  handleTouchMoveDetailed(params: {
    pointerId: number
    newColumn: number
    newRow: number
    keyX: number
    keyY: number
    keyZ: number
    dx: number
    velocity: number
  }): number {
    const voiceId = this.pointerToVoice.get(params.pointerId)
    if (voiceId === undefined) return 0

    const pitchBendCents = this.slideEngine.update({
      voiceId,
      newColumn: params.newColumn,
      newRow: params.newRow,
      keyX: params.keyX,
      keyY: params.keyY,
      keyZ: params.keyZ,
      dx: params.dx,
      velocity: params.velocity,
    })

    this.audioEngine.noteUpdate(voiceId, pitchBendCents, params.keyY, params.keyZ)

    // Also update sample engine pitch if in sample mode
    if (this.sampleMode && this.sampleEngine) {
      const baseMidi = this.voiceMidiMap.get(voiceId)
      if (baseMidi !== undefined) {
        this.sampleEngine.noteUpdate(voiceId, baseMidi, pitchBendCents)
      }
    }

    return pitchBendCents
  }

  handleTouchUp(pointerId: number, row: number): void {
    const voiceId = this.pointerToVoice.get(pointerId)
    this.pointerToVoice.delete(pointerId)
    // Clear SlideEngine state by voiceId (not pointerId — SlideEngine is keyed by voiceId)
    if (voiceId !== undefined) this.slideEngine.clearVoice(voiceId)

    if (this.playMode !== 'string') {
      if (voiceId !== undefined) {
        this.audioEngine.noteOff(voiceId)
        if (this.sampleMode && this.sampleEngine) this.sampleEngine.noteOff(voiceId)
        this.voiceMidiMap.delete(voiceId)
      }
      return
    }

    // String mode: handle pull-off (lift reveals lower-pitched finger on same row)
    const rowList = this.rowTouches.get(row) ?? []
    const idx = rowList.findIndex(t => t.pointerId === pointerId)
    if (idx !== -1) rowList.splice(idx, 1)
    this.rowTouches.set(row, rowList)

    if (rowList.length > 0) {
      // Pull-off: glide to remaining note
      const remaining = rowList[rowList.length - 1]
      if (voiceId !== undefined) {
        this.pointerToVoice.set(remaining.pointerId, voiceId)
        this.voiceMidiMap.set(voiceId, remaining.midiNote)
        this.slideEngine.initVoice(voiceId, remaining.midiNote, remaining.keyX)
        this.audioEngine.noteOn(voiceId, remaining.midiNote, remaining.keyX, remaining.keyY, remaining.keyZ)
        if (this.sampleMode && this.sampleEngine?.isLoaded) {
          this.sampleEngine.noteOn(voiceId, remaining.midiNote, remaining.keyZ)
        }
      }
    } else {
      if (voiceId !== undefined) {
        this.audioEngine.noteOff(voiceId)
        if (this.sampleMode && this.sampleEngine) this.sampleEngine.noteOff(voiceId)
        this.voiceMidiMap.delete(voiceId)
      }
    }
  }

  allNotesOff(): void {
    for (const voiceId of this.pointerToVoice.values()) {
      this.audioEngine.noteOff(voiceId)
    }
    this.pointerToVoice.clear()
    this.rowTouches.clear()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private startNewVoice(
    pointerId: number,
    midiNote: number,
    _row: number,
    _col: number,
    keyX: number,
    keyY: number,
    keyZ: number
  ): void {
    const voiceId = this.nextVoiceId++
    this.pointerToVoice.set(pointerId, voiceId)
    this.voiceMidiMap.set(voiceId, midiNote)
    this.slideEngine.initVoice(voiceId, midiNote, keyX)
    this.audioEngine.noteOn(voiceId, midiNote, keyX, keyY, keyZ)

    // Trigger sample engine if in sample mode
    if (this.sampleMode && this.sampleEngine?.isLoaded) {
      this.sampleEngine.noteOn(voiceId, midiNote, keyZ)
    }
  }

  private buildSlideConfig(patch?: Partial<VoiceManagerConfig>): SlideEngineConfig {
    const current = this.slideEngine ? this.slideEngine.getConfig() : null
    return {
      snapEnabled:         patch?.snapEnabled         ?? current?.snapEnabled         ?? true,
      roundEnabled:        patch?.roundEnabled        ?? current?.roundEnabled        ?? true,
      slideSpeed:          patch?.slideSpeed          ?? current?.slideSpeed          ?? 0.15,
      diatonicMode:        false,
      scale:               patch?.scale               ?? current?.scale               ?? [0,1,2,3,4,5,6,7,8,9,10,11],
      temperamentOffsets:  patch?.temperamentOffsets  ?? current?.temperamentOffsets  ?? new Array(12).fill(0),
      rowIntervals:        patch?.rowIntervals        ?? current?.rowIntervals        ?? [5, 5, 5, 4, 5],
      startMidiNote:       patch?.startMidiNote       ?? current?.startMidiNote       ?? 40,
    }
  }
}
