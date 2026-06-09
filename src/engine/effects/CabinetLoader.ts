export async function loadCabinetIR(ctx: AudioContext, name: string): Promise<AudioBuffer> {
  try {
    const response = await fetch(`/ir/${name}.wav`)
    if (!response.ok) {
      throw new Error(`Failed to load IR file: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return await ctx.decodeAudioData(arrayBuffer)
  } catch (e) {
    console.warn(`Cabinet IR fetch failed for "${name}". Falling back to synthetic IR.`, e)
    return generateSyntheticCabinetIR(ctx)
  }
}

// Generates a synthetic impulse response mimicking a 12-inch guitar speaker.
// Real guitar cabinets roll off high frequencies (> 5kHz) and sub-bass (< 80Hz).
export function generateSyntheticCabinetIR(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const duration = 0.05 // 50ms impulse length is standard for cabs
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  // Fill buffer with shaped decay noise
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const decay = Math.exp(-120 * t) // rapid exponential decay
    const noise = Math.random() * 2 - 1

    // Simple bandpass filter shape (80Hz to 4.5kHz)
    const freqFactor = Math.sin(2 * Math.PI * 1500 * t) * 0.4 + Math.sin(2 * Math.PI * 3000 * t) * 0.2
    data[i] = noise * decay * (0.4 + freqFactor)
  }

  return buffer
}
