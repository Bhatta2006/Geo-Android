import { useDrag } from '@use-gesture/react'
import { type KeyCell, pointInHex } from '../engine/keyboard/KeyboardLayout'
import { type VoiceManager } from '../engine/audio/VoiceManager'

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

interface UseKeyboardGestureOptions {
  layoutRef: React.RefObject<KeyCell[]>
  voiceManager: VoiceManager
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  activeTouchesRef: React.RefObject<Map<number, TouchPoint>>
  requestRedraw: () => void
  /** Called on initial press — gives renderer x/y for ripple placement */
  onTouchDown?: (
    pointerId: number,
    cell: KeyCell,
    clientX: number,
    clientY: number,
    keyZ: number
  ) => void
  /** Called on slide move — gives renderer x/y and live pitch for trail */
  onTouchMove?: (
    pointerId: number,
    clientX: number,
    clientY: number,
    pitchBendCents: number
  ) => void
  /** Called on finger lift — lets renderer clear the trail */
  onTouchUp?: (pointerId: number) => void
}

export function useKeyboardGesture({
  layoutRef,
  voiceManager,
  canvasRef,
  activeTouchesRef,
  requestRedraw,
  onTouchDown,
  onTouchMove,
  onTouchUp,
}: UseKeyboardGestureOptions) {
  const hitTest = (x: number, y: number): KeyCell | null =>
    (layoutRef.current || []).find(
      (cell) => pointInHex(x, y, cell.centerX, cell.centerY, cell.hexRadius)
    ) ?? null

  useDrag(
    ({
      event,
      xy: [clientX, clientY],
      velocity: [vx, vy],
      first,
      last,
    }) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const pointerId = (event as PointerEvent).pointerId ?? 0
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      if (first) {
        if (event.cancelable) event.preventDefault()

        const cell = hitTest(x, y)
        if (!cell) return

        const keyX = (x - cell.x) / cell.width
        const keyY = 1 - (y - cell.y) / cell.height
        const keyZ = resolveKeyZ(event)

        activeTouchesRef.current.set(pointerId, {
          pointerId,
          clientX,
          clientY,
          pressure: keyZ,
          initialX: x,
          initialCell: cell,
          cell,
          pitchCents: 0,
        })

        voiceManager.handleTouchDown({
          pointerId,
          row: cell.row,
          col: cell.col,
          midiNote: cell.midiNote,
          keyX,
          keyY,
          keyZ,
        })

        // Notify renderer for ripple placement
        onTouchDown?.(pointerId, cell, clientX, clientY, keyZ)
        requestRedraw()

      } else if (last) {
        const touch = activeTouchesRef.current.get(pointerId)
        if (!touch) return
        activeTouchesRef.current.delete(pointerId)

        voiceManager.handleTouchUp(pointerId, touch.initialCell.row)

        // Notify renderer to clear trail
        onTouchUp?.(pointerId)
        requestRedraw()

      } else {
        // Slide in progress
        const touch = activeTouchesRef.current.get(pointerId)
        if (!touch) return

        const cell = hitTest(x, y)
        if (cell && (cell.row !== touch.cell.row || cell.col !== touch.cell.col)) {
          touch.cell = cell
        }

        const keyX = touch.cell
          ? Math.max(0, Math.min(1, (x - touch.cell.x) / touch.cell.width))
          : 0.5
        const keyY = touch.cell
          ? Math.max(0, Math.min(1, 1 - (y - touch.cell.y) / touch.cell.height))
          : 0.5
        const keyZ = resolveKeyZ(event)
        const dx = x - touch.initialX
        const speed = Math.sqrt(vx * vx + vy * vy)

        touch.clientX = clientX
        touch.clientY = clientY
        touch.pressure = keyZ

        // handleTouchMoveDetailed now returns pitchBendCents
        const pitchBendCents = voiceManager.handleTouchMoveDetailed({
          pointerId,
          newColumn: touch.cell?.col ?? touch.initialCell.col,
          newRow: touch.cell?.row ?? touch.initialCell.row,
          keyX,
          keyY,
          keyZ,
          dx,
          velocity: speed,
        })

        // Store pitch bend in active touch for HUD bar rendering
        touch.pitchCents = pitchBendCents

        // Notify renderer for pitch trail point
        onTouchMove?.(pointerId, clientX, clientY, pitchBendCents)
        requestRedraw()
      }
    },
    {
      target: canvasRef,
      eventOptions: { passive: false },
      pointer: { touch: true, mouse: true },
    }
  )
}

/** Resolve pointer pressure; fall back to 0.5 for devices without hardware pressure */
function resolveKeyZ(event: Event): number {
  const pressure = (event as PointerEvent).pressure
  return pressure > 0 && pressure < 1 ? pressure : 0.5
}
