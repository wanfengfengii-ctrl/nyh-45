<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, shallowRef, watch, computed, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '@/types'
import { ToolType, HistoryActionType } from '@/types'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSoundingStore } from '@/stores/sounding'
import { useContourStore } from '@/stores/contour'
import { useValidationStore } from '@/stores/validation'
import { useHistoryStore } from '@/stores/history'
import { isPointNear, distance } from '@/utils/geometry'

const emit = defineEmits<{
  (e: 'record-history', type: HistoryActionType, description: string): void
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const tileLayer = shallowRef<L.TileLayer | null>(null)
const soundingLayers = shallowRef<Map<string, L.Layer>>(new Map())
const contourLayers = shallowRef<Map<string, L.LayerGroup>>(new Map())
const tempDrawingLayer = shallowRef<L.Polyline | null>(null)
const tempMarkers = shallowRef<L.Marker[]>([])
const editingNodeMarkers = shallowRef<Map<string, L.Marker>>(new Map())
const validationMarkers = shallowRef<Map<string, L.Marker>>(new Map())

const workspaceStore = useWorkspaceStore()
const soundingStore = useSoundingStore()
const contourStore = useContourStore()
const validationStore = useValidationStore()
const historyStore = useHistoryStore()

const cursorStyle = computed(() => {
  switch (workspaceStore.currentTool) {
    case ToolType.ADD_SOUNDING:
    case ToolType.DRAW_CONTOUR:
      return 'crosshair'
    case ToolType.DELETE:
      return 'not-allowed'
    default:
      return ''
  }
})

let dragStartState: { soundings: any[]; contours: any[] } | null = null

function recordHistory(type: HistoryActionType, description: string) {
  historyStore.recordAction(type, description)
}

function snapshotState() {
  return {
    soundings: JSON.parse(JSON.stringify(soundingStore.points)),
    contours: JSON.parse(JSON.stringify(contourStore.lines))
  }
}

function initMap() {
  if (!mapContainer.value) return
  map.value = L.map(mapContainer.value, {
    center: [workspaceStore.mapCenter.lat, workspaceStore.mapCenter.lng],
    zoom: workspaceStore.mapZoom,
    zoomControl: false
  })
  updateTileLayer()
  L.control.zoom({ position: 'topright' }).addTo(map.value)
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map.value)
  map.value.on('click', handleMapClick)
  map.value.on('move', () => {
    if (map.value) {
      const c = map.value.getCenter()
      workspaceStore.updateMapCenter(c.lat, c.lng)
    }
  })
  map.value.on('zoomend', () => {
    if (map.value) {
      workspaceStore.updateMapZoom(map.value.getZoom())
    }
  })
  renderAllSoundings()
  renderAllContours()
  renderValidationIssues()
}

function updateTileLayer() {
  if (!map.value) return
  if (tileLayer.value) {
    map.value.removeLayer(tileLayer.value)
    tileLayer.value = null
  }
  const basemap = workspaceStore.currentBasemap
  tileLayer.value = L.tileLayer(basemap.url, {
    attribution: basemap.attribution,
    maxZoom: basemap.maxZoom || 19
  })
  tileLayer.value.addTo(map.value)
}

function handleMapClick(e: L.LeafletMouseEvent) {
  const pos: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng }
  switch (workspaceStore.currentTool) {
    case ToolType.ADD_SOUNDING:
      handleAddSounding(pos)
      break
    case ToolType.DRAW_CONTOUR:
      handleDrawContour(pos)
      break
    case ToolType.DELETE:
      handleDeleteAt(pos)
      break
  }
}

function handleAddSounding(pos: LatLng) {
  const defaultDepth = workspaceStore.defaultDepth
  const result = soundingStore.addPoint(pos, defaultDepth)
  if (result) {
    renderSounding(result)
    recordHistory(HistoryActionType.ADD_SOUNDING, `添加测深点 (${defaultDepth.toFixed(1)}m)`)
    if (validationStore.autoValidate) {
      validationStore.runFullValidation()
      renderValidationIssues()
    }
  }
}

