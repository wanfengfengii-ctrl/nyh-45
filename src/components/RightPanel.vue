<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSoundingStore } from '@/stores/sounding'
import { useContourStore } from '@/stores/contour'
import { useValidationStore } from '@/stores/validation'
import { useProjectStore } from '@/stores/project'
import { ValidationSeverity, ToolType, ProjectStatus, HistoryActionType } from '@/types'
import type { ValidationIssue } from '@/types'
import { useHistoryStore } from '@/stores/history'
import StatisticsPanel from './StatisticsPanel.vue'
import SectionPanel from './SectionPanel.vue'

const workspaceStore = useWorkspaceStore()
const soundingStore = useSoundingStore()
const contourStore = useContourStore()
const validationStore = useValidationStore()
const projectStore = useProjectStore()
const historyStore = useHistoryStore()

function formatPosition(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatStatus(status?: ProjectStatus): string {
  const map: Record<string, string> = {
    draft: '草稿',
    pending_review: '待复核',
    reviewed: '已复核',
    completed: '已完成'
  }
  return map[status || 'draft']
}

function getStatusColor(status?: ProjectStatus): string {
  const map: Record<string, string> = {
    draft: '#999',
    pending_review: '#f57c00',
    reviewed: '#1976d2',
    completed: '#388e3c'
  }
  return map[status || 'draft']
}

function updateSoundingDepth(id: string, value: string) {
  const depth = parseFloat(value)
  if (!isNaN(depth)) {
    const orig = soundingStore.getPointById(id)
    if (orig && Math.abs(orig.depth - depth) > 0.001) {
      historyStore.recordAction(HistoryActionType.UPDATE_SOUNDING, `修改测深点深度 ${orig.depth.toFixed(1)}m → ${depth.toFixed(1)}m`)
      soundingStore.updatePoint(id, { depth })
      if (validationStore.autoValidate) {
        validationStore.validateAfterPointMove(id)
      }
    }
  }
}

function updateSoundingNote(id: string, value: string) {
  const orig = soundingStore.getPointById(id)
  historyStore.recordAction(HistoryActionType.UPDATE_SOUNDING, `修改测深点备注`)
  soundingStore.updatePoint(id, { note: value })
  void orig
}

function updateContourDepth(id: string, value: string) {
  const depth = parseFloat(value)
  if (!isNaN(depth)) {
    const orig = contourStore.lines.find(l => l.id === id)
    historyStore.recordAction(HistoryActionType.UPDATE_CONTOUR, `修改等深线深度 ${orig?.depth ?? '?'}m → ${depth}m`)
    contourStore.updateLine(id, { depth })
    if (validationStore.autoValidate) {
      validationStore.runFullValidation()
    }
  }
}

function updateContourLabel(id: string, value: string) {
  historyStore.recordAction(HistoryActionType.UPDATE_CONTOUR, `修改等深线标签`)
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
    historyStore.recordAction(HistoryActionType.UPDATE_CONTOUR, `闭合等深线 (${line.depth}m)`)
    contourStore.updateLine(id, { isClosed: true, points: pts })
  } else if (line.isClosed && pts.length >= 4) {
    historyStore.recordAction(HistoryActionType.UPDATE_CONTOUR, `打开等深线 (${line.depth}m)`)
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

function selectSoundingFromIssue(issue: ValidationIssue) {
  const soundingId = issue.relatedIds.find(id =>
    soundingStore.points.some(p => p.id === id)
  )
  if (soundingId) {
    soundingStore.selectPoint(soundingId)
    contourStore.selectLine(null)
  } else {
    const contourId = issue.relatedIds.find(id =>
      contourStore.lines.some(l => l.id === id)
    )
    if (contourId) {
      contourStore.selectLine(contourId)
      soundingStore.selectPoint(null)
    }
  }
}

const sortedSoundings = computed(() =>
  [...soundingStore.points].sort((a, b) => b.createdAt - a.createdAt)
)

const sortedContours = computed(() =>
  [...contourStore.lines].sort((a, b) => b.createdAt - a.createdAt)
)
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
      <button
        class="tab-btn"
        :class="{ active: workspaceStore.rightPanelTab === 'projects' }"
        @click="workspaceStore.setRightPanelTab('projects')"
      >
        项目
      </button>
      <button
        class="tab-btn"
        :class="{ active: workspaceStore.rightPanelTab === 'section' }"
        @click="workspaceStore.setRightPanelTab('section')"
      >
        断面分析
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
          <div class="property-row">
            <label>创建时间</label>
            <span class="muted">{{ formatDate(soundingStore.selectedPoint.createdAt) }}</span>
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
          <div class="property-row">
            <label>创建时间</label>
            <span class="muted">{{ formatDate(contourStore.selectedLine.createdAt) }}</span>
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

        <div v-else class="browse-list">
          <div class="section-title">测深点 ({{ soundingStore.totalPoints }})</div>
          <div v-if="soundingStore.points.length === 0" class="empty-list">
            暂无测深点
          </div>
          <div v-else class="list-scroll">
            <div
              v-for="pt in sortedSoundings.slice(0, 20)"
              :key="pt.id"
              class="list-item"
              :class="{ selected: soundingStore.selectedPointId === pt.id }"
              @click="soundingStore.selectPoint(pt.id); contourStore.selectLine(null)"
            >
              <span class="li-depth">{{ pt.depth.toFixed(1) }}m</span>
              <span class="li-pos">{{ formatPosition(pt.position.lat, pt.position.lng) }}</span>
            </div>
            <div v-if="soundingStore.totalPoints > 20" class="list-more">
              ... 还有 {{ soundingStore.totalPoints - 20 }} 个
            </div>
          </div>
          <div class="section-title" style="margin-top: 16px">等深线 ({{ contourStore.lines.length }})</div>
          <div v-if="contourStore.lines.length === 0" class="empty-list">
            暂无等深线
          </div>
          <div v-else class="list-scroll">
            <div
              v-for="line in sortedContours.slice(0, 20)"
              :key="line.id"
              class="list-item contour"
              :class="{ selected: contourStore.selectedLineId === line.id }"
              @click="contourStore.selectLine(line.id); soundingStore.selectPoint(null)"
            >
              <span class="li-color" :style="{ background: line.color }"></span>
              <span class="li-depth">{{ line.depth }}m</span>
              <span class="li-count">{{ line.points.length }} 节点</span>
              <span v-if="line.isClosed" class="li-tag">闭合</span>
            </div>
            <div v-if="contourStore.lines.length > 20" class="list-more">
              ... 还有 {{ contourStore.lines.length - 20 }} 条
            </div>
          </div>
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
        <div v-if="validationStore.hasCriticalErrors" class="critical-warning">
          ⚠ 存在严重错误，无法提交待复核或标记完成
        </div>
        <div class="issue-list">
          <div
            v-for="issue in validationStore.result.issues"
            :key="issue.id"
            class="issue-item"
            :style="{ borderLeftColor: getSeverityColor(issue.severity) }"
            @click="selectSoundingFromIssue(issue)"
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
            <div v-if="issue.position" class="issue-pos">
              位置: {{ formatPosition(issue.position.lat, issue.position.lng) }}
            </div>
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

      <div v-if="workspaceStore.rightPanelTab === 'projects'" class="projects-panel">
        <div class="section-title">当前项目</div>
        <div v-if="projectStore.currentProject" class="current-project-card">
          <div class="cpc-name">{{ projectStore.currentProject.name }}</div>
          <div v-if="projectStore.currentProject.description" class="cpc-desc">
            {{ projectStore.currentProject.description }}
          </div>
          <div class="cpc-stats">
            <span>{{ projectStore.currentProject.soundings.length }} 测深点</span>
            <span>{{ projectStore.currentProject.contours.length }} 等深线</span>
          </div>
          <div class="cpc-meta">
            <span
              class="cpc-status"
              :style="{ background: getStatusColor(projectStore.currentProject.status) }"
            >
              {{ formatStatus(projectStore.currentProject.status) }}
            </span>
            <span v-if="projectStore.isDirty" class="cpc-dirty">未保存</span>
          </div>
          <div class="cpc-time">
            更新于 {{ formatDate(projectStore.currentProject.updatedAt) }}
          </div>
        </div>
        <div v-else class="empty-hint small">
          <p>尚未打开项目</p>
        </div>

        <div class="section-title" style="margin-top: 20px">
          项目列表 ({{ projectStore.sortedProjects.length }})
        </div>
        <div v-if="projectStore.sortedProjects.length === 0" class="empty-hint small">
          <p>暂无保存的项目</p>
        </div>
        <div v-else class="project-list">
          <div
            v-for="proj in projectStore.sortedProjects"
            :key="proj.id"
            class="project-item"
            :class="{ active: proj.id === projectStore.currentProjectId }"
          >
            <div class="pi-header">
              <span class="pi-name">{{ proj.name }}</span>
              <span
                class="pi-status"
                :style="{ background: getStatusColor(proj.status) }"
              >
                {{ formatStatus(proj.status) }}
              </span>
            </div>
            <div class="pi-stats">
              {{ proj.soundings.length }} 测深点 · {{ proj.contours.length }} 等深线
            </div>
            <div class="pi-time">{{ formatDate(proj.updatedAt) }}</div>
          </div>
        </div>

        <div class="section-title" style="margin-top: 20px">工作流状态</div>
        <div class="workflow-steps">
          <div
            class="wf-step"
            :class="{ done: true, current: workspaceStore.status.projectStatus === 'draft' }"
          >
            <div class="wf-dot">1</div>
            <div class="wf-label">草稿编辑</div>
          </div>
          <div class="wf-line" :class="{ done: workspaceStore.status.projectStatus !== 'draft' }"></div>
          <div
            class="wf-step"
            :class="{
              done: ['pending_review', 'reviewed', 'completed'].includes(workspaceStore.status.projectStatus || ''),
              current: workspaceStore.status.projectStatus === 'pending_review'
            }"
          >
            <div class="wf-dot">2</div>
            <div class="wf-label">待复核</div>
          </div>
          <div class="wf-line" :class="{ done: ['reviewed', 'completed'].includes(workspaceStore.status.projectStatus || '') }"></div>
          <div
            class="wf-step"
            :class="{
              done: ['reviewed', 'completed'].includes(workspaceStore.status.projectStatus || ''),
              current: workspaceStore.status.projectStatus === 'reviewed'
            }"
          >
            <div class="wf-dot">3</div>
            <div class="wf-label">已复核</div>
          </div>
          <div class="wf-line" :class="{ done: workspaceStore.status.projectStatus === 'completed' }"></div>
          <div
            class="wf-step"
            :class="{
              done: workspaceStore.status.projectStatus === 'completed',
              current: false
            }"
          >
            <div class="wf-dot">4</div>
            <div class="wf-label">已完成</div>
          </div>
        </div>
      </div>

      <div v-if="workspaceStore.rightPanelTab === 'section'" class="section-panel-wrapper">
        <SectionPanel />
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
  padding: 12px 6px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
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
.validation-panel,
.projects-panel {
  padding: 16px;
}
.property-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
  margin-bottom: 4px;
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
.muted {
  color: #999;
  font-size: 12px;
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
.browse-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list-scroll {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: #f8f9fa;
  transition: all 0.1s;
}
.list-item:hover {
  background: #e3f2fd;
}
.list-item.selected {
  background: #bbdefb;
}
.li-depth {
  font-weight: 600;
  color: #1976d2;
  min-width: 45px;
}
.li-pos {
  color: #666;
  font-family: monospace;
  font-size: 11px;
}
.list-item.contour {
  gap: 6px;
}
.li-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.li-count {
  margin-left: auto;
  color: #888;
  font-size: 11px;
}
.li-tag {
  font-size: 10px;
  color: #388e3c;
  background: #e8f5e9;
  padding: 1px 5px;
  border-radius: 3px;
}
.list-more {
  text-align: center;
  color: #999;
  font-size: 11px;
  padding: 4px;
}
.empty-list {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 12px;
  background: #fafafa;
  border-radius: 4px;
}
.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}
.empty-hint.small {
  padding: 20px;
}
.empty-hint.small p {
  margin: 0;
  font-size: 12px;
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
.critical-warning {
  background: #ffebee;
  color: #c62828;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 12px;
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
  cursor: pointer;
  transition: background 0.15s;
}
.issue-item:hover {
  background: #f0f0f0;
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
.issue-pos {
  font-size: 11px;
  color: #666;
  font-family: monospace;
  margin-bottom: 2px;
}
.issue-ids {
  font-size: 10px;
  color: #999;
  font-family: monospace;
}
.current-project-card {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  padding: 12px;
  border-radius: 8px;
  border-left: 4px solid #1976d2;
}
.cpc-name {
  font-size: 15px;
  font-weight: 600;
  color: #0d47a1;
  margin-bottom: 4px;
}
.cpc-desc {
  font-size: 12px;
  color: #555;
  margin-bottom: 8px;
}
.cpc-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #1565c0;
  margin-bottom: 8px;
}
.cpc-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cpc-status {
  color: white;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}
.cpc-dirty {
  font-size: 11px;
  color: #d32f2f;
  font-weight: 500;
}
.cpc-time {
  margin-top: 6px;
  font-size: 11px;
  color: #666;
}
.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.project-item {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
  border-left: 3px solid #ddd;
  cursor: pointer;
  transition: all 0.15s;
}
.project-item:hover {
  background: #f0f0f0;
  border-left-color: #1976d2;
}
.project-item.active {
  background: #e3f2fd;
  border-left-color: #1976d2;
}
.pi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.pi-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}
.pi-status {
  color: white;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 3px;
}
.pi-stats {
  font-size: 11px;
  color: #666;
  margin-bottom: 2px;
}
.pi-time {
  font-size: 10px;
  color: #999;
}
.workflow-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 8px;
}
.wf-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.wf-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}
.wf-step.done .wf-dot {
  background: #4caf50;
  color: white;
}
.wf-step.current .wf-dot {
  background: #1976d2;
  color: white;
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.2);
}
.wf-label {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
}
.wf-step.done .wf-label,
.wf-step.current .wf-label {
  color: #333;
  font-weight: 500;
}
.wf-line {
  flex: 1;
  height: 2px;
  background: #e0e0e0;
  margin: 0 4px;
  margin-bottom: 18px;
  transition: background 0.2s;
}
.wf-line.done {
  background: #4caf50;
}

.section-panel-wrapper {
  height: 100%;
  min-height: 0;
}
</style>
