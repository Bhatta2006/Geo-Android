# GeoShred Web Clone — Phase 2 Master Plan
## Slide Engine · Veena Physical Model · Sample Instrument · UI/UX Overhaul

**Version:** 2.0  
**Date:** June 2026  
**Current State:** Basic isomorphic keyboard grid rendering + basic Karplus-Strong guitar pluck working  
**Goal of this phase:** Achieve the authentic GeoShred slide/bend feel, add Veena/Xitar model, build a full sample instrument engine, and massively upgrade the UI/UX to production quality

---

## Table of Contents

1. [Current State Analysis (from screenshot)](#1-current-state-analysis-from-screenshot)
2. [The Slide Mechanism — Complete Technical Blueprint](#2-the-slide-mechanism--complete-technical-blueprint)
3. [@use-gesture/react — Why It's The Right Choice & How To Use It](#3-use-gesturereact--why-its-the-right-choice--how-to-use-it)
4. [Pitch Rounding Engine — Full Implementation](#4-pitch-rounding-engine--full-implementation)
5. [Veena / Xitar Physical Model](#5-veena--xitar-physical-model)
6. [Sample Instrument Engine](#6-sample-instrument-engine)
7. [UI Visual Overhaul — Key Rendering & Touch Feedback](#7-ui-visual-overhaul--key-rendering--touch-feedback)
8. [UX Architecture Overhaul](#8-ux-architecture-overhaul)
9. [Step-by-Step Implementation Sequence](#9-step-by-step-implementation-sequence)
10. [File & Module Map](#10-file--module-map)
11. [Testing & Validation Checklist](#11-testing--validation-checklist)

---

## 1. Current State Analysis (from screenshot)

### What's working (good progress):
- Dark background keyboard grid rendered correctly ✅
- Note names (E, F, F#, G…) displayed in each key ✅
- Root note (C) highlighted with amber/gold color ✅
- Orange concentric circles on root note keys — the "polkadot" style ✅
- 6 rows × ~18 columns visible — isomorphic layout ✅
- Top bar: Octave selector, EXPRESSION controls (Guitar/Feedback, Fret Excitation, Whammy, Vibrato Depth, Filter) ✅
- Play mode tabs: String / Poly / Mono ✅
- Preset name display "Acoustic Steel" ✅
- Cyan teal border on keys ✅

### What's missing / broken:
- ❌ **Slide mechanism** — no continuous pitch bend when dragging across or within keys
- ❌ **No visual pitch trace** — no line/glow showing where the finger is sliding
- ❌ **Touch on mobile doesn't feel right** — touch events are raw PointerEvents, not gesture-aware
- ❌ **No microtonal playback** — can only hit discrete MIDI notes, no in-between pitches
- ❌ **No Veena sound model** — only guitar Karplus-Strong
- ❌ **No sample engine** — cannot load user audio files and play them as instruments
- ❌ **UI details lacking** — key glow on press, finger ripple animation, pitch slide visualization, active key highlight missing
- ❌ **Control surface not functional** — Whammy slider, vibrato depth, etc. not wired to audio
- ❌ **Note label font too small** relative to key height — note name should sit lower third of key
- ❌ **No smooth cross-row sliding** — finger crossing row boundary should retune, not create new note

---

## 2. The Slide Mechanism — Complete Technical Blueprint

### 2.1 What the Slide Should Feel Like

When you drag a finger LEFT or RIGHT across the keyboard:
- The pitch bends continuously, like bending a string on a real guitar
- As the finger slows down or pauses near a note center, the pitch "snaps" to perfect intonation (the Round effect)
- When the finger crosses from one key column to an adjacent one, the base note shifts but pitch follows seamlessly with no click/pop
- Playing fast up/down runs = meend (glide ornament in Indian music)
- Small oscillations left/right within a key = vibrato

When you drag a finger UP or DOWN (across rows):
- In **String mode**: the note switches to the new row's note range, replicating sliding up a guitar neck
- In **Poly mode**: new note is triggered when finger enters a new key zone
- **Vertical position (keyY)** within the key = velocity at attack, then expression/brightness while held

### 2.2 The Three Coordinate Values Per Touch

Every active pointer must track three normalized values at all times, updated on every `pointermove`:

```
KeyX  (0.0 → 1.0)  — horizontal position within current key
                      0.0 = left edge, 0.5 = center (perfect pitch), 1.0 = right edge
                      Maps to: pitch deviation ±50 cents, i.e. ±0.5 semitones

KeyY  (0.0 → 1.0)  — vertical position within current key
                      0.0 = bottom of key, 1.0 = top of key
                      At attack (pointerdown): maps to NoteOn velocity (soft=bottom, loud=top)
                      While held (pointermove): maps to expression/brightness/CC74

KeyZ  (0.0 → 1.0)  — pressure (hardware pressure if available, else fallback to 0)
                      Maps to: Channel Pressure / subtle additional brightness
                      On most Android devices: always 0 unless stylus used
```

### 2.3 Pitch Deviation Formula

```
// The raw pitch (in semitones) at any pointer position:
// basePitch = the MIDI note number of the column the finger is in
// KeyX = 0 to 1 across that column

rawPitchSemitones = basePitch + (KeyX - 0.5)
// Range: basePitch - 0.5 (left edge) to basePitch + 0.5 (right edge)

// In cents (100 cents = 1 semitone):
rawPitchCents = basePitch * 100 + (KeyX - 0.5) * 100
```

When the finger crosses into the next column, `basePitch` increments by 1 and `KeyX` resets near 0 (the left edge of that new key). This is seamless — the pitch curve is perfectly continuous at the key boundary.

### 2.4 The Snap + Round State Machine

This is the engine that makes GeoShred feel magical. It runs on every `pointermove` event.

```typescript
// State stored per active voice (per pointerId)
interface SlideState {
  voiceId: number
  isAttack: boolean             // true only on the very first frame after pointerdown
  currentPitchCents: number     // actual current pitch being sent to DSP
  targetPitchCents: number      // where rounding is trying to converge to
  fingerPitchCents: number      // raw finger position in cents
  lastKeyX: number
  lastColumn: number            // which column the finger is in
  lastRow: number
}

// Called EVERY pointermove and once on pointerdown
function updateSlide(
  state: SlideState,
  newColumn: number,
  newRow: number,
  keyX: number,
  snapEnabled: boolean,
  roundEnabled: boolean,
  slideSpeed: number,           // 0.0 = instant snap, 1.0 = pure fretless
  scale: number[],              // active scale note classes
  temperamentOffsets: number[]  // per-note cent deviations
): number /* returns pitchBendCents to send to DSP */ {

  // Calculate finger pitch from column + KeyX
  const colMidiNote = getColumnMidiNote(newColumn, newRow)
  const colBaseCents = colMidiNote * 100
  const fingerCents = colBaseCents + (keyX - 0.5) * 100
  state.fingerPitchCents = fingerCents

  // Find nearest note center in the current scale+temperament
  const nearestCents = findNearestScaleNote(fingerCents, scale, temperamentOffsets)

  if (state.isAttack) {
    state.isAttack = false
    if (snapEnabled) {
      // SNAP: lock to exact pitch on first touch — zero intonation error
      state.currentPitchCents = nearestCents
      state.targetPitchCents = nearestCents
    } else {
      state.currentPitchCents = fingerCents
      state.targetPitchCents = fingerCents
    }
  } else {
    // ROUND: converge current toward nearest note continuously
    if (roundEnabled) {
      state.targetPitchCents = nearestCents
      const convergenceRate = (1 - slideSpeed) * 0.25  // tune this constant
      state.currentPitchCents +=
        (state.targetPitchCents - state.currentPitchCents) * convergenceRate
    } else {
      // Pure fretless: follow finger exactly
      state.currentPitchCents = fingerCents
    }
  }

  // Return the bend amount relative to the root MIDI note
  const rootMidiNote = getColumnMidiNote(state.lastColumn, state.lastRow)
  const pitchBendCents = state.currentPitchCents - rootMidiNote * 100
  return pitchBendCents
}
```

### 2.5 Cross-Key Sliding (the Most Important Part)

When a finger slides from one column to an adjacent one, you must NOT trigger a new NoteOff+NoteOn. The voice continues — only the pitch updates. This is what produces legato slides.

```typescript
onPointerMove(e: PointerEvent) {
  const state = activeSlides.get(e.pointerId)
  if (!state) return

  const { column, row, keyX, keyY } = hitTestDetailed(e.clientX, e.clientY)

  // Detect if finger has entered a new KEY (column OR row)
  const crossedColumn = column !== state.lastColumn
  const crossedRow = row !== state.lastRow

  if (crossedRow && playMode === 'string') {
    // In string mode: crossing a row boundary is like changing strings
    // In GeoShred, the voice continues but re-excites with a lighter hammer-on
    voiceManager.hammerOn(state.voiceId, getColumnMidiNote(column, row))
    state.lastRow = row
  }

  // Always update pitch on column or within-column move
  const pitchBendCents = updateSlide(state, column, row, keyX, snapEnabled, roundEnabled, slideSpeed, ...)
  state.lastColumn = column

  // Send to DSP
  audioWorklet.updatePitch(state.voiceId, pitchBendCents)
  mpeOutput.sendPitchBend(state.voiceId, pitchBendCents)
  mpeOutput.sendKeyY(state.voiceId, keyY)
}
```

### 2.6 Vibrato Detection

Vibrato is when the finger oscillates rapidly left/right within the same note range. You detect this by tracking the direction of KeyX changes:

```typescript
// Track last few KeyX delta values
const keyXHistory: number[] = []   // ring buffer, last 8 values

function detectVibrato(currentKeyX: number): { isVibrato: boolean, depth: number, rate: number } {
  keyXHistory.push(currentKeyX)
  if (keyXHistory.length > 8) keyXHistory.shift()

  // Count direction reversals
  let reversals = 0
  for (let i = 1; i < keyXHistory.length - 1; i++) {
    const d1 = keyXHistory[i] - keyXHistory[i - 1]
    const d2 = keyXHistory[i + 1] - keyXHistory[i]
    if (Math.sign(d1) !== Math.sign(d2)) reversals++
  }

  const depth = Math.max(...keyXHistory) - Math.min(...keyXHistory)
  const isVibrato = reversals >= 2 && depth > 0.05

  return { isVibrato, depth, rate: reversals * 6 }  // approx Hz
}
```

When vibrato is detected, the rounding convergence rate drops — let the pitch oscillate naturally rather than snapping back every frame.

---

## 3. @use-gesture/react — Why It's The Right Choice & How To Use It

### 3.1 Why Not Raw PointerEvents?

Raw PointerEvents work, but `@use-gesture/react` gives you:

| Feature | Raw PointerEvents | @use-gesture/react |
|---|---|---|
| Multi-touch (simultaneous pointers) | Manual Map tracking | Built-in `touches` array |
| `movement` (delta from start) | Calculate manually | Auto-calculated `movement: [mx, my]` |
| `velocity` | Calculate manually | Auto-calculated `velocity: [vx, vy]` |
| `distance` total dragged | Calculate manually | Auto-calculated `distance` |
| Pointer capture (track outside element) | `setPointerCapture()` manually | Automatic |
| `touchAction: none` reminder | Must set manually | Built into `bind()` handler |
| `memo` (carry state between frames) | useRef manually | Built-in `memo` field in callback |

The key advantage for your slide mechanism: `@use-gesture/react` passes `movement: [mx, my]` (total delta from first touch) AND `delta: [dx, dy]` (delta since last frame) AND `velocity: [vx, vy]` in every handler call. This is exactly what you need for vibrato detection and pitch convergence rate.

### 3.2 Installation

```bash
npm install @use-gesture/react
```

Note: `react-use-gesture` is the old v9 package. `@use-gesture/react` is the current v10+ maintained package from pmndrs. Use the `@` scoped package.

### 3.3 The Keyboard Canvas Gesture Hook

The critical implementation for the keyboard:

```typescript
// src/hooks/useKeyboardGesture.ts
import { useRef, useCallback } from 'react'
import { useDrag } from '@use-gesture/react'
import { KeyboardLayout } from '../engine/keyboard/KeyboardLayout'
import { SlideEngine } from '../engine/pitch/SlideEngine'
import { VoiceManager } from '../engine/audio/VoiceManager'

interface UseKeyboardGestureOptions {
  layout: KeyboardLayout
  voiceManager: VoiceManager
  slideEngine: SlideEngine
  canvasRef: React.RefObject<HTMLCanvasElement>
}

export function useKeyboardGesture({
  layout,
  voiceManager,
  slideEngine,
  canvasRef,
}: UseKeyboardGestureOptions) {

  // useDrag provides multi-touch tracking — each finger gets its own args
  // We need a ref to track per-voice state mapped from pointerId
  const voiceMap = useRef<Map<number, number>>(new Map())   // pointerId → voiceId

  const bind = useDrag(
    ({
      event,
      xy: [clientX, clientY],      // absolute screen position
      movement: [mx, my],           // delta from first touch — use for vibrato depth
      delta: [dx, dy],              // delta since last frame — use for velocity
      velocity: [vx, vy],           // pixels/ms — use for vibrato rate detection
      first,                        // true on the very first pointerdown frame
      last,                         // true on the final pointerup frame
      touches,                      // number of simultaneous touches
      pointerId,                    // unique ID per finger
      memo,                         // carry-forward state between frames (no useRef needed)
    }) => {

      if (!canvasRef.current) return memo

      const rect = canvasRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      // Hit test: which key cell is the pointer in?
      const cell = layout.hitTest(x, y)
      if (!cell && first) return memo    // started outside keyboard

      // Carry forward the "last cell" from previous frame via memo
      const prevCell = memo?.cell ?? cell
      const voiceId = memo?.voiceId ?? pointerId

      if (first) {
        // ── NOTE ON ──────────────────────────────────────────────
        const keyX = cell ? (x - cell.x) / cell.width : 0.5
        const keyY = cell ? 1 - (y - cell.y) / cell.height : 0.5

        voiceManager.noteOn({
          voiceId,
          midiNote: cell!.midiNote,
          keyX,
          keyY,
          keyZ: (event as PointerEvent).pressure ?? 0,
          isAttack: true,
        })

        slideEngine.initVoice(voiceId, cell!.midiNote, keyX)
        voiceMap.current.set(pointerId, voiceId)

        // Return memo to carry to next frame
        return { cell, voiceId, keyXHistory: [keyX] }
      }

      if (last) {
        // ── NOTE OFF ─────────────────────────────────────────────
        voiceManager.noteOff(voiceId)
        slideEngine.clearVoice(voiceId)
        voiceMap.current.delete(pointerId)
        return undefined    // clear memo
      }

      // ── NOTE UPDATE (slide in progress) ────────────────────────
      const targetCell = cell ?? prevCell   // if finger goes off-grid, use last known cell
      const keyX = cell ? (x - targetCell.x) / targetCell.width : memo.cell ? (x - memo.cell.x) / memo.cell.width : 0.5
      const keyY = cell ? 1 - (y - targetCell.y) / targetCell.height : 0.5
      const keyZ = (event as PointerEvent).pressure ?? 0

      // Update slide engine — returns pitch bend in cents
      const pitchBendCents = slideEngine.update({
        voiceId,
        newColumn: targetCell.col,
        newRow: targetCell.row,
        keyX,
        keyY,
        keyZ,
        dx,          // frame delta for vibrato detection
        velocity: Math.sqrt(vx * vx + vy * vy),
      })

      voiceManager.noteUpdate(voiceId, pitchBendCents, keyY, keyZ)

      // Update key history in memo for vibrato tracking
      const newHistory = [...(memo?.keyXHistory ?? []), keyX].slice(-8)

      return { cell: targetCell, voiceId, keyXHistory: newHistory }
    },
    {
      // Configuration
      target: canvasRef,        // attach to canvas DOM node directly
      eventOptions: { passive: false },   // allow preventDefault
      pointer: { touch: true, mouse: true },
      // DO NOT set 'filterTaps: true' — we want every touch to trigger, not filter short taps
    }
  )

  return bind
}
```

### 3.4 Why `memo` Is Critical Here

The `memo` field in `@use-gesture/react` is the key feature that makes this work cleanly. Without it, you'd need a `useRef(new Map())` to carry state between `pointermove` frames. With `memo`, every drag handler invocation can carry its own per-touch state as the return value, and receives it back as `memo` on the next frame. This is exactly right for per-voice slide state.

### 3.5 Attaching the Gesture to the Canvas

```tsx
// src/components/KeyboardCanvas.tsx
import { useKeyboardGesture } from '../hooks/useKeyboardGesture'

export function KeyboardCanvas({ layout, voiceManager, slideEngine }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // useKeyboardGesture returns bind() from useDrag
  // We spread the bind result onto the canvas via {...bind()}
  const bind = useKeyboardGesture({ layout, voiceManager, slideEngine, canvasRef })

  return (
    <canvas
      ref={canvasRef}
      {...bind()}                  // attaches onPointerDown/Move/Up handlers
      style={{
        touchAction: 'none',       // CRITICAL: prevents browser scroll/zoom
        userSelect: 'none',
        WebkitUserSelect: 'none',
        display: 'block',
        width: '100%',
        height: '100%',
      }}
    />
  )
}
```

---

## 4. Pitch Rounding Engine — Full Implementation

### 4.1 The SlideEngine Class

This is the brain. Everything else feeds into it.

```typescript
// src/engine/pitch/SlideEngine.ts

export interface SlideEngineConfig {
  snapEnabled: boolean        // Snap to pitch center on attack
  roundEnabled: boolean       // Converge toward nearest note while sliding
  slideSpeed: number          // 0.0=instant, 0.15=default GeoShred, 1.0=fretless
  diatonicMode: boolean       // Only snap/round to scale notes
  scale: number[]             // Active scale degrees (0-11)
  temperamentOffsets: number[] // Per-note cent deviations from Equal Temperament (12 values)
  rowIntervals: number[]      // Semitones between rows
  startMidiNote: number
}

interface VoiceSlideState {
  voiceId: number
  baseMidiNote: number
  currentPitchCents: number
  targetPitchCents: number
  fingerPitchCents: number
  lastColumn: number
  lastRow: number
  keyXHistory: number[]      // Ring buffer for vibrato detection
  isVibrato: boolean
  convergenceOverride: number // 1.0 = normal, 0.3 = vibrato (slower convergence)
}

export class SlideEngine {
  private voices: Map<number, VoiceSlideState> = new Map()

  constructor(private config: SlideEngineConfig) {}

  setConfig(config: Partial<SlideEngineConfig>) {
    this.config = { ...this.config, ...config }
  }

  initVoice(voiceId: number, midiNote: number, keyX: number) {
    const baseCents = midiNote * 100
    const tempOffset = this.config.temperamentOffsets[midiNote % 12] ?? 0
    let startCents = baseCents + tempOffset

    if (this.config.snapEnabled) {
      startCents = this.findNearestScaleNoteCents(baseCents + (keyX - 0.5) * 100)
    }

    this.voices.set(voiceId, {
      voiceId,
      baseMidiNote: midiNote,
      currentPitchCents: startCents,
      targetPitchCents: startCents,
      fingerPitchCents: startCents,
      lastColumn: -1,
      lastRow: -1,
      keyXHistory: [keyX],
      isVibrato: false,
      convergenceOverride: 1.0,
    })
  }

  update(params: {
    voiceId: number
    newColumn: number
    newRow: number
    keyX: number
    keyY: number
    keyZ: number
    dx: number        // frame delta pixels
    velocity: number  // pointer velocity pixels/ms
  }): number /* pitchBendCents */ {

    const state = this.voices.get(params.voiceId)
    if (!state) return 0

    // Calculate finger pitch in cents from column + KeyX
    const colMidiNote = this.getColumnMidiNote(params.newColumn, params.newRow)
    const fingerCents = colMidiNote * 100 + (params.keyX - 0.5) * 100
    state.fingerPitchCents = fingerCents

    // Update KeyX history for vibrato detection
    state.keyXHistory.push(params.keyX)
    if (state.keyXHistory.length > 10) state.keyXHistory.shift()
    state.isVibrato = this.detectVibrato(state.keyXHistory)

    // Vibrato: reduce convergence so pitch oscillates naturally
    const targetConvergence = state.isVibrato ? 0.05 : 1.0
    state.convergenceOverride += (targetConvergence - state.convergenceOverride) * 0.1

    // Find nearest scale note
    const nearestCents = this.findNearestScaleNoteCents(fingerCents)

    if (this.config.roundEnabled) {
      // Convergence rate: slower when vibrato, faster when sliding fast
      const baseRate = (1.0 - this.config.slideSpeed) * 0.20
      const velocityBoost = Math.min(params.velocity * 0.01, 0.3) // faster slide = less correction
      const effectiveRate = baseRate * state.convergenceOverride * (1.0 - velocityBoost)

      state.targetPitchCents = nearestCents
      state.currentPitchCents += (state.targetPitchCents - state.currentPitchCents) * Math.max(0.005, effectiveRate)
    } else {
      // Pure fretless
      state.currentPitchCents = fingerCents
    }

    state.lastColumn = params.newColumn
    state.lastRow = params.newRow

    // Return bend relative to the base MIDI note of this voice
    return state.currentPitchCents - state.baseMidiNote * 100
  }

  clearVoice(voiceId: number) {
    this.voices.delete(voiceId)
  }

  private detectVibrato(history: number[]): boolean {
    if (history.length < 6) return false
    let reversals = 0
    for (let i = 1; i < history.length - 1; i++) {
      const d1 = history[i] - history[i - 1]
      const d2 = history[i + 1] - history[i]
      if (d1 !== 0 && d2 !== 0 && Math.sign(d1) !== Math.sign(d2)) reversals++
    }
    const amplitude = Math.max(...history) - Math.min(...history)
    return reversals >= 3 && amplitude > 0.04  // at least 4 cents of oscillation
  }

  private findNearestScaleNoteCents(fingerCents: number): number {
    if (!this.config.diatonicMode) {
      // Nearest chromatic note
      const nearest = Math.round(fingerCents / 100) * 100
      const noteClass = (Math.round(fingerCents / 100)) % 12
      return nearest + (this.config.temperamentOffsets[noteClass] ?? 0)
    }

    // Find nearest note in current scale
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

  private getColumnMidiNote(col: number, row: number): number {
    let note = this.config.startMidiNote
    for (let r = 0; r < row; r++) {
      note += this.config.rowIntervals[r] ?? this.config.rowIntervals[0]
    }
    return note + col
  }
}
```

### 4.2 Wiring PitchBendCents to the AudioWorklet

In the AudioWorklet processor, the pitch bend is applied by adjusting the delay line length:

```typescript
// Inside KarplusStrongProcessor.process() — for each voice per sample:
updateVoicePitch(voice: Voice) {
  // voice.pitchBendCents is the value from SlideEngine
  // voice.basePitchHz is the frequency of the root MIDI note
  const bendRatio = Math.pow(2, voice.pitchBendCents / 1200)
  const actualHz = voice.basePitchHz * bendRatio
  voice.currentDelayLength = this.sampleRate / actualHz
  // Lagrange interpolation handles the fractional delay
}
```

---

## 5. Veena / Xitar Physical Model

### 5.1 What Makes the Veena Sound Different From Guitar

Understanding Mahesh Raghavan's "Xitar" preset and the Veena/Sitar family:

| Property | Guitar | Veena / Sitar |
|---|---|---|
| Bridge type | Hard fixed bridge | Curved **jawari** (jivari) bridge |
| Bridge effect | Clean harmonics | **Buzzing** — string grazes bridge during vibration, adding shimmer |
| Decay | Moderate | Long, shimmer sustains |
| Brightness | Medium | Very bright, complex overtone halo |
| Sympathetic strings | None | 12–13 drone strings resonating sympathetically |
| Pluck position | Near bridge | ~0.1 (sitar), ~0.2 (veena) |
| Portamento | Short slides | **Long meend slides** — central to raga performance |
| Vibrato | Moderate | Extreme — multiple semitones, whole-note andolan |

### 5.2 The Jawari (Bridge Buzz) Algorithm

The jawari is the most unique part. It's a **nonlinear boundary condition** — the vibrating string occasionally grazes the curved bridge, creating a characteristic buzz. Modeled as:

```typescript
// In AudioWorklet — in the KS delay line feedback path:

function jawariFilter(sample: number, jawariAmount: number, jawariThreshold: number): number {
  // When the string displacement exceeds the threshold (bridge grazing),
  // inject a nonlinear distortion component
  if (Math.abs(sample) > jawariThreshold) {
    const excess = Math.abs(sample) - jawariThreshold
    const buzzComponent = Math.sin(excess * 80) * excess * jawariAmount
    return sample + buzzComponent * Math.sign(sample)
  }
  return sample
}

// Parameters:
// jawariAmount: 0.0 (no buzz) → 1.0 (heavy sitar buzz)
//               Veena: ~0.3–0.5 (subtle shimmer)
//               Sitar: ~0.6–0.8 (aggressive buzz)
//               Guitar: 0.0
// jawariThreshold: 0.1–0.5 (how loud the note must be before bridge grazes)
```

### 5.3 Sympathetic Resonator Bank

The sitar/veena has 12–13 additional steel strings tuned to the notes of the active raga. When the main string plays, these sympathetic strings resonate.

```typescript
// Inside AudioWorklet — a bank of 13 small KS voices running continuously

interface SympatheticString {
  delayLine: Float32Array
  writePtr: number
  length: number       // sample length = sampleRate / frequency
  gain: number         // 0.1–0.3 (subtle)
  decay: number        // 0.998 (very long, they ring forever)
}

function buildSympatheticBank(
  scale: number[],    // current raga scale degrees
  rootMidi: number,
  sampleRate: number
): SympatheticString[] {
  const sympathetics: SympatheticString[] = []

  // Use scale notes over 1–2 octaves as sympathetic strings
  for (const degree of scale) {
    for (let oct = 0; oct < 2; oct++) {
      const midi = rootMidi + degree + (oct * 12)
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      sympathetics.push({
        delayLine: new Float32Array(Math.ceil(sampleRate / freq) + 4),
        writePtr: 0,
        length: sampleRate / freq,
        gain: 0.15,
        decay: 0.9985,
      })
    }
  }
  return sympathetics
}

// Every time a main string note is played:
function exciteSympatheticStrings(bank: SympatheticString[], excitation: number) {
  for (const sym of bank) {
    // Inject a small amount of the pluck excitation
    sym.delayLine[sym.writePtr] += excitation * sym.gain * 0.05
  }
}

// Every sample tick — add sympathetic resonance to output:
function tickSympatheticBank(bank: SympatheticString[], output: Float32Array) {
  for (const sym of bank) {
    for (let i = 0; i < output.length; i++) {
      const readPtr = (sym.writePtr - Math.floor(sym.length) + sym.delayLine.length) % sym.delayLine.length
      const sample = sym.delayLine[readPtr]
      const filtered = sym.decay * (sample + sym.delayLine[(readPtr + 1) % sym.delayLine.length]) * 0.5
      sym.delayLine[sym.writePtr] = filtered
      sym.writePtr = (sym.writePtr + 1) % sym.delayLine.length
      output[i] += sample * sym.gain
    }
  }
}
```

### 5.4 Veena Preset Parameters

The complete parameter set for the "Xitar/Veena" preset:

```json
{
  "name": "Xitar 1.5 (Mahesh Raghvan Style)",
  "instrument": {
    "type": "veena_sitar",
    "parameters": {
      "stiffness": 0.12,
      "brightness": 0.88,
      "decay": 0.9960,
      "pluckPosition": 0.12,
      "jawariAmount": 0.45,
      "jawariThreshold": 0.18,
      "sympatheticGain": 0.25,
      "sympatheticDecay": 0.9985,
      "bodyResonanceQ": 8,
      "bodyResonanceFreq": 320,
      "palmMute": 0,
      "coarseTune": 0,
      "fineTune": 0
    }
  },
  "performanceSettings": {
    "slideSpeed": 0.05,
    "snapEnabled": true,
    "roundEnabled": true,
    "scale": "Kharaharapriya",
    "root": "C",
    "playMode": "string"
  },
  "effectsChain": [
    { "type": "reverb", "enabled": true, "parameters": { "decay": 2.5, "wet": 0.18 } },
    { "type": "echo", "enabled": true, "parameters": { "time": "dotted8th", "feedback": 0.22, "wet": 0.12 } }
  ]
}
```

### 5.5 Drone String (Tanpura)

Add a continuous tanpura drone that plays while you perform. This is standard in all Indian classical music:

```typescript
// src/engine/audio/DroneEngine.ts
// 4 strings tuned to: root (Sa), fifth (Pa), root octave down, root octave up
// Each is a long-decay KS voice, continuously ringing
// Plucked automatically in a slow arpeggiated pattern every ~1.5 seconds

class DroneEngine {
  private strings: KSVoice[] = []
  private intervalId: number | null = null

  startDrone(rootMidi: number, volume: number) {
    const tunings = [rootMidi - 12, rootMidi - 5, rootMidi, rootMidi + 12]
    this.strings = tunings.map(midi => new KSVoice({
      midiNote: midi,
      decay: 0.9995,
      brightness: 0.6,
      pluckPosition: 0.3,
    }))
    // Pluck each string in sequence, cycling
    let idx = 0
    this.intervalId = window.setInterval(() => {
      this.strings[idx % 4].pluck(0.3)
      idx++
    }, 1500)
  }

  stopDrone() {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}
```

---

## 6. Sample Instrument Engine

### 6.1 Architecture Overview

The sample engine allows a user to drop ANY audio file (MP3, WAV, FLAC, OGG) onto the interface, and then play the entire isomorphic keyboard with that sound — pitch-shifted to every note, with full slide/bend expressiveness.

This is different from a simple sample player. The sample is mapped to a root note, and every other key plays the sample at a different `playbackRate` (equivalent to pitch shift). The slide engine's `pitchBendCents` modulates the `playbackRate` in real time to produce continuous pitch bending from a sample.

```
User drops MP3 file
      ↓
FileReader / File System Access API decodes to ArrayBuffer
      ↓
AudioContext.decodeAudioData() → AudioBuffer (Float32Array of raw samples)
      ↓
Stored in SampleEngine (in-memory + IndexedDB for persistence)
      ↓
On noteOn(midiNote): Create AudioBufferSourceNode
  - playbackRate = 2^((midiNote - rootNote) / 12)
  - Connect: source → gainEnvelope → loopFilter → effectsChain → output
      ↓
On slideUpdate(pitchBendCents):
  - Adjust playbackRate: rate * 2^(pitchBendCents / 1200)
      ↓
On noteOff: Apply release envelope, then stop source
```

### 6.2 SampleEngine Implementation

```typescript
// src/engine/audio/SampleEngine.ts

export interface SampleConfig {
  rootMidiNote: number      // Which MIDI note the sample is "at" (default: 60 = C4)
  loopStart?: number        // For looping samples (seconds)
  loopEnd?: number
  loopEnabled: boolean
  attackTime: number        // Envelope attack (0 = instant pluck)
  releaseTime: number       // Envelope release (0.3–2.0s)
  tuningCents: number       // Fine tune the sample ±100 cents
}

interface SampleVoice {
  source: AudioBufferSourceNode
  gainNode: GainNode
  startTime: number
  basePlaybackRate: number   // rate at the sample's root note
}

export class SampleEngine {
  private buffer: AudioBuffer | null = null
  private config: SampleConfig = {
    rootMidiNote: 60,
    loopEnabled: false,
    attackTime: 0.002,
    releaseTime: 0.8,
    tuningCents: 0,
  }
  private voices: Map<number, SampleVoice> = new Map()

  constructor(
    private ctx: AudioContext,
    private outputNode: AudioNode
  ) {}

  // ── Load from File ───────────────────────────────────────────────────
  async loadFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
    // Auto-detect root note from filename: "piano_C4.wav" → rootNote = 60
    const detected = this.detectRootFromFilename(file.name)
    if (detected !== null) this.config.rootMidiNote = detected
  }

  async loadUrl(url: string): Promise<void> {
    const resp = await fetch(url)
    const arrayBuffer = await resp.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
  }

  // ── Note On ─────────────────────────────────────────────────────────
  noteOn(voiceId: number, midiNote: number, velocity: number): void {
    if (!this.buffer) return
    this.stopVoice(voiceId, 0)  // hard stop any existing voice on this ID

    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer

    // Pitch ratio: how many semitones from root
    const semitones = midiNote - this.config.rootMidiNote + this.config.tuningCents / 100
    source.playbackRate.value = Math.pow(2, semitones / 12)

    if (this.config.loopEnabled && this.config.loopStart !== undefined && this.config.loopEnd !== undefined) {
      source.loop = true
      source.loopStart = this.config.loopStart
      source.loopEnd = this.config.loopEnd
    }

    // Gain envelope
    const gainNode = this.ctx.createGain()
    gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(
      velocity,
      this.ctx.currentTime + this.config.attackTime
    )

    source.connect(gainNode)
    gainNode.connect(this.outputNode)
    source.start(this.ctx.currentTime)

    this.voices.set(voiceId, {
      source,
      gainNode,
      startTime: this.ctx.currentTime,
      basePlaybackRate: source.playbackRate.value,
    })
  }

  // ── Pitch Update (real-time slide) ───────────────────────────────────
  updatePitch(voiceId: number, pitchBendCents: number): void {
    const voice = this.voices.get(voiceId)
    if (!voice) return
    // Adjust playback rate for pitch bend
    const bendRatio = Math.pow(2, pitchBendCents / 1200)
    const newRate = voice.basePlaybackRate * bendRatio
    // Smooth rate change to avoid zipper noise
    voice.source.playbackRate.setTargetAtTime(newRate, this.ctx.currentTime, 0.005)
  }

  // ── Note Off ────────────────────────────────────────────────────────
  noteOff(voiceId: number): void {
    this.stopVoice(voiceId, this.config.releaseTime)
  }

  private stopVoice(voiceId: number, releaseTime: number): void {
    const voice = this.voices.get(voiceId)
    if (!voice) return
    if (releaseTime > 0) {
      voice.gainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, releaseTime / 5)
      voice.source.stop(this.ctx.currentTime + releaseTime)
    } else {
      voice.source.stop()
    }
    this.voices.delete(voiceId)
  }

  // Auto-detect root note from filename convention
  private detectRootFromFilename(filename: string): number | null {
    const noteNames: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }
    const match = filename.match(/([A-G][b#]?)(\d)/i)
    if (!match) return null
    const noteClass = noteNames[match[1].toUpperCase()] ?? null
    if (noteClass === null) return null
    const octave = parseInt(match[2])
    return (octave + 1) * 12 + noteClass
  }
}
```

### 6.3 Drop Zone UI Component

```tsx
// src/components/SampleDropZone.tsx

export function SampleDropZone({ onSampleLoaded }: { onSampleLoaded: (name: string) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const [sampleName, setSampleName] = useState<string | null>(null)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    // Validate: audio files only
    if (!file.type.startsWith('audio/')) return alert('Please drop an audio file')
    await sampleEngine.loadFile(file)
    setSampleName(file.name)
    onSampleLoaded(file.name)
  }

  return (
    <div
      className={`sample-dropzone ${isDragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      {sampleName ? (
        <span className="sample-name">🎵 {sampleName}</span>
      ) : (
        <span>Drop audio file here<br/><small>MP3 · WAV · FLAC · OGG</small></span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={e => handleDrop({ dataTransfer: { files: e.target.files! } } as any)}
      />
    </div>
  )
}
```

### 6.4 Sample Loop Point Editor (Optional Advanced Feature)

For longer samples, let the user define loop points — so the note sustains indefinitely:

```
[Waveform Visualization]  ←  Canvas rendering of buffer peaks
[   ]▐███████████████▌[   ]
      ↑ loopStart      ↑ loopEnd
      (drag handles)

Controls:
- Loop On/Off toggle
- Root Note selector (C3, C4, etc.)
- Fine Tune ±100 cents
- Attack | Decay | Sustain | Release (basic ADSR)
```

---

## 7. UI Visual Overhaul — Key Rendering & Touch Feedback

### 7.1 What Needs to Change in the Current UI (From Screenshot)

Looking at your screenshot:

1. **Key cells** are too uniform — the active key visual (just amber border) doesn't feel alive enough
2. **The concentric circles** on root notes are good — keep them, but animate them when pressed
3. **Note label position** — currently centered. Move to bottom-center of key for better playability visibility
4. **Touch feedback** is missing — pressing a key should produce: glow, ripple, pitch trace line
5. **Pitch slide trail** — as finger slides, draw a colored trail showing the pitch path
6. **The control surface** (EXPRESSION bar at top) needs functional visual feedback on its sliders
7. **Color palette** — the teal/amber is on the right track. Add gradient depth to keys

### 7.2 Canvas Rendering Upgrade

```typescript
// src/engine/renderer/KeyboardRenderer.ts

interface RippleEffect {
  x: number; y: number
  radius: number; maxRadius: number
  alpha: number
  color: string
}

interface PitchTrail {
  voiceId: number
  points: Array<{ x: number; y: number; pitchCents: number; timestamp: number }>
  color: string
}

export class KeyboardRenderer {
  private ripples: RippleEffect[] = []
  private trails: Map<number, PitchTrail> = new Map()
  private animFrameId: number | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private layout: KeyCell[],
  ) {}

  startRenderLoop() {
    const render = () => {
      this.drawFrame()
      this.animFrameId = requestAnimationFrame(render)
    }
    this.animFrameId = requestAnimationFrame(render)
  }

  drawFrame() {
    const ctx = this.canvas.getContext('2d')!
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // 1. Draw all key backgrounds
    for (const cell of this.layout) {
      this.drawKey(ctx, cell)
    }

    // 2. Draw pitch trails (slide paths)
    for (const trail of this.trails.values()) {
      this.drawPitchTrail(ctx, trail)
    }

    // 3. Draw active key glows (on top of keys)
    for (const cell of this.layout) {
      if (cell.isActive) this.drawActiveGlow(ctx, cell)
    }

    // 4. Draw ripple effects (newest on top)
    this.ripples = this.ripples.filter(r => r.alpha > 0.01)
    for (const ripple of this.ripples) {
      this.drawRipple(ctx, ripple)
      ripple.radius += 2.5
      ripple.alpha *= 0.93
    }
  }

  private drawKey(ctx: CanvasRenderingContext2D, cell: KeyCell) {
    const { x, y, width, height } = cell

    // ── Background gradient based on key type ──
    let bgColor: string
    if (cell.isRoot) {
      bgColor = cell.isActive ? '#a06800' : '#2d1e00'  // amber
    } else if (!cell.isInScale) {
      bgColor = '#111122'                               // very dark, out of scale
    } else {
      bgColor = cell.isActive ? '#1a3a5c' : '#0e1a2e'  // teal-blue
    }

    ctx.fillStyle = bgColor
    this.roundRect(ctx, x + 1, y + 1, width - 2, height - 2, 6)
    ctx.fill()

    // ── Border ──
    const borderColor = cell.isActive
      ? (cell.isRoot ? '#ffa500' : '#00d4ff')
      : (cell.isRoot ? '#8b6914' : '#1a4060')
    ctx.strokeStyle = borderColor
    ctx.lineWidth = cell.isActive ? 1.5 : 0.8
    this.roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 6)
    ctx.stroke()

    // ── Root note concentric rings ──
    if (cell.isRoot) {
      const cx = x + width / 2
      const cy = y + height * 0.38   // slightly above center
      const baseR = Math.min(width, height) * 0.22
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath()
        ctx.arc(cx, cy, baseR * i * 0.5, 0, Math.PI * 2)
        ctx.strokeStyle = cell.isActive
          ? `rgba(255, 165, 0, ${0.15 * i})`
          : `rgba(180, 100, 0, ${0.08 * i})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = cell.isActive ? '#ffa500' : '#8b6914'
      ctx.fill()
    } else {
      // Non-root: small guide dot
      const cx = x + width / 2
      const cy = y + height * 0.35
      ctx.beginPath()
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = cell.isInScale
        ? (cell.isActive ? '#00d4ff' : '#1a5a7a')
        : '#0d1a2a'
      ctx.fill()
    }

    // ── Note name label ── (bottom third of key)
    const fontSize = Math.max(10, Math.min(16, height * 0.22))
    ctx.font = `${cell.isRoot ? 600 : 400} ${fontSize}px 'Inter', system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = cell.isRoot
      ? (cell.isActive ? '#ffd700' : '#b8860b')
      : (cell.isInScale ? '#8ab4cc' : '#334455')
    ctx.fillText(cell.noteName, x + width / 2, y + height - 6)
  }

  private drawActiveGlow(ctx: CanvasRenderingContext2D, cell: KeyCell) {
    const glowColor = cell.isRoot ? 'rgba(255,160,0,0.4)' : 'rgba(0,200,255,0.35)'
    const cx = cell.x + cell.width / 2
    const cy = cell.y + cell.height / 2

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cell.width, cell.height) * 0.7)
    gradient.addColorStop(0, glowColor)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cell.x - 10, cell.y - 10, cell.width + 20, cell.height + 20)
  }

  private drawPitchTrail(ctx: CanvasRenderingContext2D, trail: PitchTrail) {
    if (trail.points.length < 2) return
    const now = Date.now()

    ctx.beginPath()
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let i = 1; i < trail.points.length; i++) {
      const p = trail.points[i]
      const age = (now - p.timestamp) / 1000   // seconds old
      if (age > 0.8) continue    // fade after 800ms

      const alpha = Math.max(0, 1 - age / 0.8) * 0.7
      // Color: blue for flat side, orange for sharp side
      const bend = p.pitchCents
      const hue = bend < 0 ? 200 : bend > 0 ? 35 : 180
      ctx.strokeStyle = `hsla(${hue}, 90%, 70%, ${alpha})`

      ctx.beginPath()
      ctx.moveTo(trail.points[i - 1].x, trail.points[i - 1].y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }

    // Remove old points
    trail.points = trail.points.filter(p => now - p.timestamp < 800)
  }

  private drawRipple(ctx: CanvasRenderingContext2D, ripple: RippleEffect) {
    ctx.beginPath()
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
    ctx.strokeStyle = ripple.color.replace(')', `, ${ripple.alpha})`).replace('rgb', 'rgba')
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // ── Public API ───────────────────────────────────────────────────────

  triggerRipple(x: number, y: number, isRoot: boolean) {
    this.ripples.push({
      x, y,
      radius: 8,
      maxRadius: 50,
      alpha: 0.9,
      color: isRoot ? 'rgb(255, 160, 0)' : 'rgb(0, 200, 255)',
    })
  }

  addTrailPoint(voiceId: number, x: number, y: number, pitchBendCents: number) {
    if (!this.trails.has(voiceId)) {
      this.trails.set(voiceId, { voiceId, points: [], color: '#00d4ff' })
    }
    this.trails.get(voiceId)!.points.push({ x, y, pitchCents: pitchBendCents, timestamp: Date.now() })
  }

  clearTrail(voiceId: number) {
    this.trails.delete(voiceId)
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)  // modern browsers support this
  }
}
```

### 7.3 Pitch Bend Visualizer (Per Key)

When a finger is actively on a key and bending pitch, draw a small indicator:

```
┌────────────────────┐
│   •                │  ← guide dot
│                    │
│  [━━━━●━━━━━━━]    │  ← pitch bend bar at center
│       ▲            │    ● = finger position
│       0 cents      │    bar fills left (flat) or right (sharp)
│  C                 │
└────────────────────┘
```

This runs in the canvas render loop — per active touch, look up its `currentPitchBendCents` and draw a horizontal indicator in the key cell.

---

## 8. UX Architecture Overhaul

### 8.1 Layout Redesign

```
┌──────────────────────────────────────────────────────────────────────┐
│  ≡  │  ◀ Xitar 1.5 ▶  │  [String] [Poly] [Mono]  │  🎵 SAMPLE  ⚙  │
├─────┴─────────────────────────────────────────────┴──────────────────┤
│  XY PAD   │ WHAMMY │  VOL  │  VIB  │  MUTE  │ [DRONE] │  [+SAMPLE]  │
│  [  2D  ] │  [↕]   │  [↕]  │  [↕]  │  [▪]   │  [▸]    │  dropzone   │
├───────────┴────────┴───────┴───────┴────────┴─────────┴─────────────┤
│                                                                       │
│  ██████████████████████  KEYBOARD  ███████████████████████████████   │
│   Row 6 ──────────────────────────────────────────────────────────   │
│   Row 5 ──────────────────────────────────────────────────────────   │
│   Row 4 ──────────────────────────────────────────────────────────   │
│   Row 3 ──────────────────────────────────────────────────────────   │
│   Row 2 ──────────────────────────────────────────────────────────   │
│   Row 1 ──────────────────────────────────────────────────────────   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Key UX changes from current layout:
- Move **OCTAVE** selector into the header bar (currently top-left, slightly lost)
- **Sample drop zone** lives in the control surface as a slot — visible but not intrusive
- **Drone toggle** in control surface — tap once to start tanpura drone
- **Play mode** (String/Poly/Mono) in header bar for one-tap access
- Control surface collapses to icons-only on small screens

### 8.2 The Settings Panel (Slide-Out Drawer)

Replace the current scattered top controls with a clean drawer:

```
┌──────────────────────────────────┐
│  ≡  SETTINGS                  ✕  │
├──────────────────────────────────┤
│  KEYBOARD                         │
│  ┌─ Rows ─────────┐ [4 ▾]        │
│  ├─ Row Interval ──┤ [5 st ▾]     │
│  └─ Start Note ───┘ [E3 ▾]       │
├──────────────────────────────────┤
│  EXPRESSION                       │
│  Snap      ●──────  ON            │
│  Round     ●──────  ON            │
│  Slide     ────●──  0.15          │
│  Diatonic  ────  ○  OFF           │
├──────────────────────────────────┤
│  SCALE & TUNING                   │
│  Scale     [Kharaharapriya ▾]     │
│  Root      [C ▾]                  │
│  Tuning    [Equal ▾]              │
├──────────────────────────────────┤
│  INSTRUMENT MODEL                 │
│  Type      [Xitar / Veena ▾]      │
│  Jawari    ────●──  0.45          │
│  Sympathetic ──●──  0.25          │
│  Drone     ──●────  OFF           │
├──────────────────────────────────┤
│  SAMPLE                           │
│  [  Drop Audio File Here  ]       │
│  Root Note  [C4 ▾]                │
│  Loop       ○ OFF                 │
│  Fine Tune  ───●──  +0 ¢          │
└──────────────────────────────────┘
```

### 8.3 CSS Design System

```css
/* src/styles/design-tokens.css */
:root {
  /* Backgrounds */
  --bg-base: #050d1a;
  --bg-surface: #0a1628;
  --bg-elevated: #0e1e36;

  /* Key Colors */
  --key-default: #0b172a;
  --key-inscale: #0e1e36;
  --key-root: #1f1000;
  --key-active: #0f2840;
  --key-root-active: #2d1e00;
  --key-outscale: #060d18;

  /* Accents */
  --accent-cyan: #00c8f0;
  --accent-amber: #ffa500;
  --accent-deep-teal: #005f7a;
  --accent-gold: #c8930a;

  /* Borders */
  --border-key: #152535;
  --border-active: #00c8f0;
  --border-root-active: #ffa500;

  /* Typography */
  --font-note: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --color-note-inscale: #6aa5bf;
  --color-note-root: #d4a017;
  --color-note-outscale: #283845;

  /* Control Surface */
  --cs-bg: #070f1e;
  --cs-slider-track: #1a2d45;
  --cs-slider-thumb: #00c8f0;
  --cs-button-bg: #0d2035;
  --cs-button-active: #0f3a5a;

  /* Shadows */
  --glow-cyan: 0 0 12px rgba(0, 200, 240, 0.5);
  --glow-amber: 0 0 12px rgba(255, 165, 0, 0.5);
  --glow-key-active: 0 0 20px rgba(0, 200, 240, 0.3);
}
```

### 8.4 Framer Motion Animations

Add subtle animations for UX polish:

```tsx
// Preset name change — animate in
<motion.div
  key={preset.name}
  initial={{ opacity: 0, y: -8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.15 }}
>
  {preset.name}
</motion.div>

// Settings panel — slide in from left
<motion.aside
  initial={{ x: -320 }}
  animate={{ x: isOpen ? 0 : -320 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <SettingsPanel />
</motion.aside>

// Instrument switch — crossfade
<AnimatePresence>
  <motion.div
    key={instrumentType}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <InstrumentControls />
  </motion.div>
</AnimatePresence>
```

Install: `npm install framer-motion`

### 8.5 Mobile-Specific UX

```css
/* Landscape-only enforcement on mobile */
@media (orientation: portrait) and (max-width: 768px) {
  .rotate-device-prompt {
    display: flex;   /* Show "Please rotate" message */
  }
  .app-container {
    display: none;
  }
}

/* Safe area insets (iOS notch / Android cutout) */
.header-bar {
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
}
.keyboard-canvas {
  height: calc(100dvh - var(--header-height) - var(--control-surface-height)
              - env(safe-area-inset-bottom));
}
```

---

## 9. Step-by-Step Implementation Sequence

Follow this exact order. Each step builds on the previous.

---

### STEP 1 — Install New Dependencies (Day 1)

```bash
npm install @use-gesture/react framer-motion
npm install -D @types/audioworklet
```

No code yet — just install and verify the dev server still builds.

---

### STEP 2 — Upgrade Touch Input to @use-gesture (Day 1–2)

**Goal:** Replace raw `onPointerDown/Move/Up` on the canvas with `useDrag` from `@use-gesture/react`.

**Files to create/modify:**
- `src/hooks/useKeyboardGesture.ts` — new file (code from Section 3.3 above)
- `src/components/KeyboardCanvas.tsx` — swap event handlers for `{...bind()}`

**Test:** Open DevTools → Mobile simulation → Touch and drag. Verify `pointerdown/move/up` are all firing. The sound may not change yet (that's OK), but the event data should be logged correctly.

**Verification criteria:**
- [ ] Dragging across keys logs the correct (column, row, keyX, keyY) values
- [ ] Two simultaneous touches each get their own `voiceId` / `pointerId`
- [ ] Lifting a finger ends only that voice, not all voices

---

### STEP 3 — Build the SlideEngine (Day 2–4)

**Goal:** Implement the Snap + Round pitch rounding from Section 4.1.

**Files to create:**
- `src/engine/pitch/SlideEngine.ts` — full implementation (Section 4.1)

**Integration:**
- Wire `useKeyboardGesture.ts` to call `slideEngine.initVoice()` on first touch
- Call `slideEngine.update()` on every `pointermove`
- Log the returned `pitchBendCents` value

**Test without audio:** Use a `<canvas>` overlay to display the current `pitchBendCents` per active touch as a number. You should see:
- 0 cents when finger is at key center
- Up to ±50 cents when finger is at key edge
- Rapid convergence back toward 0 cents when finger stops (Round effect)
- Instant lock to 0 on initial touch (Snap effect)

**Verification criteria:**
- [ ] Snap: touching key center → `pitchBendCents` = 0 immediately
- [ ] Snap: touching key edge → `pitchBendCents` converges quickly to 0
- [ ] Round: sliding slowly → pitch converges
- [ ] Fretless mode: pitch follows finger exactly
- [ ] Vibrato: rapid left-right oscillation → convergence slows, pitch oscillates

---

### STEP 4 — Wire PitchBend to AudioWorklet (Day 4–5)

**Goal:** The Karplus-Strong delay line adjusts its length in real time based on `pitchBendCents`.

**Files to modify:**
- `src/engine/audio/worklets/KarplusStrongProcessor.ts` — add `updatePitch()` method that adjusts `currentDelayLength` using `Math.pow(2, pitchBendCents / 1200)`
- `src/engine/audio/VoiceManager.ts` — call `audioWorklet.port.postMessage({ type: 'noteUpdate', voiceId, pitchBendCents })` from within `noteUpdate()`

**Critical implementation note:** The delay line length update must use Lagrange fractional delay (Section 2.4 from the main PRD). Without it, pitch changes produce audible stepping artifacts.

**Test:** Play a note and slowly slide left/right. You should hear:
- Smooth, continuous pitch change — like bending a guitar string
- No clicks or pops at key boundaries
- Pitch converges back to "in tune" when finger slows

**Verification criteria:**
- [ ] Smooth pitch bend with no stepping artifacts
- [ ] Bending across 2+ semitones is clean and continuous
- [ ] Fast slides sound like meend on a veena
- [ ] Slow vibrato sounds like natural string vibrato

---

### STEP 5 — Upgrade the Canvas Renderer (Day 5–7)

**Goal:** Replace the current static key drawing with the animated renderer from Section 7.2.

**Files to create/modify:**
- `src/engine/renderer/KeyboardRenderer.ts` — new class (Section 7.2)
- `src/components/KeyboardCanvas.tsx` — start the render loop, trigger ripples on noteOn, add trail points on noteUpdate

**Changes to key visuals:**
- Root note concentric rings animate (pulse on attack, glow while held)
- Active key: color transitions from idle to active with subtle radial gradient
- Pitch trail: colored line drawn behind sliding finger
- Touch ripple: expanding ring on initial press

**Verification criteria:**
- [ ] Root note keys glow amber when pressed
- [ ] Non-root in-scale keys glow cyan when pressed
- [ ] Ripple effect appears on first touch
- [ ] Pitch trail draws the slide path and fades after ~800ms
- [ ] 60fps maintained with 6 simultaneous touches

---

### STEP 6 — Build the Veena Physical Model (Day 7–10)

**Goal:** Add Jawari bridge buzz + Sympathetic resonator bank to the AudioWorklet.

**Files to modify:**
- `src/engine/audio/worklets/KarplusStrongProcessor.ts`:
  - Add `jawariFilter()` function in the loop filter feedback path (Section 5.2)
  - Add `SympatheticString[]` bank and `tickSympatheticBank()` (Section 5.3)
  - Add message handler for `setInstrumentType` ('guitar' | 'veena_sitar')
  - When instrument = 'veena_sitar': apply jawari filter, enable sympathetic bank

**Files to create:**
- `src/presets/factory/xitar-mahesh.json` — Xitar 1.5 preset (Section 5.4 parameters)
- `src/engine/audio/DroneEngine.ts` — Tanpura drone (Section 5.5)

**Test:** Load the Xitar preset and play some notes. You should hear:
- The characteristic shimmer/buzz on every note (jawari effect)
- Notes sustaining longer with complex overtone bloom
- Sympathetic strings creating a "halo" of resonance after each note
- Drone button activates the tanpura

**Verification criteria:**
- [ ] Guitar preset: clean pluck, no buzz
- [ ] Veena preset: shimmer on every note, especially audible on lower notes
- [ ] Sympathetic strings audible but not overwhelming
- [ ] Drone engine starts/stops cleanly

---

### STEP 7 — Build the Sample Instrument Engine (Day 10–13)

**Goal:** Let the user drop any audio file and play the keyboard with that sound.

**Files to create:**
- `src/engine/audio/SampleEngine.ts` — full implementation (Section 6.2)
- `src/components/SampleDropZone.tsx` — drop zone UI (Section 6.3)

**Files to modify:**
- `src/components/ControlSurface.tsx` — add Sample slot to control surface
- `src/store/audioStore.ts` — add `engineMode: 'physical' | 'sample'` to state

**Integration:**
- When a sample is loaded and `engineMode === 'sample'`, route `noteOn/noteOff/noteUpdate` to `SampleEngine` instead of `VoiceManager`
- `SampleEngine.updatePitch()` adjusts `AudioBufferSourceNode.playbackRate` in real time

**Test:** Load a vocal sample (e.g., your own voice saying "Aa"). Play the keyboard. You should hear:
- Each key plays the sample at a different pitch
- Sliding across keys bends the pitch continuously
- The "GeoShred with your own voice" experience

**Verification criteria:**
- [ ] MP3 / WAV / OGG all load correctly
- [ ] Pitch shift spans ±24 semitones without serious artifacts
- [ ] Continuous pitch bend works from sample (not just discrete notes)
- [ ] Loading a new file replaces the old one cleanly
- [ ] Root note auto-detected from filename when possible

---

### STEP 8 — UI/UX Overhaul (Day 13–17)

**Goal:** Redesign the full UI using the new design system from Section 8.

**Files to create/modify:**
- `src/styles/design-tokens.css` — CSS variables (Section 8.3)
- `src/components/Header.tsx` — new header with preset navigation, play mode, sample indicator
- `src/components/ControlSurface.tsx` — new layout with XY pad, Whammy, slots, sample drop zone
- `src/components/SettingsPanel.tsx` — slide-out drawer (Section 8.2)
- Install and configure `framer-motion` for panel animations

**Specific UI tasks:**
1. Note labels: move to bottom-center of each key (not vertically centered)
2. Add `Inter` or `Noto Sans` font for note labels (better than system-ui)
3. Root note: concentric rings must be visible but not cluttered on small keys
4. Idle state: all keys slightly brighter (increase `--key-default` base luminosity by ~10%)
5. Scale highlight: in-scale keys vs out-of-scale keys have clearer contrast ratio (3:1 minimum)
6. Pitch indicator bar in active keys (Section 7.3)

**Verification criteria:**
- [ ] Settings panel slides in/out smoothly
- [ ] Preset navigation with ◀▶ arrows advances through presets
- [ ] Play mode tabs switch correctly and change audio behavior
- [ ] Sample drop zone visible and functional in control surface
- [ ] Landscape orientation forced on mobile
- [ ] All touch targets ≥ 44×44px (WCAG accessibility)

---

### STEP 9 — Whammy & Expression Controls (Day 17–19)

**Goal:** Wire the Whammy and Expression sliders in the control surface to actual audio parameters.

**Whammy (pitch bend bar):**
- Vertical drag slider in control surface
- On drag: sends global pitch bend to ALL active voices simultaneously
- Range: configurable ±2 to ±24 semitones
- Auto-return to center on release (spring animation with `framer-motion`)

**XY Expression Pad:**
- X axis → vibrato depth
- Y axis → expression / brightness (KeyY equivalent for all voices)

```typescript
// src/components/ControlSurface.tsx
import { useDrag } from '@use-gesture/react'

function WhammySlider({ onPitchBend }: { onPitchBend: (cents: number) => void }) {
  const [y, setY] = useState(0)   // 0 = center, -1 = max up, +1 = max down
  const MAX_PX = 80

  const bind = useDrag(({ movement: [, my], last }) => {
    if (last) {
      // Spring return to center
      animate(y, 0, { onUpdate: setY })
    } else {
      const normalized = Math.max(-1, Math.min(1, my / MAX_PX))
      setY(normalized)
      onPitchBend(normalized * 2400)  // ±24 semitones = ±2400 cents
    }
  })

  return (
    <div className="whammy-track" {...bind()}>
      <div className="whammy-thumb" style={{ transform: `translateY(${y * MAX_PX}px)` }} />
    </div>
  )
}
```

**Verification criteria:**
- [ ] Whammy bends ALL playing notes simultaneously
- [ ] Auto-return to center on release (spring animation)
- [ ] XY pad affects vibrato/brightness in real time
- [ ] Volume slider controls master gain

---

### STEP 10 — Performance & PWA (Day 19–21)

**Goal:** Make the app feel native on Android Chrome.

**Performance:**

```typescript
// 1. OffscreenCanvas for keyboard rendering (off main thread)
const offscreen = canvas.transferControlToOffscreen()
const renderWorker = new Worker(new URL('../workers/KeyboardRenderWorker.ts', import.meta.url))
renderWorker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])

// 2. Prevent garbage collection during performance
// Pre-allocate all AudioWorklet Float32Arrays at startup
// Never create new arrays in the audio thread

// 3. Disable iOS bounce scrolling
document.body.style.overflow = 'hidden'
document.body.style.position = 'fixed'

// 4. Request wake lock (keeps screen on during performance)
const wakeLock = await navigator.wakeLock.request('screen')

// 5. Reduce AudioContext latency
const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
// On Android: prefer 256 sample buffer
```

**PWA manifest:**
```json
{
  "name": "GeoShred Web",
  "short_name": "GeoShred",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#050d1a",
  "theme_color": "#050d1a",
  "start_url": "/?standalone=1"
}
```

**Verification criteria:**
- [ ] App installs as PWA on Android Chrome
- [ ] No scroll/bounce on keyboard touch
- [ ] Screen stays on during performance (wake lock)
- [ ] 60fps sustained with 6 active touches
- [ ] Audio latency <20ms on mid-range Android

---

## 10. File & Module Map

```
src/
├── engine/
│   ├── pitch/
│   │   └── SlideEngine.ts              ← NEW: Snap+Round pitch rounding (Step 3)
│   ├── audio/
│   │   ├── VoiceManager.ts             ← UPDATE: wire slideEngine output to worklet
│   │   ├── SampleEngine.ts             ← NEW: sample instrument engine (Step 7)
│   │   ├── DroneEngine.ts              ← NEW: tanpura drone (Step 6)
│   │   └── worklets/
│   │       └── KarplusStrongProcessor.ts  ← UPDATE: jawari, sympathetic, pitch bend
│   ├── renderer/
│   │   └── KeyboardRenderer.ts         ← NEW: animated canvas renderer (Step 5)
│   └── keyboard/
│       └── KeyboardLayout.ts           ← existing, minor updates
├── hooks/
│   └── useKeyboardGesture.ts           ← NEW: @use-gesture/react integration (Step 2)
├── components/
│   ├── KeyboardCanvas.tsx              ← UPDATE: use new gesture hook + renderer
│   ├── ControlSurface.tsx              ← UPDATE: Whammy, XY pad, Sample slot (Step 9)
│   ├── Header.tsx                      ← UPDATE: new layout (Step 8)
│   ├── SettingsPanel.tsx               ← UPDATE: slide-out drawer (Step 8)
│   └── SampleDropZone.tsx              ← NEW: sample loading UI (Step 7)
├── presets/factory/
│   ├── acoustic-steel.json             ← existing
│   ├── xitar-mahesh.json               ← NEW: Xitar 1.5 Veena preset
│   └── classical-veena.json            ← NEW: pure veena preset
├── styles/
│   └── design-tokens.css              ← NEW: CSS variables (Step 8)
└── store/
    └── audioStore.ts                  ← UPDATE: add engineMode, slideConfig
```

---

## 11. Testing & Validation Checklist

### Audio Quality Tests

- [ ] **Slide test**: Play C4, slide slowly to E4, back to C4. Should sound like a guitar bend, no clicks
- [ ] **Meend test**: Rapid slide across 4–5 notes. Should sound like classical Indian meend ornament
- [ ] **Vibrato test**: Oscillate finger quickly within a single key. Should hear clean vibrato
- [ ] **Snap test**: Tap randomly off-center in a key. First note should always be perfectly in tune
- [ ] **Polyphony test**: Touch 4 different keys simultaneously. All 4 notes should sound independently
- [ ] **HOPO test**: Hold one note, then touch a higher note on the same row. Should sound like hammer-on
- [ ] **Jawari test**: Switch to Veena preset. Every note should have shimmer buzz, not just clean pluck
- [ ] **Sample test**: Load a WAV file, play keyboard. Pitch shift should be clean and slideable

### Performance Tests

- [ ] **Latency test**: Touch to sound < 20ms on Android Chrome (use DevTools timeline)
- [ ] **FPS test**: 6 simultaneous touches, 60fps maintained on canvas rendering
- [ ] **Memory test**: 10 minutes of playing, no memory growth (Chrome Task Manager)

### UX Tests (Test on real Android device, not just desktop browser)

- [ ] Finger can slide across 10 keys without lift — all notes change smoothly
- [ ] Two fingers can slide independently on different rows
- [ ] Whammy bar responds to vertical drag correctly
- [ ] Settings panel can be opened/closed while playing (no audio interruption)
- [ ] Sample can be loaded without interrupting current sound
- [ ] App installs from Chrome "Add to Home Screen" and opens in landscape

---

## Appendix A — Instrument Preset JSON Reference

```json
// src/presets/factory/xitar-mahesh.json
{
  "id": "xitar-mahesh-15",
  "name": "Xitar 1.5 Mahesh",
  "color": "white",
  "instrument": {
    "type": "veena_sitar",
    "parameters": {
      "stiffness": 0.10,
      "brightness": 0.90,
      "decay": 0.9962,
      "pluckPosition": 0.12,
      "jawariAmount": 0.48,
      "jawariThreshold": 0.15,
      "sympatheticGain": 0.28,
      "sympatheticDecay": 0.9988,
      "palmMute": 0.0,
      "coarseTune": 0,
      "fineTune": 0
    }
  },
  "performanceSettings": {
    "playMode": "string",
    "snapEnabled": true,
    "roundEnabled": true,
    "slideSpeed": 0.04,
    "diatonicEnabled": false,
    "scale": [0, 2, 3, 5, 7, 9, 10],
    "root": 0,
    "rows": 6,
    "rowIntervals": [5, 5, 5, 5, 5],
    "startMidiNote": 40
  },
  "effectsChain": [
    {
      "type": "reverb",
      "enabled": true,
      "parameters": { "decay": 3.0, "wet": 0.22, "predelay": 0.02 }
    },
    {
      "type": "echo",
      "enabled": true,
      "parameters": { "time": 0.375, "feedback": 0.20, "wet": 0.10 }
    }
  ],
  "controlSurface": {
    "slots": [
      { "type": "slider", "label": "Vol", "controller": "volume", "initial": 0.85 },
      { "type": "slider", "label": "Jawari", "controller": "jawariAmount", "initial": 0.48 },
      { "type": "slider", "label": "Sympath", "controller": "sympatheticGain", "initial": 0.28 },
      { "type": "toggle", "label": "Drone", "controller": "drone", "initial": false }
    ]
  }
}
```

---

## Appendix B — @use-gesture/react Quick Reference

```typescript
// The three hooks you'll use:
import { useDrag, useGesture, createUseGesture, dragAction } from '@use-gesture/react'

// State fields available in every useDrag callback:
({
  event,            // original PointerEvent
  xy: [x, y],      // current absolute screen position
  initial: [ix, iy], // position at drag start
  movement: [mx, my], // total delta from start
  delta: [dx, dy],  // delta from last frame
  velocity: [vx, vy], // pixels/ms
  direction: [sx, sy], // sign of movement (-1, 0, 1)
  distance,         // total distance dragged
  first,            // true on first frame
  last,             // true on last frame
  active,           // true while drag is active
  touches,          // number of active touches
  pointerId,        // unique per-finger ID
  memo,             // your carry-forward state
  cancel,           // call this to cancel the gesture
}) => { /* handler */ }

// Config options you MUST set for keyboard:
useDrag(handler, {
  target: canvasRef,                 // attach to canvas node
  eventOptions: { passive: false },  // required for preventDefault
  pointer: { touch: true },          // enable touch
})

// The key difference between react-use-gesture (v9) and @use-gesture/react (v10):
// v9: import { useDrag } from 'react-use-gesture'        ← OLD, unmaintained
// v10: import { useDrag } from '@use-gesture/react'       ← CURRENT, use this
```

---

*This document covers every detail needed to implement the slide mechanism, Veena physical model, sample engine, and full UI/UX overhaul. Implement the 10 steps in order — each is independently testable and deployable.*
