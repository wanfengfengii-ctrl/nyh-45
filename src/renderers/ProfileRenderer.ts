import type { SectionAnalysisResult } from '@/types'

export interface ProfileRenderOptions {
  width?: number
  height?: number
  padding?: { top: number; right: number; bottom: number; left: number }
  showTitle?: boolean
  title?: string
  dpr?: number
  clearBeforeRender?: boolean
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(2) + ' km'
  }
  return meters.toFixed(1) + ' m'
}

export function createProfileCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

export function renderProfile(
  canvas: HTMLCanvasElement,
  result: SectionAnalysisResult,
  options: ProfileRenderOptions = {}
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rect = canvas.getBoundingClientRect()
  const cssWidth = options.width ?? rect.width
  const cssHeight = options.height ?? rect.height
  if (cssWidth === 0 || cssHeight === 0) return

  const padding = options.padding ?? { top: 40, right: 30, bottom: 50, left: 60 }
  const showTitle = options.showTitle ?? true
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1

  canvas.width = cssWidth * dpr
  canvas.height = cssHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (options.clearBeforeRender ?? true) {
    ctx.clearRect(0, 0, cssWidth, cssHeight)
  }

  const chartW = cssWidth - padding.left - padding.right
  const chartH = cssHeight - padding.top - padding.bottom

  const stats = result.statistics
  const maxDistance = stats.totalLength
  const maxDepth = stats.maxDepth * 1.1
  const minDepth = Math.max(0, stats.minDepth * 0.9)

  drawGrid(ctx, cssWidth, cssHeight, padding, maxDistance, maxDepth, minDepth)
  drawAxes(ctx, cssWidth, cssHeight, padding)
  drawProfileArea(ctx, result, padding, chartW, chartH, maxDistance, maxDepth, minDepth, cssHeight)
  drawProfileLine(ctx, result, padding, chartW, chartH, maxDistance, maxDepth, minDepth)
  drawSoundingPoints(ctx, result, padding, chartW, chartH, maxDistance, maxDepth, minDepth)
  drawContourCrossings(ctx, result, padding, chartW, chartH, maxDistance, maxDepth, minDepth, cssHeight)
  drawAbnormalSlopes(ctx, result, padding, chartW, maxDistance)

  if (showTitle) {
    ctx.fillStyle = '#333'
    ctx.font = cssWidth < 500 ? 'bold 12px sans-serif' : 'bold 14px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(options.title || result.sectionName, padding.left, 10)
  }

  ctx.fillStyle = '#333'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('水深 (m)', padding.left / 2, cssHeight / 2)

  ctx.save()
  ctx.translate(cssWidth / 2, cssHeight - 12)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('沿断面距离', 0, 0)
  ctx.restore()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  maxDistance: number,
  maxDepth: number,
  minDepth: number
): void {
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#666'

  const chartH = height - padding.top - padding.bottom

  const yTicks = 5
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + (chartH * i) / yTicks
    const depth = maxDepth - ((maxDepth - minDepth) * i) / yTicks
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(depth.toFixed(1) + 'm', padding.left - 8, y)
  }

  const chartW = width - padding.left - padding.right
  const xTicks = 5
  for (let i = 0; i <= xTicks; i++) {
    const x = padding.left + (chartW * i) / xTicks
    const dist = (maxDistance * i) / xTicks
    ctx.beginPath()
    ctx.moveTo(x, padding.top)
    ctx.lineTo(x, height - padding.bottom)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(formatDistance(dist), x, height - padding.bottom + 8)
  }
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number }
): void {
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, height - padding.bottom)
  ctx.lineTo(width - padding.right, height - padding.bottom)
  ctx.stroke()
}

