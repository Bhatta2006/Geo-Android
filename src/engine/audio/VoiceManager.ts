import type { AudioEngine } from './useAudioEngine'
import { type PitchRoundingConfig, type PitchState, keyXToPitchCents } from '../pitch/PitchRoundingEngine'

export interface TouchState {
  pointerId: number
  row: number
  col: number
  midiNote: number
  keyX: number               // initial keyX on touch down
  keyY: number
  keyZ: number
}

export class VoiceManager {
  private audioEngine: AudioEngine
  private playMode: 'mono' | 'string' | 'poly'
  private config: PitchRoundingConfig

  // Map of active row -> list of pointer touches on that row (sorted by column index)
  private rowTouches: Map<number, TouchState[]> = new Map()
  // Map of pointerId -> active voice ID playing in the audio engine
  private pointerToVoice: Map<number, number> = new Map()
  // Map of pointerId -> PitchState tracking
  private pitchStates: Map<number, PitchState> = new Map()
  // Counter to allocate unique voice IDs
  private nextVoiceId = 1

  constructor(
    audioEngine: AudioEngine, 
    playMode: 'mono' | 'string' | 'poly' = 'string',
    config?: PitchRoundingConfig
  ) {
    this.audioEngine = audioEngine
    this.playMode = playMode
    this.config = config || {
      snapEnabled: true,
      roundEnabled: true,
      slideSpeed: 0.15,
      scale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic by default
      temperamentOffsets: new Array(12).fill(0)
    }
  }

  setPlayMode(mode: 'mono' | 'string' | 'poly') {
    this.playMode = mode
    this.allNotesOff()
  }

  setConfig(config: PitchRoundingConfig) {
    this.config = config
  }

  handleTouchDown(touch: TouchState) {
    const baseMidiNote = touch.midiNote
    const baseCents = baseMidiNote * 100

    const { fingerCents, nearestNoteCents } = keyXToPitchCents(touch.keyX, baseMidiNote, this.config)
    const initialPitchCents = this.config.snapEnabled ? nearestNoteCents : fingerCents

    const pitchState: PitchState = {
      baseMidiNote,
      currentPitchCents: initialPitchCents,
      targetPitchCents: initialPitchCents,
      fingerCents,
      isVibrating: false,
      lastDx: 0
    }

    const initialBendCents = initialPitchCents - baseCents

    if (this.playMode === 'poly') {
      const voiceId = this.nextVoiceId++
      this.pointerToVoice.set(touch.pointerId, voiceId)
      this.pitchStates.set(touch.pointerId, pitchState)

      // noteOn starts voice, then noteUpdate sets initial bend offset
      this.audioEngine.noteOn(voiceId, baseMidiNote, 0.5, touch.keyY, touch.keyZ)
      // Normalize bend back to keyX center-relative equivalent or send raw detune
      // Since noteUpdate expects keyX (0-1), we can send the offset
      const keyXOffset = 0.5 + (initialBendCents / 100)
      this.audioEngine.noteUpdate(voiceId, keyXOffset, touch.keyY, touch.keyZ)
    } else if (this.playMode === 'string') {
      let touches = this.rowTouches.get(touch.row) || []
      touches.push(touch)
      touches.sort((a, b) => a.col - b.col)
      this.rowTouches.set(touch.row, touches)

      const activeTouch = touches[touches.length - 1]

      if (touches.length === 1) {
        const voiceId = this.nextVoiceId++
        this.pointerToVoice.set(touch.pointerId, voiceId)
        this.pitchStates.set(touch.pointerId, pitchState)

        this.audioEngine.noteOn(voiceId, baseMidiNote, 0.5, touch.keyY, touch.keyZ)
        const keyXOffset = 0.5 + (initialBendCents / 100)
        this.audioEngine.noteUpdate(voiceId, keyXOffset, touch.keyY, touch.keyZ)
      } else {
        // Legato/HOPO: Re-use the existing voice
        const firstTouch = touches[0]
        const voiceId = this.pointerToVoice.get(firstTouch.pointerId)
        if (voiceId !== undefined) {
          this.pointerToVoice.set(touch.pointerId, voiceId)
          this.pitchStates.set(touch.pointerId, pitchState)
          // For HOPO we trigger noteOn to update delay line base frequency, but don't re-pluck
          this.audioEngine.noteOn(voiceId, activeTouch.midiNote, 0.5, activeTouch.keyY, activeTouch.keyZ)
        }
      }
    } else if (this.playMode === 'mono') {
      this.allNotesOff()
      const voiceId = this.nextVoiceId++
      this.pointerToVoice.set(touch.pointerId, voiceId)
      this.pitchStates.set(touch.pointerId, pitchState)

      this.audioEngine.noteOn(voiceId, baseMidiNote, 0.5, touch.keyY, touch.keyZ)
      const keyXOffset = 0.5 + (initialBendCents / 100)
      this.audioEngine.noteUpdate(voiceId, keyXOffset, touch.keyY, touch.keyZ)
    }
  }

