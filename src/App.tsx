import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { KeyboardCanvas } from './components/KeyboardCanvas'
import { useAudioEngine } from './engine/audio/useAudioEngine'
import { VoiceManager } from './engine/audio/VoiceManager'
import { DroneEngine } from './engine/audio/DroneEngine'
import { SampleEngine } from './engine/audio/SampleEngine'
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
  // Physical model instrument type + jawari / sympathetic params
  instrumentType: 'guitar' | 'veena_sitar'
  jawariAmount: number
  jawariThreshold: number
  sympatheticGain: number
  sympatheticDecay: number
  // KS loop params used by audio engine
  decayOverride?: number
  brightnessOverride?: number
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
    instrumentType: 'guitar',
    jawariAmount: 0.0,
    jawariThreshold: 0.2,
    sympatheticGain: 0.0,
    sympatheticDecay: 0.998,
  },
  {
    // Sitar preset — Mayamalavagowla raga, aggressive sitar buzz
    id: 'sitar-raga',
    name: 'Sitar Raga',
    rows: 4,
    startMidiNote: 48,
    scaleName: 'mayamalavagowla',
    scale: SCALES.mayamalavagowla.degrees,
    rootNote: 0,
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.05,
    diatonicEnabled: true,
    volValue: 0.75,
    vibValue: 0.1,
    dampingValue: 0.3,
    instrumentType: 'veena_sitar',
    jawariAmount: 0.65,
    jawariThreshold: 0.15,
    sympatheticGain: 0.2,
    sympatheticDecay: 0.9985,
    decayOverride: 0.99997,
    brightnessOverride: 0.80,
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
    instrumentType: 'guitar',
    jawariAmount: 0.0,
    jawariThreshold: 0.2,
    sympatheticGain: 0.0,
    sympatheticDecay: 0.998,
  },
  {
    // Xitar 1.5 — Mahesh Raghavan style
    id: 'xitar-mahesh',
    name: 'Xitar 1.5',
    rows: 4,
    startMidiNote: 48,
    scaleName: 'kharaharapriya',
    scale: SCALES.kharaharapriya.degrees,
    rootNote: 0,
    snapEnabled: true,
    roundEnabled: true,
    slideSpeed: 0.05,
    diatonicEnabled: true,
    volValue: 0.78,
    vibValue: 0.05,
    dampingValue: 0.2,
    instrumentType: 'veena_sitar',
    jawariAmount: 0.45,
    jawariThreshold: 0.18,
    sympatheticGain: 0.25,
    sympatheticDecay: 0.9985,
    decayOverride: 0.99998,
    brightnessOverride: 0.88,
  },
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
  const [droneOn, setDroneOn] = useState<boolean>(false)
  const [isVeenaMode, setIsVeenaMode] = useState<boolean>(false)

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)

  // Sample engine state
  const [sampleLoaded, setSampleLoaded] = useState<boolean>(false)
  const [sampleName, setSampleName] = useState<string>('')
  const [useSampleMode, setUseSampleMode] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const voiceManager = useMemo(() => new VoiceManager(audioEngine, 'string'), [audioEngine])
  const droneEngine = useMemo(() => new DroneEngine(audioEngine), [audioEngine])
  const sampleEngine = useMemo(() => new SampleEngine(), [])

  const activePreset = presets[activePresetIndex]

  const [prevPresetId, setPrevPresetId] = useState<string>(activePreset?.id)
  if (activePreset && activePreset.id !== prevPresetId) {
    setPrevPresetId(activePreset.id)
    setIsDiatonic(activePreset.diatonicEnabled)
  }

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
          dampingValue: p.controlSurface.dampingValue,
          // Physical model fields — fall back to guitar defaults for legacy DB entries
          instrumentType: (p.instrument?.type === 'veena_sitar' ? 'veena_sitar' : 'guitar') as 'guitar' | 'veena_sitar',
          jawariAmount: p.instrument?.parameters?.jawariAmount ?? 0.0,
          jawariThreshold: p.instrument?.parameters?.jawariThreshold ?? 0.2,
          sympatheticGain: p.instrument?.parameters?.sympatheticGain ?? 0.0,
          sympatheticDecay: 0.9985,
        }))
        setPresets(mapped)
      } catch (e) {
        console.error('DB sync error:', e)
      }
    }
    syncDb()
  }, [])

  // Initialize SampleEngine when AudioContext becomes available
  useEffect(() => {
    const ctx = audioEngine.getAudioContext()
    if (ctx) {
      sampleEngine.setContext(ctx)
    }
  }, [audioEngine, sampleEngine])

  // Re-init sample engine context on every unlock (in case ctx was created late)
  useEffect(() => {
    const interval = setInterval(() => {
      const ctx = audioEngine.getAudioContext()
      if (ctx && !sampleEngine.isLoaded) {
        sampleEngine.setContext(ctx)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [audioEngine, sampleEngine])

  // Wire sample engine into voice manager
  useEffect(() => {
    voiceManager.setSampleEngine(sampleEngine)
  }, [voiceManager, sampleEngine])

  // Sync sample mode toggle
  useEffect(() => {
    voiceManager.setSampleMode(useSampleMode && sampleLoaded)
  }, [voiceManager, useSampleMode, sampleLoaded])

  useEffect(() => {
    const mode = playMode === 'String' ? 'string' : playMode === 'Poly' ? 'poly' : 'mono'
    voiceManager.setPlayMode(mode)
    const effectiveStartMidi = activePreset.startMidiNote + (octave - 2) * 12
    const effectiveRowIntervals = activePreset.rows === 6 ? [5, 5, 5, 4, 5] : [5]
    voiceManager.setConfig({
      snapEnabled: activePreset.snapEnabled,
      roundEnabled: activePreset.roundEnabled,
      slideSpeed: activePreset.slideSpeed,
      scale: isDiatonic ? activePreset.scale : SCALES.chromatic.degrees,
      temperamentOffsets: new Array(12).fill(0),
      startMidiNote: effectiveStartMidi,
      rowIntervals: effectiveRowIntervals,
    })
  }, [voiceManager, activePreset, isDiatonic, playMode, octave])

  // Apply audio params whenever preset values change
  useEffect(() => {
    audioEngine.setMasterVolume(activePreset.volValue)
  }, [audioEngine, activePreset.volValue])

  useEffect(() => {
    const baseDecay = activePreset.decayOverride ?? (0.99996 - activePreset.dampingValue * 0.0001)
    const decay = isVeenaMode ? Math.max(baseDecay, 0.99998) : baseDecay
    const brightness = activePreset.brightnessOverride ?? (0.3 + (1 - activePreset.dampingValue) * 0.5)
    audioEngine.setPhysicalModelParams({ decay, brightness })
  }, [audioEngine, activePreset.dampingValue, activePreset.decayOverride, activePreset.brightnessOverride, isVeenaMode])

  useEffect(() => {
    audioEngine.setVibratoDepth(activePreset.vibValue)
  }, [audioEngine, activePreset.vibValue])

  // Wire instrument type (jawari) + sympathetic parameters
  useEffect(() => {
    const instrumentType = isVeenaMode ? 'veena_sitar' : activePreset.instrumentType
    const jawariAmount = isVeenaMode ? 0.45 : activePreset.jawariAmount
    const jawariThreshold = isVeenaMode ? 0.18 : activePreset.jawariThreshold

    audioEngine.setInstrumentParams({
      type: instrumentType,
      jawariAmount,
      jawariThreshold,
    })

    const useVeena = instrumentType === 'veena_sitar'
    const scale = useVeena
      ? (isDiatonic ? activePreset.scale : SCALES.chromatic.degrees)
      : []
    audioEngine.setSympatheticParams(
      scale,
      activePreset.startMidiNote + activePreset.rootNote,
      useVeena ? 0.2 : activePreset.sympatheticGain,
      activePreset.sympatheticDecay,
    )
  }, [audioEngine, activePreset, isDiatonic, isVeenaMode])

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

  // Slider drag handler (horizontal sliders now)
  const updatePresetValue = useCallback(async (key: 'volValue' | 'vibValue' | 'dampingValue', val: number) => {
    setPresets(prev => prev.map((p, idx) =>
      idx === activePresetIndex ? { ...p, [key]: val } : p
    ))

    if (key === 'volValue') {
      audioEngine.setMasterVolume(val)
    } else if (key === 'vibValue') {
      audioEngine.setVibratoDepth(val)
    } else if (key === 'dampingValue') {
      const baseDecay = 0.99996 - val * 0.0001
      const decay = isVeenaMode ? Math.max(baseDecay, 0.99998) : baseDecay
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
  }, [audioEngine, activePresetIndex, presets, isVeenaMode])

  // Horizontal slider drag handler
  const handleHSliderDrag = useCallback((
    e: React.PointerEvent,
    key: 'volValue' | 'vibValue' | 'dampingValue'
  ) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const track = e.currentTarget

    const updateValue = (evt: PointerEvent | React.PointerEvent) => {
      const rect = track.getBoundingClientRect()
      let val = (evt.clientX - rect.left) / rect.width
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

  // Drone toggle handler
  const toggleDrone = useCallback(() => {
    if (droneEngine.active) {
      droneEngine.stop()
      setDroneOn(false)
    } else {
      const rootMidi = activePreset.startMidiNote + activePreset.rootNote + (octave - 2) * 12
      droneEngine.start(rootMidi)
      setDroneOn(true)
    }
  }, [droneEngine, activePreset, octave])

  // Retune drone when octave or preset changes while drone is active
  useEffect(() => {
    if (droneEngine.active) {
      const rootMidi = activePreset.startMidiNote + activePreset.rootNote + (octave - 2) * 12
      droneEngine.setRootMidi(rootMidi)
    }
  }, [droneEngine, octave, activePreset])

  // Stop drone when component unmounts
  useEffect(() => {
    return () => { droneEngine.stop() }
  }, [droneEngine])

  // Re-unlock AudioContext when page becomes visible again
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        audioEngine.unlockAudio()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [audioEngine])

  // Sample upload handler
  const handleSampleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Ensure AudioContext exists
    audioEngine.unlockAudio()
    // Wait a tick for context to be created
    await new Promise(r => setTimeout(r, 100))

    const ctx = audioEngine.getAudioContext()
    if (ctx) {
      sampleEngine.setContext(ctx)
    }

    try {
      await sampleEngine.loadSample(file)
      setSampleLoaded(true)
      setSampleName(file.name)
      console.log(`[App] Sample loaded: ${file.name}`)
    } catch (err) {
      console.error('Failed to load sample:', err)
      setSampleLoaded(false)
      setSampleName('')
    }
  }, [audioEngine, sampleEngine])

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

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const renderSlider = (
    key: 'volValue' | 'vibValue' | 'dampingValue',
    label: string,
    val: number
  ) => (
    <div className="gs-slider-row" key={key}>
      <span className="gs-slider-label">{label}</span>
      <div
        className="gs-slider-track"
        id={`slider-${key}`}
        onPointerDown={(e) => handleHSliderDrag(e, key)}
      >
        <div className="gs-slider-fill" style={{ width: `${val * 100}%` }} />
        <div className="gs-slider-handle" style={{ left: `${val * 100}%` }} />
      </div>
      <span className="gs-slider-value">{Math.round(val * 100)}</span>
    </div>
  )

  return (
    <div className="gs-app">
      {/* ═══ HAMBURGER MENU BUTTON ═══ */}
      <button
        className={`gs-menu-btn ${drawerOpen ? 'gs-menu-open' : ''}`}
        onClick={() => setDrawerOpen(v => !v)}
        aria-label={drawerOpen ? 'Close settings' : 'Open settings'}
      >
        {drawerOpen ? '✕' : '☰'}
      </button>

      {/* ═══ BACKDROP ═══ */}
      <div
        className={`gs-backdrop ${drawerOpen ? 'gs-backdrop-visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ═══ SETTINGS DRAWER ═══ */}
      <div className={`gs-drawer ${drawerOpen ? 'gs-drawer-open' : ''}`}>
        <div className="gs-drawer-header">
          <span className="gs-drawer-title">Settings</span>
          <button className="gs-drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>

        {/* Instrument Toggle */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Instrument</div>
          <div className="gs-instrument-row">
            <button
              className={`gs-instrument-btn ${!isVeenaMode && !useSampleMode ? 'gs-instrument-active' : ''}`}
              onClick={() => { setIsVeenaMode(false); setUseSampleMode(false) }}
            >🎸 Guitar</button>
            <button
              className={`gs-instrument-btn ${isVeenaMode && !useSampleMode ? 'gs-instrument-active' : ''}`}
              onClick={() => { setIsVeenaMode(true); setUseSampleMode(false) }}
            >🪕 Veena</button>
            <button
              className={`gs-instrument-btn ${useSampleMode ? 'gs-instrument-active' : ''}`}
              onClick={() => { if (sampleLoaded) setUseSampleMode(true) }}
              style={{ opacity: sampleLoaded ? 1 : 0.4 }}
            >🎵 Sample</button>
          </div>
        </div>

        {/* Sample Upload */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">User Sample (C4 Note)</div>
          <div className="gs-sample-upload">
            <button
              className={`gs-sample-btn ${sampleLoaded ? 'gs-sample-loaded' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {sampleLoaded ? `✓ ${sampleName}` : '+ Upload C4 Sample'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleSampleUpload}
              style={{ display: 'none' }}
            />
            <div className="gs-sample-hint">
              Upload a WAV/MP3 of a single C4 note. All other notes will be pitch-shifted from it.
            </div>
          </div>
        </div>

        {/* Octave */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Octave</div>
          <div className="gs-octave-row">
            <button
              className="gs-octave-btn"
              onClick={() => setOctave(o => Math.max(0, o - 1))}
            >‹</button>
            <span className="gs-octave-value">{octave}</span>
            <button
              className="gs-octave-btn"
              onClick={() => setOctave(o => Math.min(6, o + 1))}
            >›</button>
          </div>
        </div>

        {/* Sliders */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Controls</div>
          {renderSlider('volValue', 'Volume', activePreset.volValue)}
          {renderSlider('vibValue', 'Vibrato', activePreset.vibValue)}
          {renderSlider('dampingValue', 'Damping', activePreset.dampingValue)}
        </div>

        {/* Mode Buttons */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Scale Mode</div>
          <div className="gs-mode-row">
            <button
              className={`gs-mode-btn ${!isDiatonic ? 'gs-mode-active' : ''}`}
              onClick={() => setIsDiatonic(false)}
            >Chromatic</button>
            <button
              className={`gs-mode-btn ${isDiatonic ? 'gs-mode-active' : ''}`}
              onClick={() => setIsDiatonic(true)}
            >Diatonic</button>
            <button
              className={`gs-mode-btn ${showSvara ? 'gs-mode-active' : ''}`}
              onClick={() => setShowSvara(v => !v)}
            >Svara</button>
            <button
              className={`gs-mode-btn ${droneOn ? 'gs-mode-active' : ''}`}
              onClick={toggleDrone}
            >♪ Drone</button>
          </div>
        </div>

        {/* Play Mode */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Play Mode</div>
          <div className="gs-playmode-row">
            {(['String', 'Poly', 'Mono'] as const).map(m => (
              <button
                key={m}
                className={`gs-playmode-btn ${playMode === m ? 'gs-playmode-active' : ''}`}
                onClick={() => setPlayMode(m)}
              >{m}</button>
            ))}
          </div>
        </div>

        {/* Preset Selector */}
        <div className="gs-drawer-section">
          <div className="gs-section-title">Preset</div>
          <div className="gs-preset-selector" onClick={() => setShowPresetMenu(v => !v)}>
            <span className="gs-preset-name">{activePreset.name}</span>
            <span className="gs-preset-arrow">▾</span>
          </div>
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
        </div>
      </div>

      {/* ═══ FULLSCREEN KEYBOARD ═══ */}
      <main className="gs-keyboard">
        <KeyboardCanvas
          config={layoutConfig}
          voiceManager={voiceManager}
          showSvara={showSvara}
          audioEngine={audioEngine}
        />
      </main>
    </div>
  )
}
