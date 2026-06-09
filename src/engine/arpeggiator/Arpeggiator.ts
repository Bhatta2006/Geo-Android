export class Arpeggiator {
  private ctx: AudioContext
  private bpm: number
  private pattern: 'up' | 'down' | 'random'
  private onNote: (midiNote: number) => void
  private onNoteOff: (midiNote: number) => void

  private nextNoteTime = 0
  private scheduleAheadTime = 0.1   // 100ms lookahead
  private timerInterval = 25        // check every 25ms
  private timer: number | null = null
  private heldNotes: number[] = []
  private noteIndex = 0

  constructor(
    ctx: AudioContext,
    bpm: number,
    pattern: 'up' | 'down' | 'random' = 'up',
    onNote: (midiNote: number) => void,
    onNoteOff: (midiNote: number) => void
  ) {
    this.ctx = ctx
    this.bpm = bpm
    this.pattern = pattern
    this.onNote = onNote
    this.onNoteOff = onNoteOff
  }

  start() {
    if (this.timer) return
    this.nextNoteTime = this.ctx.currentTime
    this.timer = window.setInterval(() => this.scheduler(), this.timerInterval)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  setHeldNotes(notes: number[]) {
    this.heldNotes = [...notes].sort((a, b) => a - b)
  }

  setBpm(bpm: number) {
    this.bpm = bpm
  }

  setPattern(pattern: 'up' | 'down' | 'random') {
    this.pattern = pattern
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

    // Determine gate length (duration of step, e.g., 80% gate time)
    const stepDuration = 60 / this.bpm
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000)

    // Fire note triggers
    setTimeout(() => {
      this.onNote(note)
      setTimeout(() => this.onNoteOff(note), stepDuration * 0.8 * 1000)
    }, delayMs)
  }

  private getNextNote(): number {
    if (this.heldNotes.length === 0) return 60
    if (this.pattern === 'random') {
      return this.heldNotes[Math.floor(Math.random() * this.heldNotes.length)]
    }
    return this.heldNotes[this.noteIndex % this.heldNotes.length]
  }

  private advanceNote() {
    const stepDuration = 60 / this.bpm
    this.nextNoteTime += stepDuration
    
    if (this.heldNotes.length === 0) return

    if (this.pattern === 'up') {
      this.noteIndex++
    } else if (this.pattern === 'down') {
      this.noteIndex = (this.noteIndex - 1 + this.heldNotes.length) % this.heldNotes.length
    }
  }
}
