<script setup lang="ts">
import { ToolType, ProjectStatus } from '@/types'
import { useWorkspaceStore } from '@/stores/workspace'
import { useContourStore } from '@/stores/contour'
import { useSoundingStore } from '@/stores/sounding'
import { useValidationStore } from '@/stores/validation'
import { useHistoryStore } from '@/stores/history'
import { useProjectStore } from '@/stores/project'

const workspaceStore = useWorkspaceStore()
const contourStore = useContourStore()
const soundingStore = useSoundingStore()
const validationStore = useValidationStore()
const historyStore = useHistoryStore()
const projectStore = useProjectStore()

const emit = defineEmits<{
  (e: 'run-validation'): void
  (e: 'mark-complete'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'new-project'): void
  (e: 'open-project'): void
  (e: 'save-project'): void
  (e: 'export'): void
  (e: 'submit-review'): void
}>()

const tools = [
  { type: ToolType.NONE, label: '选择', icon: '✋' },
  { type: ToolType.ADD_SOUNDING, label: '添加测深点', icon: '📍' },
  { type: ToolType.EDIT_POINT, label: '编辑测深点', icon: '🔧' },
  { type: ToolType.DRAW_CONTOUR, label: '绘制等深线', icon: '〰️' },
  { type: ToolType.MOVE_NODE, label: '编辑节点', icon: '✏️' },
  { type: ToolType.DELETE, label: '删除', icon: '🗑️' },
  { type: ToolType.DRAW_SECTION, label: '断面分析', icon: '📊' }
]

function selectTool(type: ToolType) {
  workspaceStore.setTool(type)
}

function handleDepthChange(depth: number) {
  workspaceStore.defaultDepth = depth
  contourStore.setCurrentDepth(depth)
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
</script>

<template>
  <div class="tool-panel">
    <div class="panel-section">
      <div class="section-title">项目</div>
      <div v-if="projectStore.currentProject" class="project-header">
        <div class="project-name">{{ projectStore.currentProject.name }}</div>
        <div class="project-status">
          <span class="status-dot" :class="workspaceStore.status.projectStatus || 'draft'"></span>
          {{ formatStatus(workspaceStore.status.projectStatus) }}
          <span v-if="projectStore.isDirty" class="dirty-mark">*</span>
        </div>
      </div>
      <div v-else class="project-header">
        <div class="project-name no-project">未打开项目</div>
        <div class="project-status muted">新建或打开项目</div>
      </div>
      <div class="project-actions">
        <button class="proj-btn" @click="emit('new-project')" title="新建项目">
          <span class="proj-icon">📄</span>
          <span>新建</span>
        </button>
        <button class="proj-btn" @click="emit('open-project')" title="打开项目">
          <span class="proj-icon">📂</span>
          <span>打开</span>
        </button>
        <button class="proj-btn" @click="emit('save-project')" title="保存项目">
          <span class="proj-icon">💾</span>
          <span>保存</span>
        </button>
        <button class="proj-btn" @click="emit('export')" title="导出">
          <span class="proj-icon">📤</span>
          <span>导出</span>
        </button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">历史记录</div>
      <div class="history-buttons">
        <button
          class="hist-btn"
          :class="{ disabled: !historyStore.canUndo }"
          :disabled="!historyStore.canUndo"
          @click="emit('undo')"
        >
          ↶ 撤销
          <span class="hist-hint">Ctrl+Z</span>
        </button>
        <button
          class="hist-btn"
          :class="{ disabled: !historyStore.canRedo }"
          :disabled="!historyStore.canRedo"
          @click="emit('redo')"
        >
          ↷ 重做
          <span class="hist-hint">Ctrl+Y</span>
        </button>
      </div>
      <div v-if="historyStore.undoAction" class="last-action">
        <span class="la-label">上次操作:</span>
        <span class="la-text">{{ historyStore.undoAction.description }}</span>
      </div>
      <div v-if="historyStore.actions.length > 0" class="history-count">
        共 {{ historyStore.actions.length }} 条历史记录
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">工具</div>
      <div class="tool-grid">
        <button
          v-for="tool in tools"
          :key="tool.type"
          class="tool-btn"
          :class="{ active: workspaceStore.currentTool === tool.type }"
          @click="selectTool(tool.type)"
        >
          <span class="tool-icon">{{ tool.icon }}</span>
          <span class="tool-label">{{ tool.label }}</span>
        </button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">深度设置</div>
      <div class="depth-selector">
        <label class="field-label">新测深点默认深度 (m)</label>
        <input
          type="number"
          class="depth-input"
          :value="workspaceStore.defaultDepth"
          min="0"
          step="0.5"
          @input="handleDepthChange(parseFloat(($event.target as HTMLInputElement).value) || 0)"
        />
      </div>
      <div class="depth-selector">
        <label class="field-label">当前等深线深度 (m)</label>
        <select
          class="depth-select"
          :value="contourStore.currentDepth"
          @change="contourStore.setCurrentDepth(parseFloat(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="lvl in contourStore.depthLevels" :key="lvl.depth" :value="lvl.depth">
            {{ lvl.label }}
          </option>
        </select>
        <div class="custom-depth">
          <input
            type="number"
            class="depth-input"
            placeholder="自定义深度"
            min="0"
            step="1"
            @change="contourStore.setCurrentDepth(parseFloat(($event.target as HTMLInputElement).value) || 0)"
          />
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">显示选项</div>
      <div class="display-options">
        <label class="option-item">
          <input
            type="checkbox"
            v-model="workspaceStore.showSoundingPoints"
          />
          <span>测深点</span>
        </label>
        <label class="option-item">
          <input
            type="checkbox"
            v-model="workspaceStore.showContourLines"
          />
          <span>等深线</span>
        </label>
        <label class="option-item">
          <input
            type="checkbox"
            v-model="workspaceStore.showDepthLabels"
          />
          <span>深度标签</span>
        </label>
        <label class="option-item">
          <input
            type="checkbox"
            v-model="validationStore.autoValidate"
          />
          <span>自动校绘检查</span>
        </label>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">操作</div>
      <div class="action-buttons">
        <button class="action-btn validate" @click="emit('run-validation')">
          🔍 执行校绘检查
        </button>
        <button
          v-if="workspaceStore.status.projectStatus === 'draft' || !workspaceStore.status.projectStatus"
          class="action-btn review"
          :class="{ disabled: validationStore.hasCriticalErrors }"
          :disabled="validationStore.hasCriticalErrors"
          @click="emit('submit-review')"
        >
          📨 提交待复核
        </button>
        <button
          class="action-btn complete"
          :class="{ disabled: !workspaceStore.canMarkCompleted }"
          :disabled="!workspaceStore.canMarkCompleted"
          @click="emit('mark-complete')"
        >
          {{ workspaceStore.status.isCompleted ? '✅ 已完成' : '✓ 标记完成' }}
        </button>
      </div>
      <div v-if="workspaceStore.status.isCompleted" class="completed-badge">
        已标记完成于 {{ new Date(workspaceStore.status.completedAt!).toLocaleString() }}
      </div>
      <div v-if="workspaceStore.status.projectStatus === 'pending_review'" class="review-badge">
        📋 待复核状态
        <div class="review-time">
          提交于 {{ new Date(workspaceStore.status.submittedAt!).toLocaleString() }}
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">统计概览</div>
      <div class="stats-overview">
        <div class="stat-item">
          <span class="stat-value">{{ soundingStore.totalPoints }}</span>
          <span class="stat-label">测深点</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ contourStore.lines.length }}</span>
          <span class="stat-label">等深线</span>
        </div>
        <div class="stat-item error" v-if="validationStore.errors.length">
          <span class="stat-value">{{ validationStore.errors.length }}</span>
          <span class="stat-label">错误</span>
        </div>
        <div class="stat-item warning" v-if="validationStore.warnings.length">
          <span class="stat-value">{{ validationStore.warnings.length }}</span>
          <span class="stat-label">警告</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-panel {
  width: 240px;
  height: 100%;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}
