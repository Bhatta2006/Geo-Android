export interface RippleEffect {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
}

export interface PitchTrailPoint {
  x: number
  y: number
  pitchCents: number
  timestamp: number
}

export interface PitchTrail {
  voiceId: number
  points: PitchTrailPoint[]
  color: string
}

export interface ActiveVoiceInfo {
  voiceId: number
  pointerId: number
  row: number
  col: number
  clientX: number
  clientY: number
  pitchCents: number
}

import { type KeyCell } from '../keyboard/KeyboardLayout'

export class KeyboardRenderer {
  private ripples: RippleEffect[] = []
  private trails = new Map<number, PitchTrail>()

  constructor() {}

  // ─── Ripples ──────────────────────────────────────────────────────────────

  triggerRipple(x: number, y: number, isRoot: boolean): void {
    this.ripples.push({
      x,
      y,
      radius: 5,
      maxRadius: 60,
      alpha: 1.0,
      color: isRoot ? 'rgba(255, 140, 40,' : 'rgba(0, 229, 255,',
    })
  }

  // ─── Pitch Trails ─────────────────────────────────────────────────────────

  addTrailPoint(voiceId: number, x: number, y: number, pitchCents: number): void {
    let trail = this.trails.get(voiceId)
    if (!trail) {
      trail = {
        voiceId,
        points: [],
        color: '#00e5ff',
      }
      this.trails.set(voiceId, trail)
    }

    trail.points.push({
      x,
      y,
      pitchCents,
      timestamp: Date.now(),
    })
  }

  clearTrail(voiceId: number): void {
    this.trails.delete(voiceId)
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  drawFrame(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    layout: KeyCell[],
    activeVoices: ActiveVoiceInfo[],
    showSvara: boolean
  ): void {
    const dpr = window.devicePixelRatio || 1
    const logicalW = canvas.width / dpr
    const logicalH = canvas.height / dpr

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, logicalW, logicalH)

    // 1. Draw solid dark background
    ctx.fillStyle = '#080a0e'
    ctx.fillRect(0, 0, logicalW, logicalH)

    // 2. Prep active voice lookup
    const pressedKeys = new Set<string>()
    const voiceMap = new Map<string, ActiveVoiceInfo>()
    for (const v of activeVoices) {
      const key = `${v.row},${v.col}`
      pressedKeys.add(key)
      voiceMap.set(key, v)
    }

    // 3. Draw key grid
    for (const cell of layout) {
      const key = `${cell.row},${cell.col}`
      const isPressed = pressedKeys.has(key)
      const vInfo = voiceMap.get(key)
      this.drawKey(ctx, cell, isPressed, vInfo, showSvara)
    }

    // 4. Draw pitch trails (slide trails)
    this.drawPitchTrails(ctx)

    // 5. Draw active voice touch indicators and ripples
    this.drawTouchPointsAndRipples(ctx, activeVoices, canvas.getBoundingClientRect())

    ctx.restore()
  }

  private drawKey(
    ctx: CanvasRenderingContext2D,
    cell: KeyCell,
    isPressed: boolean,
    vInfo: ActiveVoiceInfo | undefined,
    showSvara: boolean
  ): void {
    const { x, y, width: w, height: h, isInScale, isRoot, noteName, svaraName } = cell
    const pad = 1.5

    const cx = x + w / 2
    const cy = y + h / 2

    // ─── Key Background ───
    if (isPressed) {
      // Sleek radial glow on press
      const pressG = ctx.createRadialGradient(cx, cy, 5, cx, cy, Math.max(w, h) * 0.7)
      if (isRoot) {
        pressG.addColorStop(0, 'rgba(255, 140, 40, 0.45)')
        pressG.addColorStop(0.5, 'rgba(200, 100, 20, 0.25)')
        pressG.addColorStop(1, 'rgba(40, 15, 0, 0.15)')
      } else {
        pressG.addColorStop(0, 'rgba(0, 229, 255, 0.35)')
        pressG.addColorStop(0.5, 'rgba(0, 150, 180, 0.15)')
        pressG.addColorStop(1, 'rgba(0, 30, 50, 0.05)')
      }
      ctx.fillStyle = pressG
    } else if (!isInScale) {
      ctx.fillStyle = '#0b0c10' // out of scale: dark and flat
    } else if (isRoot) {
      ctx.fillStyle = '#1e1405' // root: warm dark amber tint
    } else {
      ctx.fillStyle = '#0f121a' // in scale: dark blue-grey tint
    }

    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 4)
    ctx.fill()

