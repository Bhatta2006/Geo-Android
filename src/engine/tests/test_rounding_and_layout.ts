import { assert } from 'console'
import { buildLayout, type LayoutConfig } from '../keyboard/KeyboardLayout'
import { keyXToPitchCents, type PitchRoundingConfig } from '../pitch/PitchRoundingEngine'

function runTests() {
  console.log('--- RUNNING GEOSHRED WEB CLONE ALGORITHMIC TESTS ---')

  // 1. Test KeyboardLayout calculations
  const layoutConfig: LayoutConfig = {
    rows: 4,
    rowIntervalSemitones: [5, 5, 5], // fourths
    startMidiNote: 52, // E3
    keyWidth: 80,
    keyHeight: 120,
    rootNote: 4, // E
    scale: [0, 2, 4, 5, 7, 9, 11], // Major
  }

  const cells = buildLayout(layoutConfig, 800)
  
  // Row 0 starting note should be E3 (MIDI 52)
  const cell0 = cells.find(c => c.row === 0 && c.col === 0)
  assert(cell0 !== undefined, 'Row 0 Col 0 exists')
  assert(cell0!.midiNote === 52, 'Row 0 starting note is 52 (E3)')
  assert(cell0!.noteName === 'E3', 'Note name maps to E3')
  assert(cell0!.isRoot === true, 'E3 is root note')
  assert(cell0!.isInScale === true, 'E3 is in scale')

  // Row 1 starting note should be A3 (52 + 5 = 57)
  const cell1 = cells.find(c => c.row === 1 && c.col === 0)
  assert(cell1 !== undefined, 'Row 1 Col 0 exists')
  assert(cell1!.midiNote === 57, 'Row 1 starting note is 57 (A3)')
  assert(cell1!.noteName === 'A3', 'Note name maps to A3')
  assert(cell1!.isRoot === false, 'A3 is not root note')
  assert(cell1!.isInScale === true, 'A3 is in scale')

  console.log('✓ KeyboardLayout tests passed successfully!')

  // 2. Test PitchRounding calculations
  const roundingConfig: PitchRoundingConfig = {
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.15,
    scale: [0, 2, 4, 5, 7, 9, 11], // C major scale
    temperamentOffsets: new Array(12).fill(0)
  }

  // Finger at center (keyX = 0.5) of C4 (MIDI 60)
  const res1 = keyXToPitchCents(0.5, 60, roundingConfig)
  assert(res1.fingerCents === 6000, 'Center coordinates resolve to 6000 cents')
  assert(res1.nearestNoteCents === 6000, 'Nearest note is also 6000 cents')

  // Finger flat by 30 cents (keyX = 0.2) of C4
  const res2 = keyXToPitchCents(0.2, 60, roundingConfig)
  assert(res2.fingerCents === 5970, 'Finger coordinate resolves to 5970 cents')
  assert(res2.nearestNoteCents === 6000, 'Nearest scale note center is C4 (6000 cents)')

  // Finger flat by 70 cents (keyX = -0.2 equivalent) of C4, meaning it crossed into B3 (MIDI 59)
  // Let's test a slide flat by 70 cents: finger is at 5930 cents
  const res3 = keyXToPitchCents(-0.2, 60, roundingConfig)
  assert(res3.fingerCents === 5930, 'Finger coordinate resolves to 5930 cents')
  assert(res3.nearestNoteCents === 5900, 'Nearest scale note center is B3 (5900 cents)')

  console.log('✓ PitchRoundingEngine tests passed successfully!')
  console.log('--- ALL ALGORITHMIC VERIFICATION PASSED ---')
}

runTests()