function handleDrawContour(pos: LatLng) {
  if (!contourStore.isDrawing) {
    contourStore.startDrawing()
  }
  contourStore.addDrawingPoint(pos)
  updateTempDrawing()
  addTempMarker(pos)
}

function handleDeleteAt(pos: LatLng) {
  for (const sp of soundingStore.points) {
    if (isPointNear(sp.position, pos, 8)) {
      soundingStore.deletePoint(sp.id)
      renderAllSoundings()
      recordHistory(HistoryActionType.DELETE_SOUNDING, `删除测深点 (${sp.depth.toFixed(1)}m)`)
      if (validationStore.autoValidate) {
        validationStore.validateAfterDelete(sp.id)
        renderValidationIssues()
      }
      return
    }
  }
  for (const line of contourStore.lines) {
    const d = computePointToLineDistance(pos, line.points)
    if (d < 15) {
      contourStore.deleteLine(line.id)
      renderAllContours()
      recordHistory(HistoryActionType.DELETE_CONTOUR, `删除等深线 (${line.depth}m)`)
      if (validationStore.autoValidate) {
        validationStore.runFullValidation()
        renderValidationIssues()
      }
      return
    }
  }
}

function computePointToLineDistance(pos: LatLng, points: LatLng[]): number {
  if (points.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const d = segDist(pos, points[i], points[i + 1])
    if (d < min) min = d
  }
  return min
}

