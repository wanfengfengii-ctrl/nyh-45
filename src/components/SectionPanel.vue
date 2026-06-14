<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useSectionStore } from '@/stores/section'
import { useWorkspaceStore } from '@/stores/workspace'
import { useHistoryStore } from '@/stores/history'
import { ToolType, HistoryActionType, type BatchSectionExportOptions, type SectionAnalysisResult } from '@/types'
import { renderProfile, profileToDataURL } from '@/renderers/ProfileRenderer'
import {
  exportSectionToPNG as exportServiceExportPNG,
  exportSectionToJSON as exportServiceExportJSON,
  batchExportSections
} from '@/services/ExportService'

const sectionStore = useSectionStore()
const workspaceStore = useWorkspaceStore()
const historyStore = useHistoryStore()

const profileCanvas = ref<HTMLCanvasElement | null>(null)
const activeTab = ref<'profile' | 'statistics' | 'slopes' | 'export'>('profile')
const editingName = ref(false)
const tempName = ref('')
const batchExportMode = ref(false)
const selectedExportIds = ref<Set<string>>(new Set())
const exportOptions = ref<BatchSectionExportOptions>({
  sectionIds: [],
  format: 'both',
  includeProfile: true,
  includeStatistics: true,
  includeRawData: true
})

const hasAnalysisResult = computed(() => sectionStore.analysisResult !== null)

const result = computed<SectionAnalysisResult | null>(() => sectionStore.analysisResult)

const abnormalSlopes = computed(() => {
  if (!result.value) return []
  return result.value.slopeSegments.filter((s) => s.isAbnormal)
})

const allSelectedForExport = computed(() => {
  const activeCount = sectionStore.activeSections.length
  return activeCount > 0 && selectedExportIds.value.size === activeCount
})

const canExport = computed(() => selectedExportIds.value.size > 0)

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

function updateColor(sectionId: string, color: string) {
  historyStore.recordWith(
    HistoryActionType.UPDATE_SECTION,
    `更新断面颜色`,
    () => sectionStore.updateSectionColor(sectionId, color)
  )
}

function updateName(sectionId: string, name: string) {
  historyStore.recordWith(
    HistoryActionType.UPDATE_SECTION,
    `更新断面名称`,
    () => sectionStore.updateSectionName(sectionId, name)
  )
}

function toggleArchive(sectionId: string) {
  const desc = sectionStore.sections.find(s => s.id === sectionId)?.isArchived ? '恢复断面' : '归档断面'
  historyStore.recordWith(
    HistoryActionType.UPDATE_SECTION,
    desc,
    () => sectionStore.toggleArchiveSection(sectionId)
  )
}

function toggleExportSelect(sectionId: string) {
  if (selectedExportIds.value.has(sectionId)) {
    selectedExportIds.value.delete(sectionId)
  } else {
    selectedExportIds.value.add(sectionId)
  }
  selectedExportIds.value = new Set(selectedExportIds.value)
}

function selectAllForExport() {
  if (allSelectedForExport.value) {
    selectedExportIds.value.clear()
  } else {
    sectionStore.activeSections.forEach((s) => {
      selectedExportIds.value.add(s.id)
    })
  }
  selectedExportIds.value = new Set(selectedExportIds.value)
}

function enterBatchExportMode() {
  batchExportMode.value = true
  activeTab.value = 'export'
  selectedExportIds.value.clear()
}

function exitBatchExportMode() {
  batchExportMode.value = false
  selectedExportIds.value.clear()
  if (sectionStore.selectedSectionId) {
    activeTab.value = 'profile'
  } else {
    activeTab.value = 'profile'
  }
}

async function renderProfileToCanvas(sectionId: string): Promise<string | null> {
  const section = sectionStore.sections.find((s) => s.id === sectionId)
  if (!section?.analysisResult) return null
  return profileToDataURL(section.analysisResult, { title: section.name })
}

async function handleBatchExport() {
  if (!canExport.value) return

  const ids = Array.from(selectedExportIds.value)
  const results: SectionAnalysisResult[] = []
  for (const id of ids) {
    const section = sectionStore.sections.find((s) => s.id === id)
    if (section?.analysisResult) {
      results.push(section.analysisResult)
    }
  }

  const formats: ('png' | 'json')[] = []
  if (exportOptions.value.format === 'png' || exportOptions.value.format === 'both') {
    formats.push('png')
  }
  if (exportOptions.value.format === 'json' || exportOptions.value.format === 'both') {
    formats.push('json')
  }

  let idx = 0
  batchExportSections(results, {
    formats,
    onProgress: async () => {
      idx++
      if (idx < results.length) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
  })
}

function handleColorClick(section: any) {
  const input = document.createElement('input')
  input.type = 'color'
  input.value = section.color
  input.oninput = (ev: Event) => updateColor(section.id, (ev.target as HTMLInputElement).value)
  input.click()
}

function handleNameDoubleClick(section: any) {
  if (section.isArchived) return
  const input = document.createElement('input')
  input.type = 'text'
  input.value = section.name
  input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;'
  document.body.appendChild(input)
  input.focus()
  input.select()
  input.onblur = () => {
    if (input.value.trim() && input.value.trim() !== section.name) {
      updateName(section.id, input.value.trim())
    }
    document.body.removeChild(input)
  }
  input.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      input.blur()
    } else if (e.key === 'Escape') {
      input.value = section.name
      input.blur()
    }
  }
}

