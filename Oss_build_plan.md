# GeoShred Web Clone — Open Source Analysis & Complete Build Plan

**Version:** 1.0  
**Date:** June 2026  
**Purpose:** Research analysis of open source alternatives + actionable step-by-step plan to build a GeoShred clone from existing repos  
**Target:** Web App (Chrome/Edge on Android & Windows)

---

## Table of Contents

1. [Open Source Landscape — What Exists](#1-open-source-landscape--what-exists)
2. [Component-by-Component Analysis](#2-component-by-component-analysis)
3. [Coverage Gap Analysis](#3-coverage-gap-analysis)
4. [The Recommended Stack](#4-the-recommended-stack)
5. [Phase 0 — Environment Setup](#5-phase-0--environment-setup)
6. [Phase 1 — Clone & Connect Base Repos (Week 1–2)](#6-phase-1--clone--connect-base-repos-week-12)
7. [Phase 2 — Build the Physical Model Engine (Week 3–5)](#7-phase-2--build-the-physical-model-engine-week-35)
8. [Phase 3 — Wire the Pitch Rounding Engine (Week 6–7)](#8-phase-3--wire-the-pitch-rounding-engine-week-67)
9. [Phase 4 — Effects Chain (Week 8–10)](#9-phase-4--effects-chain-week-810)
10. [Phase 5 — Control Surface & Preset System (Week 11–13)](#10-phase-5--control-surface--preset-system-week-1113)
11. [Phase 6 — MIDI & MPE Output (Week 14–15)](#11-phase-6--midi--mpe-output-week-1415)
12. [Phase 7 — Scale System, Ragas & World Tunings (Week 16–17)](#12-phase-7--scale-system-ragas--world-tunings-week-1617)
13. [Phase 8 — Arpeggiator & Backing Tracks (Week 18–19)](#13-phase-8--arpeggiator--backing-tracks-week-1819)
14. [Phase 9 — Polish, Performance & PWA (Week 20–22)](#14-phase-9--polish-performance--pwa-week-2022)
15. [Advanced Enhancements Beyond GeoShred](#15-advanced-enhancements-beyond-geoshred)
16. [Repository Structure Reference](#16-repository-structure-reference)
17. [Dependency & License Reference](#17-dependency--license-reference)

---

## 1. Open Source Landscape — What Exists

### 1.1 The Hard Truth

There is **no single open source project** that is a GeoShred clone. GeoShred's three core innovations are:

1. The **isomorphic multi-touch keyboard** with per-finger 3D expression
2. The **"Almost Magic" pitch rounding** (Snap + Round convergence algorithm)
3. The **physical modeling synthesis engine** (Dr. Julius O. Smith III's extended Karplus-Strong)

Items 2 and 3 are proprietary. Item 1 has several partial open source implementations.

However, the **component ecosystem** for building all three from scratch is excellent in 2025–2026. Here is every relevant project:

### 1.2 Project Quick Reference

| Project | GitHub | Language | Covers | License | Stars |
|---|---|---|---|---|---|
| hexatone | PLAINSOUND/hexatone | JS/HTML | Isomorphic keyboard, MIDI out, row glide | GPL-3 | ~80 |
| terpstrakeyboard | wcgbg/terpstrakeyboard | JS/HTML | Web isomorphic grid, Web Audio | GPL-3 | ~200 |
| isomorphic-keyboards | pianosnake/isomorphic-keyboards | JS | Layout math reference | MIT | ~150 |
| StarChord (Hexiano) | lrq3000/starchord | Java/Android | Android isomorphic keyboard | GPL-3 | ~120 |
| javascript-karplus-strong | mrahtz/javascript-karplus-strong | JS/asm.js | KS guitar synthesis in browser | MIT | ~500 |
| Resonarium | gabrielsoule/resonarium | C++/JUCE | Full waveguide synth, MPE | GPL-3 | ~300 |
| physical-modelling-synthesis | CCS-1L-F19/... | JS | AudioWorklet KS demo | MIT | ~40 |
| mpe.js | djipco/mpe.js | JS | MPE touch state model | MIT | ~200 |
| WebMIDI.js | djipco/webmidi | JS/TS | Full Web MIDI API wrapper | Apache-2 | ~3000 |
| Tone.js | Tonejs/Tone.js | JS/TS | High-level audio effects | MIT | ~24000 |
| Tuna.js | Theodeus/tuna | JS | Guitar-focused audio FX | MIT | ~1800 |
| Surge XT | surge-synthesizer/surge | C++ | Pro DSP reference (filters, FX) | GPL-3 | ~3600 |
| danja/flues | danja/flues | C/LV2 | Physical modeling FX reference | MIT | ~30 |
| Dexie.js | dfahlander/Dexie.js | JS/TS | IndexedDB preset storage | Apache-2 | ~11000 |
| Zustand | pmndrs/zustand | JS/TS | React state management | MIT | ~50000 |

---

## 2. Component-by-Component Analysis

### 2.1 Isomorphic Keyboard Surface

#### hexatone (PLAINSOUND/hexatone)

The single most useful project for the keyboard layer. It is itself a fork chain:
`wcgbg/terpstrakeyboard` → `000masa000/hexatone` → `PLAINSOUND/hexatone`

PLAINSOUND's fork is the most advanced version. What it gives you:

- Canvas-rendered keyboard grid with configurable note layout
- Multi-touch pointer event handling
- MIDI output via Web MIDI API
- **X Input Smoothing** — event-driven per-pad pitch smoothing without rAF timer dependence
- **Row Glide Shaping** — configurable transition between linear glide and quantised row transitions (this is the closest open source equivalent to GeoShred's Round algorithm)
- **Note-on quantise assist** — snaps the pitch on initial attack (this is the closest to GeoShred's Snap)
- Continuum MPE+ high-resolution X/Y/Z data support
- Architectural module separation: MIDI input, expression handling, canvas path are separate

What you need to add on top:
- Rectangular key cells instead of hex shapes (terpstrakeyboard has this)
- Diatonic scale filter (grays out out-of-scale keys)
- Note name rendering inside cells (Western + Svara)
- Key color theming by root note
- Touch-to-audio routing (hexatone only does MIDI out, not audio synthesis)

#### terpstrakeyboard (wcgbg/terpstrakeyboard)

Older, simpler. Better for understanding the core grid math. Has built-in Web Audio sound output (oscillators), which hexatone removes in favor of pure MIDI. You can extract its `keys.htm` layout engine as a reference for the rectangular grid cell geometry.

Key files to study:
- `keys.htm` — main keyboard rendering and touch handling
- The `noteLayout` object — how grid coordinates map to MIDI note numbers

#### pianosnake/isomorphic-keyboards

Pure layout visualization. Useful for validating that your row interval math produces the correct note names in all 12 keys. Run it side by side during development to verify.

#### StarChord/Hexiano (lrq3000/starchord)

Android Java but architecturally clean. Study specifically:

- `HexKeyboard.java` — screen dimensions, row/column count, touch routing
- `HexKey.java` — per-key play/stop logic, color assignment by note class
- `Instrument.java` — how soundfont samples are triggered per key

The color assignment logic (`noteClass % 12 == rootNote` → highlight color) directly translates to your Canvas renderer.

### 2.2 Pitch Rounding Engine

**No open source project implements GeoShred's exact algorithm.** However:

hexatone's **Row Glide Shaping** is the closest analog. It implements:
- A configurable blend between near-linear glide (fretless) and quantised row transitions (fretted)
- Low-pressure release hold (key stays active slightly after finger lifts)
- Temporary note-on quantise assist (snaps pitch at attack)

The algorithm you need to write (from scratch, ~100 lines) is documented in the PRD. hexatone's smoothing gives you the event infrastructure to hang it on.

### 2.3 Physical Modeling DSP

#### javascript-karplus-strong (mrahtz/javascript-karplus-strong)

The foundation. It gives you a working KS guitar voice in the browser. Limitations to fix:

- Uses old asm.js (upgrade to AudioWorklet)
- No Lagrange fractional delay (pitch bending is stepped, not smooth)
- No stiffness filter (inharmonicity)
- No feedback path (no distortion guitar model)
- Single voice (no polyphony)

Start here, upgrade to full GeoShred-quality model incrementally.

#### Resonarium (gabrielsoule/resonarium)

The C++ source is your gold-standard algorithm reference. Key files:

- `src/PluginProcessor.cpp` — voice management, MPE handling
- `src/dsp/WaveguideVoice.cpp` — the waveguide model per voice
- `src/dsp/WaveguideResonator.cpp` — delay line with loop filter
- `src/dsp/Exciter.cpp` — pluck/noise excitation models

You cannot run this in the browser directly. But you can:
1. Use it as a line-for-line algorithm reference
2. Compile the DSP core with Emscripten to run in an AudioWorklet (advanced)

#### physical-modelling-synthesis (CCS-1L-F19)

Small vanilla JS + Web Audio demo. Useful for verifying your AudioWorklet KS implementation produces the right sound before adding complexity.

### 2.4 Effects Chain

#### Tone.js

Use for these effects directly (they work well out of the box):

```
Tone.Reverb          → GeoShred Reverb
Tone.FeedbackDelay   → GeoShred Echo/Delay
Tone.Chorus          → GeoShred Chorus
Tone.Tremolo         → GeoShred Tremolo
Tone.Distortion      → GeoShred Distortion (basic)
Tone.AutoFilter      → GeoShred Auto-Wah
Tone.EQ3             → GeoShred 3-Band EQ
Tone.Compressor      → Master bus compression
```

#### Tuna.js

Better for guitar-specific effects:

```
Tuna.MoogFilter      → GeoShred VCF (Moog ladder filter model)
Tuna.WahWah          → GeoShred Expression Wah (better than Tone's AutoFilter)
Tuna.Phaser          → GeoShred Phaser
Tuna.Flanger         → GeoShred Flanger
Tuna.Overdrive       → GeoShred Overdrive type
Tuna.Cabinet         → GeoShred Amp/Cab (needs IR files)
```

#### Surge XT (C++ reference)

For the VCF and Phaser specifically, read:
- `src/common/dsp/effects/ParametricEQ.cpp` — parametric EQ
- `src/common/dsp/effects/FlangerEffect.cpp` — flanger
- `src/common/dsp/effects/PhaserEffect.cpp` — phaser
- `src/common/dsp/effects/ResonatorEffect.cpp` — sympathetic resonator

Port these to JS AudioWorklet when Tuna's implementations feel insufficient.

### 2.5 MIDI & MPE

#### WebMIDI.js v3

Complete wrapper for Web MIDI API. Handles:
- Device enumeration (inputs/outputs)
- Sending NoteOn/NoteOff on arbitrary channels
- Sending PitchBend (14-bit precision)
- Sending CC74 (KeyY/brightness)
- Sending Channel Pressure (KeyZ)
- RPN messages (Pitch Bend Range setting)

This covers 100% of GeoShred's MIDI output needs.

#### mpe.js

Manages the MPE state machine on the receiving end. When your app also accepts MPE input (from a Seaboard, LinnStrument, etc.), mpe.js tracks which channel carries which note and its current bend/slide/pressure values.

---

## 3. Coverage Gap Analysis

What open source covers vs. what you build from scratch:

```
Feature                          | Covered By                  | Build From Scratch
---------------------------------|-----------------------------|-----------------------
Isomorphic grid rendering        | hexatone / terpstrakeyboard | Rectangular cell styling
Multi-touch Pointer Events       | hexatone                    | —
Row glide / pitch smoothing      | hexatone (partial)          | Full Snap+Round algo
Physical model (KS core)         | js-karplus-strong           | Polyphony, stiffness, feedback
Physical model (waveguide full)  | Resonarium (reference only) | AudioWorklet port
MPE MIDI output                  | WebMIDI.js + mpe.js         | MPE config presets
Effects: Reverb, Delay, Chorus   | Tone.js                     | —
Effects: VCF, Wah, Flanger       | Tuna.js                     | —
Effects: Amp/Cab model           | Tuna (partial)              | IR loading + preset system
Effects: Sympathetic resonator   | — (reference: Surge XT)     | Full implementation
Preset system (JSON schema)      | —                           | Full implementation
Setlist system                   | —                           | Full implementation
Control Surface (XY, Whammy)     | —                           | Full implementation
Scale filter / diatonic mode     | —                           | Full implementation
World ragas / temperaments       | Scala .scl files (data)     | Parser + engine
Arpeggiator                      | —                           | Full implementation
Backing track player             | Web Audio API               | UI + sync logic
Audio recording / export         | MediaRecorder API           | UI wrapper
Note name rendering (Svara)      | —                           | Full implementation
Preset editor (drag-drop FX)     | —                           | Full implementation
```

**Summary:** Open source covers ~55% of the work. The remaining 45% is unique GeoShred functionality that you build.

---

## 4. The Recommended Stack

```
Layer               Library / API                   Why
──────────────────────────────────────────────────────────────────
Framework           React 18 + TypeScript           Component model, typed
Build               Vite 5                          Fast HMR, WorkerPlugin
State               Zustand                         Zero-overhead audio state
Keyboard UI         hexatone (forked)               Best isomorphic starting point
Canvas Rendering    HTML5 Canvas + OffscreenCanvas  60fps, no DOM overhead
Touch Input         Pointer Events API              Native, multi-touch, pressure
Pitch Engine        Custom (100 lines)              No OSS equivalent
DSP Core            AudioWorklet + WASM             Off main thread, low latency
KS Algorithm        js-karplus-strong (ported)      Proven, MIT
Waveguide Reference Resonarium C++ (study)          Production-quality algorithm
Effects             Tone.js + Tuna.js               Best coverage combo
Amp/Cab IR          OpenAIR free IRs                Realistic cab simulation
MIDI Output         WebMIDI.js v3                   Full MPE support
MPE State           mpe.js                          Touch-to-channel model
Persistence         Dexie.js (IndexedDB)            Preset / setlist storage
Scale Data          Scala .scl files                300+ scales + ragas
PWA                 Vite PWA Plugin                 Offline, installable
```

---

## 5. Phase 0 — Environment Setup

### 5.1 Prerequisites

```bash
node --version    # 20.x or higher required
npm --version     # 10.x or higher
git --version     # any recent version
```

Install Emscripten (for WASM compilation in later phases):
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
emcc --version    # should print version
```

### 5.2 Create the Monorepo Shell

```bash
mkdir geoshred-web && cd geoshred-web
npm create vite@latest . -- --template react-ts
npm install
```

Install all dependencies upfront:

```bash
# Core audio
npm install tone tuna webmidi mpe.js

# State & storage
npm install zustand dexie

# Dev tooling
npm install -D @types/node vite-plugin-pwa

# For AudioWorklet TypeScript support
npm install -D @types/audioworklet
```

### 5.3 Configure Vite for AudioWorklet

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GeoShred Web',
        short_name: 'GeoShred',
        theme_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'landscape',
      }
    })
  ],
  worker: {
    format: 'es',         // AudioWorklet needs ES module format
  },
  optimizeDeps: {
    exclude: ['tone'],    // Tone.js must not be pre-bundled
  },
})
```

---

## 6. Phase 1 — Clone & Connect Base Repos (Week 1–2)

This is the most critical phase. You are assembling the skeleton.

### 6.1 Clone hexatone (Keyboard Surface)

```bash
# Inside your project root
git clone https://github.com/PLAINSOUND/hexatone.git _vendor/hexatone
```

Study these files before touching anything:

```
_vendor/hexatone/
├── keys.html          ← entry point, keyboard init
├── src/
│   ├── Keys.js        ← main keyboard runtime, canvas rendering
│   ├── MidiEngine.js  ← MIDI output, channel assignment
│   ├── Expression.js  ← X/Y/Z handling per touch
│   ├── ScaleFilter.js ← scale degree filtering
│   └── Layout.js      ← grid coordinate to note number math
```

Read the README and every source file before proceeding. The key insight is that hexatone separates **layout** (which note is at (row, col)), **expression** (what X/Y/Z value is the finger at), and **MIDI** (how to encode that as MIDI messages). You will keep this separation and add an **audio** layer alongside the MIDI layer.

### 6.2 Clone javascript-karplus-strong (DSP Core)

```bash
git clone https://github.com/mrahtz/javascript-karplus-strong.git _vendor/karplus-strong
```

Key files:
```
_vendor/karplus-strong/
├── guitar.js          ← KS algorithm (delay line + loop filter)
├── guitar-processor.js← ScriptProcessorNode wrapper (you'll upgrade to AudioWorklet)
└── index.html         ← demo, shows how to trigger notes
```

### 6.3 Clone Resonarium for DSP Reference

```bash
git clone https://github.com/gabrielsoule/resonarium.git _vendor/resonarium
```

You won't run this, only read it:
```
_vendor/resonarium/Source/
├── PluginProcessor.cpp      ← voice management, MPE handling
├── dsp/
│   ├── WaveguideVoice.cpp   ← per-voice physical model
│   ├── WaveguideResonator.cpp ← the delay line + loop filter
│   └── Exciter.cpp          ← pluck / noise excitation
```

### 6.4 Extract hexatone's Layout Engine into Your Project

Don't just copy-paste. Adapt hexatone's layout math into a clean TypeScript module:

```typescript
// src/engine/keyboard/KeyboardLayout.ts

export interface KeyCell {
  row: number
  col: number
  midiNote: number           // 0–127
  noteName: string           // "C", "D#", etc.
  svaraName: string          // "Sa", "Re", etc.
  isRoot: boolean
  isInScale: boolean
  x: number                  // pixel position
  y: number
  width: number
  height: number
}

export interface LayoutConfig {
  rows: number               // 4 default
  rowIntervalSemitones: number[] // [5,5,5] for All-Fourths; [5,5,4,5] for guitar
  startMidiNote: number      // 52 = E3 default
  keyWidth: number           // pixels
  keyHeight: number          // pixels
  rootNote: number           // 0-11
  scale: number[]            // scale degrees e.g. [0,2,4,5,7,9,11] = major
}

export function buildLayout(config: LayoutConfig, canvasWidth: number): KeyCell[] {
  const cells: KeyCell[] = []
  const cols = Math.ceil(canvasWidth / config.keyWidth) + 2

  for (let row = 0; row < config.rows; row++) {
    // Calculate the MIDI note at column 0 of this row
    // Row 0 = bottom, row N-1 = top
    let rowStartNote = config.startMidiNote
    for (let r = 0; r < row; r++) {
      rowStartNote += config.rowIntervalSemitones[r] ?? config.rowIntervalSemitones[0]
    }

    for (let col = 0; col < cols; col++) {
      const midiNote = rowStartNote + col
      if (midiNote < 0 || midiNote > 127) continue

      const noteClass = midiNote % 12
      const octave = Math.floor(midiNote / 12) - 1

      cells.push({
        row, col,
        midiNote,
        noteName: NOTE_NAMES[noteClass] + octave,
        svaraName: SVARA_NAMES[noteClass],
        isRoot: noteClass === config.rootNote,
        isInScale: config.scale.includes(noteClass),
        x: col * config.keyWidth,
        y: (config.rows - 1 - row) * config.keyHeight, // flip: row 0 at bottom
        width: config.keyWidth,
        height: config.keyHeight,
      })
    }
  }
  return cells
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const SVARA_NAMES = ['Sa','Re♭','Re','Ga♭','Ga','Ma','Ma#','Pa','Dha♭','Dha','Ni♭','Ni']
```

### 6.5 Wire the Canvas Renderer

Create a React component that:
1. Renders the key grid on a Canvas element
2. Handles PointerEvents for multi-touch
3. Calls your pitch engine on each event

```typescript
// src/components/KeyboardCanvas.tsx
import { useRef, useEffect, useCallback } from 'react'
import { buildLayout, KeyCell, LayoutConfig } from '../engine/keyboard/KeyboardLayout'
import { useAudioEngine } from '../engine/audio/useAudioEngine'

export function KeyboardCanvas({ config }: { config: LayoutConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioEngine = useAudioEngine()
  const activeTouches = useRef<Map<number, KeyCell>>(new Map())
  const layout = useRef<KeyCell[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    layout.current = buildLayout(config, canvas.width)
    renderKeyboard(canvas, layout.current, new Set())
  }, [config])

  const hitTest = (x: number, y: number): KeyCell | null => {
    return layout.current.find(cell =>
      x >= cell.x && x < cell.x + cell.width &&
      y >= cell.y && y < cell.y + cell.height
    ) ?? null
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cell = hitTest(x, y)
    if (!cell) return

    activeTouches.current.set(e.pointerId, cell)
    const keyX = (x - cell.x) / cell.width   // 0–1 horizontal within key
    const keyY = 1 - (y - cell.y) / cell.height // 0=bottom, 1=top
    const keyZ = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0

    audioEngine.noteOn(e.pointerId, cell.midiNote, keyX, keyY, keyZ)
    renderKeyboard(canvasRef.current!, layout.current, new Set(activeTouches.current.keys()))
  }, [audioEngine])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const touch = activeTouches.current.get(e.pointerId)
    if (!touch) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const keyX = (x - touch.x) / touch.width
    const keyY = 1 - (y - touch.y) / touch.height
    const keyZ = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0
    audioEngine.noteUpdate(e.pointerId, keyX, keyY, keyZ)
  }, [audioEngine])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activeTouches.current.delete(e.pointerId)
    audioEngine.noteOff(e.pointerId)
    renderKeyboard(canvasRef.current!, layout.current, new Set(activeTouches.current.keys()))
  }, [audioEngine])

  return (
    <canvas
      ref={canvasRef}
      style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}

function renderKeyboard(canvas: HTMLCanvasElement, cells: KeyCell[], activePointers: Set<number>) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const cell of cells) {
    // Background fill
    if (!cell.isInScale) {
      ctx.fillStyle = '#1a1a2e'      // dark, out of scale
    } else if (cell.isRoot) {
      ctx.fillStyle = '#b8860b'      // gold for root
    } else {
      ctx.fillStyle = '#2a2a4a'      // normal in-scale key
    }

    ctx.fillRect(cell.x + 1, cell.y + 1, cell.width - 2, cell.height - 2)

    // Border
    ctx.strokeStyle = '#444466'
    ctx.lineWidth = 1
    ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1)

    // Note label
    ctx.fillStyle = cell.isRoot ? '#ffd700' : '#ccccee'
    ctx.font = `${Math.min(14, cell.height * 0.25)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cell.noteName, cell.x + cell.width / 2, cell.y + cell.height / 2)
  }
}
```

### 6.6 At the End of Phase 1 You Should Have

- Vite + React + TypeScript project running
- A keyboard grid rendering on screen with correct note names
- Multi-touch pointer events firing (test with browser DevTools mobile simulation)
- `noteOn / noteUpdate / noteOff` callbacks wiring up (even if audio engine is stub)
- All vendor repos cloned and studied

---

## 7. Phase 2 — Build the Physical Model Engine (Week 3–5)

### 7.1 Port Karplus-Strong to AudioWorklet

The core upgrade from mrahtz's implementation is moving from `ScriptProcessorNode` (deprecated) to `AudioWorkletProcessor`.

Create the processor file:

```typescript
// src/engine/audio/worklets/KarplusStrongProcessor.ts
// This file runs in the AudioWorklet context (separate thread)

const DELAY_MAX = 8192   // max delay line length (covers ~5Hz at 44.1kHz)

interface Voice {
  active: boolean
  delayLine: Float32Array
  writePtr: number
  delayLength: number          // fractional, for Lagrange interpolation
  loopGain: number             // decay (0.99 = long sustain)
  brightness: number           // loop filter coefficient (0=dark, 1=bright)
  pitchBendCents: number       // current pitch deviation in cents
  targetPitchBendCents: number // pitch rounding target
  roundingSpeed: number        // exponential convergence rate
  velocity: number
}

class KarplusStrongProcessor extends AudioWorkletProcessor {
  private voices: Map<number, Voice> = new Map()
  private sampleRate: number = 44100

  constructor() {
    super()
    this.port.onmessage = (e) => this.handleMessage(e.data)
  }

  handleMessage(msg: any) {
    switch (msg.type) {
      case 'noteOn':
        this.startVoice(msg.voiceId, msg.frequency, msg.velocity, msg.brightness, msg.decay)
        break
      case 'noteUpdate':
        this.updateVoice(msg.voiceId, msg.pitchBendCents, msg.keyY, msg.keyZ)
        break
      case 'noteOff':
        this.releaseVoice(msg.voiceId)
        break
    }
  }

  startVoice(voiceId: number, frequency: number, velocity: number, brightness: number, decay: number) {
    const delayLength = this.sampleRate / frequency
    const delayLine = new Float32Array(DELAY_MAX)

    // Fill delay line with noise burst (the "pluck")
    // Pluck position 0.15 = near-bridge, brighter tone
    const pluckLength = Math.round(delayLength * 0.15)
    for (let i = 0; i < Math.round(delayLength); i++) {
      if (i < pluckLength) {
        delayLine[i] = (Math.random() * 2 - 1) * velocity
      } else {
        // Comb filter: interference pattern for pluck position
        const pluckPos = 0.15
        delayLine[i] = (Math.random() * 2 - 1) * velocity *
          Math.abs(Math.sin(Math.PI * i * pluckPos / delayLength))
      }
    }

    this.voices.set(voiceId, {
      active: true,
      delayLine,
      writePtr: 0,
      delayLength,
      loopGain: decay,       // 0.990–0.9995
      brightness,            // 0.3–0.9
      pitchBendCents: 0,
      targetPitchBendCents: 0,
      roundingSpeed: 0.15,
      velocity,
    })
  }

  updateVoice(voiceId: number, pitchBendCents: number, keyY: number, keyZ: number) {
    const voice = this.voices.get(voiceId)
    if (!voice) return
    voice.targetPitchBendCents = pitchBendCents
    // keyY and keyZ can modulate brightness or gain here
    voice.brightness = 0.5 + keyY * 0.4  // brighter toward top of key
  }

  releaseVoice(voiceId: number) {
    // Accelerate decay instead of hard cut (natural release)
    const voice = this.voices.get(voiceId)
    if (voice) voice.loopGain *= 0.95
    setTimeout(() => this.voices.delete(voiceId), 3000)
  }

  // Lagrange 3rd-order fractional delay interpolation
  // Critical for smooth pitch bending without stepping artifacts
  lagrangeRead(delayLine: Float32Array, ptr: number, frac: number): number {
    const i0 = (ptr + DELAY_MAX) % DELAY_MAX
    const i1 = (ptr + 1 + DELAY_MAX) % DELAY_MAX
    const i2 = (ptr + 2 + DELAY_MAX) % DELAY_MAX
    const i3 = (ptr + 3 + DELAY_MAX) % DELAY_MAX
    const d = frac
    // 4-point Lagrange interpolation
    return (
      delayLine[i0] * ((-d*(d-1)*(d-2))/6) +
      delayLine[i1] * ((d+1)*(d-1)*(d-2)/2) +
      delayLine[i2] * (-(d+1)*d*(d-2)/2) +
      delayLine[i3] * ((d+1)*d*(d-1)/6)
    )
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0][0]
    if (!output) return true

    output.fill(0)

    for (const [, voice] of this.voices) {
      if (!voice.active) continue

      // Converge pitch bend toward target (this is the "Round" algorithm)
      const bendError = voice.targetPitchBendCents - voice.pitchBendCents
      voice.pitchBendCents += bendError * voice.roundingSpeed

      // Compute actual delay length with pitch bend applied
      const bendRatio = Math.pow(2, voice.pitchBendCents / 1200)
      const currentDelayLength = (this.sampleRate / 440) / bendRatio *
        Math.pow(2, (69 - 69) / 12) // recalculate from midi note

      const intDelay = Math.floor(currentDelayLength)
      const fracDelay = currentDelayLength - intDelay

      for (let i = 0; i < output.length; i++) {
        // Read from delay line with fractional interpolation
        const readPtr = ((voice.writePtr - intDelay) + DELAY_MAX) % DELAY_MAX
        const sample = this.lagrangeRead(voice.delayLine, readPtr, fracDelay)

        // Loop filter: one-pole lowpass (controls brightness/decay)
        // H(z) = brightness * (1 + z^-1) / 2
        const prevSample = voice.delayLine[(readPtr + 1) % DELAY_MAX]
        const filtered = voice.loopGain * voice.brightness *
          (sample + prevSample) * 0.5

        voice.delayLine[voice.writePtr] = filtered
        voice.writePtr = (voice.writePtr + 1) % DELAY_MAX

        output[i] += sample * 0.3  // mix into output
      }
    }

    return true
  }
}

registerProcessor('karplus-strong', KarplusStrongProcessor)
```

### 7.2 Create the Audio Engine Hook

```typescript
// src/engine/audio/useAudioEngine.ts
import { useRef, useEffect } from 'react'

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const masterGain = useRef<GainNode | null>(null)

  const ensureContext = async () => {
    if (ctxRef.current) return ctxRef.current
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
    await ctx.audioWorklet.addModule('/src/engine/audio/worklets/KarplusStrongProcessor.ts')
    const node = new AudioWorkletNode(ctx, 'karplus-strong', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    node.connect(gain)
    gain.connect(ctx.destination)
    ctxRef.current = ctx
    nodeRef.current = node
    masterGain.current = gain
    return ctx
  }

  const noteOn = async (voiceId: number, midiNote: number, keyX: number, keyY: number, keyZ: number) => {
    await ensureContext()
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
    const velocity = 0.3 + keyY * 0.7  // keyY = velocity at attack
    nodeRef.current?.port.postMessage({
      type: 'noteOn',
      voiceId, frequency, velocity,
      brightness: 0.5 + keyY * 0.4,
      decay: 0.992,
    })
  }

  const noteUpdate = (voiceId: number, keyX: number, keyY: number, keyZ: number) => {
    // keyX = pitch deviation. 0.5 = center. <0.5 = flat, >0.5 = sharp
    const pitchBendCents = (keyX - 0.5) * 100  // ±50 cents per key
    nodeRef.current?.port.postMessage({
      type: 'noteUpdate', voiceId, pitchBendCents, keyY, keyZ
    })
  }

  const noteOff = (voiceId: number) => {
    nodeRef.current?.port.postMessage({ type: 'noteOff', voiceId })
  }

  return { noteOn, noteUpdate, noteOff }
}
```

### 7.3 At the End of Phase 2 You Should Have

- Touching the keyboard plays a plucked string sound
- Sliding horizontally bends the pitch smoothly (Lagrange interpolation working)
- Multiple simultaneous touches play independent voices
- Vertical position (keyY) affects velocity and brightness
- Sound continues to ring out naturally and decays

---

## 8. Phase 3 — Wire the Pitch Rounding Engine (Week 6–7)

This is the phase that gives you "the GeoShred feel." Nothing else matters as much.

### 8.1 The Algorithm

```typescript
// src/engine/pitch/PitchRoundingEngine.ts

export interface PitchRoundingConfig {
  snapEnabled: boolean      // Snap to perfect pitch on attack
  roundEnabled: boolean     // Continuous convergence while sliding
  slideSpeed: number        // 0.0 (instant) to 1.0 (very slow convergence)
  scale: number[]           // Active scale degrees [0,2,4,5,7,9,11]
  temperamentOffsets: number[] // Per-note cent deviations from Equal [0,0,0,...]
}

export interface PitchState {
  baseMidiNote: number      // The key the finger started on
  currentPitchCents: number // Actual current pitch in cents from C0
  targetPitchCents: number  // Where the pitch is converging to
  fingerCents: number       // Raw finger position in cents
}

// Convert raw keyX position to cents offset from key center
// keyX=0.5 means finger is at center (perfect pitch)
// Each key = 100 cents wide → keyX maps to ±50 cents per key
export function keyXToPitchCents(
  keyX: number,
  baseMidiNote: number,
  config: PitchRoundingConfig
): { fingerCents: number; nearestNoteCents: number } {
  // Base pitch of the key's MIDI note
  const baseCents = baseMidiNote * 100

  // Finger offset within key: -50 to +50 cents
  const fingerOffsetCents = (keyX - 0.5) * 100

  // Apply temperament offset for this note class
  const noteClass = baseMidiNote % 12
  const temperamentOffset = config.temperamentOffsets[noteClass] ?? 0

  const fingerCents = baseCents + fingerOffsetCents + temperamentOffset

  // Find nearest note center in the current scale
  const nearestNoteCents = findNearestScaleNoteCents(fingerCents, config.scale, config.temperamentOffsets)

  return { fingerCents, nearestNoteCents }
}

function findNearestScaleNoteCents(
  fingerCents: number,
  scale: number[],
  temperamentOffsets: number[]
): number {
  // Build list of all scale note centers ±2 octaves from finger position
  const fingerMidi = fingerCents / 100
  const octave = Math.round(fingerMidi / 12)
  let nearest = fingerCents
  let nearestDist = Infinity

  for (let oct = octave - 2; oct <= octave + 2; oct++) {
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

// Called at audio rate (in AudioWorklet or very frequently in main thread)
export function updatePitchRounding(
  state: PitchState,
  keyX: number,
  isAttack: boolean,
  config: PitchRoundingConfig
): number {
  const { fingerCents, nearestNoteCents } = keyXToPitchCents(keyX, state.baseMidiNote, config)
  state.fingerCents = fingerCents

  if (isAttack && config.snapEnabled) {
    // SNAP: Instantly lock to nearest scale note on initial touch
    state.currentPitchCents = nearestNoteCents
    state.targetPitchCents = nearestNoteCents
    return nearestNoteCents
  }

  if (config.roundEnabled) {
    // ROUND: Exponentially converge toward nearest note
    // slideSpeed 0 = instant snap, 1 = never converges (fretless)
    const convergenceRate = 1 - config.slideSpeed  // invert: low slideSpeed = fast
    state.targetPitchCents = nearestNoteCents
    const error = state.targetPitchCents - state.currentPitchCents
    state.currentPitchCents += error * Math.max(0.01, convergenceRate)
  } else {
    // Pure fretless: follow finger exactly
    state.currentPitchCents = fingerCents
  }

  return state.currentPitchCents
}
```

### 8.2 Integrate into Voice Manager

```typescript
// src/engine/audio/VoiceManager.ts
import { PitchRoundingEngine, PitchState } from '../pitch/PitchRoundingEngine'

export class VoiceManager {
  private pitchStates: Map<number, PitchState> = new Map()

  noteOn(voiceId: number, midiNote: number, keyX: number, keyY: number, keyZ: number) {
    const pitchState: PitchState = {
      baseMidiNote: midiNote,
      currentPitchCents: midiNote * 100,
      targetPitchCents: midiNote * 100,
      fingerCents: midiNote * 100,
    }

    // SNAP on attack: instantly set to perfect pitch
    const snappedCents = updatePitchRounding(pitchState, keyX, true, this.roundingConfig)
    this.pitchStates.set(voiceId, pitchState)

    const frequency = centsToHz(snappedCents)
    this.audioWorklet.noteOn(voiceId, frequency, keyY, keyZ)
  }

  noteUpdate(voiceId: number, keyX: number, keyY: number, keyZ: number) {
    const state = this.pitchStates.get(voiceId)
    if (!state) return

    // ROUND: converge pitch toward nearest note
    const pitchCents = updatePitchRounding(state, keyX, false, this.roundingConfig)
    const pitchBendCents = pitchCents - (state.baseMidiNote * 100)
    this.audioWorklet.noteUpdate(voiceId, pitchBendCents, keyY, keyZ)
  }
}

function centsToHz(cents: number): number {
  return 440 * Math.pow(2, (cents / 100 - 69) / 12)
}
```

### 8.3 At the End of Phase 3 You Should Have

- Touching any key starts perfectly in tune (Snap working)
- Sliding left/right bends the note and converges back to tune (Round working)
- Sliding speed controls how fast convergence happens
- Vibrato (fast oscillation within a key) produces natural string vibrato
- Toggling "Fretless" mode gives pure continuous pitch following the finger

---

## 9. Phase 4 — Effects Chain (Week 8–10)

### 9.1 Set Up the Signal Chain

```typescript
// src/engine/effects/EffectsChain.ts
import * as Tone from 'tone'
import { Tuna } from 'tunajs'

export class EffectsChain {
  private tuna: any
  private nodes: Map<string, any> = new Map()
  private chain: string[] = []
  private inputGain: GainNode
  private outputGain: GainNode

  constructor(private ctx: AudioContext) {
    this.tuna = new Tuna(ctx)
    this.inputGain = ctx.createGain()
    this.outputGain = ctx.createGain()
  }

  buildDefaultChain() {
    this.addEffect('distortion', new this.tuna.Overdrive({
      outputGain: 0.5, drive: 0.7, curveAmount: 1, algorithmIndex: 0, bypass: true
    }))
    this.addEffect('wah', new this.tuna.WahWah({
      automode: false, baseFrequency: 0.5, excursionOctaves: 2,
      sweep: 0.2, resonance: 10, sensitivity: 0.5, bypass: true
    }))
    this.addEffect('vcf', new this.tuna.MoogFilter({
      cutoff: 1, resonance: 3.5, bufferSize: 256, bypass: true
    }))
    this.addEffect('phaser', new this.tuna.Phaser({
      rate: 1.2, depth: 0.3, feedback: 0.2, stereoPhase: 30,
      baseModulationFrequency: 700, bypass: true
    }))
    this.addEffect('flanger', new this.tuna.Flanger({
      delay: 0.005, feedback: 0.05, frequency: 0.01, gain: 0.02,
      stereoPhase: 40, depth: 1, bypass: true
    }))

    // Tone.js effects (connect via Tone's Web Audio context bridge)
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.3 })
    const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 0.2 })
    // ... wire Tone nodes into chain

    this.rebuildChain()
  }

  setEffectParam(effectId: string, param: string, value: number) {
    const node = this.nodes.get(effectId)
    if (node && node[param] !== undefined) node[param] = value
  }

  setEffectEnabled(effectId: string, enabled: boolean) {
    const node = this.nodes.get(effectId)
    if (node) node.bypass = !enabled
  }

  reorderChain(order: string[]) {
    this.chain = order
    this.rebuildChain()
  }

  private rebuildChain() {
    this.inputGain.disconnect()
    let prev: AudioNode = this.inputGain
    for (const id of this.chain) {
      const node = this.nodes.get(id)
      if (node) { prev.connect(node.input ?? node); prev = node.output ?? node }
    }
    prev.connect(this.outputGain)
  }

  get input() { return this.inputGain }
  get output() { return this.outputGain }
}
```

### 9.2 Load Cabinet Impulse Responses

Download free IR files from OpenAIR (openairlib.net) or GuitarHack. Store them in `public/ir/`:

```
public/ir/
├── 4x12_marshall.wav
├── 2x12_fender.wav
├── 1x12_vox.wav
└── plate_reverb.wav
```

```typescript
// src/engine/effects/CabinetLoader.ts
export async function loadCabinetIR(ctx: AudioContext, name: string): Promise<ConvolverNode> {
  const response = await fetch(`/ir/${name}.wav`)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  const convolver = ctx.createConvolver()
  convolver.buffer = audioBuffer
  return convolver
}
```

### 9.3 At the End of Phase 4 You Should Have

- Full signal chain: KS synth → Distortion → Wah → EQ → VCF → Phaser → Flanger → Chorus → Tremolo → Reverb → Echo → Output
- Each effect has bypass toggle
- Wah responds to keyY position
- Reverb and delay add ambience
- Cabinet model makes electric guitar presets sound realistic

---

## 10. Phase 5 — Control Surface & Preset System (Week 11–13)

### 10.1 Preset Schema Implementation

```typescript
// src/presets/PresetSchema.ts
export interface Preset {
  id: string
  name: string
  version: number
  color: 'white' | 'yellow' | 'red'   // unmodified | saved | unsaved-modified
  instrument: InstrumentModel
  effectsChain: EffectConfig[]
  performanceSettings: PerformanceSettings
  controlSurface: ControlSurfaceConfig
  backingTrack?: BackingTrackConfig
  arpeggiator: ArpeggiatorConfig
}

// Save to IndexedDB via Dexie.js
import Dexie from 'dexie'

class GeoShredDB extends Dexie {
  presets!: Dexie.Table<Preset, string>
  setlists!: Dexie.Table<Setlist, string>
  userSettings!: Dexie.Table<any, string>

  constructor() {
    super('GeoShredWeb')
    this.version(1).stores({
      presets: 'id, name, color',
      setlists: 'id, name',
      userSettings: 'key',
    })
  }
}

export const db = new GeoShredDB()
```

### 10.2 Control Surface Component

```typescript
// src/components/ControlSurface.tsx
// XY Pad, Whammy bar, configurable slot controls
// Implements: drag tracking, value output, visual feedback
// See PRD Section 7 for full spec
```

### 10.3 At the End of Phase 5 You Should Have

- Presets save and load correctly (persist across browser sessions)
- 20+ factory presets covering different sounds
- XY pad maps to vibrato depth + expression
- Whammy bar does global pitch bend
- Volume, palm mute, reverb sliders on control surface

---

## 11. Phase 6 — MIDI & MPE Output (Week 14–15)

### 11.1 MPE Output Engine

```typescript
// src/engine/midi/MPEOutputEngine.ts
import { WebMidi, Output } from 'webmidi'

export class MPEOutputEngine {
  private output: Output | null = null
  private channelPool: number[] = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
  private voiceChannels: Map<number, number> = new Map()

  async initialize() {
    await WebMidi.enable({ sysex: true })
    // Send MPE configuration RPN to manager channel (ch 1)
    // RPN 6 = MPE config: member zones = 15 channels
  }

  noteOn(voiceId: number, midiNote: number, velocity: number, pitchBendCents: number) {
    const channel = this.allocateChannel(voiceId)
    // Set pitch bend range to 48 semitones on this channel
    this.output?.sendRpnValue('pitchbendrange', [48, 0], { channels: [channel] })
    // Send pitch bend for initial offset
    this.sendPitchBend(voiceId, pitchBendCents)
    // Send note on
    this.output?.sendNoteOn(midiNote, { channels: [channel], velocity: velocity / 127 })
  }

  sendPitchBend(voiceId: number, cents: number) {
    const channel = this.voiceChannels.get(voiceId)
    if (!channel) return
    // Convert cents to 14-bit pitch bend value
    // Range: ±48 semitones = ±4800 cents
    const bendValue = Math.round((cents / 4800) * 8192) + 8192
    this.output?.sendPitchBend((bendValue - 8192) / 8192, { channels: [channel] })
  }

  sendKeyY(voiceId: number, keyY: number) {
    const channel = this.voiceChannels.get(voiceId)
    if (!channel) return
    // CC74 = brightness / timbre
    this.output?.sendControlChange(74, Math.round(keyY * 127), { channels: [channel] })
  }

  sendKeyZ(voiceId: number, keyZ: number) {
    const channel = this.voiceChannels.get(voiceId)
    if (!channel) return
    // Channel Pressure (aftertouch)
    this.output?.sendChannelAftertouch(keyZ, { channels: [channel] })
  }

  private allocateChannel(voiceId: number): number {
    // Rotate through member channels (2–16)
    const ch = this.channelPool.shift()!
    this.channelPool.push(ch)
    this.voiceChannels.set(voiceId, ch)
    return ch
  }
}
```

---

## 12. Phase 7 — Scale System, Ragas & World Tunings (Week 16–17)

### 12.1 Load Scala .scl Files

The Scala format is the industry standard for microtonal scales. Download the free Scala archive (300+ scales) from `huygens-fokker.org/scala/downloads.html`.

```typescript
// src/engine/scales/ScalaParser.ts
export interface ScalaScale {
  name: string
  description: string
  degrees: number[]   // cents offsets from root (always starts with 0)
}

export function parseScl(sclText: string): ScalaScale {
  const lines = sclText.split('\n').filter(l => !l.startsWith('!'))
  const description = lines[0].trim()
  const count = parseInt(lines[1])
  const degrees = [0]

  for (let i = 2; i < 2 + count; i++) {
    const token = lines[i].trim().split(/\s/)[0]
    if (token.includes('.')) {
      degrees.push(parseFloat(token))         // cents value
    } else if (token.includes('/')) {
      const [num, den] = token.split('/').map(Number)
      degrees.push(1200 * Math.log2(num / den)) // ratio to cents
    } else {
      degrees.push(parseFloat(token))
    }
  }

  return { name: sclText.split('\n')[0].replace('!', '').trim(), description, degrees }
}
```

### 12.2 Bundled Raga/Scale Data

Ship these scales as JSON in `public/scales/`:

```json
// public/scales/carnatic-ragas.json
{
  "Mayamalavagowla": { "degrees": [0, 112, 204, 498, 702, 814, 1088], "description": "Carnatic parent raga" },
  "Shankarabharanam": { "degrees": [0, 204, 386, 498, 702, 884, 1088], "description": "Equivalent to major" },
  "Kalyani":          { "degrees": [0, 204, 386, 612, 702, 884, 1088], "description": "Lydian equivalent" },
  "Kharaharapriya":   { "degrees": [0, 204, 294, 498, 702, 884, 1088], "description": "Dorian equivalent" },
  "Bhairavi":         { "degrees": [0, 112, 294, 498, 702, 814, 996], "description": "Phrygian-like" }
}
```

---

## 13. Phase 8 — Arpeggiator & Backing Tracks (Week 18–19)

### 13.1 Arpeggiator with AudioContext Scheduling

Never use `setInterval` for musical timing. Use `AudioContext.currentTime` lookahead scheduling:

```typescript
// src/engine/arpeggiator/Arpeggiator.ts
export class Arpeggiator {
  private nextNoteTime: number = 0
  private scheduleAheadTime = 0.1   // 100ms lookahead
  private timerInterval = 25        // check every 25ms
  private timer: number | null = null
  private heldNotes: number[] = []
  private noteIndex: number = 0

  constructor(
    private ctx: AudioContext,
    private bpm: number,
    private pattern: 'up' | 'down' | 'updown' | 'random',
    private onNote: (midiNote: number) => void,
    private onNoteOff: (midiNote: number) => void,
  ) {}

  start() {
    this.nextNoteTime = this.ctx.currentTime
    this.timer = window.setInterval(() => this.scheduler(), this.timerInterval)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  setHeldNotes(notes: number[]) {
    this.heldNotes = [...notes].sort((a, b) => a - b)
  }

  private scheduler() {
    const lookAheadTime = this.ctx.currentTime + this.scheduleAheadTime
    while (this.nextNoteTime < lookAheadTime) {
      this.scheduleNote(this.nextNoteTime)
      this.advanceNote()
    }
  }

  private scheduleNote(time: number) {
    if (this.heldNotes.length === 0) return
    const note = this.getNextNote()
    // Schedule audio event at exact time
    // (pass to VoiceManager with time parameter)
    const stepDuration = 60 / this.bpm
    setTimeout(() => {
      this.onNote(note)
      setTimeout(() => this.onNoteOff(note), stepDuration * 0.8 * 1000)
    }, Math.max(0, (time - this.ctx.currentTime) * 1000))
  }

  private getNextNote(): number {
    if (this.pattern === 'random') {
      return this.heldNotes[Math.floor(Math.random() * this.heldNotes.length)]
    }
    return this.heldNotes[this.noteIndex % this.heldNotes.length]
  }

  private advanceNote() {
    const stepDuration = 60 / this.bpm
    this.nextNoteTime += stepDuration
    if (this.pattern === 'up') this.noteIndex++
    else if (this.pattern === 'down') this.noteIndex--
  }
}
```

### 13.2 Backing Track Player

```typescript
// src/engine/BackingTrackPlayer.ts
export class BackingTrackPlayer {
  private sourceNode: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private gainNode: GainNode

  constructor(private ctx: AudioContext, outputNode: AudioNode) {
    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 0.7
    this.gainNode.connect(outputNode)
  }

  async loadFile(file: File) {
    const arrayBuffer = await file.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
  }

  async loadUrl(url: string) {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
  }

  play(loop: boolean = false, offset: number = 0) {
    if (!this.buffer) return
    this.sourceNode?.stop()
    this.sourceNode = this.ctx.createBufferSource()
    this.sourceNode.buffer = this.buffer
    this.sourceNode.loop = loop
    this.sourceNode.connect(this.gainNode)
    this.sourceNode.start(0, offset)
  }

  stop() { this.sourceNode?.stop() }
  setVolume(v: number) { this.gainNode.gain.value = v }
}
```

---

## 14. Phase 9 — Polish, Performance & PWA (Week 20–22)

### 14.1 Performance Optimizations

```typescript
// 1. Use OffscreenCanvas for keyboard rendering (off main thread)
const offscreen = canvas.transferControlToOffscreen()
const worker = new Worker(new URL('./KeyboardRenderWorker.ts', import.meta.url))
worker.postMessage({ canvas: offscreen, cells: layout }, [offscreen])

// 2. Pre-allocate all DSP buffers at AudioWorklet startup
// In KarplusStrongProcessor constructor:
this.voicePool = Array.from({ length: 10 }, () => ({
  delayLine: new Float32Array(DELAY_MAX),
  // ... pre-allocate all arrays
}))

// 3. Prevent GC spikes by reusing voice objects from pool
// Never 'new Float32Array()' during performance

// 4. Use SharedArrayBuffer for lock-free main↔worklet communication
const sharedBuffer = new SharedArrayBuffer(512)
const sharedView = new Float32Array(sharedBuffer)
// Write pitch bend updates from main thread, read in worklet
```

### 14.2 Mobile Touch Performance

```typescript
// Prevent all default browser behaviors on the keyboard canvas
canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false })
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false })
canvas.style.touchAction = 'none'
canvas.style.userSelect = 'none'
canvas.style.webkitUserSelect = 'none'

// Request pointer lock for precise delta tracking on desktop
// canvas.requestPointerLock()  -- optional, for mouse play mode
```

### 14.3 PWA Configuration

```json
// public/manifest.json
{
  "name": "GeoShred Web",
  "short_name": "GeoShred",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 15. Advanced Enhancements Beyond GeoShred

Once the base clone is complete, these features go beyond what GeoShred currently offers:

### 15.1 AI-Powered Features (Unique to Web)

```
Feature                          | How
---------------------------------|------------------------------------------
Auto-harmonize                   | ML model detects played note → adds harmony voice
Scale detection from playing     | Analyze which notes are played → suggest matching scale
AI preset generation             | "Create a sitar sound in Bhairavi raga" → auto-configure
Auto-transcription               | Record session → export as MIDI with pitch bends
Raga suggestion                  | Based on time of day (traditional raga timing system)
```

### 15.2 Collaboration Features (Web-Native)

```
Feature                          | Tech
---------------------------------|------------------------------------------
Real-time multiplayer jam        | WebRTC + shared AudioContext
Shared setlists via URL          | JSON preset in URL hash / cloud sync
Live stream performance          | MediaRecorder → WebRTC broadcast
Session recording with playback  | MPE MIDI recording → replay + export
Community preset sharing         | REST API + preset database
```

### 15.3 Extended Instrument Library

```
Category        | Instruments
----------------|--------------------------------------------------
Indian          | Saraswati Veena, Rudra Veena, Sarod, Santur, Rabab
World strings   | Oud, Qanun, Koto, Shamisen, Gayageum
Extended        | Cello, Violin (with bowing model), Viola da gamba
Experimental    | Feedback drone, Spectral morph, Granular string
```

### 15.4 MIDI 2.0 Support

Web MIDI API is getting MIDI 2.0 support. When available:
- 32-bit per-note pitch (vs 14-bit MPE)
- Per-note articulation
- Higher resolution velocity (16-bit vs 7-bit)
- Native microtuning messages

### 15.5 Visual Enhancements

```
Feature                          | Implementation
---------------------------------|------------------------------------------
WebGL keyboard renderer          | Three.js — 3D key visualization
Oscilloscope in each key         | Canvas per-key waveform display
Spectrogram view                 | Canvas FFT visualization
Pitch trace per finger           | Draw the pitch path as the finger moves
MIDI piano roll overlay          | Show recorded notes on keyboard
```

---

## 16. Repository Structure Reference

Final project structure after all phases:

```
geoshred-web/
├── public/
│   ├── ir/                       # Cabinet impulse responses
│   │   ├── 4x12_marshall.wav
│   │   └── plate_reverb.wav
│   ├── scales/                   # Scale data files
│   │   ├── carnatic-ragas.json
│   │   ├── hindustani-ragas.json
│   │   └── arabic-maqamat.json
│   └── manifest.json
│
├── src/
│   ├── engine/
│   │   ├── keyboard/
│   │   │   ├── KeyboardLayout.ts  # Grid coordinate → note mapping
│   │   │   └── NoteNames.ts       # Western + Svara note naming
│   │   ├── pitch/
│   │   │   └── PitchRoundingEngine.ts  # Snap + Round algorithm
│   │   ├── audio/
│   │   │   ├── useAudioEngine.ts  # React hook, AudioContext management
│   │   │   ├── VoiceManager.ts    # Polyphony, HOPO, voice stealing
│   │   │   └── worklets/
│   │   │       └── KarplusStrongProcessor.ts  # AudioWorklet DSP
│   │   ├── effects/
│   │   │   ├── EffectsChain.ts    # Ordered signal chain
│   │   │   ├── CabinetLoader.ts   # IR file loading
│   │   │   └── EffectNodes.ts     # Per-effect wrappers
│   │   ├── midi/
│   │   │   ├── MPEOutputEngine.ts # WebMIDI.js MPE wrapper
│   │   │   └── MPEInputEngine.ts  # External controller input
│   │   ├── scales/
│   │   │   ├── ScalaParser.ts     # .scl file parser
│   │   │   └── ScaleEngine.ts     # Active scale management
│   │   ├── arpeggiator/
│   │   │   └── Arpeggiator.ts     # AudioContext-scheduled arp
│   │   └── BackingTrackPlayer.ts
│   │
│   ├── presets/
│   │   ├── PresetSchema.ts        # TypeScript preset interfaces
│   │   ├── PresetManager.ts       # Load/save/export/import
│   │   ├── SetlistManager.ts
│   │   └── factory/               # 200+ factory presets as JSON
│   │       ├── shred-lead.json
│   │       ├── sitar-raga.json
│   │       └── ...
│   │
│   ├── components/
│   │   ├── KeyboardCanvas.tsx     # Main keyboard component
│   │   ├── ControlSurface.tsx     # XY pad, Whammy, slots
│   │   ├── Header.tsx             # Preset nav, menu
│   │   ├── PresetBrowser.tsx      # Modal preset list
│   │   ├── PresetEditor.tsx       # Instrument + FX chain editor
│   │   ├── EffectsChainEditor.tsx # Drag-drop effects
│   │   ├── SetlistBrowser.tsx
│   │   └── SettingsPanel.tsx
│   │
│   ├── store/
│   │   ├── audioStore.ts          # Zustand: audio state
│   │   ├── presetStore.ts         # Zustand: active preset
│   │   └── uiStore.ts             # Zustand: UI state
│   │
│   ├── db/
│   │   └── GeoShredDB.ts          # Dexie.js schema + tables
│   │
│   └── App.tsx
│
├── _vendor/                       # Cloned reference repos (read-only)
│   ├── hexatone/
│   ├── karplus-strong/
│   └── resonarium/
│
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 17. Dependency & License Reference

All libraries used are open source and compatible with a commercial or personal project:

| Dependency | Version | License | Usage |
|---|---|---|---|
| react | 18.x | MIT | UI framework |
| typescript | 5.x | Apache-2 | Language |
| vite | 5.x | MIT | Build tool |
| tone | 14.x | MIT | Audio effects |
| tunajs | 1.x | MIT | Guitar FX |
| webmidi | 3.x | Apache-2 | MIDI I/O |
| mpe.js | 1.x | MIT | MPE state |
| zustand | 4.x | MIT | State management |
| dexie | 3.x | Apache-2 | IndexedDB |
| vite-plugin-pwa | 0.x | MIT | PWA |
| **Referenced (not bundled)** | | | |
| hexatone | latest | GPL-3 | Keyboard layout reference |
| terpstrakeyboard | 1.5.2 | GPL-3 | Grid math reference |
| javascript-karplus-strong | latest | MIT | KS algorithm port |
| resonarium | 0.x | GPL-3 | DSP algorithm reference |
| surge-xt | latest | GPL-3 | FX algorithm reference |

**Note on GPL:** hexatone, terpstrakeyboard, and resonarium are GPL-3. If you study their code and re-implement the algorithms yourself (rather than directly copying code), your project is not bound by GPL. If you fork and distribute their code as part of your project, your entire project must also be GPL-3. Decide your licensing strategy early.

**Recommendation:** Use `_vendor/` as a read-only reference. Write all production code from scratch in `src/`, informed by (not copied from) the reference repos. This keeps your project's licensing clean for any future commercial distribution.

---

## Quick Start Commands

```bash
# Week 1: Project setup
git clone https://github.com/PLAINSOUND/hexatone.git _vendor/hexatone
git clone https://github.com/mrahtz/javascript-karplus-strong.git _vendor/karplus-strong
git clone https://github.com/gabrielsoule/resonarium.git _vendor/resonarium
npm create vite@latest . -- --template react-ts
npm install tone tuna webmidi mpe.js zustand dexie
npm install -D vite-plugin-pwa @types/audioworklet
npm run dev     # should open at localhost:5173

# Week 2: Keyboard working
# → Implement KeyboardLayout.ts (study _vendor/hexatone/src/Layout.js)
# → Implement KeyboardCanvas.tsx with Pointer Events
# → Verify note hit-testing in browser DevTools mobile mode

# Week 3–4: Sound working
# → Port KS algorithm to AudioWorklet
# → Connect canvas pointer events to audio engine
# → Test: touching keyboard produces plucked string sound

# Week 5–6: GeoShred feel
# → Implement PitchRoundingEngine.ts
# → Snap on attack + Round while sliding
# → Toggle Fretless mode for comparison

# Week 7–8: Effects
# → Wire in Tuna + Tone.js effects chain
# → Load cabinet IRs
# → Test with headphones: sounds like electric guitar

# From week 9: Preset system, MIDI, scales, UI polish...
```

---

*This document is the execution-layer companion to the GeoShred Clone PRD. Read the PRD for the what, read this for the how and which repos to use.*
