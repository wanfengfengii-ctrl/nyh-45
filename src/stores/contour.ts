import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ContourLine, LatLng, DepthLevel } from '@/types'
import { generateId, isPointNear } from '@/utils/geometry'

export const DEFAULT_DEPTH_LEVELS: DepthLevel[] = [
  { depth: 0, color: '#0d47a1', label: '0m' },
  { depth: 2, color: '#1565c0', label: '2m' },
  { depth: 5, color: '#1976d2', label: '5m' },
  { depth: 10, color: '#1e88e5', label: '10m' },
  { depth: 20, color: '#2196f3', label: '20m' },
  { depth: 50, color: '#42a5f5', label: '50m' },
  { depth: 100, color: '#64b5f6', label: '100m' },
  { depth: 200, color: '#90caf9', label: '200m' }
]

export const useContourStore = defineStore('contour', () => {
  const lines = ref<ContourLine[]>([])
  const selectedLineId = ref<string | null>(null)
  const currentDepth = ref<number>(10)
  const drawingPoints = ref<LatLng[]>([])
  const isDrawing = ref(false)
  const editingNodeIndex = ref<number | null>(null)
  const editingLineId = ref<string | null>(null)

  const selectedLine = computed(() =>
    lines.value.find((l) => l.id === selectedLineId.value) || null
  )

  const sortedLines = computed(() =>
    [...lines.value].sort((a, b) => a.depth - b.depth)
  )

  const depthLevels = ref<DepthLevel[]>([...DEFAULT_DEPTH_LEVELS])

  function getColorForDepth(depth: number): string {
    const exact = depthLevels.value.find((l) => l.depth === depth)
    if (exact) return exact.color
    const sorted = [...depthLevels.value].sort((a, b) => a.depth - b.depth)
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (depth >= sorted[i].depth) return sorted[i].color
    }
    return sorted[0]?.color || '#2196f3'
  }

  function startDrawing(depth?: number) {
    if (depth !== undefined) currentDepth.value = depth
    drawingPoints.value = []
    isDrawing.value = true
  }

  function addDrawingPoint(point: LatLng) {
    if (!isDrawing.value) return
    drawingPoints.value.push({ ...point })
  }

  function finishDrawing(closed: boolean = false): ContourLine | null {
    if (!isDrawing.value || drawingPoints.value.length < 2) {
      cancelDrawing()
      return null
    }
    const pts = [...drawingPoints.value]
    if (closed && pts.length >= 3) {
      const first = pts[0]
      const last = pts[pts.length - 1]
      if (!isPointNear(first, last, 5)) {
        pts.push({ ...first })
      }
    }
    const isLineClosed =
      closed &&
      pts.length >= 4 &&
      isPointNear(pts[0], pts[pts.length - 1], 5)
    const newLine: ContourLine = {
      id: generateId(),
      depth: currentDepth.value,
      points: pts,
      isClosed: isLineClosed,
      createdAt: Date.now(),
      color: getColorForDepth(currentDepth.value),
      label: `${currentDepth.value}m`
    }
    lines.value.push(newLine)
    isDrawing.value = false
    drawingPoints.value = []
    return newLine
  }

  function cancelDrawing() {
    isDrawing.value = false
    drawingPoints.value = []
  }

  function selectLine(id: string | null) {
    selectedLineId.value = id
    editingNodeIndex.value = null
    editingLineId.value = null
  }

  function startEditingNodes(lineId: string) {
    editingLineId.value = lineId
    editingNodeIndex.value = null
  }

  function stopEditingNodes() {
    editingLineId.value = null
    editingNodeIndex.value = null
  }

  function updateNode(lineId: string, nodeIndex: number, newPosition: LatLng) {
    const line = lines.value.find((l) => l.id === lineId)
    if (!line || nodeIndex < 0 || nodeIndex >= line.points.length) return
    line.points[nodeIndex] = { ...newPosition }
    if (line.isClosed && nodeIndex === 0 && line.points.length > 1) {
      line.points[line.points.length - 1] = { ...newPosition }
    } else if (
      line.isClosed &&
      nodeIndex === line.points.length - 1 &&
      line.points.length > 1
    ) {
      line.points[0] = { ...newPosition }
    }
  }

  function addNode(lineId: string, position: LatLng, insertIndex?: number) {
    const line = lines.value.find((l) => l.id === lineId)
    if (!line) return
    const idx =
      insertIndex !== undefined ? insertIndex : line.points.length - 1
    line.points.splice(idx + 1, 0, { ...position })
  }

  function removeNode(lineId: string, nodeIndex: number) {
    const line = lines.value.find((l) => l.id === lineId)
    if (!line || line.points.length <= 3) return
    if (line.isClosed && (nodeIndex === 0 || nodeIndex === line.points.length - 1)) {
      line.points.pop()
      line.points.shift()
      line.points.push({ ...line.points[0] })
    } else {
      line.points.splice(nodeIndex, 1)
    }
  }

  function updateLine(id: string, updates: Partial<ContourLine>) {
    const idx = lines.value.findIndex((l) => l.id === id)
    if (idx === -1) return
    if (updates.depth !== undefined) {
      updates.color = getColorForDepth(updates.depth)
      updates.label = `${updates.depth}m`
    }
    lines.value[idx] = { ...lines.value[idx], ...updates }
  }

  function deleteLine(id: string) {
    lines.value = lines.value.filter((l) => l.id !== id)
    if (selectedLineId.value === id) selectedLineId.value = null
    if (editingLineId.value === id) stopEditingNodes()
  }

  function setCurrentDepth(depth: number) {
    currentDepth.value = depth
  }

  function clearAll() {
    lines.value = []
    selectedLineId.value = null
    drawingPoints.value = []
    isDrawing.value = false
    stopEditingNodes()
  }

  return {
    lines,
    selectedLineId,
    selectedLine,
    sortedLines,
    currentDepth,
    depthLevels,
    drawingPoints,
    isDrawing,
    editingNodeIndex,
    editingLineId,
    getColorForDepth,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,
    selectLine,
    startEditingNodes,
    stopEditingNodes,
    updateNode,
    addNode,
    removeNode,
    updateLine,
    deleteLine,
    setCurrentDepth,
    clearAll
  }
})
