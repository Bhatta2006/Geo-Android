/**
 * SlideEngine — per-voice pitch tracking with Snap, Round, and Vibrato detection.
 *
 * Snap:    On first touch, lock immediately to the nearest scale note (zero intonation error).
 * Round:   While sliding, converge continuously toward the nearest scale note.
 * Vibrato: Rapid left-right oscillation reduces convergence so the oscillation sounds natural.
 *
 * Returns pitchBendCents relative to the voice's base MIDI note, ready to send to the DSP.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export interface SlideEngineConfig {
  snapEnabled: boolean       // Snap to pitch center on first attack
  roundEnabled: boolean      // Converge toward nearest note while sliding
  slideSpeed: number         // 0.0 = instant snap, 0.15 = default, 1.0 = pure fretless
  diatonicMode: boolean      // Only snap/round to scale notes (vs chromatic)
  scale: number[]            // Active scale degrees 0–11
  temperamentOffsets: number[] // Per-note cent deviations from Equal Temperament (12 values)
  rowIntervals: number[]     // Semitones between each row (e.g. [5,5,5,4,5] for guitar)
  startMidiNote: number      // MIDI note of row 0, col 0
}

// ─── Per-Voice State ──────────────────────────────────────────────────────────

interface VoiceSlideState {
  baseMidiNote: number
  currentPitchCents: number
  targetPitchCents: number
  fingerPitchCents: number
  lastColumn: number
  lastRow: number
  /** Ring buffer of recent keyX values for vibrato detection */
  keyXHistory: number[]
  isVibrato: boolean
  /** Smoothly blends between 1.0 (normal) and 0.05 (vibrato) convergence */
  convergenceMultiplier: number
}

// ─── Public Update Params ─────────────────────────────────────────────────────

export interface SlideUpdateParams {
  voiceId: number
  newColumn: number
  newRow: number
  keyX: number   // 0–1 across the key cell
  keyY: number   // 0–1 vertical (not used for pitch, passed through for expression)
  keyZ: number   // pressure 0–1
  dx: number     // pixel delta since last frame (for future velocity boost)
  velocity: number // pointer velocity pixels/ms
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class SlideEngine {
  private voices = new Map<number, VoiceSlideState>()
  private config: SlideEngineConfig

  constructor(config: SlideEngineConfig) {
    this.config = config
  }

  updateConfig(patch: Partial<SlideEngineConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  // ── Called once on pointerdown ────────────────────────────────────────────

  initVoice(voiceId: number, midiNote: number, keyX: number): void {
    const rawCents = this.midiNoteToCents(midiNote)
    const fingerCents = rawCents + (keyX - 0.5) * 100
    const startCents = this.config.snapEnabled
      ? this.nearestScaleNoteCents(fingerCents)
      : fingerCents

    this.voices.set(voiceId, {
      baseMidiNote: midiNote,
      currentPitchCents: startCents,
      targetPitchCents: startCents,
      fingerPitchCents: startCents,
      lastColumn: -1,
      lastRow: -1,
      keyXHistory: [keyX],
      isVibrato: false,
      convergenceMultiplier: 1.0,
    })
  }

  // ── Called on every pointermove ────────────────────────────────────────────

  /**
   * Returns pitchBendCents (relative to base MIDI note).
   * Send this value to the AudioWorklet as 'noteUpdate'.
   */
  update(params: SlideUpdateParams): number {
    const state = this.voices.get(params.voiceId)
    if (!state) return 0

    // Finger pitch = column MIDI note + keyX offset (±50 cents at edges)
    const colMidi = this.columnToMidiNote(params.newColumn, params.newRow)
    const fingerCents = colMidi * 100 + (params.keyX - 0.5) * 100
    state.fingerPitchCents = fingerCents

    // Update keyX history for vibrato detection (ring buffer of 10)
    state.keyXHistory.push(params.keyX)
    if (state.keyXHistory.length > 10) state.keyXHistory.shift()
    state.isVibrato = this.detectVibrato(state.keyXHistory)

    // Smoothly blend convergenceMultiplier toward vibrato or normal rate
    const targetMultiplier = state.isVibrato ? 0.05 : 1.0
    state.convergenceMultiplier += (targetMultiplier - state.convergenceMultiplier) * 0.1

    const nearestCents = this.nearestScaleNoteCents(fingerCents)

    if (this.config.roundEnabled) {
      const baseRate = (1.0 - this.config.slideSpeed) * 0.20
      // Fast slides → less correction (player is intentionally sliding across notes)
      const velocityDamping = Math.min(params.velocity * 0.01, 0.3)
      const effectiveRate = baseRate * state.convergenceMultiplier * (1.0 - velocityDamping)

      state.targetPitchCents = nearestCents
      state.currentPitchCents += (nearestCents - state.currentPitchCents) * Math.max(0.005, effectiveRate)
    } else {
      // Pure fretless: follow the finger exactly with no correction
      state.currentPitchCents = fingerCents
    }

    state.lastColumn = params.newColumn
    state.lastRow = params.newRow

    // Bend is relative to the voice's initial base note
    return state.currentPitchCents - state.baseMidiNote * 100
  }

  clearVoice(voiceId: number): void {
    this.voices.delete(voiceId)
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Vibrato = rapid direction reversals with meaningful amplitude.
   * Detected when ≥3 reversals occur in the keyX history ring buffer
   * and the peak-to-peak amplitude is > 0.04 (≈ 4 cents of oscillation).
   */
  private detectVibrato(history: number[]): boolean {
    if (history.length < 6) return false

    let reversals = 0
    for (let i = 1; i < history.length - 1; i++) {
      const d1 = history[i] - history[i - 1]
      const d2 = history[i + 1] - history[i]
      if (d1 !== 0 && d2 !== 0 && Math.sign(d1) !== Math.sign(d2)) reversals++
    }

    const amplitude = Math.max(...history) - Math.min(...history)
    return reversals >= 3 && amplitude > 0.04
  }

  private nearestScaleNoteCents(fingerCents: number): number {
    if (!this.config.diatonicMode) {
      // Chromatic: nearest semitone + temperament correction
      const nearestMidi = Math.round(fingerCents / 100)
      const noteClass = ((nearestMidi % 12) + 12) % 12
      return nearestMidi * 100 + (this.config.temperamentOffsets[noteClass] ?? 0)
    }

    // Diatonic: scan scale degrees over ±1 octave from finger position
    const approxMidi = fingerCents / 100
    const octave = Math.floor(approxMidi / 12)
    let nearestCents = fingerCents
    let nearestDist = Infinity

    for (let oct = octave - 1; oct <= octave + 1; oct++) {
      for (const degree of this.config.scale) {
        const noteClass = degree % 12
        const noteMidi = oct * 12 + noteClass
        const noteCents = noteMidi * 100 + (this.config.temperamentOffsets[noteClass] ?? 0)
        const dist = Math.abs(noteCents - fingerCents)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestCents = noteCents
        }
      }
    }

    return nearestCents
  }

  private columnToMidiNote(col: number, row: number): number {
    let note = this.config.startMidiNote
    for (let r = 0; r < row; r++) {
      note += this.config.rowIntervals[r] ?? this.config.rowIntervals[0] ?? 5
    }
    return note + col
  }

  private midiNoteToCents(midiNote: number): number {
    return midiNote * 100 + (this.config.temperamentOffsets[midiNote % 12] ?? 0)
  }
}
