<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace'
import { useSoundingStore } from '@/stores/sounding'
import { useContourStore } from '@/stores/contour'
import { useValidationStore } from '@/stores/validation'
import { ValidationSeverity, ToolType } from '@/types'
import type { ValidationIssue } from '@/types'
import StatisticsPanel from './StatisticsPanel.vue'

const workspaceStore = useWorkspaceStore()
const soundingStore = useSoundingStore()
const contourStore = useContourStore()
const validationStore = useValidationStore()

function formatPosition(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function updateSoundingDepth(id: string, value: string) {
  const depth = parseFloat(value)
  if (!isNaN(depth)) {
    soundingStore.updatePoint(id, { depth })
    if (validationStore.autoValidate) {
      validationStore.validateAfterPointMove(id)
    }
  }
}

function updateSoundingNote(id: string, value: string) {
  soundingStore.updatePoint(id, { note: value })
}

function updateContourDepth(id: string, value: string) {
  const depth = parseFloat(value)
  if (!isNaN(depth)) {
    contourStore.updateLine(id, { depth })
    if (validationStore.autoValidate) {
      validationStore.runFullValidation()
    }
  }
}

function updateContourLabel(id: string, value: string) {
  contourStore.updateLine(id, { label: value })
}

function deleteSounding(id: string) {
  soundingStore.deletePoint(id)
  if (validationStore.autoValidate) {
    validationStore.validateAfterDelete(id)
  }
}

function deleteContour(id: string) {
  contourStore.deleteLine(id)
  if (validationStore.autoValidate) {
    validationStore.runFullValidation()
  }
}

function toggleContourClosed(id: string) {
  const line = contourStore.lines.find((l) => l.id === id)
  if (!line) return
  const pts = [...line.points]
  if (!line.isClosed && pts.length >= 3) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (Math.abs(first.lat - last.lat) > 0.00001 || Math.abs(first.lng - last.lng) > 0.00001) {
      pts.push({ ...first })
    }
    contourStore.updateLine(id, { isClosed: true, points: pts })
  } else if (line.isClosed && pts.length >= 4) {
    contourStore.updateLine(id, { isClosed: false, points: pts.slice(0, -1) })
  }
  if (validationStore.autoValidate) {
    validationStore.runFullValidation()
  }
}

function getSeverityColor(severity: ValidationSeverity): string {
  switch (severity) {
    case ValidationSeverity.ERROR:
      return '#d32f2f'
    case ValidationSeverity.WARNING:
      return '#f57c00'
    default:
      return '#1976d2'
  }
}

function getSeverityLabel(severity: ValidationSeverity): string {
  switch (severity) {
    case ValidationSeverity.ERROR:
      return '错误'
    case ValidationSeverity.WARNING:
      return '警告'
    default:
      return '提示'
  }
}

function getIssueTypeLabel(issue: ValidationIssue): string {
  const map: Record<string, string> = {
    negative_depth: '负深度',
    duplicate_position: '位置重复',
    contour_intersection: '等深线交叉',
    depth_jump: '深度跳变',
    unclosed_contour: '未闭合',
    data_inconsistency: '数据不一致'
  }
  return map[issue.type] || issue.type
}
</script>

