import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  SectionLine,
  SectionSoundingPoint,
  ContourCrossing,
  SlopeSegment,
  SectionStatistics,
  SectionAnalysisResult,
  LatLng,
  ContourLine,
  BatchSectionExportOptions
} from '@/types'
import { generateId, distance, findNearestPointOnLine, segmentsIntersect } from '@/utils/geometry'
import { useSoundingStore } from './sounding'
import { useContourStore } from './contour'

const ABNORMAL_SLOPE_THRESHOLD = 0.3
const SLOPE_SEGMENT_MIN_LENGTH = 10

const DEFAULT_COLORS = [
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#009688',
  '#4caf50',
  '#ff9800',
  '#f44336',
  '#00bcd4'
]

export const useSectionStore = defineStore('section', () => {
  const sections = ref<SectionLine[]>([])
  const selectedSectionId = ref<string | null>(null)
  const drawingPoints = ref<LatLng[]>([])
  const isDrawing = ref(false)
  const analysisResult = ref<SectionAnalysisResult | null>(null)
  const slopeThreshold = ref(ABNORMAL_SLOPE_THRESHOLD)
  const editingSectionId = ref<string | null>(null)
  const editingNodeIndex = ref<number | null>(null)
  const nextColorIndex = ref(0)

  const selectedSection = computed(() =>
    sections.value.find((s) => s.id === selectedSectionId.value) || null
  )

  const sectionCount = computed(() => sections.value.length)

  const activeSections = computed(() =>
    sections.value.filter((s) => !s.isArchived)
  )

  const archivedSections = computed(() =>
    sections.value.filter((s) => s.isArchived)
  )

  const availableColors = computed(() => [...DEFAULT_COLORS])

  function getNextColor(): string {
    const color = DEFAULT_COLORS[nextColorIndex.value % DEFAULT_COLORS.length]
    nextColorIndex.value++
    return color
  }

  function startDrawing() {
    drawingPoints.value = []
    isDrawing.value = true
    analysisResult.value = null
    stopEditingNodes()
  }

  function addDrawingPoint(point: LatLng) {
    if (!isDrawing.value) return
    drawingPoints.value.push({ ...point })
  }

  function finishDrawing(): SectionLine | null {
    if (!isDrawing.value || drawingPoints.value.length < 2) {
      cancelDrawing()
      return null
    }
    const now = Date.now()
    const newSection: SectionLine = {
      id: generateId(),
      name: `断面 ${activeSections.value.length + 1}`,
      points: [...drawingPoints.value],
      createdAt: now,
      updatedAt: now,
      color: getNextColor()
    }
    sections.value.push(newSection)
    selectedSectionId.value = newSection.id
    isDrawing.value = false
    drawingPoints.value = []
    analyzeSection(newSection.id)
    return newSection
  }

  function cancelDrawing() {
    isDrawing.value = false
    drawingPoints.value = []
  }

  function selectSection(id: string | null) {
    selectedSectionId.value = id
    if (id) {
      analyzeSection(id)
    } else {
      analysisResult.value = null
    }
  }

  function startEditingNodes(sectionId: string) {
    editingSectionId.value = sectionId
    editingNodeIndex.value = null
    selectedSectionId.value = sectionId
  }

  function stopEditingNodes() {
    editingSectionId.value = null
    editingNodeIndex.value = null
  }

  function updateNode(sectionId: string, nodeIndex: number, newPosition: LatLng) {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section || nodeIndex < 0 || nodeIndex >= section.points.length) return
    section.points[nodeIndex] = { ...newPosition }
    section.updatedAt = Date.now()
    if (selectedSectionId.value === sectionId) {
      analyzeSection(sectionId)
    }
  }

  function addNode(sectionId: string, position: LatLng, insertIndex?: number) {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section) return
    const idx = insertIndex !== undefined ? insertIndex : section.points.length - 1
    section.points.splice(idx + 1, 0, { ...position })
    section.updatedAt = Date.now()
    if (selectedSectionId.value === sectionId) {
      analyzeSection(sectionId)
    }
  }

  function removeNode(sectionId: string, nodeIndex: number) {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section || section.points.length <= 3) return
    section.points.splice(nodeIndex, 1)
    section.updatedAt = Date.now()
    if (selectedSectionId.value === sectionId) {
      analyzeSection(sectionId)
    }
  }

  function deleteSection(id: string) {
    sections.value = sections.value.filter((s) => s.id !== id)
    if (selectedSectionId.value === id) {
      selectedSectionId.value = null
      analysisResult.value = null
    }
    if (editingSectionId.value === id) {
      stopEditingNodes()
    }
  }

  function updateSection(id: string, updates: Partial<SectionLine>) {
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    sections.value[idx] = {
      ...sections.value[idx],
      ...updates,
      updatedAt: Date.now()
    }
    if (selectedSectionId.value === id) {
      analyzeSection(id)
    }
  }

  function updateSectionColor(id: string, color: string) {
    updateSection(id, { color })
  }

  function updateSectionName(id: string, name: string) {
    updateSection(id, { name })
  }

  function toggleArchiveSection(id: string) {
    const section = sections.value.find((s) => s.id === id)
    if (!section) return
    section.isArchived = !section.isArchived
    section.updatedAt = Date.now()
    if (section.isArchived && selectedSectionId.value === id) {
      selectedSectionId.value = null
      analysisResult.value = null
    }
    if (section.isArchived && editingSectionId.value === id) {
      stopEditingNodes()
    }
  }

  function clearAll() {
    sections.value = []
    selectedSectionId.value = null
    drawingPoints.value = []
    isDrawing.value = false
    analysisResult.value = null
    stopEditingNodes()
    nextColorIndex.value = 0
  }

  function getSectionLength(points: LatLng[]): number {
    let total = 0
    for (let i = 0; i < points.length - 1; i++) {
      total += distance(points[i], points[i + 1])
    }
    return total
  }

  function getDistanceAlongLine(points: LatLng[], targetPoint: LatLng): number {
    let accumulated = 0
    for (let i = 0; i < points.length - 1; i++) {
      const segStart = points[i]
      const segEnd = points[i + 1]
      const segLength = distance(segStart, segEnd)
      const nearest = findNearestPointOnLine(targetPoint, [segStart, segEnd])
      if (nearest) {
        const t = nearest.distance < 1000
          ? (() => {
              const d = distance(segStart, nearest.point)
              return segLength > 0 ? d / segLength : 0
            })()
          : 0
        if (t >= 0 && t <= 1) {
          return accumulated + distance(segStart, nearest.point)
        }
      }
      accumulated += segLength
    }
    return accumulated
  }

  function collectSoundingPoints(sectionPoints: LatLng[]): SectionSoundingPoint[] {
    const soundingStore = useSoundingStore()
    const result: SectionSoundingPoint[] = []
    const sectionLength = getSectionLength(sectionPoints)

    for (const sp of soundingStore.points) {
      const nearest = findNearestPointOnLine(sp.position, sectionPoints)
      if (nearest && nearest.distance < 500) {
        const dist = getDistanceAlongLine(sectionPoints, nearest.point)
        result.push({
          point: sp,
          distance: Math.max(0, Math.min(sectionLength, dist)),
          projectedPosition: nearest.point
        })
      }
    }

    return result.sort((a, b) => a.distance - b.distance)
  }

  function findContourCrossings(sectionPoints: LatLng[]): ContourCrossing[] {
    const contourStore = useContourStore()
    const crossings: ContourCrossing[] = []
    const sectionLength = getSectionLength(sectionPoints)

    for (const contour of contourStore.lines) {
      for (let i = 0; i < sectionPoints.length - 1; i++) {
        const secStart = sectionPoints[i]
        const secEnd = sectionPoints[i + 1]

        for (let j = 0; j < contour.points.length - 1; j++) {
          const conStart = contour.points[j]
          const conEnd = contour.points[j + 1]

          const intersection = segmentsIntersect(secStart, secEnd, conStart, conEnd)
          if (intersection) {
            const dist = getDistanceAlongLine(sectionPoints, intersection)
            const prevDepth = j > 0 ? getApproxDepthAtPoint(contour.points[j - 1], contourStore.lines) : contour.depth
            const direction: 'ascending' | 'descending' = prevDepth > contour.depth ? 'ascending' : 'descending'

            crossings.push({
              contourId: contour.id,
              contourDepth: contour.depth,
              position: intersection,
              distance: Math.max(0, Math.min(sectionLength, dist)),
              direction
            })
          }
        }
      }
    }

    return crossings.sort((a, b) => a.distance - b.distance)
  }

  function getApproxDepthAtPoint(point: LatLng, contours: ContourLine[]): number {
    let minDist = Infinity
    let nearestDepth = 0
    for (const c of contours) {
      const nearest = findNearestPointOnLine(point, c.points)
      if (nearest && nearest.distance < minDist) {
        minDist = nearest.distance
        nearestDepth = c.depth
      }
    }
    return nearestDepth
  }

  function calculateSlopeSegments(
    soundingPoints: SectionSoundingPoint[],
    threshold: number
  ): SlopeSegment[] {
    if (soundingPoints.length < 2) return []

    const segments: SlopeSegment[] = []

    for (let i = 0; i < soundingPoints.length - 1; i++) {
      const start = soundingPoints[i]
      const end = soundingPoints[i + 1]
      const length = end.distance - start.distance

      if (length < SLOPE_SEGMENT_MIN_LENGTH) continue

      const depthDiff = end.point.depth - start.point.depth
      const slope = Math.abs(depthDiff) / length
      const slopeAngle = Math.atan(slope) * (180 / Math.PI)

      segments.push({
        startDistance: start.distance,
        endDistance: end.distance,
        startDepth: start.point.depth,
        endDepth: end.point.depth,
        slope,
        slopeAngle,
        length,
        isAbnormal: slope > threshold
      })
    }

    return segments
  }

  function calculateStatistics(
    sectionPoints: LatLng[],
    soundingPoints: SectionSoundingPoint[],
    contourCrossings: ContourCrossing[],
    slopeSegments: SlopeSegment[]
  ): SectionStatistics {
    const totalLength = getSectionLength(sectionPoints)
    const depths = soundingPoints.map((sp) => sp.point.depth)

    const minDepth = depths.length > 0 ? Math.min(...depths) : 0
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0
    const avgDepth = depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0
    const depthRange = maxDepth - minDepth

    const slopes = slopeSegments.map((s) => s.slope)
    const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0
    const maxSlopeAngle = slopeSegments.length > 0 ? Math.max(...slopeSegments.map((s) => s.slopeAngle)) : 0
    const avgSlope = slopes.length > 0 ? slopes.reduce((a, b) => a + b, 0) / slopes.length : 0

    const abnormalCount = slopeSegments.filter((s) => s.isAbnormal).length

    return {
      totalLength,
      minDepth,
      maxDepth,
      avgDepth,
      depthRange,
      maxSlope,
      maxSlopeAngle,
      avgSlope,
      soundingCount: soundingPoints.length,
      contourCrossingCount: contourCrossings.length,
      abnormalSlopeCount: abnormalCount
    }
  }

  function analyzeSection(sectionId: string): SectionAnalysisResult | null {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section) return null

    const soundingPoints = collectSoundingPoints(section.points)
    const contourCrossings = findContourCrossings(section.points)
    const slopeSegments = calculateSlopeSegments(soundingPoints, slopeThreshold.value)
    const statistics = calculateStatistics(
      section.points,
      soundingPoints,
      contourCrossings,
      slopeSegments
    )

    const result: SectionAnalysisResult = {
      sectionId: section.id,
      sectionName: section.name,
      linePoints: section.points,
      soundingPoints,
      contourCrossings,
      slopeSegments,
      statistics,
      generatedAt: Date.now()
    }

    section.analysisResult = result
    section.updatedAt = Date.now()
    analysisResult.value = result
    return result
  }

  function analyzeAllSections() {
    sections.value.forEach((s) => {
      if (!s.isArchived) {
        analyzeSection(s.id)
      }
    })
  }

  function setSlopeThreshold(threshold: number) {
    slopeThreshold.value = threshold
    if (selectedSectionId.value) {
      analyzeSection(selectedSectionId.value)
    }
  }

  function exportToJSON(sectionId?: string): string {
    const targetId = sectionId || selectedSectionId.value
    if (!targetId) return ''
    const section = sections.value.find((s) => s.id === targetId)
    const result = section?.analysisResult || analysisResult.value
    if (!result) return ''
    return JSON.stringify(result, null, 2)
  }

  function exportSectionToJSON(sectionId: string): string {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section) return ''
    const exportData = {
      section: {
        id: section.id,
        name: section.name,
        color: section.color,
        points: section.points,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
        note: section.note
      },
      analysisResult: section.analysisResult || null
    }
    return JSON.stringify(exportData, null, 2)
  }

  function batchExport(options: BatchSectionExportOptions): { files: { name: string; content: string; type: string }[] } {
    const files: { name: string; content: string; type: string }[] = []
    const ids = options.sectionIds.length > 0
      ? options.sectionIds
      : activeSections.value.map((s) => s.id)

    ids.forEach((id) => {
      const section = sections.value.find((s) => s.id === id)
      if (!section || section.isArchived) return

      const safeName = section.name.replace(/[<>:"/\\|?*]/g, '_')

      if (options.format === 'json' || options.format === 'both') {
        const jsonContent = exportSectionToJSON(id)
        if (jsonContent) {
          files.push({
            name: `${safeName}_分析结果.json`,
            content: jsonContent,
            type: 'application/json'
          })
        }
      }

      if (options.format === 'png' || options.format === 'both') {
        if (section.analysisResult) {
          files.push({
            name: `${safeName}_剖面图.png`,
            content: section.id,
            type: 'png-pending'
          })
        }
      }
    })

    return { files }
  }

  function getAbnormalSlopeSegments(sectionId: string): SlopeSegment[] {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section?.analysisResult) return []
    return section.analysisResult.slopeSegments.filter((s) => s.isAbnormal)
  }

  function getContourCrossings(sectionId: string): ContourCrossing[] {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section?.analysisResult) return []
    return section.analysisResult.contourCrossings
  }

  function getPointsAlongSegment(
    sectionPoints: LatLng[],
    startDistance: number,
    endDistance: number
  ): LatLng[] {
    const result: LatLng[] = []
    let accumulated = 0

    for (let i = 0; i < sectionPoints.length - 1; i++) {
      const segStart = sectionPoints[i]
      const segEnd = sectionPoints[i + 1]
      const segLength = distance(segStart, segEnd)

      if (accumulated + segLength < startDistance) {
        accumulated += segLength
        continue
      }

      if (accumulated > endDistance) {
        break
      }

      if (accumulated >= startDistance && accumulated <= endDistance) {
        result.push({ ...segStart })
      }

      const tStart = Math.max(0, (startDistance - accumulated) / segLength)
      const tEnd = Math.min(1, (endDistance - accumulated) / segLength)

      if (tStart >= 0 && tStart <= 1) {
        const lat = segStart.lat + (segEnd.lat - segStart.lat) * tStart
        const lng = segStart.lng + (segEnd.lng - segStart.lng) * tStart
        result.push({ lat, lng })
      }

      if (tEnd >= 0 && tEnd <= 1 && tEnd !== tStart) {
        const lat = segStart.lat + (segEnd.lat - segStart.lat) * tEnd
        const lng = segStart.lng + (segEnd.lng - segStart.lng) * tEnd
        result.push({ lat, lng })
      }

      accumulated += segLength
    }

    return result
  }

  return {
    sections,
    selectedSectionId,
    selectedSection,
    sectionCount,
    activeSections,
    archivedSections,
    availableColors,
    drawingPoints,
    isDrawing,
    analysisResult,
    slopeThreshold,
    editingSectionId,
    editingNodeIndex,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,
    selectSection,
    startEditingNodes,
    stopEditingNodes,
    updateNode,
    addNode,
    removeNode,
    deleteSection,
    updateSection,
    updateSectionColor,
    updateSectionName,
    toggleArchiveSection,
    clearAll,
    analyzeSection,
    analyzeAllSections,
    getSectionLength,
    setSlopeThreshold,
    exportToJSON,
    exportSectionToJSON,
    batchExport,
    getAbnormalSlopeSegments,
    getContourCrossings,
    getPointsAlongSegment
  }
})