.project-header {
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 6px;
  border-left: 3px solid #1976d2;
}
.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #1976d2;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-name.no-project {
  color: #999;
}
.project-status {
  font-size: 12px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 6px;
}
.project-status.muted {
  color: #bbb;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
}
.status-dot.draft {
  background: #999;
}
.status-dot.pending_review {
  background: #f57c00;
}
.status-dot.reviewed {
  background: #1976d2;
}
.status-dot.completed {
  background: #388e3c;
}
.dirty-mark {
  color: #f44336;
  font-weight: bold;
}
.project-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.proj-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 11px;
  color: #555;
}
.proj-btn:hover {
  background: #e3f2fd;
  border-color: #1976d2;
  color: #1976d2;
}
.proj-icon {
  font-size: 16px;
}
.history-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.hist-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;
  font-weight: 500;
  color: #333;
}
.hist-btn:hover:not(.disabled) {
  background: #e3f2fd;
  border-color: #1976d2;
  color: #1976d2;
}
.hist-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hist-hint {
  font-size: 10px;
  color: #999;
  font-weight: normal;
}
.last-action {
  font-size: 12px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.la-label {
  color: #888;
  font-size: 11px;
}
.la-text {
  color: #333;
  font-weight: 500;
}
.history-count {
  font-size: 11px;
  color: #999;
  text-align: center;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.tool-btn:hover {
  background: #f5f5f5;
  border-color: #1976d2;
}
.tool-btn.active {
  background: #e3f2fd;
  border-color: #1976d2;
  color: #1976d2;
}
.tool-icon {
  font-size: 20px;
}
.tool-label {
  font-size: 12px;
}
.depth-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  color: #666;
}
.depth-input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.depth-input:focus {
  border-color: #1976d2;
}
.depth-select {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.custom-depth {
  margin-top: 4px;
}
.display-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
}
.option-item input {
  cursor: pointer;
}
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.action-btn {
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  color: white;
}
.action-btn.validate {
  background: #1976d2;
}
.action-btn.validate:hover {
  background: #1565c0;
}
.action-btn.review {
  background: #f57c00;
}
.action-btn.review:hover:not(.disabled) {
  background: #ef6c00;
}
.action-btn.complete {
  background: #388e3c;
}
.action-btn.complete:hover:not(.disabled) {
  background: #2e7d32;
}
.action-btn.disabled {
  background: #bbb;
  cursor: not-allowed;
}
.completed-badge {
  font-size: 11px;
  color: #388e3c;
  background: #e8f5e9;
  padding: 6px 8px;
  border-radius: 4px;
  text-align: center;
}
.review-badge {
  font-size: 12px;
  color: #e65100;
  background: #fff3e0;
  padding: 8px;
  border-radius: 4px;
  text-align: center;
  font-weight: 500;
}
.review-time {
  font-size: 11px;
  color: #999;
  font-weight: normal;
  margin-top: 4px;
}
.stats-overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}
.stat-label {
  font-size: 11px;
  color: #777;
}
.stat-item.error .stat-value {
  color: #d32f2f;
}
.stat-item.warning .stat-value {
  color: #f57c00;
}
</style>
