import React, { useRef, useEffect, useCallback } from 'react'
import { type KeyCell, type LayoutConfig, buildLayout } from '../engine/keyboard/KeyboardLayout'
import { type VoiceManager, type TouchState } from '../engine/audio/VoiceManager'

interface TouchPoint {
  pointerId: number
  clientX: number
  clientY: number
  pressure: number
  initialX: number
  initialCell: KeyCell
  cell: KeyCell
}

interface KeyboardCanvasProps {
  config: LayoutConfig
  voiceManager: VoiceManager
  showSvara?: boolean
}

// Pre-draw a single key cell to an offscreen canvas for performance
// Colors:
//   root note in scale:    warm orange border + tinted bg
//   in scale (not root):   cyan border + dark bg
//   out of scale:          dim grey border + very dark bg
//   pressed:               bright cyan fill + white text

function drawGeoShredKey(
  ctx: CanvasRenderingContext2D,
  cell: KeyCell,
  isPressed: boolean,
  showSvara: boolean,
) {
  const { x, y, width: w, height: h, isInScale, isRoot, noteName, svaraName } = cell
  const pad = 1.5 // gap between keys

  const cx = x + w / 2
  const cy = y + h / 2

  // ─── Background ───
  if (isPressed) {
    // Pressed: strong cyan gradient
    const g = ctx.createLinearGradient(x, y, x, y + h)
    g.addColorStop(0, 'rgba(0,229,255,0.55)')
    g.addColorStop(0.5, 'rgba(0,180,210,0.35)')
    g.addColorStop(1, 'rgba(0,100,140,0.25)')
    ctx.fillStyle = g
  } else if (!isInScale) {
    ctx.fillStyle = '#0a0c10'
  } else if (isRoot) {
    ctx.fillStyle = '#1a1000'
  } else {
    ctx.fillStyle = '#0e1118'
  }

  ctx.beginPath()
  ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 4)
  ctx.fill()

  // ─── Border ───
  ctx.lineWidth = isPressed ? 2 : 1
  if (isPressed) {
    ctx.strokeStyle = '#00e5ff'
  } else if (isRoot && isInScale) {
    ctx.strokeStyle = 'rgba(255,140,40,0.75)'
  } else if (isInScale) {
    ctx.strokeStyle = 'rgba(0,229,255,0.45)'
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  }

  ctx.beginPath()
  ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 4)
  ctx.stroke()

  // ─── Concentric circle texture (guitar sound hole) ───
  if (isInScale) {
    const maxRadius = Math.min(w, h) * 0.38
    const rings = 4
    const baseAlpha = isPressed ? 0.35 : (isRoot ? 0.18 : 0.12)
    const ringColor = isPressed
      ? `rgba(255,255,255,` 
      : isRoot
        ? `rgba(255,160,60,`
        : `rgba(0,229,255,`

    for (let i = rings; i >= 1; i--) {
      const r = (maxRadius / rings) * i
      ctx.beginPath()
      ctx.arc(cx, cy - h * 0.08, r, 0, Math.PI * 2)
      ctx.strokeStyle = ringColor + (baseAlpha * (i / rings)).toFixed(2) + ')'
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy - h * 0.08, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = isPressed ? 'rgba(255,255,255,0.6)' : isRoot ? 'rgba(255,140,40,0.5)' : 'rgba(0,229,255,0.4)'
    ctx.fill()
  }

  // ─── Note Label ───
  const label = showSvara ? svaraName : noteName
  const fontSize = Math.min(15, Math.max(10, h * 0.2))

  if (isInScale) {
    ctx.fillStyle = isPressed
      ? '#ffffff'
      : isRoot
        ? '#ffa040'
        : '#9ab0cc'
  } else {
    ctx.fillStyle = '#2a3040'
  }

  ctx.font = `700 ${fontSize}px "Outfit", "Inter", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(label, cx, y + h - h * 0.18)

  // ─── Pressed glow overlay ───
  if (isPressed) {
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.5)
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.2)')
    glowGrad.addColorStop(1, 'rgba(0,229,255,0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 4)
    ctx.fill()
  }
}

export function KeyboardCanvas({ config, voiceManager, showSvara = false }: KeyboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeTouches = useRef<Map<number, TouchPoint>>(new Map())
  const layout = useRef<KeyCell[]>([])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)

    const logicalW = canvas.width / dpr
    const logicalH = canvas.height / dpr
    ctx.clearRect(0, 0, logicalW, logicalH)

    // Background
    ctx.fillStyle = '#080a0e'
    ctx.fillRect(0, 0, logicalW, logicalH)

    // Draw all key cells
    const pressedSet = new Set(
      Array.from(activeTouches.current.values()).map(t => `${t.cell.row},${t.cell.col}`)
    )

    for (const cell of layout.current) {
      const isPressed = pressedSet.has(`${cell.row},${cell.col}`)
      drawGeoShredKey(ctx, cell, isPressed, showSvara)
    }

    // Touch ripple indicators
    for (const touch of activeTouches.current.values()) {
      const rect = canvas.getBoundingClientRect()
      const tx = touch.clientX - rect.left
      const ty = touch.clientY - rect.top

      const glow = ctx.createRadialGradient(tx, ty, 2, tx, ty, 36)
      glow.addColorStop(0, 'rgba(0, 229, 255, 0.5)')
      glow.addColorStop(0.5, 'rgba(0, 229, 255, 0.15)')
      glow.addColorStop(1, 'rgba(0, 229, 255, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(tx, ty, 36, 0, Math.PI * 2)
      ctx.fill()

      // Inner dot
      ctx.beginPath()
      ctx.arc(tx, ty, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fill()
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.restore()
  }, [showSvara])

  const updateLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    layout.current = buildLayout(config, rect.width, rect.height)
    draw()
  }, [config, draw])

  useEffect(() => {
    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [updateLayout])

  const hitTest = (x: number, y: number): KeyCell | null => {
    return layout.current.find(cell =>
      x >= cell.x && x < cell.x + cell.width &&
      y >= cell.y && y < cell.y + cell.height
    ) ?? null
  }

  const requestRedraw = useCallback(() => {
    requestAnimationFrame(draw)
  }, [draw])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cell = hitTest(x, y)
    if (!cell) return

    const keyX = (x - cell.x) / cell.width
    const keyY = 1 - (y - cell.y) / cell.height
    const keyZ = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.5

    activeTouches.current.set(e.pointerId, {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      pressure: keyZ,
      initialX: x,
      initialCell: cell,
      cell,
    })

    const touchState: TouchState = {
      pointerId: e.pointerId,
      row: cell.row,
      col: cell.col,
      midiNote: cell.midiNote,
      keyX,
      keyY,
      keyZ,
    }

    voiceManager.handleTouchDown(touchState)
    requestRedraw()
  }, [voiceManager, requestRedraw])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const touch = activeTouches.current.get(e.pointerId)
    if (!touch) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const cell = hitTest(x, y)
    if (cell && (cell.row !== touch.cell.row || cell.col !== touch.cell.col)) {
      touch.cell = cell
    }

    const dx = x - touch.initialX
    const centsOffset = (dx / touch.initialCell.width) * 100

    const keyY = 1 - (y - touch.cell.y) / touch.cell.height
    const keyZ = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.5

    touch.clientX = e.clientX
    touch.clientY = e.clientY
    touch.pressure = keyZ

    voiceManager.handleTouchMove(e.pointerId, centsOffset, keyY, keyZ)
    requestRedraw()
  }, [voiceManager, requestRedraw])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const touch = activeTouches.current.get(e.pointerId)
    if (!touch) return
    activeTouches.current.delete(e.pointerId)
    voiceManager.handleTouchUp(e.pointerId, touch.initialCell.row)
    requestRedraw()
  }, [voiceManager, requestRedraw])

  return (
    <canvas
      ref={canvasRef}
      style={{
        touchAction: 'none',
        display: 'block',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
