<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useSectionStore } from '@/stores/section'
import { useWorkspaceStore } from '@/stores/workspace'
import { ToolType } from '@/types'
import type { SectionAnalysisResult } from '@/types'

const sectionStore = useSectionStore()
const workspaceStore = useWorkspaceStore()

const profileCanvas = ref<HTMLCanvasElement | null>(null)
const activeTab = ref<'profile' | 'statistics' | 'slopes'>('profile')
const editingName = ref(false)
const tempName = ref('')

const hasAnalysisResult = computed(() => sectionStore.analysisResult !== null)

const result = computed<SectionAnalysisResult | null>(() => sectionStore.analysisResult)

const abnormalSlopes = computed(() => {
  if (!result.value) return []
  return result.value.slopeSegments.filter((s) => s.isAbnormal)
})

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(2) + ' km'
  }
  return meters.toFixed(1) + ' m'
}

function formatDepth(meters: number): string {
  return meters.toFixed(1) + ' m'
}

function formatSlope(slope: number): string {
  return (slope * 100).toFixed(1) + '%'
}

function startDrawSection() {
  workspaceStore.setTool(ToolType.DRAW_SECTION)
}

function selectSection(id: string) {
  sectionStore.selectSection(id)
}

function deleteSection(id: string) {
  sectionStore.deleteSection(id)
}

function startEditName() {
  if (sectionStore.selectedSection) {
    tempName.value = sectionStore.selectedSection.name
    editingName.value = true
    nextTick(() => {
      const input = document.querySelector('.section-name-input') as HTMLInputElement
      input?.focus()
      input?.select()
    })
  }
}

function saveName() {
  if (sectionStore.selectedSectionId && tempName.value.trim()) {
    sectionStore.updateSection(sectionStore.selectedSectionId, {
      name: tempName.value.trim()
    })
  }
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
}

