# 🔇 GeoShred Audio Fix — Root Cause Analysis & Full Implementation Guide

**Status:** No sound generated on press/slide. Only some blocks produce harsh sound.
**Symptom:** Console shows AudioContext created, worklet loaded, audio graph connected — but silence.

---

## 🔍 Root Cause Summary (5 Bugs Found)

| # | Bug | Location | Effect |
|---|-----|----------|--------|
| 1 | `noteOn` is async → `await` breaks the user-gesture window before `resume()` | `useAudioEngine.ts` | AudioContext stays **suspended** → **total silence** |
| 2 | `useMemo` gets a new `audioEngine` object every render → VoiceManager recreated constantly | `App.tsx` | VoiceManager always starts fresh, wrong worklet ref → silence |
| 3 | `pitchBendCents` math is relative to MIDI note × 100, but KS processor divides original `delayLength / bendRatio` wrong | `karplus-strong-processor.js` | Extreme delay ratios → **silence or harsh clipping** |
| 4 | `SlideEngine.columnToMidiNote` returns a raw MIDI number, then `fingerCents = colMidi * 100` — `colMidi` is already in MIDI space, so `* 100` is fine, but `baseMidiNote * 100` at the end double-counts octave offsets | `SlideEngine.ts` | Pitch bend of 1000s of cents sent to worklet → silence |
| 5 | `ensureCtx()` is called with `await` inside `noteOn()` which itself is `async` — the entire async chain means AudioContext `resume()` never fires in the user gesture | `useAudioEngine.ts` + `useKeyboardGesture.ts` | Gesture window closed before resume → **permanent suspension** |

---

## 🐛 Bug 1 — The Critical One: Async noteOn Breaks AudioContext Resume

### Why This Happens

Browsers enforce a strict **"user gesture window"**: when you call `pointerdown`, there is a tiny synchronous execution window during which `AudioContext.resume()` is allowed to work. The moment any `await` fires (even `await Promise.resolve()`), that window closes.

Current code:
```typescript
// useAudioEngine.ts
const noteOn = async (voiceId, midiNote, ...) => {
  await ensureCtx()       // ← THIS await closes the gesture window
  // ...
  worklet.port.postMessage(...)
}
```

And `useKeyboardGesture.ts` calls:
```typescript
voiceManager.handleTouchDown(...)   // which calls audioEngine.noteOn() (async, fire-and-forget)
```

Because `handleTouchDown` doesn't `await` the async `noteOn`, the gesture is consumed but the resume never fires inside the gesture window.

### Fix

Split into two phases:
1. **Eagerly initialize AudioContext** on first user interaction **synchronously** (just `new AudioContext()` + `resume()`)
2. **Load worklet asynchronously** in the background (after the gesture window, this is fine — the context is already running)
3. **Queue noteOn** until the worklet is ready

---

## 🐛 Bug 2 — `useAudioEngine` Returns a New Object Every Render

Every render, `useAudioEngine()` returns a new plain object `{ noteOn, noteUpdate, ... }`. This causes `useMemo(() => new VoiceManager(audioEngine), [audioEngine])` to fire every render, creating a fresh VoiceManager (and DroneEngine) that has never been initialized with a worklet.

---

## 🐛 Bug 3 — KS Processor Pitch Bend Math is Wrong

When `noteOn` fires, the worklet stores `delayLength = sampleRate / frequency`. On pitch bends, `rawDelay = v.delayLength / bendRatio`. If `pitchBendCents` is hundreds or thousands of cents (from the SlideEngine bug), `bendRatio` becomes extreme:
- At +4800 cents: `bendRatio = 16`, `rawDelay = 6.25` → below minimum → **silence**
- Abrupt delay changes → clicking / harsh artifacts

---

## 🐛 Bug 4 — SlideEngine Sends Wrong Pitch Bend When startMidiNote Defaults to 40

`columnToMidiNote` uses `this.config.startMidiNote` (default 40). If the actual key pressed is MIDI 60, `baseMidiNote = 60`. After sliding to column 0 row 0: `fingerCents = 40 * 100 = 4000`, `return 4000 - 60*100 = -2000` cents — a wild pitch bend → silence.

---

## ✅ Implementation Plan

### Step A — Refactor useAudioEngine.ts (MOST CRITICAL)

Make the engine a **stable class** with synchronous `unlockAudio()`:

```typescript
class AudioEngineImpl implements AudioEngine {
  private ctx: AudioContext | null = null
  private worklet: AudioWorkletNode | null = null
  private workletReady = false
  private pendingNotes: Array<() => void> = []
  private masterGain: GainNode | null = null

  // Call this SYNCHRONOUSLY from pointerdown
  unlockAudio(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })
      this._loadWorklet()  // async, but ctx is already unlocked
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()  // NO await — synchronous within gesture window
    }
  }

  private async _loadWorklet(): Promise<void> {
    try {
      await this.ctx!.audioWorklet.addModule('/karplus-strong-processor.js')
      this.worklet = new AudioWorkletNode(this.ctx!, 'karplus-strong', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
      })
      this.masterGain = this.ctx!.createGain()
      this.masterGain.gain.value = 0.8
      this.worklet.connect(this.masterGain)
      this.masterGain.connect(this.ctx!.destination)
      this.workletReady = true
      this.pendingNotes.forEach(fn => fn())
      this.pendingNotes = []
    } catch (err) {
      console.error('[AudioEngine] Worklet load failed:', err)
    }
  }

  noteOn(voiceId: number, midiNote: number, _keyX: number, keyY: number, _keyZ: number): void {
    // NOT async — queue if worklet not ready yet
    const doNoteOn = () => {
      const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
      this.worklet!.port.postMessage({
        type: 'noteOn', voiceId, frequency,
        velocity: 0.6 + keyY * 0.4,
        brightness: 0.5, decay: 0.992,
      })
    }
    if (this.workletReady) doNoteOn()
    else this.pendingNotes.push(doNoteOn)
  }
}

// In the hook — return STABLE reference:
export function useAudioEngine(): AudioEngineImpl {
  const ref = useRef<AudioEngineImpl | null>(null)
  if (!ref.current) ref.current = new AudioEngineImpl()
  return ref.current  // always the same object
}
```

### Step B — Wire unlockAudio() from Canvas pointerdown

```tsx
// KeyboardCanvas.tsx — add to canvas element:
<canvas
  ref={canvasRef}
  onPointerDown={() => props.onFirstTouch?.()}   // synchronous unlock
  style={{ touchAction: 'none', ... }}
/>
```

```tsx
// App.tsx:
<KeyboardCanvas
  ...
  onFirstTouch={() => audioEngine.unlockAudio()}
/>
```

Also add a `visibilitychange` listener in App.tsx:
```tsx
useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') audioEngine.unlockAudio()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}, [audioEngine])
```

### Step C — Fix KS Processor: Clamp + Smooth Pitch Bend

```javascript
// In _noteUpdate:
if (pitchBendCents !== undefined) {
  v.targetPitchBendCents = Math.max(-2400, Math.min(2400, pitchBendCents))
}

// In process() per-voice, replace hard bendRatio with smoothed version:
// Initialize v.smoothPitchBend = 0 in _noteOn
v.smoothPitchBend = v.smoothPitchBend !== undefined
  ? v.smoothPitchBend + (v.targetPitchBendCents - v.smoothPitchBend) * 0.04
  : (v.targetPitchBendCents || 0)

const bendRatio = Math.pow(2, v.smoothPitchBend / 1200)
const rawDelay  = v.delayLength / bendRatio
const D = Math.max(2, Math.min(v.MAXBUF - 2, rawDelay))
```

### Step D — Improve Excitation for Warm Sound

```javascript
// In _noteOn, replace excitation with bandlimited noise:
const buf = new Float32Array(MAXBUF)
let prev = 0
for (let i = 0; i < Nint; i++) {
  const env = Math.sin(Math.PI * i / Nint)
  const noise = (Math.random() * 2 - 1)
  // Two-point averager for bandlimiting (removes high-freq harshness)
  const smoothNoise = (noise + prev) * 0.5
  prev = noise
  buf[i] = smoothNoise * velocity * env * 0.8
}
```

### Step E — Fix Output Volume (amp scaling)

Current code: `const amp = x * 0.5` — but `x` can be very small after first few frames.

```javascript
// Replace with voice-tracked amplitude envelope:
// In noteOn, add: v.ampEnv = 1.0
// In process():
v.ampEnv = (v.ampEnv || 1.0) * (v.releasing ? v.releaseDecay : 0.9995)
const amp = x * v.ampEnv * 0.6
outL[i] += amp
if (outR) outR[i] += amp * 0.97  // slight L/R difference for width
```