<template>
  <div class="right-panel">
    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: workspaceStore.rightPanelTab === 'properties' }"
        @click="workspaceStore.setRightPanelTab('properties')"
      >
        属性
      </button>
      <button
        class="tab-btn"
        :class="{ active: workspaceStore.rightPanelTab === 'statistics' }"
        @click="workspaceStore.setRightPanelTab('statistics')"
      >
        统计
      </button>
      <button
        class="tab-btn validate"
        :class="{ active: workspaceStore.rightPanelTab === 'validation' }"
        @click="workspaceStore.setRightPanelTab('validation')"
      >
        校绘检查
        <span v-if="validationStore.errors.length" class="error-badge">
          {{ validationStore.errors.length }}
        </span>
      </button>
    </div>

    <div class="tab-content">
      <div v-if="workspaceStore.rightPanelTab === 'properties'" class="properties-panel">
        <div v-if="soundingStore.selectedPoint" class="property-section">
          <div class="section-title">测深点属性</div>
          <div class="property-row">
            <label>ID</label>
            <span class="mono">{{ soundingStore.selectedPoint.id.slice(-8) }}</span>
          </div>
          <div class="property-row">
            <label>位置</label>
            <span>{{ formatPosition(soundingStore.selectedPoint.position.lat, soundingStore.selectedPoint.position.lng) }}</span>
          </div>
          <div class="property-row">
            <label>深度 (m)</label>
            <input
              type="number"
              class="prop-input"
              :value="soundingStore.selectedPoint.depth"
              min="0"
              step="0.1"
              @change="updateSoundingDepth(soundingStore.selectedPoint!.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="property-row">
            <label>备注</label>
            <input
              type="text"
              class="prop-input"
              :value="soundingStore.selectedPoint.note || ''"
              placeholder="添加备注..."
              @change="updateSoundingNote(soundingStore.selectedPoint!.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <button class="danger-btn" @click="deleteSounding(soundingStore.selectedPoint!.id)">
            删除测深点
          </button>
        </div>

        <div v-else-if="contourStore.selectedLine" class="property-section">
          <div class="section-title">等深线属性</div>
          <div class="property-row">
            <label>ID</label>
            <span class="mono">{{ contourStore.selectedLine.id.slice(-8) }}</span>
          </div>
          <div class="property-row">
            <label>节点数</label>
            <span>{{ contourStore.selectedLine.points.length }}</span>
          </div>
          <div class="property-row">
            <label>深度 (m)</label>
            <input
              type="number"
              class="prop-input"
              :value="contourStore.selectedLine.depth"
              min="0"
              step="0.5"
              @change="updateContourDepth(contourStore.selectedLine!.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="property-row">
            <label>标签</label>
            <input
              type="text"
              class="prop-input"
              :value="contourStore.selectedLine.label || ''"
              @change="updateContourLabel(contourStore.selectedLine!.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="property-row">
            <label>是否闭合</label>
            <label class="toggle-switch">
              <input
                type="checkbox"
                :checked="contourStore.selectedLine.isClosed"
                @change="toggleContourClosed(contourStore.selectedLine!.id)"
              />
              <span class="slider"></span>
            </label>
          </div>
          <div class="property-row">
            <label>颜色</label>
            <span class="color-swatch" :style="{ background: contourStore.selectedLine.color }"></span>
          </div>
          <button
            class="action-btn edit"
            @click="workspaceStore.setTool(ToolType.MOVE_NODE); contourStore.startEditingNodes(contourStore.selectedLine!.id)"
          >
            ✏️ 编辑节点
          </button>
          <button class="danger-btn" @click="deleteContour(contourStore.selectedLine!.id)">
            删除等深线
          </button>
        </div>

        <div v-else class="empty-hint">
          <div class="hint-icon">ℹ️</div>
          <p>点击地图上的测深点或等深线</p>
          <p>查看和编辑属性</p>
        </div>
      </div>

      <div v-if="workspaceStore.rightPanelTab === 'statistics'" class="statistics-panel">
        <StatisticsPanel />
      </div>

      <div v-if="workspaceStore.rightPanelTab === 'validation'" class="validation-panel">
        <div class="validation-header">
          <div class="validation-summary">
            <div class="summary-item error" v-if="validationStore.errors.length">
              <span class="count">{{ validationStore.errors.length }}</span>
              <span class="label">错误</span>
            </div>
            <div class="summary-item warning" v-if="validationStore.warnings.length">
              <span class="count">{{ validationStore.warnings.length }}</span>
              <span class="label">警告</span>
            </div>
            <div class="summary-item ok" v-if="!validationStore.errors.length && !validationStore.warnings.length && validationStore.result.issues.length === 0">
              <span class="count">✓</span>
              <span class="label">暂无问题</span>
            </div>
          </div>
          <div v-if="validationStore.result.timestamp" class="validation-time">
            {{ new Date(validationStore.result.timestamp).toLocaleTimeString() }}
          </div>
        </div>
        <div class="issue-list">
          <div
            v-for="issue in validationStore.result.issues"
            :key="issue.id"
            class="issue-item"
            :style="{ borderLeftColor: getSeverityColor(issue.severity) }"
          >
            <div class="issue-header">
              <span
                class="severity-tag"
                :style="{ background: getSeverityColor(issue.severity) }"
              >
                {{ getSeverityLabel(issue.severity) }}
              </span>
              <span class="issue-type">{{ getIssueTypeLabel(issue) }}</span>
            </div>
            <div class="issue-message">{{ issue.message }}</div>
            <div class="issue-ids">
              关联: {{ issue.relatedIds.map((id) => id.slice(-6)).join(', ') }}
            </div>
          </div>
          <div v-if="validationStore.result.issues.length === 0" class="empty-hint">
            <div class="hint-icon">✅</div>
            <p>所有校绘检查通过</p>
            <p class="hint-sub">点击左侧"执行校绘检查"开始</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.right-panel {
  width: 320px;
  height: 100%;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}
.tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}
.tab-btn {
  flex: 1;
  padding: 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  position: relative;
}
.tab-btn:hover {
  color: #1976d2;
}
.tab-btn.active {
  color: #1976d2;
  border-bottom-color: #1976d2;
  font-weight: 500;
}
.error-badge {
  display: inline-block;
  background: #d32f2f;
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 4px;
}
.tab-content {
  flex: 1;
  overflow-y: auto;
}
.properties-panel,
.statistics-panel,
.validation-panel {
  padding: 16px;
}
.property-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}
.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.property-row label {
  font-size: 12px;
  color: #666;
  min-width: 60px;
}
.prop-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.prop-input:focus {
  border-color: #1976d2;
}
.mono {
  font-family: monospace;
  font-size: 12px;
  color: #555;
}
.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #ddd;
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  transition: 0.2s;
}
.slider::before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}
.toggle-switch input:checked + .slider {
  background: #1976d2;
}
.toggle-switch input:checked + .slider::before {
  transform: translateX(18px);
}
.action-btn,
.danger-btn {
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn.edit {
  background: #1976d2;
  color: white;
}
.action-btn.edit:hover {
  background: #1565c0;
}
.danger-btn {
  background: #fff;
  color: #d32f2f;
  border: 1px solid #ffcdd2;
}
.danger-btn:hover {
  background: #ffebee;
}
.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}
.hint-icon {
  font-size: 40px;
  margin-bottom: 12px;
}
.empty-hint p {
  margin: 4px 0;
  font-size: 13px;
}
.hint-sub {
  font-size: 11px;
  color: #bbb;
}
.validation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.validation-summary {
  display: flex;
  gap: 16px;
}
.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  border-radius: 6px;
}
.summary-item.error {
  background: #ffebee;
}
.summary-item.error .count {
  color: #d32f2f;
}
.summary-item.warning {
  background: #fff3e0;
}
.summary-item.warning .count {
  color: #f57c00;
}
.summary-item.ok {
  background: #e8f5e9;
}
.summary-item.ok .count {
  color: #388e3c;
}
.summary-item .count {
  font-size: 22px;
  font-weight: 600;
}
.summary-item .label {
  font-size: 11px;
  color: #666;
}
.validation-time {
  font-size: 11px;
  color: #999;
}
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.issue-item {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
  border-left: 3px solid;
}
.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.severity-tag {
  padding: 2px 8px;
  border-radius: 3px;
  color: white;
  font-size: 10px;
  font-weight: 600;
}
.issue-type {
  font-size: 12px;
  color: #555;
  font-weight: 500;
}
.issue-message {
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  margin-bottom: 4px;
}
.issue-ids {
  font-size: 10px;
  color: #999;
  font-family: monospace;
}
</style>
