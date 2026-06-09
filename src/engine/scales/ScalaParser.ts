export interface ScalaScale {
  name: string
  description: string
  degrees: number[]   // cents offsets from root note (always starts with 0)
}

export function parseScl(sclText: string): ScalaScale {
  const lines = sclText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('!'))

  if (lines.length < 2) {
    throw new Error('Invalid Scala file: Missing description or count.')
  }

  const description = lines[0]
  const count = parseInt(lines[1], 10)
  const degrees = [0] // index 0 is always 0 cents (root note)

  let lineIndex = 2
  for (let i = 0; i < count; i++) {
    while (lineIndex < lines.length && (lines[lineIndex].length === 0 || lines[lineIndex].startsWith('!'))) {
      lineIndex++
    }
    if (lineIndex >= lines.length) break

    const token = lines[lineIndex].split(/\s+/)[0]
    lineIndex++

    if (token.includes('.')) {
      // It's a cents value: e.g., "1200.0"
      degrees.push(parseFloat(token))
    } else if (token.includes('/')) {
      // It's a ratio: e.g., "3/2"
      const [num, den] = token.split('/').map(Number)
      if (den === 0) {
        throw new Error(`Invalid ratio: division by zero in "${token}"`)
      }
      degrees.push(1200 * Math.log2(num / den))
    } else {
      // It's an integer value, treated as a ratio: e.g., "2" (2/1 octave)
      const ratioValue = parseInt(token, 10)
      degrees.push(1200 * Math.log2(ratioValue))
    }
  }

  return {
    name: description.substring(0, 30),
    description,
    degrees
  }
}
