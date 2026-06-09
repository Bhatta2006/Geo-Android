export interface PitchRoundingConfig {
  snapEnabled: boolean         // Snap to perfect note center on attack
  roundEnabled: boolean        // Converge to nearest note center while sliding
  slideSpeed: number           // Rate of convergence: 0 = instant, 1 = fretless (no correction)
  scale: number[]              // Scale degrees [0, 2, 4, 5, 7, 9, 11]
  temperamentOffsets: number[] // Deviations in cents from Equal Temperament
}

export interface PitchState {
  baseMidiNote: number
  currentPitchCents: number
  targetPitchCents: number
  fingerCents: number
  isVibrating: boolean
  lastDx: number
}

// Convert normalized keyX position to cents offset
export function keyXToPitchCents(
  keyX: number,
  baseMidiNote: number,
  config: PitchRoundingConfig
): { fingerCents: number; nearestNoteCents: number } {
  const baseCents = baseMidiNote * 100
  const fingerOffsetCents = (keyX - 0.5) * 100

  const noteClass = baseMidiNote % 12
  const tempOffset = config.temperamentOffsets[noteClass] ?? 0

  const fingerCents = baseCents + fingerOffsetCents + tempOffset
  const nearestNoteCents = findNearestScaleNoteCents(fingerCents, config.scale, config.temperamentOffsets)

  return { fingerCents, nearestNoteCents }
}

function findNearestScaleNoteCents(
  fingerCents: number,
  scale: number[],
  temperamentOffsets: number[]
): number {
  const fingerMidi = fingerCents / 100
  const octave = Math.round(fingerMidi / 12)
  let nearest = fingerCents
  let nearestDist = Infinity

  // Scan notes in scale around current octave
  for (let oct = octave - 1; oct <= octave + 1; oct++) {
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

// Update pitch tracking state per voice block tick or touch event
export function updatePitchRounding(
  state: PitchState,
  keyX: number,
  isAttack: boolean,
  config: PitchRoundingConfig
): number {
  const { fingerCents, nearestNoteCents } = keyXToPitchCents(keyX, state.baseMidiNote, config)
  state.fingerCents = fingerCents

  if (isAttack && config.snapEnabled) {
    state.currentPitchCents = nearestNoteCents
    state.targetPitchCents = nearestNoteCents
    return nearestNoteCents
  }

  if (config.roundEnabled) {
    // Check if the movement is small wiggling (vibrato) vs sliding
    const diff = fingerCents - state.currentPitchCents
    const absDiff = Math.abs(diff)

    // Vibrato detection: If finger wiggles rapidly back and forth in a tiny range (< 18 cents)
    // we scale down the convergence rate to allow the vibrato depth to be fully expressive.
    let currentConvergence = 1 - config.slideSpeed // invert: lower slideSpeed = faster convergence

    if (absDiff < 18) {
      // Scale down rounding slightly for small vibrato wiggles
      currentConvergence *= 0.4
    }

    state.targetPitchCents = nearestNoteCents
    const error = state.targetPitchCents - state.currentPitchCents
    
    // Smoothly interpolate towards the target cents
    state.currentPitchCents += error * Math.max(0.02, currentConvergence)
  } else {
    // Pure fretless mode: follow the raw finger pitch exactly
    state.currentPitchCents = fingerCents
  }

  return state.currentPitchCents
}
