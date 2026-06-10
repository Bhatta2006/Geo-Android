import { useRef, useEffect, useCallback } from 'react'
import { type KeyCell, type LayoutConfig, buildLayout } from '../engine/keyboard/KeyboardLayout'
import { type VoiceManager } from '../engine/audio/VoiceManager'
import { useKeyboardGesture } from '../hooks/useKeyboardGesture'
import { KeyboardRenderer, type ActiveVoiceInfo } from '../engine/renderer/KeyboardRenderer'

interface TouchPoint {
  pointerId: number
  clientX: number
  clientY: number
  pressure: number
  initialX: number
  initialCell: KeyCell
  cell: KeyCell
  pitchCents: number
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
  const rendererRef = useRef<KeyboardRenderer>(new KeyboardRenderer())
  const rafRef = useRef<number | null>(null)

  // ─── Animation Loop ──────────────────────────────────────────────────────────

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Build the current active voice info array from touch state
    const activeVoices: ActiveVoiceInfo[] = Array.from(activeTouches.current.values()).map((t) => ({
      voiceId: t.pointerId,
      pointerId: t.pointerId,
      row: t.cell.row,
      col: t.cell.col,
      clientX: t.clientX,
      clientY: t.clientY,
      pitchCents: t.pitchCents,
    }))

    rendererRef.current.drawFrame(canvas, ctx, layout.current, activeVoices, showSvara ?? false)
    rafRef.current = requestAnimationFrame(renderFrame)
  }, [showSvara])

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(renderFrame)
  }, [renderFrame])

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // ─── Layout & Resize ─────────────────────────────────────────────────────────

  const updateLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    layout.current = buildLayout(config, rect.width, rect.height)
  }, [config])

  useEffect(() => {
    updateLayout()
    startLoop()
    window.addEventListener('resize', updateLayout)
    return () => {
      stopLoop()
      window.removeEventListener('resize', updateLayout)
    }
  }, [updateLayout, startLoop, stopLoop])

  // ─── Gesture Callbacks ───────────────────────────────────────────────────────

  const requestRedraw = useCallback(() => {
    // No-op: the RAF loop handles continuous drawing.
    // We keep this for API compatibility with useKeyboardGesture.
  }, [])

  const onTouchDown = useCallback(
    (_pointerId: number, cell: KeyCell, clientX: number, clientY: number, _keyZ: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      // Trigger ripple at exact touch point on canvas
      rendererRef.current.triggerRipple(x, y, cell.isRoot)
    },
    []
  )

  const onTouchMove = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      pitchBendCents: number
    ) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      // Feed the current pointer position into the pitch trail for this voice
      const touch = activeTouches.current.get(pointerId)
      const isRoot = touch?.initialCell.isRoot ?? false
      rendererRef.current.addTrailPoint(pointerId, x, y, pitchBendCents, isRoot)
    },
    []
  )

  const onTouchUp = useCallback((pointerId: number) => {
    rendererRef.current.clearTrail(pointerId)
  }, [])

  useKeyboardGesture({
    layoutRef: layout,
    voiceManager,
    canvasRef,
    activeTouchesRef: activeTouches,
    requestRedraw,
    onTouchDown,
    onTouchMove,
    onTouchUp,
  })

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
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
