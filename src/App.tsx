import { useState, useRef, useEffect } from 'react'
import { KeyboardCanvas } from './components/KeyboardCanvas'
import { useAudioEngine } from './engine/audio/useAudioEngine'
import { VoiceManager } from './engine/audio/VoiceManager'
import { db, type Preset as DbPreset } from './presets/PresetSchema'
import type { LayoutConfig } from './engine/keyboard/KeyboardLayout'

interface Preset {
  id: string
  name: string
  rows: number
  startMidiNote: number
  scaleName: string
  scale: number[]
  rootNote: number
  snapEnabled: boolean
  roundEnabled: boolean
  slideSpeed: number
  diatonicEnabled: boolean
  volValue: number
  vibValue: number
  dampingValue: number
}

const SCALES: Record<string, { name: string; degrees: number[] }> = {
  chromatic: { name: 'Chromatic', degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: 'Major (Shankarabharanam)', degrees: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural Minor', degrees: [0, 2, 3, 5, 7, 8, 10] },
  mayamalavagowla: { name: 'Mayamalavagowla (Raga)', degrees: [0, 1, 4, 5, 7, 8, 11] },
  kalyani: { name: 'Kalyani (Raga)', degrees: [0, 2, 4, 6, 7, 9, 11] },
  kharaharapriya: { name: 'Kharaharapriya (Raga)', degrees: [0, 2, 3, 5, 7, 9, 10] },
}

const FACTORY_PRESETS: Preset[] = [
  {
    id: 'shred-lead',
    name: 'Shred Lead (Guitar)',
    rows: 4,
    startMidiNote: 52, // E3
    scaleName: 'chromatic',
    scale: SCALES.chromatic.degrees,
    rootNote: 4, // E
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.15,
    diatonicEnabled: false,
    volValue: 0.8,
    vibValue: 0.2,
    dampingValue: 0.3,
  },
  {
    id: 'sitar-raga',
    name: 'Sitar Raga (Carnatic)',
    rows: 4,
    startMidiNote: 48, // C3
    scaleName: 'mayamalavagowla',
    scale: SCALES.mayamalavagowla.degrees,
    rootNote: 0, // C
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.25,
    diatonicEnabled: true,
    volValue: 0.75,
    vibValue: 0.1,
    dampingValue: 0.5,
  },
  {
    id: 'acoustic-steel',
    name: 'Acoustic Steel',
    rows: 6,
    startMidiNote: 40, // E2
    scaleName: 'major',
    scale: SCALES.major.degrees,
    rootNote: 0, // C
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.05,
    diatonicEnabled: false,
    volValue: 0.85,
    vibValue: 0.0,
    dampingValue: 0.2,
  }
]

export default function App() {
  const audioEngine = useAudioEngine()
  
  // Initialize VoiceManager once
  const voiceManagerRef = useRef<VoiceManager | null>(null)
  if (!voiceManagerRef.current) {
    voiceManagerRef.current = new VoiceManager(audioEngine, 'poly')
  }
  
  // App settings state
  const [presets, setPresets] = useState<Preset[]>(FACTORY_PRESETS)
  const [activePresetIndex, setActivePresetIndex] = useState<number>(0)
  const activePreset = presets[activePresetIndex]

  // Dexie DB Sync on mount
  useEffect(() => {
    const syncDb = async () => {
      try {
        const count = await db.presets.count()
        if (count === 0) {
          // Pre-populate DB with factory defaults
          const dbPresets: DbPreset[] = FACTORY_PRESETS.map(p => ({
            id: p.id,
            name: p.name,
            version: 1,
            color: 'white',
            instrument: {
              type: 'guitar',
              parameters: {
                stiffness: 0.2,
                brightness: 0.5,
                decay: p.dampingValue,
                pluckPosition: 0.15,
                feedback: 0.3
              }
            },
            performanceSettings: {
              rows: p.rows,
              startMidiNote: p.startMidiNote,
              scaleName: p.scaleName,
              rootNote: p.rootNote,
              snapEnabled: p.snapEnabled,
              roundEnabled: p.roundEnabled,
              slideSpeed: p.slideSpeed,
              diatonicEnabled: p.diatonicEnabled
            },
            controlSurface: {
              volValue: p.volValue,
              vibValue: p.vibValue,
              dampingValue: p.dampingValue
            }
          }))
          await db.presets.bulkAdd(dbPresets)
        }

        const loaded = await db.presets.toArray()
        const mapped = loaded.map(p => ({
          id: p.id,
          name: p.name,
          rows: p.performanceSettings.rows,
          startMidiNote: p.performanceSettings.startMidiNote,
          scaleName: p.performanceSettings.scaleName,
          scale: SCALES[p.performanceSettings.scaleName]?.degrees || SCALES.chromatic.degrees,
          rootNote: p.performanceSettings.rootNote,
          snapEnabled: p.performanceSettings.snapEnabled,
          roundEnabled: p.performanceSettings.roundEnabled,
          slideSpeed: p.performanceSettings.slideSpeed,
          diatonicEnabled: p.performanceSettings.diatonicEnabled,
          volValue: p.controlSurface.volValue,
          vibValue: p.controlSurface.vibValue,
          dampingValue: p.controlSurface.dampingValue
        }))
        setPresets(mapped)
      } catch (e) {
        console.error('Dexie DB Sync error:', e)
      }
    }
    syncDb()
  }, [])

  const [showSvara, setShowSvara] = useState<boolean>(false)
  const [isDiatonic, setIsDiatonic] = useState<boolean>(activePreset.diatonicEnabled)
  const [showMenu, setShowMenu] = useState<boolean>(false)

  // Track XY values
  const [xyVal, setXyVal] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
  const xyPadRef = useRef<HTMLDivElement>(null)

  // Track Whammy value (height offset from center)
  const [whammyVal, setWhammyVal] = useState<number>(0.5) // 0.5 is centered / zero bend
  const whammyRef = useRef<HTMLDivElement>(null)

  // Sync state with active preset on load/change
  useEffect(() => {
    setIsDiatonic(activePreset.diatonicEnabled)
  }, [activePreset])

  useEffect(() => {
    if (voiceManagerRef.current) {
      const mode = activePreset.id === 'shred-lead' ? 'string' : 'poly'
      voiceManagerRef.current.setPlayMode(mode)
      voiceManagerRef.current.setConfig({
        snapEnabled: activePreset.snapEnabled,
        roundEnabled: activePreset.roundEnabled,
        slideSpeed: activePreset.slideSpeed,
        scale: isDiatonic ? activePreset.scale : SCALES.chromatic.degrees,
        temperamentOffsets: new Array(12).fill(0)
      })
    }
  }, [activePreset, isDiatonic])

  // Sync Audio Engine parameters with preset values
  useEffect(() => {
    audioEngine.setMasterVolume(activePreset.volValue)

    const decay = 0.998 - activePreset.dampingValue * 0.015
    audioEngine.setPhysicalModelParams({
      decay,
      brightness: 0.3 + (1 - activePreset.dampingValue) * 0.5
    })

    audioEngine.setEffectEnabled('chorus', activePreset.vibValue > 0.05)
  }, [audioEngine, activePreset.volValue, activePreset.dampingValue, activePreset.vibValue])

  // Configure default preset effects
  useEffect(() => {
    if (activePreset.id === 'shred-lead') {
      audioEngine.setEffectEnabled('distortion', true)
      audioEngine.setEffectEnabled('delay', true)
      audioEngine.setEffectEnabled('reverb', true)
      audioEngine.setEffectEnabled('wah', true)
    } else if (activePreset.id === 'sitar-raga') {
      audioEngine.setEffectEnabled('distortion', false)
      audioEngine.setEffectEnabled('delay', true)
      audioEngine.setEffectEnabled('reverb', true)
      audioEngine.setEffectEnabled('wah', false)
    } else {
      audioEngine.setEffectEnabled('distortion', false)
      audioEngine.setEffectEnabled('delay', false)
      audioEngine.setEffectEnabled('reverb', true)
      audioEngine.setEffectEnabled('wah', false)
    }
  }, [audioEngine, activePreset.id])

  // Handle Preset Selection
  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    setShowMenu(false)
  }

  // Handle XY Pad Pointer Events
  const handleXyPointerMove = (e: React.PointerEvent) => {
    const pad = xyPadRef.current
    if (!pad) return
    const rect = pad.getBoundingClientRect()
    
    // Calculate normalized coordinates
    let x = (e.clientX - rect.left) / rect.width
    let y = 1 - (e.clientY - rect.top) / rect.height
    
    // Clamp to 0-1
    x = Math.max(0, Math.min(1, x))
    y = Math.max(0, Math.min(1, y))
    
    setXyVal({ x, y })
    
    // Update active voices with expression CC values (CC74 = Y, CC1 = X)
    // In our simplified osc synthesis, we pass expression parameter shifts
  }

  const handleXyPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handleXyPointerMove(e)
  }

  const handleXyPointerUp = () => {
    // Reset to center on release
    setXyVal({ x: 0.5, y: 0.5 })
  }

  // Handle Whammy Bar Pointer Events (Pitch Bend)
  const handleWhammyPointerMove = (e: React.PointerEvent) => {
    const bar = whammyRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    
    // Calculate normalized value
    let val = 1 - (e.clientY - rect.top) / rect.height
    val = Math.max(0, Math.min(1, val))
    
    setWhammyVal(val)
    // Apply pitch bend to audio engine (e.g. translate 0-1 to global detune offset of +/- 200 cents bend)
    // Broadcast global pitch bend to active voices (updates the active detune)
  }

  const handleWhammyPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handleWhammyPointerMove(e)
  }

  const handleWhammyPointerUp = () => {
    // Return to center (spring action)
    setWhammyVal(0.5)
  }

  // Handle Slot Slider Changes
  const updatePresetValue = async (key: 'volValue' | 'vibValue' | 'dampingValue', val: number) => {
    setPresets(prev => prev.map((p, idx) => {
      if (idx === activePresetIndex) {
        return { ...p, [key]: val }
      }
      return p
    }))

    // Persist to IndexedDB
    try {
      const active = presets[activePresetIndex]
      if (active) {
        await db.presets.update(active.id, {
          [`controlSurface.${key}`]: val
        })
      }
    } catch (e) {
      console.error('Error updating preset slider in Dexie:', e)
    }
  }

  // Helper to trigger slot slider drag
  const handleSliderDrag = (
    e: React.PointerEvent,
    key: 'volValue' | 'vibValue' | 'dampingValue'
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const track = e.currentTarget
    const updateValue = (moveEvent: any) => {
      const rect = track.getBoundingClientRect()
      let val = 1 - (moveEvent.clientY - rect.top) / rect.height
      val = Math.max(0, Math.min(1, val))
      updatePresetValue(key, val)
    }

    updateValue(e)

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateValue(moveEvent)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Create layout configuration for KeyboardCanvas
  const layoutConfig: LayoutConfig = {
    rows: activePreset.rows,
    rowIntervalSemitones: activePreset.rows === 6 ? [5, 5, 5, 4, 5] : [5], // guitar vs standard fourths
    startMidiNote: activePreset.startMidiNote,
    keyWidth: 80,
    keyHeight: 120,
    rootNote: activePreset.rootNote,
    scale: isDiatonic ? activePreset.scale : SCALES.chromatic.degrees,
  }

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div className="header-left">
          <button className="hamburger-btn" onClick={() => setShowMenu(prev => !prev)}>
            ≡
          </button>
          <div className="preset-selector" onClick={() => setShowMenu(prev => !prev)}>
            <span className="preset-name">{activePreset.name}</span>
            <span style={{ fontSize: '10px' }}>▼</span>
          </div>
        </div>

        <div className="header-right">
          <button 
            className="nav-btn" 
            onClick={() => setShowSvara(prev => !prev)}
            style={{ color: showSvara ? '#ffd700' : '#888' }}
          >
            {showSvara ? 'SVARA' : 'WESTERN'}
          </button>
          <button 
            className="nav-btn" 
            onClick={() => setIsDiatonic(prev => !prev)}
            style={{ color: isDiatonic ? '#00e5ff' : '#888' }}
          >
            {isDiatonic ? 'DIATONIC' : 'CHROMATIC'}
          </button>
          <button className="settings-btn" onClick={() => selectPreset((activePresetIndex + 1) % presets.length)}>
            ⚙
          </button>
        </div>
      </header>

      {/* Preset Dropdown Menu */}
      {showMenu && (
        <div style={{
          position: 'absolute',
          top: '52px',
          left: '16px',
          backgroundColor: '#1a1a2e',
          border: '1px solid #31314d',
          borderRadius: '6px',
          zIndex: 100,
          boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}>
          {presets.map((preset, idx) => (
            <div
              key={preset.id}
              onClick={() => selectPreset(idx)}
              style={{
                padding: '12px 24px',
                cursor: 'pointer',
                color: idx === activePresetIndex ? '#ffd700' : '#e2e8f0',
                backgroundColor: idx === activePresetIndex ? '#262642' : 'transparent',
                fontWeight: idx === activePresetIndex ? 'bold' : 'normal',
                borderBottom: '1px solid #23233c'
              }}
            >
              {preset.name}
            </div>
          ))}
        </div>
      )}

      {/* Control Surface Panel */}
      <section className="control-surface">
        {/* XY Pad */}
        <div 
          className="xy-pad" 
          ref={xyPadRef}
          onPointerDown={handleXyPointerDown}
          onPointerMove={handleXyPointerMove}
          onPointerUp={handleXyPointerUp}
          onPointerCancel={handleXyPointerUp}
        >
          <div className="xy-pad-grid" />
          <div 
            className="xy-pad-crosshair" 
            style={{ 
              left: `${xyVal.x * 100}%`, 
              top: `${(1 - xyVal.y) * 100}%` 
            }} 
          />
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            fontSize: '9px',
            color: '#94a3b8',
            pointerEvents: 'none',
            fontWeight: 'bold'
          }}>
            XY MOD PAD
          </div>
        </div>

        {/* Whammy Pitch Bend */}
        <div 
          className="whammy-bar-container"
          ref={whammyRef}
          onPointerDown={handleWhammyPointerDown}
          onPointerMove={handleWhammyPointerMove}
          onPointerUp={handleWhammyPointerUp}
          onPointerCancel={handleWhammyPointerUp}
        >
          <div 
            className="whammy-bar" 
            style={{ 
              bottom: '4px',
              height: '8px',
              top: `${(1 - whammyVal) * 90}%`
            }} 
          />
          <div className="whammy-label">BEND</div>
        </div>

        {/* Dynamic Slot Sliders */}
        <div className="slots-container">
          <div className="slot-control">
            <span className="slot-label">VOLUME</span>
            <div 
              className="slot-slider-track"
              onPointerDown={(e) => handleSliderDrag(e, 'volValue')}
            >
              <div 
                className="slot-slider-fill" 
                style={{ height: `${activePreset.volValue * 100}%` }} 
              />
              <div 
                className="slot-slider-handle" 
                style={{ bottom: `${activePreset.volValue * 100}%` }} 
              />
            </div>
            <span className="slot-value">{Math.round(activePreset.volValue * 100)}%</span>
          </div>

          <div className="slot-control">
            <span className="slot-label">VIBRATO</span>
            <div 
              className="slot-slider-track"
              onPointerDown={(e) => handleSliderDrag(e, 'vibValue')}
            >
              <div 
                className="slot-slider-fill" 
                style={{ height: `${activePreset.vibValue * 100}%` }} 
              />
              <div 
                className="slot-slider-handle" 
                style={{ bottom: `${activePreset.vibValue * 100}%` }} 
              />
            </div>
            <span className="slot-value">{Math.round(activePreset.vibValue * 100)}%</span>
          </div>

          <div className="slot-control">
            <span className="slot-label">DAMPING</span>
            <div 
              className="slot-slider-track"
              onPointerDown={(e) => handleSliderDrag(e, 'dampingValue')}
            >
              <div 
                className="slot-slider-fill" 
                style={{ height: `${activePreset.dampingValue * 100}%` }} 
              />
              <div 
                className="slot-slider-handle" 
                style={{ bottom: `${activePreset.dampingValue * 100}%` }} 
              />
            </div>
            <span className="slot-value">{Math.round(activePreset.dampingValue * 100)}%</span>
          </div>
        </div>
      </section>

      {/* Keyboard Grid Panel */}
      <section className="keyboard-panel">
        <KeyboardCanvas 
          config={layoutConfig}
          voiceManager={voiceManagerRef.current}
          showSvara={showSvara}
        />
      </section>
    </div>
  )
}
