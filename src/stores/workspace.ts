import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WorkspaceStatus } from '@/types'
import { ToolType } from '@/types'
import { useValidationStore } from './validation'

export const useWorkspaceStore = defineStore('workspace', () => {
  const status = ref<WorkspaceStatus>({
    isCompleted: false,
    hasCriticalErrors: false
  })
  const currentTool = ref<ToolType>(ToolType.NONE)
  const leftPanelCollapsed = ref(false)
  const rightPanelCollapsed = ref(false)
  const rightPanelTab = ref<'properties' | 'statistics' | 'validation'>('properties')
  const showDepthLabels = ref(true)
  const showSoundingPoints = ref(true)
  const showContourLines = ref(true)
  const mapCenter = ref<{ lat: number; lng: number }>({
    lat: 31.2304,
    lng: 121.4737
  })
  const mapZoom = ref(14)
  const defaultDepth = ref(10)

  const canMarkCompleted = computed(() => {
    const validationStore = useValidationStore()
    return !validationStore.hasCriticalErrors
  })

  function setTool(tool: ToolType) {
    currentTool.value = tool
  }

  function toggleLeftPanel() {
    leftPanelCollapsed.value = !leftPanelCollapsed.value
  }

  function toggleRightPanel() {
    rightPanelCollapsed.value = !rightPanelCollapsed.value
  }

  function setRightPanelTab(tab: 'properties' | 'statistics' | 'validation') {
    rightPanelTab.value = tab
  }

  function markAsCompleted(): boolean {
    const validationStore = useValidationStore()
    if (validationStore.hasCriticalErrors) {
      return false
    }
    status.value = {
      isCompleted: true,
      completedAt: Date.now(),
      hasCriticalErrors: false
    }
    return true
  }

  function unmarkCompleted() {
    status.value = {
      isCompleted: false,
      hasCriticalErrors: false
    }
  }

  function updateMapCenter(lat: number, lng: number) {
    mapCenter.value = { lat, lng }
  }

  function updateMapZoom(zoom: number) {
    mapZoom.value = zoom
  }

  function resetWorkspace() {
    status.value = {
      isCompleted: false,
      hasCriticalErrors: false
    }
    currentTool.value = ToolType.NONE
  }

  return {
    status,
    currentTool,
    leftPanelCollapsed,
    rightPanelCollapsed,
    rightPanelTab,
    showDepthLabels,
    showSoundingPoints,
    showContourLines,
    mapCenter,
    mapZoom,
    defaultDepth,
    canMarkCompleted,
    setTool,
    toggleLeftPanel,
    toggleRightPanel,
    setRightPanelTab,
    markAsCompleted,
    unmarkCompleted,
    updateMapCenter,
    updateMapZoom,
    resetWorkspace
  }
})
