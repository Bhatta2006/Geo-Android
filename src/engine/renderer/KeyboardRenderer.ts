/**
 * KeyboardRenderer — draws hexagonal keys, white touch circles, and ripples.
 *
 * Monochrome black & white palette:
 *   - Background: pure black
 *   - Keys: dark gray hexagons with white borders
 *   - Root keys: slightly brighter border
 *   - Pressed keys: white glow
 *   - Touch: large white filled circle with expanding ripple rings
 *   - NO pitch trail lines
 */

export interface RippleEffect {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
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

  constructor() {}

  // ─── Ripples ──────────────────────────────────────────────────────────────

  triggerRipple(x: number, y: number, _isRoot: boolean): void {
    // Three concentric expanding white ripple rings
    this.ripples.push({ x, y, radius: 6,  maxRadius: 50,  alpha: 0.8 })
    this.ripples.push({ x, y, radius: 4,  maxRadius: 80,  alpha: 0.5 })
    this.ripples.push({ x, y, radius: 2,  maxRadius: 120, alpha: 0.3 })
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

    // 1. Pure black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, logicalW, logicalH)

    // 2. Prep active voice lookup
    const pressedKeys = new Set<string>()
    for (const v of activeVoices) {
      pressedKeys.add(`${v.row},${v.col}`)
    }

    // 3. Draw hex grid
    for (const cell of layout) {
      const key = `${cell.row},${cell.col}`
      const isPressed = pressedKeys.has(key)
      this.drawHexKey(ctx, cell, isPressed, showSvara)
    }

    // 4. Draw ripples
    this.drawRipples(ctx)

    // 5. Draw touch circles (large white orbs at active finger positions)
    this.drawTouchCircles(ctx, activeVoices, canvas)

    ctx.restore()
  }

  // ─── Hex Key Drawing ──────────────────────────────────────────────────────

  private drawHexKey(
    ctx: CanvasRenderingContext2D,
    cell: KeyCell,
    isPressed: boolean,
    showSvara: boolean
  ): void {
    const { centerX: cx, centerY: cy, hexRadius: r, isInScale, isRoot, noteName, svaraName } = cell
    const inset = r * 0.92  // slightly smaller for gap between hexes

    // Build hex path (pointy-top)
    const hexPath = new Path2D()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (i * Math.PI / 3)  // 30° offset for pointy-top
      const vx = cx + inset * Math.cos(angle)
      const vy = cy + inset * Math.sin(angle)
      if (i === 0) hexPath.moveTo(vx, vy)
      else hexPath.lineTo(vx, vy)
    }
    hexPath.closePath()

    // ── Fill ──
    if (isPressed) {
      // White radial glow
      const pressG = ctx.createRadialGradient(cx, cy, 0, cx, cy, inset)
      pressG.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
      pressG.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)')
      pressG.addColorStop(1, 'rgba(255, 255, 255, 0.03)')
      ctx.fillStyle = pressG
    } else if (!isInScale) {
      ctx.fillStyle = '#080808'
    } else if (isRoot) {
      ctx.fillStyle = '#141414'
    } else {
      ctx.fillStyle = '#0e0e0e'
    }
    ctx.fill(hexPath)

    // ── Border ──
    if (isPressed) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
    } else if (isRoot && isInScale) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 1.5
    } else if (isInScale) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.lineWidth = 0.5
    }
    ctx.stroke(hexPath)

    // ── Inner dot for in-scale keys ──
    if (isInScale) {
      ctx.beginPath()
      ctx.arc(cx, cy - r * 0.15, isRoot ? 3 : 2, 0, Math.PI * 2)
      ctx.fillStyle = isPressed
        ? '#ffffff'
        : (isRoot ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)')
      ctx.fill()
    }

    // ── Label ──
    const label = showSvara ? svaraName : noteName
    const fontSize = Math.min(13, Math.max(9, r * 0.35))
    ctx.fillStyle = isInScale
      ? (isPressed ? '#ffffff' : isRoot ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)')
      : 'rgba(255, 255, 255, 0.06)'
    ctx.font = `700 ${fontSize}px "Outfit", "Inter", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, cy + r * 0.25)
  }

  // ─── Ripples (white expanding rings) ──────────────────────────────────────

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    this.ripples = this.ripples.filter(r => r.alpha > 0.01)
    for (const r of this.ripples) {
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${r.alpha.toFixed(3)})`
      ctx.lineWidth = r.radius < 20 ? 2.5 : 1.5
      ctx.stroke()

      r.radius += (r.maxRadius - r.radius) * 0.1  // ease-out expansion
      r.alpha *= 0.9
    }
  }

  // ─── Touch Circles (large white filled circle at finger) ──────────────────

  private drawTouchCircles(
    ctx: CanvasRenderingContext2D,
    activeVoices: ActiveVoiceInfo[],
    canvas: HTMLCanvasElement
  ): void {
    const rect = canvas.getBoundingClientRect()
    const now = Date.now()

    for (const v of activeVoices) {
      const tx = v.clientX - rect.left
      const ty = v.clientY - rect.top

      // ── Outer ambient halo ──
      const haloR = 40 + Math.sin(now * 0.005) * 4
      const halo = ctx.createRadialGradient(tx, ty, 0, tx, ty, haloR)
      halo.addColorStop(0,   'rgba(255, 255, 255, 0.20)')
      halo.addColorStop(0.4, 'rgba(255, 255, 255, 0.08)')
      halo.addColorStop(1,   'rgba(255, 255, 255, 0.00)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(tx, ty, haloR, 0, Math.PI * 2)
      ctx.fill()

      // ── Main filled circle ──
      const mainR = 18 + Math.sin(now * 0.008) * 2
      const main = ctx.createRadialGradient(tx, ty, 0, tx, ty, mainR)
      main.addColorStop(0,   'rgba(255, 255, 255, 0.75)')
      main.addColorStop(0.7, 'rgba(255, 255, 255, 0.30)')
      main.addColorStop(1,   'rgba(255, 255, 255, 0.00)')
      ctx.fillStyle = main
      ctx.beginPath()
      ctx.arc(tx, ty, mainR, 0, Math.PI * 2)
      ctx.fill()

      // ── Bright core ──
      ctx.beginPath()
      ctx.arc(tx, ty, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      // ── Outer ring ──
      ctx.beginPath()
      ctx.arc(tx, ty, 12, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
}