function drawProfile() {
  const canvas = profileCanvas.value
  if (!canvas || !result.value) return
  renderProfile(canvas, result.value, { showTitle: true, title: result.value.sectionName })
}

function exportToPNG() {
  if (!result.value) return
  exportServiceExportPNG(result.value, { title: result.value.sectionName })
}

function exportToJSON() {
  if (!result.value) return
  exportServiceExportJSON(result.value)
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

defineExpose({
  renderProfileToCanvas
})
</script>

<template>
  <div class="section-panel">
    <div class="panel-header">
      <h3 class="panel-title">📊 断面分析</h3>
      <div class="header-actions">
        <button
          v-if="!batchExportMode"
          class="draw-btn small"
          @click="enterBatchExportMode"
          :disabled="sectionStore.activeSections.length === 0"
        >
          📦 批量导出
        </button>
        <button
          v-else
          class="draw-btn small active"
          @click="exitBatchExportMode"
        >
          ✋ 取消导出
        </button>
        <button
          v-if="!batchExportMode && workspaceStore.currentTool !== ToolType.DRAW_SECTION"
          class="draw-btn"
          @click="startDrawSection"
        >
          ✏️ 绘制断面
        </button>
        <button
          v-if="!batchExportMode && workspaceStore.currentTool === ToolType.DRAW_SECTION"
          class="draw-btn active"
          @click="workspaceStore.setTool(ToolType.NONE)"
        >
          ✋ 取消绘制
        </button>
      </div>
    </div>

    <div class="section-list">
      <div class="list-header">
        <div class="list-title">断面列表 ({{ sectionStore.sectionCount }})</div>
        <div v-if="batchExportMode" class="batch-actions">
          <button class="select-all-btn" @click.stop="selectAllForExport">
            {{ allSelectedForExport ? '取消全选' : '全选' }}
          </button>
          <span class="selected-count">{{ selectedExportIds.size }} 已选</span>
        </div>
      </div>
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
          :class="{
            selected: section.id === sectionStore.selectedSectionId,
            archived: section.isArchived,
            'export-selected': selectedExportIds.has(section.id)
          }"
          @click="batchExportMode ? toggleExportSelect(section.id) : selectSection(section.id)"
        >
          <div v-if="batchExportMode" class="export-checkbox">
            <input
              type="checkbox"
              :checked="selectedExportIds.has(section.id)"
              @click.stop
              @change="toggleExportSelect(section.id)"
            />
          </div>
          <div class="section-color-wrapper">
            <div
              class="section-color"
              :style="{ background: section.color }"
              @click.stop="handleColorClick(section)"
              title="点击更改颜色"
            ></div>
          </div>
          <div class="section-info">
            <div
              class="section-name"
              :title="section.isArchived ? '' : '双击编辑名称'"
              @dblclick.stop="handleNameDoubleClick(section)"
            >{{ section.name }}</div>
            <div class="section-meta">
              {{ section.points.length }} 节点 · {{ formatDistance(sectionStore.getSectionLength(section.points)) }}
              <span v-if="section.isArchived" class="archive-tag">已归档</span>
            </div>
          </div>
          <div v-if="!batchExportMode" class="section-actions">
            <button
              v-if="!section.isArchived"
              class="action-btn edit"
              @click.stop="workspaceStore.setTool(ToolType.MOVE_NODE); sectionStore.startEditingNodes(section.id)"
              title="编辑节点"
            >
              ✏️
            </button>
            <button
              class="action-btn archive"
              @click.stop="toggleArchive(section.id)"
              :title="section.isArchived ? '恢复断面' : '归档断面'"
            >
              {{ section.isArchived ? '↩️' : '📦' }}
            </button>
            <button class="action-btn delete" @click.stop="deleteSection(section.id)" title="删除">
              ×
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="hasAnalysisResult || batchExportMode" class="analysis-content">
      <div class="tab-bar">
        <button
          v-if="!batchExportMode"
          class="tab-btn"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          📈 剖面图
        </button>
        <button
          v-if="!batchExportMode"
          class="tab-btn"
          :class="{ active: activeTab === 'statistics' }"
          @click="activeTab = 'statistics'"
        >
          📊 统计
        </button>
        <button
          v-if="!batchExportMode"
          class="tab-btn"
          :class="{ active: activeTab === 'slopes' }"
          @click="activeTab = 'slopes'"
        >
          ⚠️ 坡度
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'export' }"
          @click="activeTab = 'export'"
        >
          📦 导出
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

      <div v-else-if="activeTab === 'export'" class="tab-content">
        <div v-if="!batchExportMode && !sectionStore.selectedSectionId" class="empty-state small">
          <div class="empty-icon">📦</div>
          <div class="empty-text">请选择断面或进入批量导出模式</div>
        </div>
        <div v-else>
          <div class="export-header">
            <div class="detail-title">
              {{ batchExportMode ? '批量导出设置' : '单个断面导出' }}
            </div>
            <div v-if="batchExportMode" class="export-summary">
              已选择 {{ selectedExportIds.size }} 个断面
            </div>
          </div>

          <div class="export-options">
            <div class="option-group">
              <div class="option-label">导出格式</div>
              <div class="option-radios">
                <label class="radio-label">
                  <input
                    type="radio"
                    v-model="exportOptions.format"
                    value="png"
                  />
                  <span>📷 PNG 图片</span>
                </label>
                <label class="radio-label">
                  <input
                    type="radio"
                    v-model="exportOptions.format"
                    value="json"
                  />
                  <span>📄 JSON 数据</span>
                </label>
                <label class="radio-label">
                  <input
                    type="radio"
                    v-model="exportOptions.format"
                    value="both"
                  />
                  <span>📦 全部</span>
                </label>
              </div>
            </div>

            <div class="option-group">
              <div class="option-label">包含内容</div>
              <div class="option-checkboxes">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    v-model="exportOptions.includeProfile"
                  />
                  <span>剖面图数据</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    v-model="exportOptions.includeStatistics"
                  />
                  <span>统计信息</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    v-model="exportOptions.includeRawData"
                  />
                  <span>原始数据</span>
                </label>
              </div>
            </div>
          </div>

          <div class="export-actions">
            <button
              v-if="!batchExportMode"
              class="export-btn png"
              @click="exportToPNG"
              :disabled="!result"
            >
              📷 导出 PNG
            </button>
            <button
              v-if="!batchExportMode"
              class="export-btn json"
              @click="exportToJSON"
              :disabled="!result"
            >
              📄 导出 JSON
            </button>
            <button
              v-if="batchExportMode"
              class="export-btn batch"
              @click="handleBatchExport"
              :disabled="!canExport"
            >
              📦 批量导出 ({{ selectedExportIds.size }})
            </button>
          </div>

          <div v-if="batchExportMode" class="export-preview">
            <div class="detail-title">导出预览</div>
            <div v-if="selectedExportIds.size === 0" class="empty-hint">
              请在左侧列表选择要导出的断面
            </div>
            <div v-else class="preview-list">
              <div
                v-for="id in Array.from(selectedExportIds)"
                :key="id"
                class="preview-item"
              >
                <span
                  class="preview-color"
                  :style="{
                    background: sectionStore.sections.find((s) => s.id === id)?.color
                  }"
                ></span>
                <span class="preview-name">
                  {{ sectionStore.sections.find((s) => s.id === id)?.name }}
                </span>
              </div>
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

