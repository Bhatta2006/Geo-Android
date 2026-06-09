import { useState, useRef, useEffect, useCallback } from 'react'
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
    name: 'On The Road',
    rows: 6,
    startMidiNote: 40, // E2
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
    name: 'Sitar Raga',
    rows: 4,
    startMidiNote: 48,
    scaleName: 'mayamalavagowla',
    scale: SCALES.mayamalavagowla.degrees,
    rootNote: 0,
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
    startMidiNote: 40,
    scaleName: 'major',
    scale: SCALES.major.degrees,
    rootNote: 0,
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

  // ALL useRef/useState hooks MUST be called unconditionally and in same order every render
  const [presets, setPresets] = useState<Preset[]>(FACTORY_PRESETS)
  const [activePresetIndex, setActivePresetIndex] = useState<number>(0)
  const [octave, setOctave] = useState<number>(2)
  const [showSvara, setShowSvara] = useState<boolean>(false)
  const [isDiatonic, setIsDiatonic] = useState<boolean>(FACTORY_PRESETS[0].diatonicEnabled)
  const [showPresetMenu, setShowPresetMenu] = useState<boolean>(false)
  const [playMode, setPlayMode] = useState<'String' | 'Poly' | 'Mono'>('String')

  const audioEngineRef = useRef(audioEngine)
  audioEngineRef.current = audioEngine

  // VoiceManager init using lazy ref — safe, no conditional hooks
  const voiceManagerRef = useRef<VoiceManager | null>(null)
  if (voiceManagerRef.current === null) {
    voiceManagerRef.current = new VoiceManager(audioEngineRef.current, 'string')
  }

  const activePreset = presets[activePresetIndex]

  // Dexie DB Sync on mount
  useEffect(() => {
    const syncDb = async () => {
      try {
        const count = await db.presets.count()
        if (count === 0) {
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
        console.error('DB sync error:', e)
      }
    }
    syncDb()
  }, [])

  useEffect(() => {
    setIsDiatonic(activePreset.diatonicEnabled)
  }, [activePreset])

  useEffect(() => {
    if (voiceManagerRef.current) {
      const mode = playMode === 'String' ? 'string' : playMode === 'Poly' ? 'poly' : 'mono'
      voiceManagerRef.current.setPlayMode(mode)
      voiceManagerRef.current.setConfig({
        snapEnabled: activePreset.snapEnabled,
        roundEnabled: activePreset.roundEnabled,
        slideSpeed: activePreset.slideSpeed,
        scale: isDiatonic ? activePreset.scale : SCALES.chromatic.degrees,
        temperamentOffsets: new Array(12).fill(0)
      })
    }
  }, [activePreset, isDiatonic, playMode])

  // Apply audio params whenever preset values change
  useEffect(() => {
    audioEngine.setMasterVolume(activePreset.volValue)
  }, [audioEngine, activePreset.volValue])

  useEffect(() => {
    const decay = 0.998 - activePreset.dampingValue * 0.015
    const brightness = 0.3 + (1 - activePreset.dampingValue) * 0.5
    audioEngine.setPhysicalModelParams({ decay, brightness })
  }, [audioEngine, activePreset.dampingValue])

  useEffect(() => {
    audioEngine.setVibratoDepth(activePreset.vibValue)
  }, [audioEngine, activePreset.vibValue])

  // Effect presets per instrument
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

  // Slider drag handler
  const updatePresetValue = useCallback(async (key: 'volValue' | 'vibValue' | 'dampingValue', val: number) => {
    setPresets(prev => prev.map((p, idx) =>
      idx === activePresetIndex ? { ...p, [key]: val } : p
    ))

    // Immediately apply to audio engine
    if (key === 'volValue') {
      audioEngine.setMasterVolume(val)
    } else if (key === 'vibValue') {
      audioEngine.setVibratoDepth(val)
    } else if (key === 'dampingValue') {
      const decay = 0.998 - val * 0.015
      const brightness = 0.3 + (1 - val) * 0.5
      audioEngine.setPhysicalModelParams({ decay, brightness })
    }

    try {
      const active = presets[activePresetIndex]
      if (active) {
        await db.presets.update(active.id, { [`controlSurface.${key}`]: val })
      }
    } catch (e) {
      console.error('Error updating preset slider:', e)
    }
  }, [audioEngine, activePresetIndex, presets])

  const handleSliderDrag = useCallback((
    e: React.PointerEvent,
    key: 'volValue' | 'vibValue' | 'dampingValue'
  ) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const track = e.currentTarget

    const updateValue = (evt: PointerEvent | React.PointerEvent) => {
      const rect = track.getBoundingClientRect()
      let val = 1 - (evt.clientY - rect.top) / rect.height
      val = Math.max(0, Math.min(1, val))
      updatePresetValue(key, val)
    }

    updateValue(e as unknown as PointerEvent)

    const onMove = (moveEvt: PointerEvent) => updateValue(moveEvt)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [updatePresetValue])

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    setShowPresetMenu(false)
  }

  // Layout config
  const layoutConfig: LayoutConfig = {
    rows: activePreset.rows,
    rowIntervalSemitones: activePreset.rows === 6 ? [5, 5, 5, 4, 5] : [5],
    startMidiNote: activePreset.startMidiNote + (octave - 2) * 12,
    keyWidth: 80,
    keyHeight: 120,
    rootNote: activePreset.rootNote,
    scale: isDiatonic ? activePreset.scale : SCALES.chromatic.degrees,
  }

  return (
    <div className="gs-app">
      {/* ═══ TOP TOOLBAR ═══ */}
      <header className="gs-toolbar">

        {/* Octave Selector */}
        <div className="gs-octave-group">
          <div className="gs-octave-label">Octave</div>
          <div className="gs-octave-controls">
            <button
              className="gs-octave-btn"
              onClick={() => setOctave(o => Math.max(0, o - 1))}
              aria-label="Decrease octave"
            >‹</button>
            <span className="gs-octave-value">{octave}</span>
            <button
              className="gs-octave-btn"
              onClick={() => setOctave(o => Math.min(6, o + 1))}
              aria-label="Increase octave"
            >›</button>
          </div>
          <div className="gs-auto-label">Auto</div>
        </div>

        {/* Expression / XY Pad */}
        <div className="gs-expr-group">
          <div className="gs-expr-label-row">
            <span className="gs-expr-title">Expression</span>
          </div>
          <div className="gs-expr-inner">
            {/* Circular XY pad */}
            <div className="gs-xy-container">
              <div className="gs-xy-labels">
                <span className="gs-xy-label-v">Guitar/Feedback</span>
              </div>
              <div className="gs-xy-pad" id="xy-pad">
                <div className="gs-xy-crosshair" style={{ left: '50%', top: '50%' }} />
                <div className="gs-xy-rings" />
              </div>
              <div className="gs-xy-label-h">Guitar/Distance</div>
            </div>

            {/* Vertical Sliders: Fret Excitation, Whammy, Vibrato, Depth, Filter */}
            {[
              { key: 'volValue' as const, label: 'Fret\nExcitation', val: activePreset.volValue, color: '#00e5ff' },
              { key: 'vibValue' as const, label: 'Whammy', val: activePreset.vibValue, color: '#ff6b35' },
              { key: 'dampingValue' as const, label: 'Vibrato\nDepth', val: activePreset.vibValue, color: '#00e5ff' },
            ].map(({ key, label, val, color }) => (
              <div className="gs-vslider-group" key={key}>
                <div className="gs-vslider-label">{label}</div>
                <div
                  className="gs-vslider-track"
                  id={`slider-${key}`}
                  onPointerDown={(e) => handleSliderDrag(e, key)}
                >
                  <div
                    className="gs-vslider-fill"
                    style={{ height: `${val * 100}%`, background: color }}
                  />
                  <div
                    className="gs-vslider-handle"
                    style={{ bottom: `calc(${val * 100}% - 6px)`, borderColor: color }}
                  />
                </div>
              </div>
            ))}

            {/* Filter slider (damping) */}
            <div className="gs-vslider-group">
              <div className="gs-vslider-label">Filter</div>
              <div
                className="gs-vslider-track"
                id="slider-filter"
                onPointerDown={(e) => handleSliderDrag(e, 'dampingValue')}
              >
                <div
                  className="gs-vslider-fill"
                  style={{ height: `${activePreset.dampingValue * 100}%`, background: '#4fc3f7' }}
                />
                <div
                  className="gs-vslider-handle"
                  style={{ bottom: `calc(${activePreset.dampingValue * 100}% - 6px)`, borderColor: '#4fc3f7' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mode Button Grid */}
        <div className="gs-mode-group">
          <div className="gs-mode-row">
            {['2nd\nHmonic', 'Piano'].map(m => (
              <button key={m} className="gs-mode-btn" style={{ whiteSpace: 'pre-line' }}>{m}</button>
            ))}
            <button className="gs-mode-btn gs-mode-active">Play\nTrack</button>
          </div>
          <div className="gs-mode-row">
            <button
              className={`gs-mode-btn ${!isDiatonic ? 'gs-mode-active' : ''}`}
              onClick={() => setIsDiatonic(false)}
            >Guitar</button>
            <button className="gs-mode-btn">Pinch\nHmonic\nOn\nRelease</button>
            <button
              className={`gs-mode-btn ${isDiatonic ? 'gs-mode-active' : ''}`}
              onClick={() => setIsDiatonic(true)}
            >Diatonic</button>
          </div>
          <div className="gs-mode-row">
            <button
              className={`gs-mode-btn ${showSvara ? 'gs-mode-active' : ''}`}
              onClick={() => setShowSvara(v => !v)}
            >Slide</button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="gs-right-group">
          <div className="gs-presets-label">All Presets Play</div>
          <div className="gs-track-row">
            <div className="gs-knob-group">
              <div className="gs-knob" />
              <div className="gs-knob-label">Track Vol</div>
            </div>
            <div className="gs-track-counter">
              <span className="gs-track-num">1/174</span>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="gs-preset-selector" onClick={() => setShowPresetMenu(v => !v)}>
            <span className="gs-preset-name">{activePreset.name}</span>
            <span className="gs-preset-arrow">▾</span>
          </div>

          <div className="gs-playmode-row">
            <span className="gs-playmode-label">Play Mode:</span>
            {(['String', 'Poly', 'Mono'] as const).map(m => (
              <button
                key={m}
                className={`gs-playmode-btn ${playMode === m ? 'gs-playmode-active' : ''}`}
                onClick={() => setPlayMode(m)}
              >{m}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Preset Dropdown */}
      {showPresetMenu && (
        <div className="gs-preset-dropdown">
          {presets.map((p, idx) => (
            <div
              key={p.id}
              className={`gs-preset-item ${idx === activePresetIndex ? 'gs-preset-item-active' : ''}`}
              onClick={() => selectPreset(idx)}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}

      {/* ═══ KEYBOARD GRID ═══ */}
      <main className="gs-keyboard">
        <KeyboardCanvas
          config={layoutConfig}
          voiceManager={voiceManagerRef.current}
          showSvara={showSvara}
        />
      </main>
    </div>
  )
}
