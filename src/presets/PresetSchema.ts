import Dexie from 'dexie'

export interface Preset {
  id: string
  name: string
  version: number
  color: 'white' | 'yellow' | 'red'
  instrument: {
    type: string
    parameters: {
      stiffness: number
      brightness: number
      decay: number
      pluckPosition: number
      feedback: number
      jawariAmount?: number
      jawariThreshold?: number
      sympatheticGain?: number
    }
  }
  performanceSettings: {
    rows: number
    startMidiNote: number
    scaleName: string
    rootNote: number
    snapEnabled: boolean
    roundEnabled: boolean
    slideSpeed: number
    diatonicEnabled: boolean
  }
  controlSurface: {
    volValue: number
    vibValue: number
    dampingValue: number
  }
}

export interface Setlist {
  id: string
  name: string
  presets: { presetId: string; name: string }[]
}

class GeoShredDB extends Dexie {
  presets!: Dexie.Table<Preset, string>
  setlists!: Dexie.Table<Setlist, string>

  constructor() {
    super('GeoShredWeb')
    this.version(1).stores({
      presets: 'id, name, color',
      setlists: 'id, name',
    })
  }
}

export const db = new GeoShredDB()
export type { GeoShredDB }