    // ─── Borders ───
    ctx.lineWidth = isPressed ? 2 : 1
    if (isPressed) {
      ctx.strokeStyle = isRoot ? 'rgba(255, 160, 60, 0.95)' : 'rgba(0, 229, 255, 0.95)'
    } else if (isRoot && isInScale) {
      ctx.strokeStyle = 'rgba(255, 140, 40, 0.55)'
    } else if (isInScale) {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)'
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    }

    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 4)
    ctx.stroke()

    // ─── Concentric Guitar Hole Rings (Aesthetics) ───
    if (isInScale) {
      const maxRadius = Math.min(w, h) * 0.36
      const rings = 4
      const baseAlpha = isPressed ? 0.3 : (isRoot ? 0.15 : 0.08)
      const ringColor = isPressed
        ? (isRoot ? 'rgba(255, 180, 80,' : 'rgba(100, 255, 255,')
        : (isRoot ? 'rgba(255, 140, 40,' : 'rgba(0, 229, 255,')

      for (let i = rings; i >= 1; i--) {
        const r = (maxRadius / rings) * i
        ctx.beginPath()
        ctx.arc(cx, cy - h * 0.08, r, 0, Math.PI * 2)
        ctx.strokeStyle = `${ringColor}${baseAlpha * (i / rings)})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy - h * 0.08, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = isPressed
        ? (isRoot ? '#ffa040' : '#ffffff')
        : (isRoot ? 'rgba(255,140,40,0.5)' : 'rgba(0,229,255,0.4)')
      ctx.fill()
    }

    // ─── Label ───
    const label = showSvara ? svaraName : noteName
    const fontSize = Math.min(15, Math.max(10, h * 0.2))

    if (isInScale) {
      ctx.fillStyle = isPressed
        ? '#ffffff'
        : isRoot
          ? '#ffa040'
          : '#9ab0cc'
    } else {
      ctx.fillStyle = '#2d3345'
    }

    ctx.font = `700 ${fontSize}px "Outfit", "Inter", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(label, cx, y + h - h * 0.18)

    // ─── Pitch Bend HUD Bar (inside the active cell) ───
    if (isPressed && vInfo && Math.abs(vInfo.pitchCents) > 1.5) {
      const barW = w * 0.55
      const barH = 3
      const barX = cx - barW / 2
      const barY = y + h * 0.8

      // Track background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.fillRect(barX, barY, barW, barH)

      // Pitch fill (bend range is approx -100 to 100 cents relative to key center)
      // Clamped normalized bend: -1 to 1
      const normBend = Math.max(-1, Math.min(1, vInfo.pitchCents / 100))
      const fillW = (barW / 2) * normBend
      ctx.fillStyle = vInfo.pitchCents > 0 ? '#ff9f3b' : '#00e5ff' // Sharp is warm, Flat is cyan
      ctx.fillRect(cx, barY, fillW, barH)

      // Center tick
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - 0.75, barY - 1, 1.5, barH + 2)
    }
  }

  private drawPitchTrails(ctx: CanvasRenderingContext2D): void {
    const now = Date.now()
    const trailDuration = 700 // milliseconds

    for (const trail of this.trails.values()) {
      if (trail.points.length < 2) continue

      // Filter out points older than the duration
      trail.points = trail.points.filter((p) => now - p.timestamp < trailDuration)

      ctx.save()
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 1; i < trail.points.length; i++) {
        const p1 = trail.points[i - 1]
        const p2 = trail.points[i]

        const age = now - p2.timestamp
        const alpha = Math.max(0, 1 - age / trailDuration) * 0.75

        // Dynamic color: transition from Flat cyan to Sharp orange based on pitch bend
        const bend = p2.pitchCents
        let colorStr = `rgba(0, 229, 255, ${alpha})`
        if (bend > 8) {
          colorStr = `rgba(255, 140, 40, ${alpha})`
        } else if (Math.abs(bend) <= 8) {
          // Centered pitch gets a clean white-blue glow
          colorStr = `rgba(180, 240, 255, ${alpha})`
        }

        ctx.strokeStyle = colorStr
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawTouchPointsAndRipples(
    ctx: CanvasRenderingContext2D,
    activeVoices: ActiveVoiceInfo[],
    rect: DOMRect
  ): void {
    const now = Date.now()

    // 1. Draw & update ripples
    this.ripples = this.ripples.filter((r) => r.alpha > 0.01)
    for (const r of this.ripples) {
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.strokeStyle = `${r.color}${r.alpha.toFixed(2)})`
      ctx.lineWidth = 2.5
      ctx.stroke()

      // Expand ripple size, decay alpha
      r.radius += 2.2
      r.alpha *= 0.925
    }

    // 2. Draw current pointer contact nodes
    for (const v of activeVoices) {
      const tx = v.clientX - rect.left
      const ty = v.clientY - rect.top

      // Pulse glow circle under finger
      const pulseRadius = 34 + Math.sin(now * 0.015) * 3
      const glow = ctx.createRadialGradient(tx, ty, 2, tx, ty, pulseRadius)
      glow.addColorStop(0, 'rgba(0, 229, 255, 0.45)')
      glow.addColorStop(0.5, 'rgba(0, 229, 255, 0.12)')
      glow.addColorStop(1, 'rgba(0, 229, 255, 0)')

      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(tx, ty, pulseRadius, 0, Math.PI * 2)
      ctx.fill()

      // Solid central core dot
      ctx.beginPath()
      ctx.arc(tx, ty, 5.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
}