function drawProfile() {
  const canvas = profileCanvas.value
  if (!canvas || !result.value) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  const width = rect.width
  const height = rect.height
  const padding = { top: 40, right: 30, bottom: 50, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  ctx.clearRect(0, 0, width, height)

  const stats = result.value.statistics
  const maxDistance = stats.totalLength
  const maxDepth = stats.maxDepth * 1.1
  const minDepth = Math.max(0, stats.minDepth * 0.9)

  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#666'

  const yTicks = 5
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + (chartHeight * i) / yTicks
    const depth = maxDepth - ((maxDepth - minDepth) * i) / yTicks
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(depth.toFixed(1) + 'm', padding.left - 8, y)
  }

  const xTicks = 5
  for (let i = 0; i <= xTicks; i++) {
    const x = padding.left + (chartWidth * i) / xTicks
    const dist = (maxDistance * i) / xTicks
    ctx.beginPath()
    ctx.moveTo(x, padding.top)
    ctx.lineTo(x, height - padding.bottom)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(formatDistance(dist), x, height - padding.bottom + 8)
  }

  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, height - padding.bottom)
  ctx.lineTo(width - padding.right, height - padding.bottom)
  ctx.stroke()

  const points = result.value.soundingPoints
  if (points.length >= 2) {
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom)
    gradient.addColorStop(0, 'rgba(33, 150, 243, 0.1)')
    gradient.addColorStop(1, 'rgba(33, 150, 243, 0.5)')

    ctx.beginPath()
    ctx.moveTo(padding.left, height - padding.bottom)
    points.forEach((p, idx) => {
      const x = padding.left + (p.distance / maxDistance) * chartWidth
      const y =
        padding.top +
        chartHeight -
        ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartHeight
      if (idx === 0) {
        ctx.lineTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.lineTo(padding.left + chartWidth, height - padding.bottom)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.beginPath()
    points.forEach((p, idx) => {
      const x = padding.left + (p.distance / maxDistance) * chartWidth
      const y =
        padding.top +
        chartHeight -
        ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartHeight
      if (idx === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.strokeStyle = '#1976d2'
    ctx.lineWidth = 2.5
    ctx.stroke()

    points.forEach((p) => {
      const x = padding.left + (p.distance / maxDistance) * chartWidth
      const y =
        padding.top +
        chartHeight -
        ((p.point.depth - minDepth) / (maxDepth - minDepth)) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#1976d2'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
  }

  const crossings = result.value.contourCrossings
  crossings.forEach((c) => {
    const x = padding.left + (c.distance / maxDistance) * chartWidth
    const y =
      padding.top +
      chartHeight -
      ((c.contourDepth - minDepth) / (maxDepth - minDepth)) * chartHeight
    const clampedY = Math.max(padding.top, Math.min(height - padding.bottom, y))

    ctx.beginPath()
    ctx.moveTo(x, padding.top)
    ctx.lineTo(x, height - padding.bottom)
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

  const abnormalSegs = result.value.slopeSegments.filter((s) => s.isAbnormal)
  abnormalSegs.forEach((seg) => {
    const startX = padding.left + (seg.startDistance / maxDistance) * chartWidth
    const endX = padding.left + (seg.endDistance / maxDistance) * chartWidth
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

  ctx.fillStyle = '#333'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('水深 (m)', padding.left / 2, height / 2)

  ctx.save()
  ctx.translate(width / 2, height - 12)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('沿断面距离', 0, 0)
  ctx.restore()

  ctx.fillStyle = '#1976d2'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(result.value.sectionName, padding.left, 10)
}

function exportToPNG() {
  const canvas = profileCanvas.value
  if (!canvas) return

  const link = document.createElement('a')
  link.download = `${result.value?.sectionName || '断面'}_剖面图.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function exportToJSON() {
  const json = sectionStore.exportToJSON()
  if (!json) return

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = `${result.value?.sectionName || '断面'}_分析结果.json`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

watch(
  () => [sectionStore.analysisResult, activeTab.value],
  () => {
    if (activeTab.value === 'profile' && result.value) {
      nextTick(() => {
        drawProfile()
      })
    }
  },
  { deep: true }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (profileCanvas.value && result.value) {
    drawProfile()
  }
  if (typeof ResizeObserver !== 'undefined' && profileCanvas.value) {
    resizeObserver = new ResizeObserver(() => {
      if (activeTab.value === 'profile' && result.value) {
        drawProfile()
      }
    })
    resizeObserver.observe(profileCanvas.value.parentElement!)
  }
})
</script>

<template>
  <div class="section-panel">
    <div class="panel-header">
      <h3 class="panel-title">📊 断面分析</h3>
      <button v-if="workspaceStore.currentTool !== ToolType.DRAW_SECTION" class="draw-btn" @click="startDrawSection">
        ✏️ 绘制断面
      </button>
      <button v-else class="draw-btn active" @click="workspaceStore.setTool(ToolType.NONE)">
        ✋ 取消绘制
      </button>
    </div>

    <div class="section-list">
      <div class="list-title">断面列表 ({{ sectionStore.sectionCount }})</div>
      <div v-if="sectionStore.sections.length === 0" class="empty-state">
        <div class="empty-icon">📐</div>
        <div class="empty-text">暂无断面</div>
        <div class="empty-hint">点击"绘制断面"按钮开始</div>
      </div>
      <div v-else class="section-items">
        <div
          v-for="section in sectionStore.sections"
          :key="section.id"
          class="section-item"
          :class="{ selected: section.id === sectionStore.selectedSectionId }"
          @click="selectSection(section.id)"
        >
          <div class="section-color" :style="{ background: section.color }"></div>
          <div class="section-info">
            <div class="section-name">{{ section.name }}</div>
            <div class="section-meta">
              {{ section.points.length }} 节点 · {{ formatDistance(sectionStore.getSectionLength(section.points)) }}
            </div>
          </div>
          <button class="delete-btn" @click.stop="deleteSection(section.id)">×</button>
        </div>
      </div>
    </div>

    <div v-if="hasAnalysisResult" class="analysis-content">
      <div class="tab-bar">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          📈 剖面图
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'statistics' }"
          @click="activeTab = 'statistics'"
        >
          📊 统计
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'slopes' }"
          @click="activeTab = 'slopes'"
        >
          ⚠️ 坡度
        </button>
      </div>

      <div v-if="activeTab === 'profile'" class="tab-content">
        <div class="section-title-bar">
          <div v-if="!editingName" class="section-title" @dblclick="startEditName">
            {{ result?.sectionName }}
            <span class="edit-hint">双击重命名</span>
          </div>
          <div v-else class="section-title-edit">
            <input
              v-model="tempName"
              class="section-name-input"
              @keyup.enter="saveName"
              @blur="saveName"
              @keyup.esc="cancelEditName"
            />
          </div>
        </div>
        <div class="profile-chart">
          <canvas ref="profileCanvas" class="profile-canvas"></canvas>
        </div>
        <div class="chart-legend">
          <div class="legend-item">
            <span class="legend-dot" style="background: #1976d2"></span>
            <span>测深点</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #4caf50"></span>
            <span>变深穿越</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #f44336"></span>
            <span>变浅穿越</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: rgba(244, 67, 54, 0.5)"></span>
            <span>异常坡度</span>
          </div>
        </div>
        <div class="export-buttons">
          <button class="export-btn png" @click="exportToPNG">📷 导出 PNG</button>
          <button class="export-btn json" @click="exportToJSON">📄 导出 JSON</button>
        </div>
      </div>

      <div v-else-if="activeTab === 'statistics'" class="tab-content">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">断面长度</div>
            <div class="stat-value">{{ formatDistance(result?.statistics.totalLength || 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">测深点数</div>
            <div class="stat-value">{{ result?.statistics.soundingCount || 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">最浅深度</div>
            <div class="stat-value">{{ formatDepth(result?.statistics.minDepth || 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">最深深度</div>
            <div class="stat-value">{{ formatDepth(result?.statistics.maxDepth || 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">平均深度</div>
            <div class="stat-value">{{ formatDepth(result?.statistics.avgDepth || 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">深度差</div>
            <div class="stat-value">{{ formatDepth(result?.statistics.depthRange || 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">等深线穿越</div>
            <div class="stat-value">{{ result?.statistics.contourCrossingCount || 0 }} 次</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">平均坡度</div>
            <div class="stat-value">{{ formatSlope(result?.statistics.avgSlope || 0) }}</div>
          </div>
          <div class="stat-card highlight">
            <div class="stat-label">最大坡度</div>
            <div class="stat-value">{{ formatSlope(result?.statistics.maxSlope || 0) }}</div>
            <div class="stat-sub">({{ result?.statistics.maxSlopeAngle.toFixed(1) }}°)</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">异常坡段</div>
            <div class="stat-value">{{ result?.statistics.abnormalSlopeCount || 0 }} 处</div>
          </div>
        </div>

        <div class="stats-detail">
          <div class="detail-title">坡度阈值设置</div>
          <div class="threshold-control">
            <input
              type="range"
              :min="0.05"
              :max="0.5"
              :step="0.01"
              :value="sectionStore.slopeThreshold"
              @input="sectionStore.setSlopeThreshold(parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="threshold-value">{{ formatSlope(sectionStore.slopeThreshold) }}</span>
          </div>
          <div class="threshold-hint">
            坡度超过此阈值的段落将标记为异常
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'slopes'" class="tab-content">
        <div v-if="abnormalSlopes.length === 0" class="empty-state small">
          <div class="empty-icon">✅</div>
          <div class="empty-text">未发现异常坡度</div>
          <div class="empty-hint">所有坡段均在正常范围内</div>
        </div>
        <div v-else class="slope-list">
          <div class="slope-header">
            <span>位置</span>
            <span>坡度</span>
            <span>长度</span>
          </div>
          <div
            v-for="(seg, idx) in abnormalSlopes"
            :key="idx"
            class="slope-item abnormal"
          >
            <div class="slope-position">
              {{ formatDistance(seg.startDistance) }} - {{ formatDistance(seg.endDistance) }}
            </div>
            <div class="slope-value">
              {{ formatSlope(seg.slope) }}
              <span class="slope-angle">({{ seg.slopeAngle.toFixed(1) }}°)</span>
            </div>
            <div class="slope-length">{{ formatDistance(seg.length) }}</div>
          </div>
        </div>

        <div v-if="result?.slopeSegments.length" class="all-slopes">
          <div class="detail-title">全部坡段 ({{ result.slopeSegments.length }})</div>
          <div class="slope-list compact">
            <div
              v-for="(seg, idx) in result?.slopeSegments"
              :key="idx"
              class="slope-item"
              :class="{ abnormal: seg.isAbnormal }"
            >
              <div class="slope-position">
                {{ formatDistance(seg.startDistance) }} - {{ formatDistance(seg.endDistance) }}
              </div>
              <div class="slope-value">
                {{ formatSlope(seg.slope) }}
              </div>
              <div class="slope-length">{{ formatDistance(seg.length) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="no-analysis">
      <div class="no-analysis-icon">📈</div>
      <div class="no-analysis-text">选择一个断面查看分析结果</div>
    </div>
  </div>
</template>

<style scoped>
.section-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background: #f8f9fa;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.draw-btn {
  padding: 6px 12px;
  border: 1px solid #e91e63;
  background: #fff;
  color: #e91e63;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.draw-btn:hover {
  background: #fce4ec;
}

.draw-btn.active {
  background: #e91e63;
  color: white;
}

.section-list {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}

.list-title {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

.empty-state {
  padding: 30px 20px;
  text-align: center;
  color: #999;
}

.empty-state.small {
  padding: 20px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: #bbb;
}

.section-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.section-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.section-item:hover {
  background: #e3f2fd;
}

.section-item.selected {
  background: #e3f2fd;
  border-color: #1976d2;
}

.section-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.section-info {
  flex: 1;
  min-width: 0;
}

.section-item .section-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-meta {
  font-size: 11px;
  color: #999;
}

.delete-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  border-radius: 4px;
  flex-shrink: 0;
}

.delete-btn:hover {
  background: #ffcdd2;
  color: #d32f2f;
}

.analysis-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.tab-btn {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;
}

.tab-btn:hover {
  color: #1976d2;
  background: #f5f5f5;
}

.tab-btn.active {
  color: #1976d2;
  border-bottom-color: #1976d2;
  background: #fff;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title-bar {
  padding: 8px 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-hint {
  font-size: 10px;
  color: #bbb;
  font-weight: normal;
}

.section-title:hover .edit-hint {
  color: #1976d2;
}

.section-title-edit {
  display: flex;
}

.section-name-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #1976d2;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.profile-chart {
  flex: 1;
  min-height: 200px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
}

.profile-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #666;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.export-buttons {
  display: flex;
  gap: 8px;
}

.export-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.export-btn.png {
  background: #1976d2;
  color: white;
}

.export-btn.png:hover {
  background: #1565c0;
}

.export-btn.json {
  background: #4caf50;
  color: white;
}

.export-btn.json:hover {
  background: #388e3c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-card {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #1976d2;
}

.stat-card.highlight {
  background: #fff3e0;
  border-left-color: #ff9800;
}

.stat-card.warning {
  background: #ffebee;
  border-left-color: #f44336;
}

.stat-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.stat-card.highlight .stat-value {
  color: #e65100;
}

.stat-card.warning .stat-value {
  color: #d32f2f;
}

.stat-sub {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}

.stats-detail {
  margin-top: 8px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.detail-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.threshold-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.threshold-control input[type='range'] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  border-radius: 2px;
  outline: none;
}

.threshold-control input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #e91e63;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.threshold-value {
  font-size: 12px;
  font-weight: 600;
  color: #e91e63;
  min-width: 50px;
  text-align: right;
}

.threshold-hint {
  font-size: 11px;
  color: #999;
  margin-top: 6px;
}

.slope-list {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.slope-list.compact {
  font-size: 11px;
}

.slope-header {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f5f5;
  font-size: 11px;
  font-weight: 600;
  color: #666;
  border-bottom: 1px solid #e0e0e0;
}

.slope-item {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 12px;
  color: #555;
}

.slope-item:last-child {
  border-bottom: none;
}

.slope-item.abnormal {
  background: #ffebee;
  color: #d32f2f;
}

.slope-position {
  font-family: monospace;
  font-size: 11px;
}

.slope-value {
  font-weight: 500;
}

.slope-angle {
  font-size: 10px;
  color: #999;
  font-weight: normal;
}

.slope-length {
  text-align: right;
  font-family: monospace;
  font-size: 11px;
}

.all-slopes {
  margin-top: 12px;
}

.no-analysis {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #999;
  padding: 40px 20px;
}

.no-analysis-icon {
  font-size: 48px;
  opacity: 0.5;
}

.no-analysis-text {
  font-size: 14px;
}
</style>