function segDist(p: LatLng, a: LatLng, b: LatLng): number {
  const mapInst = map.value
  if (!mapInst) return Infinity
  const pm = mapInst.latLngToContainerPoint([p.lat, p.lng])
  const am = mapInst.latLngToContainerPoint([a.lat, a.lng])
  const bm = mapInst.latLngToContainerPoint([b.lat, b.lng])
  const dx = bm.x - am.x
  const dy = bm.y - am.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-6) {
    return Math.sqrt((pm.x - am.x) ** 2 + (pm.y - am.y) ** 2)
  }
  let t = ((pm.x - am.x) * dx + (pm.y - am.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = am.x + t * dx
  const py = am.y + t * dy
  return Math.sqrt((pm.x - px) ** 2 + (pm.y - py) ** 2)
}

function createSoundingIcon(depth: number, selected: boolean, dragging: boolean): L.DivIcon {
  const color = selected ? '#f44336' : dragging ? '#ff9800' : '#1976d2'
  const size = selected || dragging ? 32 : 26
  return L.divIcon({
    className: 'sounding-marker',
    html: `<div style="
      background: ${color};
      color: white;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      font-family: sans-serif;
      transform: scale(${dragging ? 1.15 : 1});
      transition: transform 0.1s;
    ">${depth.toFixed(1)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  })
}

function renderSounding(point: ReturnType<typeof useSoundingStore>['points'][0]) {
  if (!map.value || !workspaceStore.showSoundingPoints) return
  const isSelected = soundingStore.selectedPointId === point.id
  const canDrag = workspaceStore.currentTool === ToolType.EDIT_POINT
  const marker = L.marker([point.position.lat, point.position.lng], {
    icon: createSoundingIcon(point.depth, isSelected, false),
    draggable: canDrag
  })
  marker.on('click', (e) => {
    L.DomEvent.stopPropagation(e)
    if (workspaceStore.currentTool === ToolType.DELETE) {
      soundingStore.deletePoint(point.id)
      renderAllSoundings()
      recordHistory(HistoryActionType.DELETE_SOUNDING, `删除测深点 (${point.depth.toFixed(1)}m)`)
      if (validationStore.autoValidate) {
        validationStore.validateAfterDelete(point.id)
        renderValidationIssues()
      }
      return
    }
    soundingStore.selectPoint(point.id)
    contourStore.selectLine(null)
    renderAllSoundings()
  })
  marker.on('dragstart', () => {
    dragStartState = snapshotState()
    marker.setIcon(createSoundingIcon(point.depth, isSelected, true))
  })
  marker.on('drag', () => {
    const pos = marker.getLatLng()
    soundingStore.updatePoint(point.id, {
      position: { lat: pos.lat, lng: pos.lng }
    })
  })
  marker.on('dragend', () => {
    const pos = marker.getLatLng()
    soundingStore.updatePoint(point.id, {
      position: { lat: pos.lat, lng: pos.lng }
    })
    marker.setIcon(createSoundingIcon(point.depth, isSelected, false))
    if (dragStartState) {
      const newPts = soundingStore.points
      const moved = newPts.find(p => p.id === point.id)
      if (moved && dragStartState.soundings.find(s => s.id === point.id)) {
        const orig = dragStartState.soundings.find(s => s.id === point.id)
        if (orig && distance(orig.position, moved.position) > 0.1) {
          recordHistory(HistoryActionType.UPDATE_SOUNDING, `移动测深点 (${moved.depth.toFixed(1)}m)`)
        }
      }
    }
    dragStartState = null
    if (validationStore.autoValidate) {
      validationStore.validateAfterPointMove(point.id)
      renderValidationIssues()
    }
  })
  marker.on('contextmenu', (e) => {
    L.DomEvent.stopPropagation(e)
    soundingStore.deletePoint(point.id)
    renderAllSoundings()
    recordHistory(HistoryActionType.DELETE_SOUNDING, `删除测深点 (${point.depth.toFixed(1)}m)`)
    if (validationStore.autoValidate) {
      validationStore.validateAfterDelete(point.id)
      renderValidationIssues()
    }
  })
  marker.addTo(map.value)
  soundingLayers.value.set(point.id, marker)
}

function renderAllSoundings() {
  if (!map.value) return
  soundingLayers.value.forEach((l) => map.value?.removeLayer(l))
  soundingLayers.value.clear()
  if (!workspaceStore.showSoundingPoints) return
  soundingStore.points.forEach(renderSounding)
}

function renderAllContours() {
  if (!map.value) return
  contourLayers.value.forEach((g) => map.value?.removeLayer(g))
  contourLayers.value.clear()
  if (!workspaceStore.showContourLines) return
  contourStore.lines.forEach(renderContour)
  editingNodeMarkers.value.clear()
  if (contourStore.editingLineId) {
    renderEditingNodes()
  }
}

function calculateContourLabelPositions(line: { points: LatLng[]; depth: number }): LatLng[] {
  const pts = line.points
  if (pts.length < 3) return pts.length >= 1 ? [pts[Math.floor(pts.length / 2)]] : []

  const positions: LatLng[] = []
  let totalLength = 0
  const segmentLengths: number[] = []

  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = distance(pts[i], pts[i + 1])
    segmentLengths.push(segLen)
    totalLength += segLen
  }

  if (totalLength < 100) {
    return [pts[Math.floor(pts.length / 2)]]
  }

  const labelSpacing = Math.max(200, totalLength / 3)
  let currentDist = labelSpacing / 2
  let segIdx = 0
  let segProgress = 0

  while (currentDist < totalLength) {
    while (segIdx < segmentLengths.length && currentDist > segProgress + segmentLengths[segIdx]) {
      segProgress += segmentLengths[segIdx]
      segIdx++
    }
    if (segIdx >= segmentLengths.length) break

    const t = (currentDist - segProgress) / segmentLengths[segIdx]
    const p1 = pts[segIdx]
    const p2 = pts[segIdx + 1]
    positions.push({
      lat: p1.lat + (p2.lat - p1.lat) * t,
      lng: p1.lng + (p2.lng - p1.lng) * t
    })
    currentDist += labelSpacing
  }

  if (positions.length === 0) {
    positions.push(pts[Math.floor(pts.length / 2)])
  }

  return positions
}

function calculateSegmentAngle(p1: LatLng, p2: LatLng): number {
  const mapInst = map.value
  if (!mapInst) return 0
  const a = mapInst.latLngToContainerPoint([p1.lat, p1.lng])
  const b = mapInst.latLngToContainerPoint([p2.lat, p2.lng])
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
}

function renderContour(line: ReturnType<typeof useContourStore>['lines'][0]) {
  if (!map.value) return
  const group = L.layerGroup()
  const isSelected = contourStore.selectedLineId === line.id
  const isEditing = contourStore.editingLineId === line.id
  const latlngs = line.points.map((p) => [p.lat, p.lng] as [number, number])
  const polyline = L.polyline(latlngs, {
    color: line.color,
    weight: isSelected || isEditing ? 4 : 3,
    opacity: 0.9,
    dashArray: line.isClosed ? undefined : '8, 4'
  })

  polyline.on('click', (e) => {
    L.DomEvent.stopPropagation(e)
    if (workspaceStore.currentTool === ToolType.DELETE) {
      contourStore.deleteLine(line.id)
      renderAllContours()
      recordHistory(HistoryActionType.DELETE_CONTOUR, `删除等深线 (${line.depth}m)`)
      if (validationStore.autoValidate) {
        validationStore.runFullValidation()
        renderValidationIssues()
      }
      return
    }
    if (workspaceStore.currentTool === ToolType.MOVE_NODE) {
      contourStore.startEditingNodes(line.id)
    } else {
      contourStore.selectLine(line.id)
    }
    soundingStore.selectPoint(null)
    renderAllContours()
  })
  polyline.on('dblclick', (e) => {
    L.DomEvent.stopPropagation(e)
    if (workspaceStore.currentTool === ToolType.MOVE_NODE) {
      const mapInst = map.value
      if (mapInst) {
        const pt = mapInst.latLngToContainerPoint(e.latlng)
        const idx = findNearestSegmentIndex(pt, line.points)
        if (idx >= 0) {
          contourStore.addNode(line.id, { lat: e.latlng.lat, lng: e.latlng.lng }, idx)
          renderAllContours()
          recordHistory(HistoryActionType.UPDATE_CONTOUR, `添加等深线节点 (${line.depth}m)`)
        }
      }
    }
  })
  polyline.addTo(group)

  if (workspaceStore.showDepthLabels && line.points.length >= 2) {
    const labelPositions = calculateContourLabelPositions(line)
    const labelText = line.label || `${line.depth}m`
    const labelWidth = Math.max(40, labelText.length * 10 + 12)

    labelPositions.forEach((labelPos) => {
      let angle = 0
      const nearIdx = findNearestPointIndex(labelPos, line.points)
      if (nearIdx >= 0 && nearIdx < line.points.length - 1) {
        angle = calculateSegmentAngle(line.points[nearIdx], line.points[nearIdx + 1])
      }
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180

      const halo = L.marker([labelPos.lat, labelPos.lng], {
        icon: L.divIcon({
          className: 'contour-label-halo',
          html: `<div style="
            background: rgba(255,255,255,0.85);
            color: ${line.color};
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
            border: 2px solid white;
            white-space: nowrap;
            font-family: sans-serif;
            display: inline-block;
            transform: rotate(${angle}deg);
            transform-origin: center center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          ">${labelText}</div>`,
          iconSize: [labelWidth, 20],
          iconAnchor: [labelWidth / 2, 10]
        }),
        interactive: false
      })
      halo.addTo(group)
    })
  }

  group.addTo(map.value)
  contourLayers.value.set(line.id, group)
}

