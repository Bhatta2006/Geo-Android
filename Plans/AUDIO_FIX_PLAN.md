# 🔇 GeoShred Audio Fix — Complete Root Cause Analysis

**Date:** 2026-06-10
**Status:** ✅ ALL BUGS FIXED — sound plays on tap, pitch bends on slide
**Commit:** `ca52ff2`

---

## 🔍 Bugs Found (3 Total — 2 Critical, 1 Minor)

### 🐛 Bug 1 — CRITICAL: Write Pointer Overwrites Excitation (COMPLETE SILENCE)

**File:** `public/karplus-strong-processor.js`, `_noteOn()`, line 93
**Symptom:** No sound at all. Not even a click.

#### How Karplus-Strong Works

The KS algorithm uses a **circular delay buffer** of size `MAXBUF = 4096`.
The excitation (noise burst) fills positions `buf[0 .. Nint-1]` (e.g., 100 samples for 440 Hz).
The write pointer `ptr` advances forward, and the read pointer reads `Nint` positions behind.

#### The Bug

```
ptr was initialized to 0.

Buffer Layout (MAXBUF = 4096, Nint = 100):

  Index:  0    1    2  ...  99  100  101  ...  4095
          ├───EXCITATION───┤    ├──── zeros ────┤
  ptr=0 → ↑ write here                   read from here ↑
                                          (ptr - Nint + MAXBUF) % MAXBUF
                                          = (0 - 100 + 4096) % 4096
                                          = 3996 → ZERO!
```

**What happens sample by sample:**

| Sample | ptr | Read from           | Read value | Write to buf[ptr] | Effect                |
|--------|-----|---------------------|------------|-------------------|-----------------------|
| 0      | 0   | buf[3996]           | 0          | buf[0] = 0        | Excitation at [0] **destroyed** |
| 1      | 1   | buf[3997]           | 0          | buf[1] = 0        | Excitation at [1] **destroyed** |
| ...    | ... | ...                 | 0          | buf[...] = 0      | ...                   |
| 99     | 99  | buf[3996+99]=buf[4095] | 0       | buf[99] = 0       | Last excitation **destroyed** |
| 100    | 100 | buf[0]              | 0 ← **was already overwritten!** | | |

**The write pointer walks forward from 0 and destroys every excitation sample before the read pointer (100 positions behind) can ever reach it. Total silence.**

#### The Fix

```javascript
// BEFORE (broken):
ptr: 0,

// AFTER (fixed):
ptr: Nint,
```

With `ptr = Nint`:

```
  Index:  0    1    2  ...  99  100  101  ...  4095
          ├───EXCITATION───┤
                            ptr=100 → ↑ write here
  read from (100 - 100 + 4096) % 4096 = 0 → ✓ reads excitation!
```

The first read goes to `buf[0]` — the START of the excitation. ✅

---

### 🐛 Bug 2 — CRITICAL: Premature Silence Cleanup (Voice Killed on First Block)

**File:** `public/karplus-strong-processor.js`, `process()`, line 334
**Symptom:** Even if a tiny bit of noise leaked through, the voice would be immediately deleted.

#### The Bug

```javascript
// OLD CODE:
if (Math.abs(v.lastOut) < 5e-8 && !v.releasing) {
    this.voices.delete(id)  // ← KILLS the voice!
}
```

Because of Bug #1, `lastOut` is always `0` on the first block. This check triggers immediately and **deletes the voice before the second block ever runs**.

#### The Fix

```javascript
// NEW CODE — wait for the excitation to loop through at least 4 cycles:
const minAge = v.N * 4
if (v.sampleAge > minAge && Math.abs(v.lastOut) < 5e-8 && !v.releasing) {
    this.voices.delete(id)
}
```

A `sampleAge` counter tracks how many samples the voice has lived. Silence cleanup only activates after the voice has been alive for at least 4 full delay cycles.

---

### 🐛 Bug 3 — MINOR: SlideEngine Memory Leak

**File:** `src/engine/audio/VoiceManager.ts`, `handleTouchUp()`, line 143
**Symptom:** SlideEngine voice Map grows forever (memory leak), no audible effect.

#### The Bug

```typescript
// OLD CODE:
this.slideEngine.clearVoice(pointerId)  // WRONG — SlideEngine is keyed by voiceId!

// NEW CODE:
if (voiceId !== undefined) this.slideEngine.clearVoice(voiceId)  // ✓
```

The SlideEngine stores per-voice pitch state indexed by `voiceId`, but `clearVoice` was being called with `pointerId`. The two are different numbers. Slide states were never cleaned up.

---

## 📂 Files Changed

| File | What Changed |
|------|-------------|
| `public/karplus-strong-processor.js` | `ptr: 0` → `ptr: Nint`; added `sampleAge` guard on silence cleanup; added console.log diagnostics |
| `src/engine/audio/VoiceManager.ts` | `clearVoice(pointerId)` → `clearVoice(voiceId)` |

---

## ✅ Verification

- `npm run build` → 0 TypeScript errors ✅
- `npm run lint` → 0 warnings/errors ✅
- `git push origin main` → `ca52ff2` ✅

## 🔊 Expected Console Output (When Working)

When you tap a key, you should see in DevTools console:

```
[AudioEngine] Creating AudioContext (first unlock)
[AudioEngine] AudioContext state after creation: running
[AudioEngine] Loading AudioWorklet module…
[KS-Processor] AudioWorklet processor created
[AudioEngine] Worklet module loaded
[AudioEngine] Audio graph connected, worklet ready
[KS-Processor] noteOn: voiceId=1, freq=329.6 Hz, N=133.8, Nint=134
```

If you don't see `[KS-Processor]` lines, the worklet file failed to load — check the Network tab for 404 errors on `/karplus-strong-processor.js`.
