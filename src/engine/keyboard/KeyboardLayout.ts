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

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SVARA_NAMES = ['Sa', 'Re♭', 'Re', 'Ga♭', 'Ga', 'Ma', 'Ma#', 'Pa', 'Dha♭', 'Dha', 'Ni♭', 'Ni']

export function buildLayout(config: LayoutConfig, canvasWidth: number): KeyCell[] {
  const cells: KeyCell[] = []
  // Auto-fill width with columns, add extra 2 columns to ensure grid covers past the right edge
  const cols = Math.ceil(canvasWidth / config.keyWidth) + 2

  for (let row = 0; row < config.rows; row++) {
    // Calculate starting note of this row based on cumulative row intervals
    let rowStartNote = config.startMidiNote
    for (let r = 0; r < row; r++) {
      rowStartNote += config.rowIntervalSemitones[r] ?? config.rowIntervalSemitones[0] ?? 5
    }

    for (let col = 0; col < cols; col++) {
      const midiNote = rowStartNote + col
      if (midiNote < 0 || midiNote > 127) continue

      const noteClass = midiNote % 12
      const octave = Math.floor(midiNote / 12) - 1

      cells.push({
        row,
        col,
        midiNote,
        noteName: NOTE_NAMES[noteClass] + octave,
        svaraName: SVARA_NAMES[noteClass],
        isRoot: noteClass === config.rootNote,
        isInScale: config.scale.includes(noteClass),
        x: col * config.keyWidth,
        y: (config.rows - 1 - row) * config.keyHeight, // row 0 at bottom, row N-1 at top
        width: config.keyWidth,
        height: config.keyHeight,
      })
    }
  }
  return cells
}