function findNearestPointIndex(pt: LatLng, points: LatLng[]): number {
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = distance(pt, points[i])
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function findNearestSegmentIndex(
  pt: L.Point,
  points: LatLng[]
): number {
  const mapInst = map.value
  if (!mapInst) return -1
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const am = mapInst.latLngToContainerPoint([points[i].lat, points[i].lng])
    const bm = mapInst.latLngToContainerPoint([points[i + 1].lat, points[i + 1].lng])
    const dx = bm.x - am.x
    const dy = bm.y - am.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) continue
    let t = ((pt.x - am.x) * dx + (pt.y - am.y) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const px = am.x + t * dx
    const py = am.y + t * dy
    const d = Math.sqrt((pt.x - px) ** 2 + (pt.y - py) ** 2)
    if (d < bestDist && d < 15) {
      bestDist = d
      best = i
    }
  }
  return best
}

function renderEditingNodes() {
  if (!map.value || !contourStore.editingLineId) return
  const line = contourStore.lines.find((l) => l.id === contourStore.editingLineId)
  if (!line) return
  const isClosed = line.isClosed
  const nodes = isClosed ? line.points.slice(0, -1) : line.points

  nodes.forEach((point, idx) => {
    let nodeBeforeState: { soundings: any[]; contours: any[] } | null = null

    const marker = L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        className: 'edit-node',
        html: `<div style="
          background: #ff9800;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      }),
      draggable: true
    })
    marker.on('dragstart', () => {
      nodeBeforeState = snapshotState()
    })
    marker.on('drag', () => {
      const pos = marker.getLatLng()
      contourStore.updateNode(line.id, idx, { lat: pos.lat, lng: pos.lng })
      renderAllContours()
    })
    marker.on('dragend', () => {
      if (nodeBeforeState) {
        recordHistory(HistoryActionType.UPDATE_CONTOUR, `编辑等深线节点 (${line.depth}m)`)
      }
      nodeBeforeState = null
      if (validationStore.autoValidate) {
        validationStore.runFullValidation()
        renderValidationIssues()
      }
    })
    marker.on('contextmenu', (e) => {
      L.DomEvent.stopPropagation(e)
      if (line.points.length > 3) {
        contourStore.removeNode(line.id, idx)
        renderAllContours()
        recordHistory(HistoryActionType.UPDATE_CONTOUR, `删除等深线节点 (${line.depth}m)`)
      }
    })
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e)
    })
    marker.addTo(map.value!)
    editingNodeMarkers.value.set(`${line.id}-${idx}`, marker)
  })
}

function updateTempDrawing() {
  if (!map.value) return
  if (tempDrawingLayer.value) {
    map.value.removeLayer(tempDrawingLayer.value)
  }
  if (contourStore.drawingPoints.length > 0) {
    const latlngs = contourStore.drawingPoints.map(
      (p) => [p.lat, p.lng] as [number, number]
    )
    tempDrawingLayer.value = L.polyline(latlngs, {
      color: contourStore.getColorForDepth(contourStore.currentDepth),
      weight: 3,
      opacity: 0.8,
      dashArray: '5, 5'
    })
    tempDrawingLayer.value.addTo(map.value)
  }
}

function addTempMarker(pos: LatLng) {
  if (!map.value) return
  const marker = L.marker([pos.lat, pos.lng], {
    icon: L.divIcon({
      className: 'temp-marker',
      html: `<div style="
        background: #4caf50;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid white;
      "></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    }),
    interactive: false
  })
  marker.addTo(map.value)
  tempMarkers.value.push(marker)
}

