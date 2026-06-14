import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WorkspaceStatus, BaseMapLayer } from '@/types'
import { ToolType, ProjectStatus } from '@/types'
import { useValidationStore } from './validation'
import { useProjectStore } from './project'

export const DEFAULT_BASEMAPS: BaseMapLayer[] = [
  {
    id: 'carto-voyager',
    name: 'CARTO 航海图',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
  },
  {
    id: 'osm-standard',
    name: 'OpenStreetMap 标准',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  },
  {
    id: 'carto-light',
    name: 'CARTO 浅色',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
  },
  {
    id: 'carto-dark',
    name: 'CARTO 深色',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
  },
  {
    id: 'esri-satellite',
    name: 'ESRI 卫星影像',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Imagery',
    maxZoom: 19
  },
  {
    id: 'esri-ocean',
    name: 'ESRI 海洋图',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Ocean',
    maxZoom: 16
  },
  {
    id: 'esri-topo',
    name: 'ESRI 地形图',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Topographic',
    maxZoom: 19
  }
]

export const useWorkspaceStore = defineStore('workspace', () => {
  const status = ref<WorkspaceStatus>({
    isCompleted: false,
    hasCriticalErrors: false,
    projectStatus: ProjectStatus.DRAFT
  })
  const currentTool = ref<ToolType>(ToolType.NONE)
  const leftPanelCollapsed = ref(false)
  const rightPanelCollapsed = ref(false)
  const rightPanelTab = ref<'properties' | 'statistics' | 'validation' | 'projects'>('properties')
  const showDepthLabels = ref(true)
  const showSoundingPoints = ref(true)
  const showContourLines = ref(true)
  const mapCenter = ref<{ lat: number; lng: number }>({
    lat: 31.2304,
    lng: 121.4737
  })
  const mapZoom = ref(14)
  const defaultDepth = ref(10)
  const currentBasemapId = ref<string>('carto-voyager')
  const customBasemaps = ref<BaseMapLayer[]>([])

  const allBasemaps = computed(() => [...DEFAULT_BASEMAPS, ...customBasemaps.value])

  const currentBasemap = computed<BaseMapLayer>(() => {
    return (
      allBasemaps.value.find((b) => b.id === currentBasemapId.value) || DEFAULT_BASEMAPS[0]
    )
  })

  const canMarkCompleted = computed(() => {
    const validationStore = useValidationStore()
    return !validationStore.hasCriticalErrors
  })

  const canSubmitForReview = computed(() => {
    const validationStore = useValidationStore()
    return !validationStore.hasCriticalErrors && status.value.projectStatus === ProjectStatus.DRAFT
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

  function setRightPanelTab(tab: 'properties' | 'statistics' | 'validation' | 'projects') {
    rightPanelTab.value = tab
  }

  function setBasemap(basemapId: string) {
    if (allBasemaps.value.some((b) => b.id === basemapId)) {
      currentBasemapId.value = basemapId
    }
  }

  function addCustomBasemap(basemap: BaseMapLayer) {
    if (!customBasemaps.value.some((b) => b.id === basemap.id)) {
      customBasemaps.value.push(basemap)
    }
  }

  function removeCustomBasemap(basemapId: string) {
    customBasemaps.value = customBasemaps.value.filter((b) => b.id !== basemapId)
    if (currentBasemapId.value === basemapId) {
      currentBasemapId.value = 'carto-voyager'
    }
  }

  function markAsCompleted(): boolean {
    const validationStore = useValidationStore()
    const projectStore = useProjectStore()
    if (validationStore.hasCriticalErrors) {
      return false
    }
    status.value = {
      isCompleted: true,
      completedAt: Date.now(),
      hasCriticalErrors: false,
      projectStatus: ProjectStatus.COMPLETED
    }
    if (projectStore.currentProjectId) {
      projectStore.updateProjectStatus(projectStore.currentProjectId, ProjectStatus.COMPLETED)
    }
    return true
  }

  function unmarkCompleted() {
    const projectStore = useProjectStore()
    status.value = {
      isCompleted: false,
      hasCriticalErrors: false,
      projectStatus: ProjectStatus.DRAFT
    }
    if (projectStore.currentProjectId) {
      projectStore.updateProjectStatus(projectStore.currentProjectId, ProjectStatus.DRAFT)
    }
  }

  function submitForReview(): boolean {
    const validationStore = useValidationStore()
    const projectStore = useProjectStore()
    if (validationStore.hasCriticalErrors) {
      return false
    }
    status.value = {
      ...status.value,
      isCompleted: false,
      completedAt: undefined,
      projectStatus: ProjectStatus.PENDING_REVIEW,
      submittedAt: Date.now()
    }
    if (projectStore.currentProjectId) {
      projectStore.updateProjectStatus(projectStore.currentProjectId, ProjectStatus.PENDING_REVIEW)
    }
    return true
  }

  function cancelReview() {
    const projectStore = useProjectStore()
    status.value = {
      ...status.value,
      isCompleted: false,
      completedAt: undefined,
      projectStatus: ProjectStatus.DRAFT,
      submittedAt: undefined
    }
    if (projectStore.currentProjectId) {
      projectStore.updateProjectStatus(projectStore.currentProjectId, ProjectStatus.DRAFT)
    }
  }

  function markAsReviewed() {
    const projectStore = useProjectStore()
    status.value = {
      ...status.value,
      isCompleted: false,
      completedAt: undefined,
      projectStatus: ProjectStatus.REVIEWED
    }
    if (projectStore.currentProjectId) {
      projectStore.updateProjectStatus(projectStore.currentProjectId, ProjectStatus.REVIEWED)
    }
  }

  function updateMapCenter(lat: number, lng: number) {
    mapCenter.value = { lat, lng }
  }

  function updateMapZoom(zoom: number) {
    mapZoom.value = zoom
  }

  function setProjectStatus(statusVal: ProjectStatus) {
    status.value.projectStatus = statusVal
    if (statusVal === ProjectStatus.COMPLETED) {
      status.value.isCompleted = true
      if (!status.value.completedAt) {
        status.value.completedAt = Date.now()
      }
    } else {
      status.value.isCompleted = false
      status.value.completedAt = undefined
    }
  }

  function resetWorkspace() {
    status.value = {
      isCompleted: false,
      hasCriticalErrors: false,
      projectStatus: ProjectStatus.DRAFT
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
    currentBasemapId,
    customBasemaps,
    allBasemaps,
    currentBasemap,
    canMarkCompleted,
    canSubmitForReview,
    setTool,
    toggleLeftPanel,
    toggleRightPanel,
    setRightPanelTab,
    setBasemap,
    addCustomBasemap,
    removeCustomBasemap,
    markAsCompleted,
    unmarkCompleted,
    submitForReview,
    cancelReview,
    markAsReviewed,
    updateMapCenter,
    updateMapZoom,
    setProjectStatus,
    resetWorkspace
  }
})