  handleTouchMove(pointerId: number, centsOffset: number, keyY: number, keyZ: number) {
    const voiceId = this.pointerToVoice.get(pointerId)
    const state = this.pitchStates.get(pointerId)
    if (voiceId === undefined || !state) return

    // Calculate current finger pitch based on the raw cents offset from initial note
    const baseCents = state.baseMidiNote * 100
    const fingerCents = baseCents + centsOffset
    
    // Snapping logic: find nearest scale note cents
    const nearestNoteCents = findNearestScaleNoteCents(fingerCents, this.config.scale, this.config.temperamentOffsets)
    
    // Rounding convergence: target is either the snapped note or the raw finger position
    const targetCents = this.config.roundEnabled ? nearestNoteCents : fingerCents
    const targetBendCents = targetCents - baseCents

    // Translate target bend cents to keyX representation (0.5 center, 100 cents = 1.0 keyX unit width)
    const keyXValue = 0.5 + (targetBendCents / 100)
    this.audioEngine.noteUpdate(voiceId, keyXValue, keyY, keyZ)
  }

  handleTouchUp(pointerId: number, row: number) {
    if (this.playMode === 'poly' || this.playMode === 'mono') {
      const voiceId = this.pointerToVoice.get(pointerId)
      if (voiceId !== undefined) {
        this.audioEngine.noteOff(voiceId)
        this.pointerToVoice.delete(pointerId)
        this.pitchStates.delete(pointerId)
      }
    } else if (this.playMode === 'string') {
      let touches = this.rowTouches.get(row) || []
      const index = touches.findIndex(t => t.pointerId === pointerId)
      
      if (index !== -1) {
        touches.splice(index, 1)
        this.rowTouches.set(row, touches)
      }

      const voiceId = this.pointerToVoice.get(pointerId)
      this.pointerToVoice.delete(pointerId)
      this.pitchStates.delete(pointerId)

      if (touches.length > 0) {
        // Pull-off: glide to remaining note
        const activeTouch = touches[touches.length - 1]
        if (voiceId !== undefined) {
          this.pointerToVoice.set(activeTouch.pointerId, voiceId)
          // Pull-off PitchState setup
          const pitchState: PitchState = {
            baseMidiNote: activeTouch.midiNote,
            currentPitchCents: activeTouch.midiNote * 100,
            targetPitchCents: activeTouch.midiNote * 100,
            fingerCents: activeTouch.midiNote * 100,
            isVibrating: false,
            lastDx: 0
          }
          this.pitchStates.set(activeTouch.pointerId, pitchState)
          this.audioEngine.noteOn(voiceId, activeTouch.midiNote, 0.5, activeTouch.keyY, activeTouch.keyZ)
        }
      } else {
        if (voiceId !== undefined) {
          this.audioEngine.noteOff(voiceId)
        }
      }
    }
  }

  allNotesOff() {
    for (const voiceId of this.pointerToVoice.values()) {
      this.audioEngine.noteOff(voiceId)
    }
    this.pointerToVoice.clear()
    this.pitchStates.clear()
    this.rowTouches.clear()
  }
}

// Utility duplicate of findNearestScaleNoteCents to prevent self-contained imports if needed
function findNearestScaleNoteCents(
  fingerCents: number,
  scale: number[],
  temperamentOffsets: number[]
): number {
  const fingerMidi = fingerCents / 100
  const octave = Math.round(fingerMidi / 12)
  let nearest = fingerCents
  let nearestDist = Infinity

  for (let oct = octave - 1; oct <= octave + 1; oct++) {
    for (const degree of scale) {
      const noteClass = degree % 12
      const noteCents = (oct * 12 + noteClass) * 100 + (temperamentOffsets[noteClass] ?? 0)
      const dist = Math.abs(noteCents - fingerCents)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = noteCents
      }
    }
  }
  return nearest
}