function clearTempDrawing() {
  if (map.value && tempDrawingLayer.value) {
    map.value.removeLayer(tempDrawingLayer.value)
    tempDrawingLayer.value = null
  }
  tempMarkers.value.forEach((m) => map.value?.removeLayer(m))
  tempMarkers.value = []
}

function renderValidationIssues() {
  if (!map.value) return
  validationMarkers.value.forEach((m) => map.value?.removeLayer(m))
  validationMarkers.value.clear()
  validationStore.result.issues.forEach((issue) => {
    if (!issue.position) return
    const color =
      issue.severity === 'error' ? '#f44336' : issue.severity === 'warning' ? '#ff9800' : '#2196f3'
    const icon = issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '⚠' : 'ℹ'
    const marker = L.marker([issue.position.lat, issue.position.lng], {
      icon: L.divIcon({
        className: 'validation-marker',
        html: `<div style="
          background: ${color};
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          font-family: sans-serif;
          animation: pulse 1.5s infinite;
        ">${icon}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    })
    marker.bindTooltip(issue.message, {
      permanent: false,
      direction: 'top'
    })
    marker.addTo(map.value!)
    validationMarkers.value.set(issue.id, marker)
  })
}

function finishDrawing(closed: boolean) {
  const line = contourStore.finishDrawing(closed)
  clearTempDrawing()
  if (line) {
    renderAllContours()
    recordHistory(HistoryActionType.ADD_CONTOUR, `添加等深线 (${line.depth}m)`)
    if (validationStore.autoValidate) {
      validationStore.runFullValidation()
      renderValidationIssues()
    }
  }
}

function cancelDrawing() {
  contourStore.cancelDrawing()
  clearTempDrawing()
}

defineExpose({
  finishDrawing,
  cancelDrawing
})

watch(
  () => workspaceStore.currentTool,
  () => {
    if (workspaceStore.currentTool !== ToolType.DRAW_CONTOUR && contourStore.isDrawing) {
      cancelDrawing()
    }
    if (workspaceStore.currentTool !== ToolType.MOVE_NODE) {
      contourStore.stopEditingNodes()
      renderAllContours()
    }
    renderAllSoundings()
  }
)

watch(
  () => [
    soundingStore.points.length,
    soundingStore.selectedPointId,
    workspaceStore.showSoundingPoints
  ],
  () => {
    renderAllSoundings()
  },
  { deep: true }
)

watch(
  () => [
    contourStore.lines.length,
    contourStore.selectedLineId,
    contourStore.editingLineId,
    workspaceStore.showContourLines,
    workspaceStore.showDepthLabels
  ],
  () => {
    nextTick(() => renderAllContours())
  },
  { deep: true }
)

watch(
  () => validationStore.result.issues.length,
  () => {
    renderValidationIssues()
  }
)

watch(
  () => workspaceStore.currentBasemapId,
  () => {
    updateTileLayer()
  }
)

watch(
  () => workspaceStore.mapZoom,
  () => {
    if (workspaceStore.showDepthLabels) {
      nextTick(() => renderAllContours())
    }
  }
)

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  if (map.value) {
    map.value.remove()
    map.value = null
  }
})
</script>

<template>
  <div class="chart-map-wrapper">
    <div ref="mapContainer" class="map-container" :style="{ cursor: cursorStyle }"></div>
    <div v-if="contourStore.isDrawing" class="drawing-controls">
      <span class="drawing-tip">已添加 {{ contourStore.drawingPoints.length }} 个节点</span>
      <button class="btn-primary" @click="finishDrawing(false)">完成</button>
      <button class="btn-success" @click="finishDrawing(true)">闭合</button>
      <button class="btn-danger" @click="cancelDrawing">取消</button>
    </div>
    <div v-if="contourStore.editingLineId" class="drawing-controls">
      <span class="drawing-tip">节点编辑模式 - 拖动节点移动 / 双击添加 / 右键删除</span>
      <button class="btn-primary" @click="contourStore.stopEditingNodes(); renderAllContours()">完成</button>
    </div>
    <div class="basemap-indicator">
      <span class="bi-label">底图:</span>
      <span class="bi-name">{{ workspaceStore.currentBasemap.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.chart-map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
.map-container {
  width: 100%;
  height: 100%;
}
.drawing-controls {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  gap: 8px;
  align-items: center;
  z-index: 1000;
}
.drawing-tip {
  font-size: 13px;
  color: #555;
  margin-right: 8px;
}
.btn-primary,
.btn-success,
.btn-danger {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: white;
}
.btn-primary {
  background: #1976d2;
}
.btn-primary:hover {
  background: #1565c0;
}
.btn-success {
  background: #388e3c;
}
.btn-success:hover {
  background: #2e7d32;
}
.btn-danger {
  background: #d32f2f;
}
.btn-danger:hover {
  background: #c62828;
}
.basemap-indicator {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  color: #555;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  z-index: 500;
}
.bi-label {
  color: #999;
  margin-right: 4px;
}
.bi-name {
  font-weight: 500;
  color: #333;
}
</style>

<style>
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}
.leaflet-container {
  font-family: inherit;
  background: #aad3df;
}
.sounding-marker,
.contour-label,
.contour-label-halo,
.edit-node,
.validation-marker,
.temp-marker {
  background: none !important;
  border: none !important;
}
</style>
