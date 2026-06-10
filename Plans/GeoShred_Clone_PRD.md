# GeoShred Web Clone — Complete Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** June 2026  
**Target Platforms:** Web App (Chrome/Edge on Android & Windows)  
**Stack Recommendation:** React + TypeScript + Web Audio API + Tone.js + WebMIDI.js + Canvas/WebGL

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Architecture](#2-core-architecture)
3. [Playing Surface — The Isomorphic Keyboard](#3-playing-surface--the-isomorphic-keyboard)
4. [Pitch Rounding Engine (The "Almost Magic" System)](#4-pitch-rounding-engine-the-almost-magic-system)
5. [Sound Engine — Physical Modeling Synthesis](#5-sound-engine--physical-modeling-synthesis)
6. [Effects Chain](#6-effects-chain)
7. [Control Surface](#7-control-surface)
8. [Play Modes](#8-play-modes)
9. [Preset System](#9-preset-system)
10. [Setlist System](#10-setlist-system)
11. [MIDI & MPE System](#11-midi--mpe-system)
12. [Arpeggiator](#12-arpeggiator)
13. [Scale & Tuning System](#13-scale--tuning-system)
14. [Backing Track System](#14-backing-track-system)
15. [Performance Settings](#15-performance-settings)
16. [UI Layout & Visual Design](#16-ui-layout--visual-design)
17. [Keyboard Customization](#17-keyboard-customization)
18. [Audio Recording & Export](#18-audio-recording--export)
19. [Touch & Pointer Input System](#19-touch--pointer-input-system)
20. [Technical Stack & Architecture](#20-technical-stack--architecture)
21. [Performance & Latency Requirements](#21-performance--latency-requirements)
22. [Feature Implementation Priorities](#22-feature-implementation-priorities)
23. [Open Questions & Web-Specific Challenges](#23-open-questions--web-specific-challenges)

---

## 1. Product Overview

### 1.1 What is GeoShred?

GeoShred is an award-winning expressive musical instrument originally developed by Wizdom Music (Jordan Rudess, Dream Theater) and moForte Inc. (Dr. Julius O. Smith III, Stanford/CCRMA). It combines:

- An **isomorphic multi-touch playing surface** modeled after guitar strings and frets
- A **physical modeling synthesis engine** based on Karplus-Strong digital waveguide synthesis (Dr. Julius O. Smith III's research at Stanford/CCRMA, 30+ years of development)
- **"Almost Magic" Pitch Rounding** that snaps and guides pitch to perfect intonation in any temperament
- A **fully configurable effects chain** with 21+ modeled effects
- **Full MPE (MIDI Polyphonic Expression)** support for per-note expressiveness
- Support for **World Scales, Indian Ragas, Microtonal tunings**

### 1.2 Our Goal

Build a pixel-perfect, feel-perfect **web application** that replicates every feature of GeoShred Pro v7. It must run in Chrome/Edge on Android and Windows, giving Android and Windows users access to a GeoShred-equivalent experience.

### 1.3 Key Differentiators to Replicate

| Feature | Why It Matters |
|---|---|
| Isomorphic grid keyboard | Guitar-like layout, same chord shapes in all keys |
| Pitch Rounding (Snap + Round) | The "magic" that makes sliding feel musical |
| Physical Modeling Synth | Plucked string, feedback guitar, sitar, etc. — NOT samples |
| Per-note 3D expression (KeyX/KeyY/KeyZ) | Vibrato, slide, pressure per finger independently |
| MPE Output | Control external synths expressively |
| Customizable Control Surface | Whammy, XY pad, sliders, buttons per preset |
| World scales & Ragas | Critical for 30%+ South Asian user base |

---

## 2. Core Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEB BROWSER                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   INPUT LAYER                           │   │
│  │  PointerEvents API  │  WebMIDI API  │  Mouse Events     │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                   │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │                  GESTURE ENGINE                         │   │
│  │  Touch Tracker → KeyX/KeyY/KeyZ Resolver               │   │
│  │  Pitch Snap → Pitch Round → HOPO Detector              │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                   │
│        ┌────────────────────┼──────────────────┐               │
│        ▼                    ▼                  ▼               │
│  ┌───────────┐    ┌──────────────────┐  ┌──────────────┐       │
│  │  SYNTH    │    │   MIDI/MPE OUT   │  │  CONTROL     │       │
│  │  ENGINE   │    │  (WebMIDI.js)    │  │  SURFACE     │       │
│  │  (Phys    │    │                  │  │  ENGINE      │       │
│  │   Model)  │    │                  │  │              │       │
│  └─────┬─────┘    └──────────────────┘  └──────────────┘       │
│        │                                                        │
│  ┌─────▼───────────────────────────────────────────────────┐   │
│  │                  EFFECTS CHAIN                          │   │
│  │  Distortion→EQ→Wah→VCF→Flanger→Phaser→Chorus→         │   │
│  │  Tremolo→Amp/Cab Model→Reverb→Echo→Looper              │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────▼───────────────────────────────┐   │
│  │          Web Audio API AudioContext (Output)            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Breakdown

| Module | Responsibility |
|---|---|
| `InputManager` | Normalizes PointerEvents into touch points with ID, x, y, pressure |
| `KeyboardLayout` | Maps pixel coordinates to note numbers, row/column |
| `PitchRoundingEngine` | Snap-on-attack, Round-while-sliding, temperament-aware |
| `VoiceManager` | Allocates per-voice DSP nodes, handles polyphony, HOPO |
| `PhysicalModelEngine` | Karplus-Strong + waveguide DSP per voice |
| `EffectsChain` | Ordered signal chain, Web Audio nodes |
| `ControlSurface` | Whammy, XY pad, sliders — maps to parameter controllers |
| `PresetManager` | Load/save/share/export presets as JSON |
| `SetlistManager` | Ordered lists of presets |
| `MidiEngine` | WebMIDI input/output, MPE mode, channel rotation |
| `ArpeggiatorEngine` | Pattern, rate, octave range, latch |
| `ScaleEngine` | Scale filtering, diatonic mode, temperament |
| `BackingTrackPlayer` | Audio file playback synced to playing |
| `UIRenderer` | Canvas/CSS rendering of keyboard, control surface |

---

## 3. Playing Surface — The Isomorphic Keyboard

### 3.1 Layout Concept

The keyboard is a 2D grid of rectangular "keys" (cells). Each row represents a "string," and each column represents a "fret." The grid is **isomorphic** — the same interval pattern repeats uniformly in all directions.

```
Row 4 (Top):    E4  F4  F#4 G4  G#4 A4  A#4 B4  C5  C#5 D5  D#5 ...
Row 3:          B3  C4  C#4 D4  D#4 E4  F4  F#4 G4  G#4 A4  A#4 ...
Row 2:          G3  G#3 A3  A#3 B3  C4  C#4 D4  D#4 E4  F4  F#4 ...
Row 1 (Bottom): E3  F3  F#3 G3  G#3 A3  A#3 B3  C4  C#4 D4  D#4 ...
                ──────────────────────────────────────────────────►
                      Semitone +1 per column →
```

- **Default tuning:** Standard guitar tuning — rows are a **perfect fourth apart** (5 semitones between rows), with a **major third** (4 semitones) between rows 2 and 3 (G and B string equivalents), matching real guitar
- **Alternate default:** "All Fourths" (5 semitones every row) — most commonly used isomorphic layout, same as LinnStrument default, Ableton Push, ROLI
- **Columns:** Each column = +1 semitone horizontally (moving right = higher pitch)
- **Configurable:** Row count (2–8), column count (auto-fill screen width), semitone interval between rows (1–12), starting note

### 3.2 Key Rendering

Each key cell on the canvas must display:

- **Note name** (C, D, E... or Sa, Re, Ga... in Svara mode)
- **Octave number** (optional, toggleable)
- **Color coding:**
  - Root note: highlighted (customizable color)
  - In-scale notes (diatonic mode): bright
  - Out-of-scale notes (diatonic mode): darkened or hidden
  - Active/pressed: bright highlight + finger trace visual
- **Key styles:** Multiple visual styles including "Polkadot" (quarter-tone indicator dots), standard, minimal
- **Quarter-tone guide lines:** Vertical lines through key centers when quarter-tone mode is active

### 3.3 Key Size & Grid Configuration

| Setting | Range | Default |
|---|---|---|
| Number of rows (strings) | 2–8 | 4 |
| Columns | Auto-fill screen | Screen width / key width |
| Key width | 40px – 120px | ~80px on 1080p |
| Key height | 40px – 200px | ~130px per row |
| Row interval (semitones) | 1–12 | 5 (fourths) |
| Bottom row start note | Any MIDI note | E3 (52) |
| Transpose (coarse) | ±24 semitones | 0 |
| Transpose (fine) | ±100 cents | 0 |

### 3.4 Note Naming Modes

- Western: C D E F G A B (with sharps/flats)
- Svara (Indian): Sa Re Ga Ma Pa Dha Ni
- Both can show octave subscript
- Option to show MIDI note number
- Configurable font size

---

## 4. Pitch Rounding Engine (The "Almost Magic" System)

This is the single most important feature to get right. It is what makes GeoShred feel magical to play.

### 4.1 Concepts

The keyboard has limited pixel resolution (~±4 cents per pixel on a typical screen). Without rounding, the player would constantly be out of tune. The pitch rounding system has two components:

**SNAP (on initial attack):**
- When a finger first touches a key, regardless of the horizontal pixel position within the key, the pitch is immediately and instantly set to the exact center pitch of that key in the current temperament
- Result: First note is always perfectly in tune, even if the finger lands slightly off-center

**ROUND (while sliding):**
- As the finger moves left/right across the keyboard, the pitch follows the finger position
- BUT the system continuously applies a convergence toward the nearest note center at the configured "Slide Speed" rate
- When Snap=Off and Round=Off: pitch follows finger exactly with no correction (fretless mode)
- When Snap=On, Round=On: full intelligent rounding

### 4.2 Pitch Rounding Algorithm

```
// Called at audio rate (e.g., every 1ms)
function updatePitch(voice) {
  const fingerCents = pixelToCents(voice.fingerX, voice.keyIndex);
  const nearestNoteCents = snapToNearestNote(fingerCents, currentScale, temperament);
  
  if (voice.isAttack && snapEnabled) {
    voice.currentPitch = nearestNoteCents; // Instant snap on attack
    return;
  }
  
  if (roundEnabled) {
    // Exponential convergence toward nearest note
    const error = nearestNoteCents - voice.currentPitch;
    voice.currentPitch += error * slideSpeed; // slideSpeed: 0.0–1.0
  } else {
    voice.currentPitch = fingerCents; // Pure fretless
  }
}
```

### 4.3 Parameters

| Parameter | Type | Description |
|---|---|---|
| `snap` | Boolean | Snap to note center on attack |
| `round` | Boolean | Continuous convergence while sliding |
| `slideSpeed` | Float 0.0–1.0 | Rate of convergence to nearest note |
| `snapThreshold` | Semitones | How far off-center before not snapping |
| `temperament` | Enum/Custom | Equal, Just, Carnatic, Arabic, custom cents table |

### 4.4 Vibrato Behavior

- Moving finger **left/right within a single key** (without crossing to adjacent key) produces vibrato
- The pitch oscillates around the center pitch, controlled by the speed and depth of the finger oscillation
- The physical model engine uses this continuous pitch modulation as input to produce realistic string vibrato, including subtle timbral changes

---

## 5. Sound Engine — Physical Modeling Synthesis

### 5.1 Overview

GeoShred uses **Digital Waveguide Synthesis** (extended Karplus-Strong), pioneered by Dr. Julius O. Smith III at Stanford/CCRMA. This is NOT sample-based. Every note is computed in real-time from a physics model.

The base model simulates a vibrating string. Parameters control the physical properties of the string, bridge, body, and pickup.

### 5.2 Karplus-Strong Digital Waveguide Core

The fundamental algorithm (per voice):

```
Core Loop (runs at audio sample rate, e.g., 48kHz):

1. EXCITATION SIGNAL generation:
   - Pluck model: burst of noise shaped by pluck position
   - Bow model: sawtooth-shaped continuous excitation  
   - Mallet model: half-sine burst

2. DELAY LINE (length = sample_rate / frequency):
   - Ring buffer of length N samples
   - N = sample_rate / (base_freq * 2^(pitchBendSemitones/12))
   - Use Lagrange interpolation for fractional delay lengths (tuning precision)

3. LOOP FILTER (in the feedback path):
   - First-order lowpass: simulates energy loss (string damping)
   - Coefficient controls decay rate and brightness
   - H(z) = g * (1 + z^-1) / 2  (basic averaging filter)
   - Tunable: stiffness (dispersion), brightness, decay time

4. COMB FILTER at input:
   - Simulates pluck position on string
   - Position 0.5 (midpoint) = brightest
   - Position 0.1 (near bridge) = twangy

5. NONLINEAR DISTORTION (optional, for feedback/overdrive):
   - Waveshaper inserted in loop for saturation
   - Modeled feedback: output fed back into delay line
     via a secondary delay simulating distance to amplifier

6. OUTPUT: current sample = delay_line[read_pointer]
```

### 5.3 Guitar Model Parameters

| Parameter | Range | Description |
|---|---|---|
| `stiffness` | 0–1 | String dispersion — affects inharmonicity (piano vs guitar) |
| `brightness` | 0–1 | High freq content — controls loop filter rolloff |
| `decay` | 0–∞ | String sustain — loop filter gain coefficient |
| `pluckPosition` | 0–1 | Where string is excited (0=bridge, 1=nut) |
| `bodyResonance` | Freq, Q, Gain | Comb filter for body resonance peaks |
| `pickupPosition` | 0–1 | Affects which harmonics are emphasized |
| `palmMute` | 0–1 | Strong damping applied to decay |
| `stringVariance` | 0–1 | Random variation between strings for realism |
| `coarseTune` | ±24 semitones | Pitch offset |
| `fineTune` | ±100 cents | Fine pitch offset |
| `feedback` | 0–1 | Modeled amp feedback into string |
| `feedbackPitch` | MIDI note | Which harmonic the feedback locks onto |

### 5.4 Polyphony

- **Mono mode:** Single voice. New note steals previous voice with legato glide
- **String mode:** One voice per row. Each row is monophonic (like a guitar string). HOPO (Hammer On/Pull Off) gestures available
- **Poly mode:** Independent voice per finger, up to 10 simultaneous (browser PointerEvent limit)
- Voice stealing: Oldest voice stolen when max polyphony reached

### 5.5 HOPO (Hammer-On / Pull-Off) — String Mode Only

- **Hammer-On:** Second finger placed on same row higher than first while first still held → new note activates without a new pluck/attack excitation
- **Pull-Off:** First finger releases while a second lower finger is already held → lower note rings without a new attack
- Implemented as: new voice inherits the existing delay line state instead of re-triggering excitation

### 5.6 Additional Physical Models (beyond base guitar)

These are the equivalent of GeoShred's IAP instruments. For the web clone, implement as selectable timbres via parameter presets:

| Model | Key Differences vs Guitar |
|---|---|
| Acoustic Guitar (Steel) | Brighter, less sustain, body resonance prominent |
| Classical Guitar (Nylon) | Warmer loop filter, softer attack |
| Dobro/Resonator | Specific comb filter peaks for resonator body |
| Sitar | Additional sympathetic resonator, buzz bridge effect |
| Electric Guitar | Neutral body, pickup model, feeds into amp sim |
| Bass Guitar | Low stiffness, long decay, low frequency |
| 12-String | Doubled voices slightly detuned |

---

## 6. Effects Chain

GeoShred has 21+ modeled effects in a configurable signal chain. Each effect has a bypass toggle, adjustable parameters, and visual UI resembling a guitar pedal.

### 6.1 Signal Chain Order

The signal chain is **drag-and-drop reorderable** in the preset editor. Default order:

```
[Physical Model Output]
        │
        ▼
   ┌─────────┐
   │  WHAMMY │ ← KeyX / Control Surface
   └─────────┘
        │
        ▼
   ┌────────────┐
   │  DISTORTION│ (Overdrive/Fuzz/Metal)
   └────────────┘
        │
        ▼
   ┌──────┐
   │  WAH │ ← KeyY / Control Surface
   └──────┘
        │
        ▼
   ┌──────┐
   │  EQ  │ (3-band or parametric)
   └──────┘
        │
        ▼
   ┌───────┐
   │  VCF  │ (Moog-style ladder filter)
   └───────┘
        │
        ▼
   ┌──────────┐
   │  FLANGER │
   └──────────┘
        │
        ▼
   ┌────────┐
   │ PHASER │
   └────────┘
        │
        ▼
   ┌────────┐
   │ CHORUS │
   └────────┘
        │
        ▼
   ┌──────────┐
   │ TREMOLO  │
   └──────────┘
        │
        ▼
   ┌───────────────────┐
   │ AMP + CAB MODEL   │
   └───────────────────┘
        │
        ▼
   ┌─────────────────────┐
   │ SYMPATHETIC         │
   │ RESONATOR           │ (Sitar drone strings simulation)
   └─────────────────────┘
        │
        ▼
   ┌──────────────┐
   │  REVERB      │ (Convolution or algorithmic)
   └──────────────┘
        │
        ▼
   ┌───────────────┐
   │  ECHO / DELAY │ (Multi-tap, sync to BPM)
   └───────────────┘
        │
        ▼
   ┌──────────────┐
   │   LOOPER     │ (Record/Play/Overdub)
   └──────────────┘
        │
        ▼
   [MASTER OUTPUT]
```

### 6.2 Effect Parameter Details

#### Distortion
- Type: Overdrive, Fuzz, Metal, Amp Drive
- Drive: 0–100
- Tone: 0–100 (high freq rolloff post-distortion)
- Level: 0–100
- Implementation: WaveShaper node with cubic/sigmoid/asymmetric transfer functions

#### Wah (Auto-Wah / Expression Wah)
- Center frequency: 400Hz–3500Hz
- Q / Resonance: 0.5–15
- Mode: Expression (mapped to KeyY or Control Surface), Auto (envelope follower), LFO
- Implementation: BiquadFilterNode (bandpass) with dynamic frequency modulation

#### EQ
- 3-band: Low shelf, Mid peak, High shelf
- Or Parametric: 4 bands, each with Freq/Gain/Q
- Implementation: BiquadFilterNode chain

#### VCF (Voltage Controlled Filter)
- Type: Low-pass (Moog ladder model)
- Cutoff: 20Hz–20kHz
- Resonance: 0–1 (self-oscillation at 1.0)
- Envelope amount, Attack, Decay
- LFO modulation depth and rate
- Implementation: Custom IIR ladder filter or approximated via BiquadFilterNode cascade

#### Flanger
- Rate: 0.01–5 Hz
- Depth: 0–1
- Feedback: 0–0.95
- Delay center: 1–10ms
- Implementation: DelayNode with LFO-modulated delay time + feedback

#### Phaser
- Stages: 2, 4, 6, 8
- Rate: 0.01–5 Hz
- Depth: 0–1
- Feedback: 0–0.95
- Implementation: All-pass filter chain with LFO modulation

#### Chorus
- Rate: 0.1–5 Hz
- Depth: 0–1
- Delay: 5–30ms
- Wet/Dry mix
- Implementation: Dual delayed paths with LFO modulation

#### Tremolo
- Rate: 0.5–20 Hz
- Depth: 0–1
- Shape: Sine, Square, Triangle
- Implementation: GainNode with LFO oscillator

#### Amp + Cabinet Model
- Amp type presets: Clean, Crunch, Lead, Metal
- Gain, Bass, Mid, Treble, Presence
- Cabinet IR (Impulse Response): 1x12, 2x12, 4x12 cabinet simulations
- Implementation: Pre-amp waveshaper → ConvolverNode (cabinet IR)

#### Sympathetic Resonator
- For sitar, veena, sarod: Models drone/sympathetic strings
- Tuning: Array of sympathetic string frequencies
- Decay: Independent decay for sympathetic strings
- Implementation: Bank of Karplus-Strong voices triggered by main note events

#### Reverb
- Type: Room, Hall, Plate, Spring
- Size: 0–1
- Decay: 0.1–10s
- Damping: 0–1
- Pre-delay: 0–100ms
- Wet/Dry
- Implementation: ConvolverNode (convolution reverb with IR files) or Tone.js Reverb

#### Echo / Delay
- Time: 10ms–2s (or sync: 1/4, 1/8, dotted, triplet)
- Feedback: 0–0.99
- Wet/Dry
- Multi-tap: Up to 4 taps with independent times and levels
- Ping-pong mode
- Implementation: DelayNode with feedback

#### Looper
- Record, Play, Overdub, Stop, Clear
- Max loop length: 30s (configurable)
- Visual playhead display
- Implementation: MediaRecorder / ScriptProcessorNode ring buffer

---

## 7. Control Surface

### 7.1 Layout

The control surface is a horizontal strip that sits either **above or below** the keyboard (user-configurable). It contains slots for customizable controls.

```
┌─────────────────────────────────────────────────────────────────────┐
│  [XY PAD]  │ [WHAMMY] │ [VOL] │ [VIB] │ [MUTE] │ [SLOT] │ [SLOT] │
│            │          │       │       │        │        │        │
└─────────────────────────────────────────────────────────────────────┘
```

The control surface has **7 column slots** to the right of the XY Expression Pad.

### 7.2 XY Expression Pad

- 2D touch surface
- X axis: Maps to any controller parameter (default: mod wheel / vibrato depth)
- Y axis: Maps to any controller parameter (default: expression / volume)
- Outputs two independent continuous values 0–1
- Shows finger position visually

### 7.3 Whammy (Pitch Bend Bar)

- Vertical drag slider
- Range: configurable (e.g., ±2 semitones, ±12 semitones, ±24 semitones)
- Default center = 0 (no bend)
- Auto-return to center on release (spring): configurable
- Implementation: modifies the base pitch of ALL active voices simultaneously
- MIDI out: Pitch Bend message on manager channel

### 7.4 Slot Control Types

Each of the 7 column slots can be one of:

| Control Type | Description |
|---|---|
| **Slider** (vertical) | Continuous 0–1 value, touch-drag |
| **Momentary Button** | Active while held, releases on lift |
| **Toggle Button** | On/off state, tap to toggle |
| **Spring Slider** | Returns to center or default on release |
| **Play Button** | Starts/stops backing track |

Each control can be **labeled** (user-defined text) and **mapped** to one or more controllers:
- Volume
- Vibrato Depth
- Palm Mute
- Distortion Drive
- Wah Frequency
- Reverb Wet
- Echo Wet / Feedback
- Any effect parameter
- MIDI CC 0–127 (for MPE output mode)

### 7.5 Control Surface Configurability

In the Preset Editor, each slot can be:
- Added, removed, reordered
- Assigned to 1–N controller targets
- Given a custom min/max range (e.g., Volume slider only goes 0.5–1.0)
- Given a custom initial value (value on preset load)
- Given a display label

---

## 8. Play Modes

### 8.1 Three Fundamental Play Modes

| Mode | Per-Row Behavior | MIDI Out Equivalent | HOPO |
|---|---|---|---|
| **MONO** | Only one note total active | MIDI Mono Mode | No |
| **STRING** | One note per row (like guitar strings) | MPE Mode 4 (Channel-per-Row) | Yes |
| **POLY** | Multiple notes per row (like piano) | MPE Mode 3 (Channel-per-Note) | No |

### 8.2 Diatonic Mode

When enabled, the scale filter changes what keys are displayed/active:

- **Off (Fretless/Chromatic):** All 12 semitones visible and playable. Full chromatic sliding possible
- **On (Diatonic):** Only notes in the current scale are displayed as active. Sliding always stays within scale — you can never hit a "wrong" note
- In diatonic mode, horizontal sliding jumps by scale degrees rather than semitones
- The key spacing remains the same, but non-scale keys are visually darkened and sonically skipped

### 8.3 Fretless vs. Diatonic Toggle

GeoShred's core UX lets the player **seamlessly switch** between chromatic/fretless playing and diatonic (scale-locked) playing. This must be instant, with no audio interruption.

---

## 9. Preset System

### 9.1 Preset Structure (JSON Schema)

```json
{
  "preset": {
    "id": "uuid",
    "name": "Shred Lead",
    "version": 7,
    "color": "white",  // white=factory, yellow=modified, red=unsaved-edit
    "instrument": {
      "type": "guitar_pluck",  // guitar_pluck | guitar_electric | sitar | classical | dobro
      "parameters": {
        "stiffness": 0.2,
        "brightness": 0.7,
        "decay": 0.85,
        "pluckPosition": 0.15,
        "coarseTune": 0,
        "fineTune": 0,
        "palmMute": 0,
        "feedback": 0.3,
        "feedbackPitch": 64,
        "stringVariance": 0.05
      }
    },
    "effectsChain": [
      {
        "type": "distortion",
        "enabled": true,
        "parameters": { "drive": 75, "tone": 50, "level": 80, "type": "metal" }
      },
      {
        "type": "amp_cab",
        "enabled": true,
        "parameters": { "amp": "lead", "gain": 60, "bass": 50, "mid": 55, "treble": 60, "cab": "4x12" }
      },
      {
        "type": "reverb",
        "enabled": true,
        "parameters": { "type": "room", "size": 0.3, "decay": 1.5, "wet": 0.2 }
      }
    ],
    "performanceSettings": {
      "playMode": "string",  // mono | string | poly
      "snapEnabled": true,
      "roundEnabled": true,
      "slideSpeed": 0.15,
      "diatonicEnabled": false,
      "scale": "major",
      "root": "E",
      "temperament": "equal",
      "rows": 4,
      "rowInterval": 5,
      "startNote": 52
    },
    "controlSurface": {
      "position": "top",  // top | bottom
      "xyPad": {
        "xController": "vibrato_depth",
        "yController": "expression"
      },
      "whammy": {
        "rangeMin": -24,
        "rangeMax": 24,
        "springReturn": false
      },
      "slots": [
        { "type": "slider", "label": "Vol", "controller": "volume", "min": 0, "max": 1, "initial": 0.8 },
        { "type": "slider", "label": "Vib", "controller": "vibrato_depth", "min": 0, "max": 1, "initial": 0 },
        { "type": "toggle", "label": "Mute", "controller": "palm_mute", "offValue": 0, "onValue": 0.8 }
      ]
    },
    "backingTrack": null,
    "arpeggiator": {
      "enabled": false,
      "pattern": "up",
      "rate": 120,
      "octaves": 1,
      "latch": false
    }
  }
}
```

### 9.2 Preset Operations

- **Load:** Instantly loads all parameters, re-initializes effects chain
- **Save:** Saves to browser localStorage or IndexedDB
- **Save As:** Creates a new copy with new name
- **Revert:** Restores factory preset to original state (user-modified presets go yellow)
- **Share:** Export as `.geoshred` JSON file (or base64 URL)
- **Import:** Import from file or URL
- **Preset Color State:**
  - White: Factory or user-created, unmodified
  - Red: Factory preset modified but not saved
  - Yellow: Factory preset saved-over (modified and saved)

### 9.3 Factory Presets (200+)

Must ship with presets across these categories:

- **Shred Lead** (feedback distortion guitar — many variations)
- **Steel Dobro Acoustic**
- **Classical Acoustic**
- **Sitar** (multiple variations)
- **Xitar** (Mahesh Raghvan signature presets)
- **GeoJamTrax** (diatonic mode + backing track combos for easy playing)
- **Bass** variations
- **Clean Electric** variations
- **Chorus/Flanger** textured sounds
- **Percussive/Muted** sounds

---

## 10. Setlist System

### 10.1 Concept

A **setlist** is an ordered list of presets, used for live performance navigation. The player can swipe/tap to advance to the next preset in the setlist without leaving the performance view.

### 10.2 Setlist Structure

```json
{
  "setlist": {
    "id": "uuid",
    "name": "Live Set - Mumbai 2026",
    "presets": [
      { "presetId": "uuid1", "name": "Intro Clean" },
      { "presetId": "uuid2", "name": "Shred Lead" },
      { "presetId": "uuid3", "name": "Sitar Raga" }
    ]
  }
}
```

### 10.3 Operations

- Create, rename, delete setlists
- Add/remove presets from setlist
- Reorder presets (drag and drop)
- Navigate: Previous / Next preset during performance
- iCloud sync equivalent: Firebase/localStorage cloud sync
- User Setlist: Default user setlist where all user-created presets go
- Search presets by name across all setlists

---

## 11. MIDI & MPE System

### 11.1 MIDI Output (for controlling external synths)

Using the **Web MIDI API** (supported in Chrome/Edge).

#### MIDI Configurations (Presets)

The user selects a MIDI configuration that determines how GeoShred translates touch gestures to MIDI messages:

| Config Name | Description |
|---|---|
| MPE Mode 3 | Channel-per-Note. Each simultaneous note gets its own MIDI channel. Per-note pitchBend + CC74 + Channel Pressure |
| MPE Mode 4 | Channel-per-Row. Each row gets a fixed MIDI channel |
| MPE Mode 3 CC74 | MPE Mode 3, sends only CC74 for KeyY (no Channel Pressure) |
| MPE Mode 3 Channel Pressure | MPE Mode 3, sends only Channel Pressure for KeyY |
| Multi Mode 3 | Non-MPE multitimbral. One channel per row, no channel rotation |
| Single Channel | Traditional MIDI, one channel, pitch bend applies globally |
| Roli Seaboard | Optimized for Seaboard hardware |
| LinnStrument | Optimized for LinnStrument hardware |

#### MPE Implementation Details

```
MPE Channel Assignment:
- Channel 1: Manager channel (global pitchBend ±2, ModWheel CC1, global messages)
- Channels 2–16: Member channels (rotated for each new note)
  - PitchBend: ±48 semitones (per-note pitch sliding)
  - CC74: KeyY value (finger vertical position within key)
  - Channel Pressure (mono aftertouch): KeyZ (pressure/touch depth)
  - NoteOn velocity: from KeyY position at attack (0=bottom of key, 127=top)
  - NoteOff: on finger lift

RPN Messages sent:
- RPN 0 (Pitch Bend Range): Set to 48 semitones for member channels
- RPN 0 (Pitch Bend Range): Set to 2 for manager channel
```

#### Pitch Bend Range Scaling

```
finalBendSemitones = pitchBendValue * (pitchBendRange / 48);
// When Whammy slider present:
bendInSemitones = bendInSemitones * (rangeOfWhammySlider / pitchBendRange);
```

### 11.2 MIDI Input (for being controlled)

GeoShred can be controlled by external MIDI/MPE controllers:

- **MPE Controller (Seaboard, LinnStrument, etc.):** Use "MPE Channel Mode" config. Receives per-note pitchBend, CC74, Channel Pressure
- **Conventional MIDI controller + breath (CC2):** "Single Channel" config
- **Wind controller:** CC2 maps to expression
- **Foot pedal CC4:** Maps to expression
- **Expression pedal CC11:** Maps to volume/expression

### 11.3 MIDI I/O Transports

| Transport | Web Implementation |
|---|---|
| USB Physical MIDI | Web MIDI API (Chrome/Edge only) |
| Virtual MIDI | Web MIDI API (same browser environment) |
| Bluetooth MIDI | Web MIDI API (Chrome Android) |
| Wi-Fi MIDI (rtpMIDI) | Not directly available in browser — use WebSocket bridge |

---

## 12. Arpeggiator

### 12.1 Modes

| Mode | Description |
|---|---|
| Up | Notes play ascending |
| Down | Notes play descending |
| Up-Down | Ascending then descending |
| Random | Random order each cycle |
| As Played | Notes arpeggiate in order pressed |

### 12.2 Parameters

| Parameter | Range | Description |
|---|---|---|
| Rate | 30–500 BPM | Speed of arpeggio |
| Note Duration | 10%–100% | Gate time as % of step time |
| Octave Range | 1–4 | How many octaves the arp spans |
| Latch | Boolean | Hold last set of notes even after fingers lift |
| Sync | Boolean | Sync rate to backing track BPM |

### 12.3 Implementation

- Web Audio API `setInterval` or `AudioContext.currentTime`-based scheduler (NOT setInterval for accurate timing)
- Use `AudioContext.currentTime` lookahead scheduling for glitch-free arp
- Arp rate set to 0 = play all held notes simultaneously as a chord

---

## 13. Scale & Tuning System

### 13.1 Built-in Scales

Western scales:
- Major, Natural Minor, Harmonic Minor, Melodic Minor
- All 7 modes (Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian)
- Pentatonic Major, Pentatonic Minor
- Blues scale, Whole Tone, Diminished, Chromatic

Indian/World scales (critical feature — 30% user base):
- Carnatic Ragas: Mayamalavagowla, Shankarabharanam, Kalyani, Kharaharapriya, Bhairav, and dozens more
- Hindustani Ragas
- Arabic Maqamat
- Balinese Pelog and Slendro

### 13.2 Scale Root

Any of the 12 chromatic pitch classes (Db through F#). Note: G# not typically offered — use Ab instead (same enharmonic, fewer theoretical issues).

### 13.3 Temperament System

| Temperament | Description |
|---|---|
| Equal Temperament | Standard Western, 100 cents per semitone |
| Just Intonation | Pure ratios (3:2 fifth = 702 cents, etc.) |
| Carnatic Intonation | Close to Just, used in South Indian classical music |
| Arabic | Quarter-tone inflections |
| Custom | User-defined via ETdiff table (cents deviation from Equal per scale degree) |

Custom temperament editor:
- Table of 12 entries (one per chromatic pitch class)
- Each entry = deviation in cents from Equal Temperament (-50 to +50 cents)
- Can be named and saved as custom temperament

### 13.4 Global vs. Per-Preset Tuning

- **Per-preset:** Coarse tune (±24 semitones), Fine tune (±100 cents) stored in preset
- **Global:** Overrides ALL presets — used for South Asian performance where Sa must match a singer's pitch
- Global tuning accessible from Settings

### 13.5 Note Name Display

- Toggle: Western note names (C, D, E...) vs. Svara names (Sa, Re, Ga, Ma, Pa, Dha, Ni)
- Particularly important for Indian classical musicians

---

## 14. Backing Track System

### 14.1 Features

- Load audio file (MP3, AAC, WAV, FLAC, OGG) as backing track
- Backing track can be **per-preset** or **global**
- Auto-play: Backing track can start automatically on preset load
- Play/Stop control on Control Surface (assignable button)
- Volume control independent from instrument volume
- Loop: Configurable looping
- BPM detection (optional, for arpeggiator sync)

### 14.2 Web Implementation

- Use HTML5 `<audio>` element or Web Audio API AudioBufferSourceNode
- File sources:
  - Upload from device (File System Access API or `<input type="file">`)
  - URL (load from web URL)
  - Stored in IndexedDB for persistence

### 14.3 Backing Track Inspector

Settings per backing track assignment:
- Global or current preset only
- Auto-play on preset change: Yes/No
- Start time offset (in seconds)
- Loop: Yes/No
- Volume: 0–1

---

## 15. Performance Settings

All settings accessible from a slide-out or modal panel, organized by category:

### 15.1 Keyboard Settings

| Setting | Options |
|---|---|
| Number of rows | 2, 3, 4, 5, 6, 7, 8 |
| Row interval | 1–12 semitones |
| Starting note | Any MIDI note |
| Key width | Small / Medium / Large / Custom |
| Snap | On / Off |
| Round | On / Off |
| Slide Speed | 0.0–1.0 slider |
| Note names | On / Off |
| Note name font | Western / Svara |
| Octave numbers | On / Off |
| Root highlight color | Color picker |
| Key style | Standard / Polkadot / Minimal |

### 15.2 Play Mode Settings

- Mono / String / Poly mode selector
- Diatonic mode toggle
- Scale selector
- Root selector
- Temperament selector

### 15.3 Touch Settings

- KeyY Touch for Velocity: On/Off (use vertical position within key for velocity)
- KeyY Touch Velocity Curve: Linear, Logarithmic, Exponential (customizable curve)
- KeyY Touch Pressure Curve: same
- Pressure Sensitivity: For devices with pointer pressure API

### 15.4 Global Settings

- Master Tuning (A=440Hz default, adjustable ±100 cents)
- Global transpose (coarse and fine)
- Audio buffer size (for latency tuning: 128, 256, 512, 1024 samples)
- Sample rate (44.1kHz, 48kHz, 96kHz)

---

## 16. UI Layout & Visual Design

### 16.1 Main Screen Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [≡ MENU]    [PRESET NAME ▼]    [← PREV] [NEXT →]   [⚙]    │  ← Header Bar
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [XY PAD] [WHAMMY] [VOL] [VIB] [MUTE] [       ] [       ]   │  ← Control Surface
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│          ████████████ KEYBOARD GRID ████████████            │
│                                                              │
│    Row 4: E4  F4  F#4  G4  G#4  A4  A#4  B4  C5  C#5...   │
│    Row 3: B3  C4  C#4  D4  D#4  E4   F4  F#4  G4  G#4...   │
│    Row 2: G3  G#3  A3  A#3  B3  C4  C#4   D4  D#4   E4...  │
│    Row 1: E3  F3  F#3  G3  G#3  A3  A#3   B3   C4  C#4...  │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Control surface position is configurable** (top or bottom). When at bottom, header moves to top and keyboard expands.

### 16.2 Header Bar

- Hamburger menu (≡): Opens main menu
- Preset name: Shows current preset name. Tap = open preset browser
- Preset navigation: ← Previous / Next → within current setlist
- Settings icon (⚙): Quick access to performance settings
- Optional: MIDI indicator (shows MIDI input activity)

### 16.3 Main Menu Structure

```
Menu
├── Presets & Setlists
│   ├── Browse Presets
│   ├── Browse Setlists
│   ├── Create Setlist
│   └── User Setlist
├── Model & FX (Preset Editor)
│   ├── Guitar (physical model params)
│   ├── Effects Chain
│   │   ├── Add Effect
│   │   ├── Reorder Effects (drag-drop)
│   │   └── [Effect name] → opens editor
│   ├── Perform (strum / control surface options)
│   └── Control Surface Editor
├── Performance Settings
│   ├── Keyboard (rows, tuning, snap/round)
│   ├── Play Mode (mono/string/poly, diatonic)
│   ├── Scale & Temperament
│   └── Touch Settings
├── MIDI
│   ├── MIDI In (select input device/config)
│   ├── MIDI Out (select output device/config)
│   └── MPE Configuration
├── Set Backing Track
│   ├── From File
│   └── Factory Tracks
├── Play Backing Track / Stop
├── File
│   ├── Export Presets
│   ├── Import Presets
│   └── Factory Reset
├── Share (current preset by email/link)
├── Settings
│   ├── Note Name Font (Western / Svara)
│   ├── Tuning (global fine tune, A=440)
│   ├── Audio Buffer Size
│   └── 3D Touch / Pressure Settings
└── Help
    ├── Video Manual
    ├── FAQs
    └── About
```

### 16.4 Preset Editor Screen

Full-screen overlay with three main sections:

**A. Guitar/Instrument Model Panel**
- Knobs or sliders for all physical model parameters
- Visual representation (stylized guitar diagram)
- Parameter: Brightness, Stiffness, Decay, Pluck Position, Palm Mute, Feedback, etc.

**B. Effects Chain Panel**
- Horizontal (or vertical) signal chain visualization
- Each effect shown as a "pedal" block with enable toggle
- Tap effect = opens inline parameter panel
- Drag to reorder
- "+" button to add new effect from library
- Visual signal flow arrows between effects

**C. Control Surface Editor**
- Preview of current control surface
- Tap a slot to reassign its type and parameter mapping
- Drag slots to reorder

### 16.5 Visual Theme / Design Language

- **Color scheme:** Dark background (#1a1a2e or similar near-black), with vibrant colored key highlights
- Root notes: Gold/amber highlight
- Active pressed notes: Bright cyan or white glow with radial ripple effect
- Finger trace: Each touch point shows a translucent circular glow that follows the finger
- Note name text: High contrast white on dark keys
- In-scale keys (diatonic mode): Normal brightness
- Out-of-scale keys: 40% opacity darkened
- Control surface: Dark panel with metallic-look sliders
- Effects chain: Each effect has its own color code (distortion = red, reverb = blue, etc.)

---

## 17. Keyboard Customization

### 17.1 Key Styles

- **Standard:** Rectangular grid, all same size
- **Polkadot:** Small colored dots at note centers, especially for quarter-tone visualization
  - Each dot pattern is customizable via a pattern editor (color picker, size, shadow)
  - Exportable/importable Polkadot patterns for sharing
- **Minimal:** Just note names, no cell borders

### 17.2 Polkadot Pattern Designer

Feature from GeoShred v7:
- Free-form color picker for dots
- Sticky preview while designing
- Stroke / drop shadow options
- Label circle size
- Import/Export patterns as JSON
- Share patterns with other users

### 17.3 Quarter-Tone Support

- Full quarter-tone scale support (24 divisions per octave)
- Vertical guide lines through key centers when QT mode active
- "Show 1/4 Tones" toggle in settings
- QT keyboard presets (different row spacing to accommodate quarter tones)
- QT note naming (augmented with half-sharp/half-flat symbols)

---

## 18. Audio Recording & Export

### 18.1 In-App Recording

- Record button in header or control surface
- Records Web Audio output to WAV or WebM
- Uses `MediaRecorder` API or `AudioWorkletNode` buffer capture
- Recorded file auto-downloaded or saved to IndexedDB

### 18.2 MIDI Recording

- Record gestures as MIDI/MPE data in real-time
- Save as MIDI file (.mid) for use in DAWs
- Timeline view of recorded MIDI notes (basic)

---

## 19. Touch & Pointer Input System

This is the most latency-critical component. Must be implemented with extreme care.

### 19.1 Event Model

Use the **Pointer Events API** (not Touch Events, which are older):
- `pointerdown` → note attack
- `pointermove` → continuous expression update (KeyX, KeyY, optional KeyZ)
- `pointerup` / `pointercancel` → note release
- `setPointerCapture(e.pointerId)` on the keyboard canvas to ensure moves are tracked even outside the element

### 19.2 Multi-Touch

- Track up to 10 simultaneous `pointerId` values
- Each pointerId = one voice in the voice manager
- Map pointerId → voiceId → MIDI channel (for MPE)
- On new `pointerdown`: allocate new voice, send NoteOn
- On `pointermove` for existing pointerId: update KeyX (pitch), KeyY (CC74/velocity), KeyZ (pressure if available)
- On `pointerup`: release voice, send NoteOff

### 19.3 KeyX, KeyY, KeyZ Mapping

```
KeyX (Horizontal within key):
  - Range: 0 at left edge of key, 1 at right edge
  - 0.5 = exact note center (perfect pitch)
  - Maps to: pitch deviation in cents (±50 cents per key = ±1 semitone)
  - After rounding: maps to pitchBend MIDI message

KeyY (Vertical within key):
  - Range: 0 at bottom of key, 1 at top
  - On initial tap (velocity): 0=soft (pianissimo), 1=loud (fortissimo)
  - While held: maps to CC74 (brightness/expression) or Channel Pressure
  - Used for: volume swells, tremolo, flutter on wind models, bow pressure on strings

KeyZ (Pressure — device-dependent):
  - From: `event.pressure` on Pointer Events (0–1, requires pressure-sensitive screen)
  - Fallback: KeyY-sliding when no hardware pressure
  - Maps to: Channel Pressure (Mono Aftertouch) in MPE
  - Used for: swell, growl, flutter on wind instruments
```

### 19.4 Minimum Latency Requirements

| Stage | Target |
|---|---|
| PointerEvent → Audio output | < 20ms total |
| AudioContext buffer size | 128–256 samples (2.9–5.8ms at 44.1kHz) |
| JavaScript processing overhead | < 5ms |
| Physical model compute per voice | < 1ms per sample block |

Use `AudioWorklet` (not deprecated `ScriptProcessorNode`) for all DSP processing.

### 19.5 Preventing Default Behaviors

On the keyboard canvas:
```javascript
canvas.style.touchAction = 'none';  // Disable browser scroll/zoom
canvas.addEventListener('contextmenu', e => e.preventDefault()); // No long-press menu
document.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
```

---

## 20. Technical Stack & Architecture

### 20.1 Recommended Stack

| Layer | Technology |
|---|---|
| Framework | React 18+ with TypeScript |
| State Management | Zustand (lightweight, perfect for audio state) |
| Rendering (Keyboard) | HTML5 Canvas API (OffscreenCanvas for performance) |
| Audio DSP Core | Web Audio API + AudioWorklet |
| High-level Audio | Tone.js (for effects that don't need custom DSP) |
| MIDI | WebMIDI.js v3 |
| Physical Modeling DSP | Custom AudioWorkletProcessor (compiled from C/C++ via WebAssembly for performance) |
| Persistence | IndexedDB (via Dexie.js) for presets, setlists |
| File I/O | File System Access API + fallback `<a download>` |
| Build | Vite |
| Audio Worklet Language | TypeScript AudioWorklet or WebAssembly (Emscripten from C++) |

### 20.2 AudioWorklet Architecture

The physical model engine MUST run in an AudioWorklet (off the main thread) for reliable low-latency audio:

```typescript
// physical-model-processor.ts (AudioWorklet context)
class PhysicalModelProcessor extends AudioWorkletProcessor {
  private voices: Map<number, Voice> = new Map();
  
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0][0];
    
    for (const [voiceId, voice] of this.voices) {
      if (voice.active) {
        voice.computeSamples(output, this.currentFrame);
      }
    }
    
    return true; // Keep processor alive
  }
}

// Communication with main thread via MessagePort
// Voice events: noteOn(freq, velocity, voiceId), 
//               noteUpdate(voiceId, pitchBend, keyY, keyZ),
//               noteOff(voiceId)
// Parameter changes: effectParam(effectId, param, value)
```

### 20.3 WebAssembly for Physical Modeling

For optimal performance of Karplus-Strong DSP, compile a C implementation to WASM:

```c
// karplus_strong.c — compiled to WASM via Emscripten
typedef struct {
    float* delay_line;
    int delay_length;
    int write_ptr;
    float brightness;  // loop filter coefficient
    float decay;
    float current_pitch_hz;
    // ... other params
} KSVoice;

float ks_tick(KSVoice* v) {
    int read_ptr = (v->write_ptr - v->delay_length + DELAY_MAX) % DELAY_MAX;
    float sample = v->delay_line[read_ptr];
    // Apply loop filter (low-pass averaging)
    float filtered = v->brightness * (sample + v->delay_line[(read_ptr + 1) % DELAY_MAX]) * 0.5f;
    filtered *= v->decay;
    v->delay_line[v->write_ptr] = filtered;
    v->write_ptr = (v->write_ptr + 1) % DELAY_MAX;
    return sample;
}
```

### 20.4 React Component Hierarchy

```
<App>
  <AudioContextProvider>          // Web Audio context, master gain
    <MidiEngineProvider>          // WebMIDI setup
      <PresetProvider>            // Current preset state
        <Header />                // Menu, preset nav
        <ControlSurface />        // XY pad, Whammy, slots
        <KeyboardCanvas           // Canvas-based keyboard
          onPointerDown={...}
          onPointerMove={...}
          onPointerUp={...}
        />
        <PresetEditor />          // Modal overlay
        <SettingsPanel />         // Slide-out settings
        <SetlistBrowser />        // Modal overlay
      </PresetProvider>
    </MidiEngineProvider>
  </AudioContextProvider>
</App>
```

### 20.5 Data Flow

```
User touches screen
      │
      ▼
PointerEvents Handler (React canvas ref)
      │ normalizes to {pointerId, x, y, pressure, type}
      ▼
KeyboardLayout.resolveTouch(x, y)
      │ returns {row, column, noteNumber, keyXNormalized, keyYNormalized}
      ▼
PitchRoundingEngine.processTouch(...)
      │ returns {pitchHz, pitchBendCents, velocity}
      ▼
VoiceManager.noteEvent(...)
      │ sends to both:
      ├── AudioWorklet (via MessagePort) → Physical Model → Effects → Output
      └── MidiEngine → MPE MIDI Out (if enabled)
```

---

## 21. Performance & Latency Requirements

### 21.1 Audio Latency Budget

| Component | Budget |
|---|---|
| PointerEvent delivery | ~2ms (browser, hardware dependent) |
| JS main thread processing | ≤3ms |
| AudioWorklet message delivery | ~1ms |
| AudioContext buffer latency | 3–10ms (128–256 samples @ 44.1kHz) |
| **Total round-trip** | **≤20ms target, ≤30ms acceptable** |

Note: iOS Safari achieves ~5–10ms consistently. Chrome Android is typically 10–20ms. Windows Chrome is 10–30ms. These are acceptable for music performance.

### 21.2 Rendering Performance

- Keyboard canvas must render at 60fps with 10 active touch points
- Use `requestAnimationFrame` for all canvas updates
- `OffscreenCanvas` + `transferControlToOffscreen` for rendering in worker if needed
- Batch canvas draw calls; avoid per-sample canvas updates

### 21.3 Memory

- Pre-allocate all DSP buffers at startup; avoid GC during performance
- Use `Float32Array` for all audio buffers
- Use `SharedArrayBuffer` + `Atomics` for lock-free communication between main thread and AudioWorklet if needed for lowest latency

---

## 22. Feature Implementation Priorities

### Phase 1 — Core Playable Instrument (MVP)

1. Isomorphic keyboard grid (4 rows, all fourths, chromatic)
2. Karplus-Strong physical model (guitar pluck), single voice
3. Basic pitch rounding (Snap + Round)
4. Multi-touch poly mode (up to 6 voices)
5. Whammy control (pitch bend)
6. Basic effects: Distortion, Reverb, Echo
7. 5–10 factory presets
8. Mobile Chrome compatible touch input

### Phase 2 — Full Expressiveness

1. Full polyphony (String mode, Mono mode)
2. HOPO gestures
3. KeyY velocity + pressure expression
4. Complete 21-effect chain
5. XY Expression Pad
6. Custom control surface slots
7. 50+ factory presets
8. Diatonic mode + scale system
9. Arpeggiator

### Phase 3 — Preset System & MIDI

1. Full preset editor (instrument params + effects chain drag-and-drop)
2. Setlist system
3. Preset import/export/share
4. WebMIDI output (MPE Mode 3 + 4)
5. WebMIDI input (external controller support)
6. World scales and temperaments (Indian ragas)
7. Global/per-preset tuning

### Phase 4 — Advanced Features

1. Backing track system
2. Audio recording export
3. MIDI recording
4. Polkadot key style + pattern designer
5. Quarter-tone support
6. iCloud / cloud sync equivalent (Firebase)
7. Svara note names
8. All 200+ factory presets
9. Full help system / tooltips

---

## 23. Open Questions & Web-Specific Challenges

### 23.1 Audio Latency on Android

Android Chrome audio latency varies widely by device. Mitigation:
- Allow user to select buffer size (128/256/512/1024 samples) in settings
- Default to 256 on Android, 128 on desktop
- Show latency estimate in settings

### 23.2 WebAssembly for Physical Modeling

The Karplus-Strong DSP core should be implemented in C and compiled to WASM for performance comparable to native iOS. JavaScript alone may not be fast enough for 10 simultaneous high-quality voices with a full effects chain.

Tool: Emscripten (`emcc`) to compile C → WASM module, loaded by AudioWorklet.

### 23.3 WebMIDI Support

WebMIDI is only available in Chrome/Edge. Firefox does not support it without a plugin. For Firefox, consider:
- Graceful degradation: Full instrument without MIDI output
- Warning message for non-Chrome browsers

### 23.4 Safari / iOS

The target is Android + Windows but the keyboard should work in Safari iOS too (it can play audio, though WebMIDI requires a polyfill). Safari's AudioContext has stricter autoplay policies — always require a user gesture before creating AudioContext.

### 23.5 Pressure / Force Touch

Most Android devices do NOT support hardware pressure (stylus excepted). Therefore:
- Default: Use KeyY-sliding for expression (as GeoShred does on iPad)
- Where `event.pressure > 0 && event.pressure < 1`: use as KeyZ
- Otherwise: KeyZ = 0

### 23.6 Patent & IP Considerations

GeoShred's physical modeling is based on patents held by Stanford/CCRMA. The Karplus-Strong algorithm itself is public domain. However, the specific "Almost Magic" pitch rounding implementation and certain aspects of the interface may be proprietary. The web clone should implement these features from first principles based on publicly documented behavior, not by reverse-engineering or copying code.

---

## Appendix A — Effects Quick Reference

| Effect | Web Audio Nodes Used |
|---|---|
| Distortion | WaveShaperNode |
| Wah | BiquadFilterNode (bandpass, dynamic freq) |
| EQ | Multiple BiquadFilterNodes |
| VCF | Custom IIR or BiquadFilterNode cascade |
| Flanger | DelayNode + LFO OscillatorNode |
| Phaser | Multiple AllPassFilterNode (BiquadFilter) |
| Chorus | Dual DelayNode + LFO |
| Tremolo | GainNode + LFO OscillatorNode |
| Amp/Cab | WaveShaperNode + ConvolverNode (IR) |
| Sympathetic Resonator | AudioWorklet (KS voices) |
| Reverb | ConvolverNode (IR) |
| Echo | DelayNode + GainNode (feedback) |
| Looper | MediaRecorder + AudioBufferSourceNode |

---

## Appendix B — MIDI CC Reference

| CC | Parameter |
|---|---|
| 1 | Mod Wheel |
| 2 | Breath Controller (wind controller input) |
| 4 | Foot Controller |
| 7 | Volume |
| 11 | Expression |
| 64 | Sustain Pedal |
| 74 | KeyY / Brightness (MPE) |
| 120 | All Sound Off |
| 123 | All Notes Off |

---

## Appendix C — Scale Degree Count Reference

| Scale | Notes |
|---|---|
| Chromatic | 12 |
| Major / Ionian | 7 |
| Minor (Natural) | 7 |
| Harmonic Minor | 7 |
| Pentatonic Major | 5 |
| Pentatonic Minor | 5 |
| Blues | 6 |
| Whole Tone | 6 |
| Diminished (octatonic) | 8 |
| Indian Ragas | 5–7 (varies per raga) |
| Arabic Maqamat | 7 (with microtonal inflections) |

---

## Appendix D — Keyboard Layout Presets

| Layout Name | Row Interval (semitones) | Equivalent To |
|---|---|---|
| All Fourths | 5, 5, 5, 5 | Bass guitar, LinnStrument default, Ableton Push |
| Guitar Standard | 5, 5, 5, 4, 5 | E-A-D-G-B-E (6 rows) |
| Guitar 4-String | 5, 5, 4 | G-B-E strings (3 rows = upper guitar) |
| All Fifths | 7, 7, 7, 7 | Cello/Violin layout |
| Thirds | 4, 4, 4, 4 | Augmented system layout |
| Major Thirds | 4, 4, 4, 4 | Same as Thirds |
| Minor Thirds | 3, 3, 3, 3 | Diminished layout |
| Whole Tones | 2, 2, 2, 2 | Whole tone rows |

---

*End of PRD — GeoShred Web Clone v1.0*

*This document should be treated as the single source of truth for all engineering, design, and QA work. Every feature described here has been researched from GeoShred's official documentation, FAQs, App Store listings, technical interviews, and music tech reviews.*
