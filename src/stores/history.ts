import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  HistoryAction,
  HistoryState,
  HistoryActionType
} from '@/types'
import { generateId } from '@/utils/geometry'
import { useSoundingStore } from './sounding'
import { useContourStore } from './contour'
import { useSectionStore } from './section'
import { useValidationStore } from './validation'

const MAX_HISTORY_SIZE = 100

export const useHistoryStore = defineStore('history', () => {
  const actions = ref<HistoryAction[]>([])
  const currentIndex = ref<number>(-1)
  const isRestoring = ref(false)

  const canUndo = computed(() => currentIndex.value >= 0)
  const canRedo = computed(() => currentIndex.value < actions.value.length - 1)

  const undoAction = computed<HistoryAction | null>(() =>
    canUndo.value ? actions.value[currentIndex.value] : null
  )

  const redoAction = computed<HistoryAction | null>(() =>
    canRedo.value ? actions.value[currentIndex.value + 1] : null
  )

  function cloneState(state: HistoryState): HistoryState {
    return {
      soundings: JSON.parse(JSON.stringify(state.soundings)),
      contours: JSON.parse(JSON.stringify(state.contours)),
      sections: JSON.parse(JSON.stringify(state.sections || []))
    }
  }

  function snapshot(): HistoryState {
    const soundingStore = useSoundingStore()
    const contourStore = useContourStore()
    const sectionStore = useSectionStore()
    return {
      soundings: JSON.parse(JSON.stringify(soundingStore.points)),
      contours: JSON.parse(JSON.stringify(contourStore.lines)),
      sections: JSON.parse(JSON.stringify(sectionStore.sections))
    }
  }

  function applyState(state: HistoryState): void {
    const soundingStore = useSoundingStore()
    const contourStore = useContourStore()
    const sectionStore = useSectionStore()
    const validationStore = useValidationStore()

    soundingStore.clearAll()
    contourStore.clearAll()
    sectionStore.clearAll()
    state.soundings.forEach((p) => soundingStore.points.push(p))
    state.contours.forEach((l) => contourStore.lines.push(l))
    if (state.sections && Array.isArray(state.sections)) {
      state.sections.forEach((s) => sectionStore.sections.push(s))
    }
    validationStore.runFullValidation()
    if (sectionStore.selectedSectionId) {
      sectionStore.analyzeSection(sectionStore.selectedSectionId)
    }
  }

  function recordAction(
    type: HistoryActionType,
    description: string,
    beforeState?: HistoryState
  ): HistoryAction | null {
    if (isRestoring.value) return null
    const before = beforeState ? cloneState(beforeState) : snapshot()
    const after = snapshot()

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
    return snapshot()
  }

  function undo(): boolean {
    if (!canUndo.value) return false
    isRestoring.value = true
    const action = actions.value[currentIndex.value]
    currentIndex.value--
    applyState(cloneState(action.beforeState))
    isRestoring.value = false
    return true
  }

  function redo(): boolean {
    if (!canRedo.value) return false
    isRestoring.value = true
    currentIndex.value++
    const action = actions.value[currentIndex.value]
    applyState(cloneState(action.afterState))
    isRestoring.value = false
    return true
  }

  function clearHistory() {
    actions.value = []
    currentIndex.value = -1
  }

  function recordWith<T>(
    type: HistoryActionType,
    description: string,
    operation: () => T
  ): T | null {
    if (isRestoring.value) return operation()
    const before = snapshot()
    const result = operation()
    recordAction(type, description, before)
    return result
  }

  return {
    actions,
    currentIndex,
    isRestoring,
    canUndo,
    canRedo,
    undoAction,
    redoAction,
    snapshot,
    snapshotBefore,
    recordAction,
    recordWith,
    undo,
    redo,
    clearHistory
  }
})
