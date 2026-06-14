import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  HistoryAction,
  HistoryState,
  HistoryActionType,
  SoundingPoint,
  ContourLine
} from '@/types'
import { generateId } from '@/utils/geometry'

const MAX_HISTORY_SIZE = 100

type GetStateFn = () => { soundings: SoundingPoint[]; contours: ContourLine[] }
type ApplyStateFn = (state: HistoryState) => void

export const useHistoryStore = defineStore('history', () => {
  const actions = ref<HistoryAction[]>([])
  const currentIndex = ref<number>(-1)
  const isRestoring = ref(false)
  let getStateFn: GetStateFn | null = null
  let applyStateFn: ApplyStateFn | null = null

  const canUndo = computed(() => currentIndex.value >= 0)
  const canRedo = computed(() => currentIndex.value < actions.value.length - 1)

  const undoAction = computed<HistoryAction | null>(() =>
    canUndo.value ? actions.value[currentIndex.value] : null
  )

  const redoAction = computed<HistoryAction | null>(() =>
    canRedo.value ? actions.value[currentIndex.value + 1] : null
  )

  function registerStateHandlers(getFn: GetStateFn, applyFn: ApplyStateFn) {
    getStateFn = getFn
    applyStateFn = applyFn
  }

  function cloneState(state: HistoryState): HistoryState {
    return {
      soundings: JSON.parse(JSON.stringify(state.soundings)) as SoundingPoint[],
      contours: JSON.parse(JSON.stringify(state.contours)) as ContourLine[]
    }
  }

  function getCurrentState(): HistoryState {
    if (!getStateFn) {
      return { soundings: [], contours: [] }
    }
    return cloneState(getStateFn())
  }

  function recordAction(
    type: HistoryActionType,
    description: string,
    beforeState?: HistoryState
  ): HistoryAction | null {
    if (isRestoring.value) return null
    const before = beforeState ? cloneState(beforeState) : getCurrentState()
    const after = getCurrentState()

    const action: HistoryAction = {
      id: generateId(),
      type,
      timestamp: Date.now(),
      description,
      beforeState: before,
      afterState: after
    }

    if (currentIndex.value < actions.value.length - 1) {
      actions.value = actions.value.slice(0, currentIndex.value + 1)
    }

    actions.value.push(action)

    if (actions.value.length > MAX_HISTORY_SIZE) {
      const excess = actions.value.length - MAX_HISTORY_SIZE
      actions.value = actions.value.slice(excess)
      currentIndex.value -= excess
    } else {
      currentIndex.value = actions.value.length - 1
    }

    return action
  }

  function snapshotBefore(): HistoryState {
    return getCurrentState()
  }

  function undo(): boolean {
    if (!canUndo.value || !applyStateFn) return false
    isRestoring.value = true
    const action = actions.value[currentIndex.value]
    currentIndex.value--
    applyStateFn(cloneState(action.beforeState))
    isRestoring.value = false
    return true
  }

  function redo(): boolean {
    if (!canRedo.value || !applyStateFn) return false
    isRestoring.value = true
    currentIndex.value++
    const action = actions.value[currentIndex.value]
    applyStateFn(cloneState(action.afterState))
    isRestoring.value = false
    return true
  }

  function clearHistory() {
    actions.value = []
    currentIndex.value = -1
  }

  return {
    actions,
    currentIndex,
    isRestoring,
    canUndo,
    canRedo,
    undoAction,
    redoAction,
    registerStateHandlers,
    getCurrentState,
    recordAction,
    snapshotBefore,
    undo,
    redo,
    clearHistory
  }
})
