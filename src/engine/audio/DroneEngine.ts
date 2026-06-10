import type { AudioEngine } from './useAudioEngine'

/**
 * Tanpura drone engine — Section 5.5 of GeoShred_Phase2.md
 *
 * 4 strings tuned to: root (Sa), fifth (Pa), root octave down, root octave up
 * Plucked automatically in a slow arpeggiated pattern every ~1.5 seconds.
 * Uses reserved negative voice IDs to avoid colliding with keyboard voices.
 */
export class DroneEngine {
  private audioEngine: AudioEngine
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private rootMidi  = 48

  // Drone voice IDs: four strings, well outside keyboard range
  private readonly voiceIds = [-10, -11, -12, -13] as const

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine
  }

  /**
   * Start the drone.
   * Tuning order (as in plan §5.5): [Sa-low, Pa, Sa, Sa-high]
   *   String 1 (idx=0): rootMidi - 12  (Sa, octave down)
   *   String 2 (idx=1): rootMidi -  5  (Pa, fifth below root = IV of root = Pa in Sa context)
   *   String 3 (idx=2): rootMidi        (Sa, unison)
   *   String 4 (idx=3): rootMidi + 12  (Sa, octave up)
   */
  start(rootMidi: number) {
    this.rootMidi = rootMidi

    if (this.isRunning) {
      // Already running — just retune by stopping and restarting
      this.stop()
    }

    this.isRunning = true
    let idx = 0

    const tunings = [
      this.rootMidi - 12,   // Sa low
      this.rootMidi - 5,    // Pa (plan uses rootMidi - 5 = perfect 4th below = Pa)
      this.rootMidi,        // Sa
      this.rootMidi + 12,   // Sa high
    ]

    const pluckNext = () => {
      if (!this.isRunning) return
      const i       = idx % 4
      const midiNote = tunings[i]
      const voiceId  = this.voiceIds[i]

      // Very long decay, mid brightness — warm tanpura tone
      this.audioEngine.noteOn(voiceId, midiNote, 0.5, 0.3, 0.0, {
        decay:      0.9995,
        brightness: 0.25,
      })

      // Auto-release after 1.2 s so the next pluck of the same string replaces it cleanly
      setTimeout(() => {
        if (this.isRunning) this.audioEngine.noteOff(voiceId)
      }, 1200)

      idx++
    }

    // First pluck immediately, then every 1.5 s
    pluckNext()
    this.intervalId = setInterval(pluckNext, 1500)
  }

  /** Update root pitch — triggers a retune by restarting. */
  setRootMidi(rootMidi: number) {
    if (this.isRunning) {
      this.start(rootMidi)   // stop + restart with new tuning
    } else {
      this.rootMidi = rootMidi
    }
  }

  stop() {
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    // Release all drone voices
    for (const voiceId of this.voiceIds) {
      this.audioEngine.noteOff(voiceId)
    }
  }

  get active() {
    return this.isRunning
  }
}
