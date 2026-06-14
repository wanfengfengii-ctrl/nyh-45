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
  ContourLine
} from '@/types'
import { generateId, distance, findNearestPointOnLine, segmentsIntersect } from '@/utils/geometry'
import { useSoundingStore } from './sounding'
import { useContourStore } from './contour'

const ABNORMAL_SLOPE_THRESHOLD = 0.3
const SLOPE_SEGMENT_MIN_LENGTH = 10

export const useSectionStore = defineStore('section', () => {
  const sections = ref<SectionLine[]>([])
  const selectedSectionId = ref<string | null>(null)
  const drawingPoints = ref<LatLng[]>([])
  const isDrawing = ref(false)
  const analysisResult = ref<SectionAnalysisResult | null>(null)
  const slopeThreshold = ref(ABNORMAL_SLOPE_THRESHOLD)

  const selectedSection = computed(() =>
    sections.value.find((s) => s.id === selectedSectionId.value) || null
  )

  const sectionCount = computed(() => sections.value.length)

  function startDrawing() {
    drawingPoints.value = []
    isDrawing.value = true
    analysisResult.value = null
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
    const newSection: SectionLine = {
      id: generateId(),
      name: `断面 ${sections.value.length + 1}`,
      points: [...drawingPoints.value],
      createdAt: Date.now(),
      color: '#e91e63'
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

  function deleteSection(id: string) {
    sections.value = sections.value.filter((s) => s.id !== id)
    if (selectedSectionId.value === id) {
      selectedSectionId.value = null
      analysisResult.value = null
    }
  }

  function updateSection(id: string, updates: Partial<SectionLine>) {
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    sections.value[idx] = { ...sections.value[idx], ...updates }
    if (selectedSectionId.value === id) {
      analyzeSection(id)
    }
  }

  function clearAll() {
    sections.value = []
    selectedSectionId.value = null
    drawingPoints.value = []
    isDrawing.value = false
    analysisResult.value = null
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

    analysisResult.value = result
    return result
  }

  function setSlopeThreshold(threshold: number) {
    slopeThreshold.value = threshold
    if (selectedSectionId.value) {
      analyzeSection(selectedSectionId.value)
    }
  }

  function exportToJSON(): string {
    if (!analysisResult.value) return ''
    return JSON.stringify(analysisResult.value, null, 2)
  }

  return {
    sections,
    selectedSectionId,
    selectedSection,
    sectionCount,
    drawingPoints,
    isDrawing,
    analysisResult,
    slopeThreshold,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,
    selectSection,
    deleteSection,
    updateSection,
    clearAll,
    analyzeSection,
    getSectionLength,
    setSlopeThreshold,
    exportToJSON
  }
})
