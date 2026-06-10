export interface KeyCell {
  row: number
  col: number
  midiNote: number           // 0–127
  noteName: string           // "C", "D#", etc.
  svaraName: string          // "Sa", "Re", etc.
  isRoot: boolean
  isInScale: boolean
  // Bounding box (used for hit-test fallback and gesture math)
  x: number
  y: number
  width: number
  height: number
  // Hexagon geometry
  centerX: number
  centerY: number
  hexRadius: number          // circumradius of the pointy-top hexagon
}

export interface LayoutConfig {
  rows: number               // 4 default
  rowIntervalSemitones: number[] // [5,5,5] for All-Fourths; [5,5,4,5] for guitar
  startMidiNote: number      // 52 = E3 default
  keyWidth: number           // pixels (used as reference for hex sizing)
  keyHeight: number          // pixels (used as reference)
  rootNote: number           // 0-11
  scale: number[]            // scale degrees e.g. [0,2,4,5,7,9,11] = major
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SVARA_NAMES = ['Sa', 'Re♭', 'Re', 'Ga♭', 'Ga', 'Ma', 'Ma#', 'Pa', 'Dha♭', 'Dha', 'Ni♭', 'Ni']

/**
 * Build a honeycomb hex grid layout.
 * Pointy-top hexagons with odd rows staggered right by half a hex width.
 */
export function buildLayout(config: LayoutConfig, canvasWidth: number, canvasHeight?: number): KeyCell[] {
  const cells: KeyCell[] = []

  // Compute hex size from canvas dimensions
  const totalH = canvasHeight ?? (config.rows * config.keyHeight)

  // For pointy-top hex tiling:
  //   col spacing = sqrt(3) * radius  (horizontal center-to-center)
  //   row spacing = 1.5 * radius      (vertical center-to-center)
  // Odd rows offset right by sqrt(3)/2 * radius

  // Recalculate hex radius based on rows fitting canvas height
  // row spacing = 1.5 * R, total height = (rows-1) * 1.5R + 2R = 1.5R*(rows-1) + 2R
  // Solve: totalH = 1.5 * R * (rows - 1) + 2 * R = R * (1.5 * rows - 1.5 + 2) = R * (1.5 * rows + 0.5)
  const adjustedRadius = totalH / (1.5 * config.rows + 0.5)
  const adjColSpacing = Math.sqrt(3) * adjustedRadius
  const adjRowSpacing = 1.5 * adjustedRadius
  const adjCols = Math.ceil(canvasWidth / adjColSpacing) + 2

  for (let row = 0; row < config.rows; row++) {
    // Starting MIDI note of this row
    let rowStartNote = config.startMidiNote
    for (let r = 0; r < row; r++) {
      rowStartNote += config.rowIntervalSemitones[r] ?? config.rowIntervalSemitones[0] ?? 5
    }

    // Visual row index: row 0 at bottom, row N-1 at top
    const visualRow = config.rows - 1 - row

    for (let col = 0; col < adjCols; col++) {
      const midiNote = rowStartNote + col
      if (midiNote < 0 || midiNote > 127) continue

      const noteClass = midiNote % 12

      // Hex center position
      // Odd visual rows stagger right by half a column
      const stagger = (visualRow % 2 === 1) ? adjColSpacing * 0.5 : 0
      const centerX = col * adjColSpacing + adjColSpacing * 0.5 + stagger
      const centerY = visualRow * adjRowSpacing + adjustedRadius

      cells.push({
        row,
        col,
        midiNote,
        noteName: NOTE_NAMES[noteClass],
        svaraName: SVARA_NAMES[noteClass],
        isRoot: noteClass === config.rootNote,
        isInScale: config.scale.includes(noteClass),
        // Bounding box for gesture math
        x: centerX - adjustedRadius,
        y: centerY - adjustedRadius,
        width: adjustedRadius * 2,
        height: adjustedRadius * 2,
        // Hex geometry
        centerX,
        centerY,
        hexRadius: adjustedRadius,
      })
    }
  }
  return cells
}

/**
 * Check if a point is inside a pointy-top hexagon.
 * Uses the hex center and circumradius.
 */
export function pointInHex(px: number, py: number, cx: number, cy: number, radius: number): boolean {
  // Transform to hex-local coordinates
  const dx = Math.abs(px - cx)
  const dy = Math.abs(py - cy)

  // Quick bounding-box reject
  if (dx > Math.sqrt(3) * radius * 0.5 || dy > radius) return false

  // Hex edge test: for pointy-top, the slanted edge satisfies:
  // sqrt(3) * dy + dx <= sqrt(3) * radius
  return (Math.sqrt(3) * dy + dx) <= Math.sqrt(3) * radius
}
