export interface DecaidProfileStep {
  name?: string
  temperature?: number
  seconds?: number
  duration?: number
  volume?: number
  weight?: number | null
  pressure?: number
  flow?: number
  pump?: string | { target?: string; pressure?: number; flow?: number }
  transition?: string | { type?: string; duration?: number; adaptive?: boolean }
  sensor?: 'coffee' | 'water' | string
  exit?: { type?: 'pressure' | 'flow' | string; condition?: 'over' | 'under' | string; value?: number } | null
  limiter?: { value?: number; range?: number } | null
  [key: string]: unknown
}
export interface DecaidProfile {
  version?: string | null
  title?: string
  category?: string
  beverage_type?: 'espresso' | 'calibrate' | 'cleaning' | 'manual' | 'pourover' | string
  description?: string
  notes?: string
  author?: string
  profile_notes?: string
  steps?: DecaidProfileStep[]
  target_weight?: number | null
  target_volume?: number | null
  target_volume_count_start?: number
  tank_temperature?: number
  dose_weight?: number | null
  [key: string]: unknown
}
export interface DecaidProfileRecord { id?: string; parentId?: string | null; profile?: DecaidProfile; visibility?: string; metadata?: Record<string, unknown> | null; isDefault?: boolean }
export type FavoriteAssignments = Record<string, string | null>
export interface DecaidWorkflowContext { targetDoseWeight?: number | null; targetYield?: number | null; grinderSetting?: string | null; beanBatchId?: string | null; coffeeName?: string | null; coffeeRoaster?: string | null }
export interface DecaidWorkflow {
  name?: string
  profile?: DecaidProfile
  context?: DecaidWorkflowContext
  steamSettings?: { targetTemperature?: number; duration?: number; flow?: number }
  hotWaterData?: { targetTemperature?: number; duration?: number; volume?: number; flow?: number }
  rinseData?: { targetTemperature?: number; duration?: number; flow?: number }
}
export type DecaidWorkflowPatch = Partial<Pick<DecaidWorkflow, 'profile' | 'context' | 'steamSettings' | 'hotWaterData' | 'rinseData'>>
export interface MachineSnapshot {
  timestamp?: string
  state?: string | { state?: string; substate?: string }
  flow?: number
  pressure?: number
  targetFlow?: number
  targetPressure?: number
  mixTemperature?: number
  groupTemperature?: number
  targetMixTemperature?: number
  targetGroupTemperature?: number
  profileFrame?: number
  steamTemperature?: number
}
export interface ScaleSnapshot { status?: 'connected' | 'disconnected'; timestamp?: string; weight?: number; weightFlow?: number; timerValue?: number | null }
export interface DecaidDevice { id?: string; name?: string; state?: 'connected' | 'disconnected'; type?: 'machine' | 'scale' | 'sensor'; available?: boolean }
export type ScalePowerMode = 'disabled' | 'displayOff' | 'disconnect'
export interface DecaidSettings { preferredScaleId?: string | null; blockTareDuringShot?: boolean; scalePowerMode?: ScalePowerMode }
export interface DecaidMachineSettings { flushTemp?: number; flushTimeout?: number; flushFlow?: number }
export interface DisplayState { brightness?: number; requestedBrightness?: number; platformSupported?: { brightness?: boolean; wakeLock?: boolean } }
export interface WaterLevels { currentLevel?: number; refillLevel?: number }
export interface TimeToReadyFrame { status?: string; remainingTimeMs?: number; currentTemp?: number; targetTemp?: number }
export interface ShotMeasurement {
  machine?: {
    timestamp?: string
    state?: { substate?: string }
    profileFrame?: number
    pressure?: number
    flow?: number
    targetPressure?: number
    targetFlow?: number
    mixTemperature?: number
    groupTemperature?: number
  }
  scale?: { weight?: number; weightFlow?: number }
}
export interface ShotRecord { id?: string; timestamp?: string; workflow?: DecaidWorkflow; measurements?: ShotMeasurement[]; annotations?: { actualYield?: number }; stopReason?: string | null }
export interface PaginatedShots { items: ShotRecord[]; total: number; limit: number; offset: number }

export interface Bean {
  id: string
  roaster: string
  name: string
  species?: string | null
  decaf: boolean
  decafProcess?: string | null
  country?: string | null
  region?: string | null
  producer?: string | null
  variety?: string[] | null
  altitude?: [number, number] | null
  processing?: string | null
  notes?: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}
export type CreateBeanInput = Pick<Bean, 'roaster' | 'name'> & Partial<Pick<Bean, 'species' | 'decaf' | 'decafProcess' | 'country' | 'region' | 'producer' | 'variety' | 'altitude' | 'processing' | 'notes' | 'extras'>>
export type UpdateBeanInput = Partial<Omit<Bean, 'id' | 'createdAt' | 'updatedAt'>>

export interface BeanBatch {
  id: string
  beanId: string
  roastDate?: string | null
  roastLevel?: string | null
  harvestDate?: string | null
  qualityScore?: number | null
  price?: number | null
  currency?: string | null
  weight?: number | null
  weightRemaining?: number | null
  buyDate?: string | null
  openDate?: string | null
  bestBeforeDate?: string | null
  freezeDate?: string | null
  unfreezeDate?: string | null
  frozen: boolean
  archived: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}
export type CreateBeanBatchInput = Partial<Omit<BeanBatch, 'id' | 'beanId' | 'weightRemaining' | 'archived' | 'createdAt' | 'updatedAt'>>
export type UpdateBeanBatchInput = Partial<Omit<BeanBatch, 'id' | 'beanId' | 'createdAt' | 'updatedAt'>>