.header-actions {
  display: flex;
  gap: 8px;
}

.draw-btn.small {
  padding: 4px 8px;
  font-size: 11px;
}

.draw-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-all-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid #1976d2;
  background: #fff;
  color: #1976d2;
  border-radius: 3px;
  cursor: pointer;
}

.select-all-btn:hover {
  background: #e3f2fd;
}

.selected-count {
  font-size: 11px;
  color: #666;
}

.section-item.archived {
  opacity: 0.6;
}

.section-item.export-selected {
  background: #e8f5e9;
  border-color: #4caf50;
}

.export-checkbox {
  display: flex;
  align-items: center;
}

.export-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.section-color-wrapper {
  position: relative;
}

.section-color-wrapper .section-color {
  cursor: pointer;
  width: 16px;
  height: 16px;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s;
}

.section-color-wrapper .section-color:hover {
  transform: scale(1.2);
}

.archive-tag {
  margin-left: 4px;
  padding: 1px 4px;
  background: #eee;
  color: #888;
  border-radius: 3px;
  font-size: 10px;
}

.section-actions {
  display: flex;
  gap: 2px;
}

.action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  border-radius: 3px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.action-btn:hover {
  color: #333;
  background: #e0e0e0;
}

.action-btn.edit:hover {
  color: #1976d2;
  background: #e3f2fd;
}

.action-btn.archive:hover {
  color: #ff9800;
  background: #fff3e0;
}

.action-btn.delete:hover {
  color: #d32f2f;
  background: #ffebee;
}

.export-header {
  margin-bottom: 16px;
}

.export-summary {
  font-size: 13px;
  color: #4caf50;
  font-weight: 500;
  margin-top: 4px;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.option-radios,
.option-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radio-label,
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.radio-label:hover,
.checkbox-label:hover {
  background: #f5f5f5;
}

.radio-label input,
.checkbox-label input {
  cursor: pointer;
}

.export-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.export-btn.batch {
  flex: 1;
  background: #4caf50;
  color: white;
}

.export-btn.batch:hover {
  background: #388e3c;
}

.export-btn.batch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-preview {
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 12px;
}

.preview-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.preview-name {
  color: #333;
}
</style>
