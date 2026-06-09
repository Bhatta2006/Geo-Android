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

export function KeyboardCanvas({ config, voiceManager, showSvara = false }: KeyboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeTouches = useRef<Map<number, TouchPoint>>(new Map())
  const layout = useRef<KeyCell[]>([])

  // Re-build layout when config or window changes size
  const updateLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    layout.current = buildLayout(config, canvas.width / window.devicePixelRatio)
    draw()
  }, [config])

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    // Draw grid keys
    for (const cell of layout.current) {
      const isPressed = Array.from(activeTouches.current.values()).some(
        touch => touch.cell.row === cell.row && touch.cell.col === cell.col
      )

      // Background fill color logic
      if (isPressed) {
        // Glowing cyan gradient for pressed key
        const grad = ctx.createLinearGradient(cell.x, cell.y, cell.x, cell.y + cell.height)
        grad.addColorStop(0, '#00e5ff')
        grad.addColorStop(1, '#00838f')
        ctx.fillStyle = grad
      } else if (!cell.isInScale) {
        ctx.fillStyle = '#11111e'      // darkened out-of-scale key
      } else if (cell.isRoot) {
        ctx.fillStyle = '#2c220f'      // subtle gold/brown background for root note
      } else {
        ctx.fillStyle = '#1c1c2e'      // default dark slate for in-scale keys
      }

      ctx.fillRect(cell.x + 1, cell.y + 1, cell.width - 2, cell.height - 2)

      // Key cell border
      ctx.strokeStyle = cell.isRoot && cell.isInScale
        ? '#ffd700' 
        : cell.isInScale ? '#3a3a5e' : '#1d1d2b'
      ctx.lineWidth = cell.isRoot && cell.isInScale ? 1.5 : 1
      ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1)

      // Center dots for quarter-tones/visual alignment (Polkadot style indicator)
      if (cell.isInScale) {
        ctx.fillStyle = cell.isRoot ? '#ffd700' : '#4f4f7a'
        ctx.beginPath()
        ctx.arc(cell.x + cell.width / 2, cell.y + cell.height - 10, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw Note Label
      if (cell.isInScale) {
        ctx.fillStyle = isPressed 
          ? '#ffffff' 
          : cell.isRoot ? '#ffd700' : '#b0b0d6'
      } else {
        ctx.fillStyle = '#44445c'      // dim out-of-scale text
      }

      const fontSize = Math.min(16, cell.height * 0.22)
      ctx.font = `bold ${fontSize}px "Outfit", "Inter", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const label = showSvara ? cell.svaraName : cell.noteName
      ctx.fillText(label, cell.x + cell.width / 2, cell.y + cell.height / 2)
    }

    // Draw Touch Indicator Circles & Trailing Lines
    for (const touch of activeTouches.current.values()) {
      const rect = canvas.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      // Draw soft outer radial glow
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 40)
      glow.addColorStop(0, 'rgba(0, 229, 255, 0.4)')
      glow.addColorStop(1, 'rgba(0, 229, 255, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, 40, 0, Math.PI * 2)
      ctx.fill()

      // Draw solid inner pointer core
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.restore()
  }, [showSvara])

  // Custom draw caller that uses requestAnimationFrame
  const requestRedraw = useCallback(() => {
    requestAnimationFrame(draw)
  }, [draw])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cell = hitTest(x, y)
    if (!cell) return

    const keyX = (x - cell.x) / cell.width   // 0–1 horizontal within key
    const keyY = 1 - (y - cell.y) / cell.height // 0=bottom, 1=top
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
    
    // Check if finger moved onto a different key cell (for active highlighting)
    const cell = hitTest(x, y)
    if (cell && (cell.row !== touch.cell.row || cell.col !== touch.cell.col)) {
      touch.cell = cell
    }

    // Calculate delta relative to initial start coordinates
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
        backgroundColor: '#0c0c14',
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
