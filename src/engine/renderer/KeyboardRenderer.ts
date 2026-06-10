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
  isRoot: boolean
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
    // Spawn two ripples: a fast tight one and a slow wide one (GeoShred style)
    this.ripples.push({
      x, y, radius: 8, maxRadius: 55, alpha: 0.9,
      color: isRoot ? 'rgba(255, 140, 40,' : 'rgba(0, 229, 255,',
    })
    this.ripples.push({
      x, y, radius: 4, maxRadius: 90, alpha: 0.5,
      color: isRoot ? 'rgba(255, 200, 80,' : 'rgba(100, 220, 255,',
    })
  }

  // ─── Pitch Trails ─────────────────────────────────────────────────────────

  addTrailPoint(voiceId: number, x: number, y: number, pitchCents: number, isRoot = false): void {
    let trail = this.trails.get(voiceId)
    if (!trail) {
      trail = { voiceId, points: [], isRoot }
      this.trails.set(voiceId, trail)
    }
    // Throttle: only add a new point if finger moved ≥2px from the last one
    const last = trail.points[trail.points.length - 1]
    if (last) {
      const dx = x - last.x
      const dy = y - last.y
      if (dx * dx + dy * dy < 4) return   // < 2px movement — skip
    }
    trail.points.push({ x, y, pitchCents, timestamp: Date.now() })
    // Keep at most 80 points to prevent memory growth on very long slides
    if (trail.points.length > 80) trail.points.shift()
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

    // 4. Draw smooth pitch trails (BEFORE the touch orbs so orbs sit on top)
    this.drawPitchTrails(ctx)

    // 5. Draw ripples and moving finger orbs
    this.drawRipples(ctx)
    this.drawTouchOrbs(ctx, activeVoices, canvas)

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
      const pressG = ctx.createRadialGradient(cx, cy, 5, cx, cy, Math.max(w, h) * 0.7)
      if (isRoot) {
        pressG.addColorStop(0, 'rgba(255, 140, 40, 0.50)')
        pressG.addColorStop(0.5, 'rgba(200, 100, 20, 0.28)')
        pressG.addColorStop(1, 'rgba(40, 15, 0, 0.12)')
      } else {
        pressG.addColorStop(0, 'rgba(0, 229, 255, 0.40)')
        pressG.addColorStop(0.5, 'rgba(0, 150, 180, 0.18)')
        pressG.addColorStop(1, 'rgba(0, 30, 50, 0.05)')
      }
      ctx.fillStyle = pressG
    } else if (!isInScale) {
      ctx.fillStyle = '#0b0c10'
    } else if (isRoot) {
      ctx.fillStyle = '#1e1405'
    } else {
      ctx.fillStyle = '#0f121a'
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

    // ─── Concentric Rings ───
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
    ctx.fillStyle = isInScale
      ? (isPressed ? '#ffffff' : isRoot ? '#ffa040' : '#9ab0cc')
      : '#2d3345'
    ctx.font = `700 ${fontSize}px "Outfit", "Inter", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(label, cx, y + h - h * 0.18)

    // ─── Pitch Bend HUD Bar ───
    if (isPressed && vInfo && Math.abs(vInfo.pitchCents) > 1.5) {
      const barW = w * 0.55
      const barH = 3
      const barX = cx - barW / 2
      const barY = y + h * 0.8
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.fillRect(barX, barY, barW, barH)
      const normBend = Math.max(-1, Math.min(1, vInfo.pitchCents / 100))
      const fillW = (barW / 2) * normBend
      ctx.fillStyle = vInfo.pitchCents > 0 ? '#ff9f3b' : '#00e5ff'
      ctx.fillRect(cx, barY, fillW, barH)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - 0.75, barY - 1, 1.5, barH + 2)
    }
  }

  /**
   * Draw smooth slide trails using quadratic bezier curves.
   * Each segment fades based on age and is colored by pitch bend direction.
   * Drawn with two passes: a thick soft glow, then a sharp bright line on top.
   */
  private drawPitchTrails(ctx: CanvasRenderingContext2D): void {
    const now = Date.now()
    const trailDuration = 800  // ms

    for (const trail of this.trails.values()) {
      // Age out old points
      trail.points = trail.points.filter(p => now - p.timestamp < trailDuration)
      if (trail.points.length < 2) continue

      const pts = trail.points

      // Draw 2 passes: wide soft glow, then narrow bright line
      for (let pass = 0; pass < 2; pass++) {
        const isGlow = pass === 0
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Build a smooth Catmull-Rom path via quadratic bezier midpoints
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)

        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2
          const my = (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
        }
        // Last segment to the final point
        const last = pts[pts.length - 1]
        ctx.lineTo(last.x, last.y)

        // Color the trail by the latest pitch bend direction
        const latestBend = last.pitchCents
        let baseColor: string
        if (latestBend > 8) {
          baseColor = isGlow ? 'rgba(255, 140, 40,' : 'rgba(255, 200, 100,'
        } else if (latestBend < -8) {
          baseColor = isGlow ? 'rgba(0, 229, 255,' : 'rgba(150, 245, 255,'
        } else {
          baseColor = isGlow ? 'rgba(180, 240, 255,' : 'rgba(220, 255, 255,'
        }

        // Age-based alpha: most recent tail is brightest
        const headAge = now - last.timestamp
        const tailAlpha = Math.max(0, 1 - headAge / trailDuration)
        const alpha = isGlow ? tailAlpha * 0.35 : tailAlpha * 0.85

        ctx.strokeStyle = `${baseColor}${alpha.toFixed(3)})`
        ctx.lineWidth = isGlow ? 18 : 3
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    this.ripples = this.ripples.filter(r => r.alpha > 0.01)
    for (const r of this.ripples) {
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.strokeStyle = `${r.color}${r.alpha.toFixed(3)})`
      ctx.lineWidth = r.radius < 20 ? 2.5 : 1.5
      ctx.stroke()

      r.radius += (r.maxRadius - r.radius) * 0.12  // ease-out expansion
      r.alpha *= 0.91
    }
  }

  /**
   * Draw a large glowing orb at each active finger position.
   * This is the key GeoShred-style visual: a bright contact circle
   * with a wide ambient glow halo, sitting on top of the trail.
   */
  private drawTouchOrbs(
    ctx: CanvasRenderingContext2D,
    activeVoices: ActiveVoiceInfo[],
    canvas: HTMLCanvasElement
  ): void {
    const now = Date.now()
    const rect = canvas.getBoundingClientRect()

    for (const v of activeVoices) {
      const tx = v.clientX - rect.left
      const ty = v.clientY - rect.top

      // Determine orb color by pitch bend
      const bend = v.pitchCents
      let orbColor: string
      let coreColor: string
      if (bend > 8) {
        orbColor = 'rgba(255, 140, 40,'; coreColor = '#ffb060'
      } else if (bend < -8) {
        orbColor = 'rgba(0, 229, 255,'; coreColor = '#80efff'
      } else {
        orbColor = 'rgba(160, 240, 255,'; coreColor = '#ffffff'
      }

      // ── Outer ambient halo ────────────────────────────────────────
      const haloR = 46 + Math.sin(now * 0.006) * 4
      const halo = ctx.createRadialGradient(tx, ty, 0, tx, ty, haloR)
      halo.addColorStop(0,   `${orbColor}0.22)`)
      halo.addColorStop(0.4, `${orbColor}0.12)`)
      halo.addColorStop(1,   `${orbColor}0.00)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(tx, ty, haloR, 0, Math.PI * 2)
      ctx.fill()

      // ── Mid glow ring ─────────────────────────────────────────────
      const midR = 22 + Math.sin(now * 0.009) * 2.5
      const mid = ctx.createRadialGradient(tx, ty, 2, tx, ty, midR)
      mid.addColorStop(0,   `${orbColor}0.65)`)
      mid.addColorStop(0.6, `${orbColor}0.25)`)
      mid.addColorStop(1,   `${orbColor}0.00)`)
      ctx.fillStyle = mid
      ctx.beginPath()
      ctx.arc(tx, ty, midR, 0, Math.PI * 2)
      ctx.fill()

      // ── Bright core dot ───────────────────────────────────────────
      ctx.beginPath()
      ctx.arc(tx, ty, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      // ── Colored ring around core ──────────────────────────────────
      ctx.beginPath()
      ctx.arc(tx, ty, 9, 0, Math.PI * 2)
      ctx.strokeStyle = coreColor
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
  }
}