function drawProfileArea(
  ctx: CanvasRenderingContext2D,
  result: SectionAnalysisResult,
  padding: { top: number; right: number; bottom: number; left: number },
  chartW: number,
  chartH: number,
  maxDistance: number,
  maxDepth: number,
  minDepth: number,
  cssHeight: number
): void {
  const points = result.soundingPoints
  if (points.length < 2) return

  const gradient = ctx.createLinearGradient(0, padding.top, 0, cssHeight - padding.bottom)
  gradient.addColorStop(0, 'rgba(33, 150, 243, 0.1)')
  gradient.addColorStop(1, 'rgba(33, 150, 243, 0.5)')

  ctx.beginPath()
  ctx.moveTo(padding.left, cssHeight - padding.bottom)
  points.forEach((p, idx) => {
    const x = padding.left + (p.distance / maxDistance) * chartW
    const y =
      padding.top +
      chartH -
      ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartH
    if (idx === 0) {
      ctx.lineTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.lineTo(padding.left + chartW, cssHeight - padding.bottom)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()
}

function drawProfileLine(
  ctx: CanvasRenderingContext2D,
  result: SectionAnalysisResult,
  padding: { top: number; right: number; bottom: number; left: number },
  chartW: number,
  chartH: number,
  maxDistance: number,
  maxDepth: number,
  minDepth: number
): void {
  const points = result.soundingPoints
  if (points.length < 2) return

  ctx.beginPath()
  points.forEach((p, idx) => {
    const x = padding.left + (p.distance / maxDistance) * chartW
    const y =
      padding.top +
      chartH -
      ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartH
    if (idx === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.strokeStyle = '#1976d2'
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function drawSoundingPoints(
  ctx: CanvasRenderingContext2D,
  result: SectionAnalysisResult,
  padding: { top: number; right: number; bottom: number; left: number },
  chartW: number,
  chartH: number,
  maxDistance: number,
  maxDepth: number,
  minDepth: number
): void {
  const points = result.soundingPoints
  points.forEach((p) => {
    const x = padding.left + (p.distance / maxDistance) * chartW
    const y =
      padding.top +
      chartH -
      ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartH
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#1976d2'
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1.5
    ctx.stroke()
  })
}

function drawContourCrossings(
  ctx: CanvasRenderingContext2D,
  result: SectionAnalysisResult,
  padding: { top: number; right: number; bottom: number; left: number },
  chartW: number,
  chartH: number,
  maxDistance: number,
  maxDepth: number,
  minDepth: number,
  canvasHeight: number
): void {
  const crossings = result.contourCrossings
  crossings.forEach((c) => {
    const x = padding.left + (c.distance / maxDistance) * chartW
    const y =
      padding.top +
      chartH -
      ((c.contourDepth - minDepth) / (maxDepth - minDepth)) * chartH
    const clampedY = Math.max(padding.top, Math.min(canvasHeight - padding.bottom, y))

    ctx.beginPath()
    ctx.moveTo(x, padding.top)
    ctx.lineTo(x, canvasHeight - padding.bottom)
    ctx.strokeStyle = c.direction === 'ascending' ? '#4caf50' : '#f44336'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(x, clampedY, 6, 0, Math.PI * 2)
    ctx.fillStyle = c.direction === 'ascending' ? '#4caf50' : '#f44336'
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = c.direction === 'ascending' ? '#4caf50' : '#f44336'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(c.contourDepth + 'm', x, clampedY - 8)
  })
}

function drawAbnormalSlopes(
  ctx: CanvasRenderingContext2D,
  result: SectionAnalysisResult,
  padding: { top: number; right: number; bottom: number; left: number },
  chartW: number,
  maxDistance: number
): void {
  const abnormalSegs = result.slopeSegments.filter((s) => s.isAbnormal)
  abnormalSegs.forEach((seg) => {
    const startX = padding.left + (seg.startDistance / maxDistance) * chartW
    const endX = padding.left + (seg.endDistance / maxDistance) * chartW
    const y = padding.top + 10

    ctx.fillStyle = 'rgba(244, 67, 54, 0.3)'
    ctx.fillRect(startX, y, endX - startX, 20)

    ctx.fillStyle = '#d32f2f'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const midX = (startX + endX) / 2
    ctx.fillText('⚠', midX, y + 4)
  })
}

export function profileToDataURL(
  result: SectionAnalysisResult,
  options: ProfileRenderOptions = {}
): string | null {
  const canvas = createProfileCanvas()
  const exportOptions: ProfileRenderOptions = {
    width: 800,
    height: 400,
    showTitle: true,
    ...options
  }
  renderProfile(canvas, result, exportOptions)
  return canvas.toDataURL('image/png')
}
