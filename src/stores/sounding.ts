import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SoundingPoint, LatLng, DepthStatistics } from '@/types'
import { generateId, isPointNear, pointToLineDistance } from '@/utils/geometry'
import { useContourStore } from './contour'

export const useSoundingStore = defineStore('sounding', () => {
  const points = ref<SoundingPoint[]>([])
  const selectedPointId = ref<string | null>(null)

  const totalPoints = computed(() => points.value.length)

  const selectedPoint = computed(() =>
    points.value.find((p) => p.id === selectedPointId.value) || null
  )

  const depthRange = computed(() => {
    if (points.value.length === 0) return { min: 0, max: 0 }
    const depths = points.value.map((p) => p.depth)
    return {
      min: Math.min(...depths),
      max: Math.max(...depths)
    }
  })

  const averageDepth = computed(() => {
    if (points.value.length === 0) return 0
    const sum = points.value.reduce((acc, p) => acc + p.depth, 0)
    return sum / points.value.length
  })

  const statistics = computed<DepthStatistics>(() => {
    const dist: Record<number, number> = {}
    points.value.forEach((p) => {
      const rounded = Math.round(p.depth * 10) / 10
      dist[rounded] = (dist[rounded] || 0) + 1
    })
    const depthDistribution = Object.entries(dist)
      .map(([depth, count]) => ({ depth: parseFloat(depth), count }))
      .sort((a, b) => a.depth - b.depth)
    return {
      totalPoints: points.value.length,
      depthRange: depthRange.value,
      averageDepth: averageDepth.value,
      depthDistribution,
      areaCoverage: calculateCoverage(points.value)
    }
  })

  function calculateCoverage(pts: SoundingPoint[]): number {
    if (pts.length < 3) return 0
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity
    pts.forEach((p) => {
      minLat = Math.min(minLat, p.position.lat)
      maxLat = Math.max(maxLat, p.position.lat)
      minLng = Math.min(minLng, p.position.lng)
      maxLng = Math.max(maxLng, p.position.lng)
    })
    const latDiff = maxLat - minLat
    const lngDiff = maxLng - minLng
    const avgLat = (minLat + maxLat) / 2
    const R = 6371000
    const width = lngDiff * (Math.PI / 180) * R * Math.cos((avgLat * Math.PI) / 180)
    const height = latDiff * (Math.PI / 180) * R
    return Math.abs(width * height)
  }

  function addPoint(position: LatLng, depth: number, note?: string): SoundingPoint | null {
    if (depth < 0) return null
    const duplicate = points.value.find(
      (p) => isPointNear(p.position, position, 3) && Math.abs(p.depth - depth) > 0.01
    )
    if (duplicate) return null
    const newPoint: SoundingPoint = {
      id: generateId(),
      position: { ...position },
      depth,
      createdAt: Date.now(),
      note
    }
    points.value.push(newPoint)
    return newPoint
  }

  function updatePoint(id: string, updates: Partial<SoundingPoint>): boolean {
    if (updates.depth !== undefined && updates.depth < 0) return false
    const idx = points.value.findIndex((p) => p.id === id)
    if (idx === -1) return false
    if (updates.position) {
      const duplicate = points.value.find(
        (p) =>
          p.id !== id &&
          isPointNear(p.position, updates.position!, 3) &&
          Math.abs(p.depth - (updates.depth ?? points.value[idx].depth)) > 0.01
      )
      if (duplicate) return false
    }
    points.value[idx] = { ...points.value[idx], ...updates }
    return true
  }

  function deletePoint(id: string): string[] {
    const affectedContours = findAffectedContours(id)
    points.value = points.value.filter((p) => p.id !== id)
    if (selectedPointId.value === id) selectedPointId.value = null
    return affectedContours
  }

  function findAffectedContours(pointId: string): string[] {
    const point = points.value.find((p) => p.id === pointId)
    if (!point) return []
    const contourStore = useContourStore()
    const affected: string[] = []
    for (const line of contourStore.lines) {
      const dist = pointToLineDistance(point.position, line.points)
      if (dist < 500) {
        affected.push(line.id)
      }
    }
    return affected
  }

  function selectPoint(id: string | null) {
    selectedPointId.value = id
  }

  function getPointById(id: string): SoundingPoint | undefined {
    return points.value.find((p) => p.id === id)
  }

  function getPointsNear(position: LatLng, radiusMeters: number): SoundingPoint[] {
    return points.value.filter((p) => isPointNear(p.position, position, radiusMeters))
  }

  function clearAll() {
    points.value = []
    selectedPointId.value = null
  }

  return {
    points,
    selectedPointId,
    selectedPoint,
    totalPoints,
    depthRange,
    averageDepth,
    statistics,
    addPoint,
    updatePoint,
    deletePoint,
    selectPoint,
    getPointById,
    getPointsNear,
    findAffectedContours,
    clearAll
  }
})
