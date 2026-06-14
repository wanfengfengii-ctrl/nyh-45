<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, watch } from 'vue'
import {
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  NModal,
  NInput,
  NForm,
  NFormItem,
  NList,
  NListItem,
  NButton,
  NEmpty,
  NRadioGroup,
  NRadio,
  NCheckbox,
  useMessage,
  useDialog,
  NTag,
  NAlert,
  NSpace
} from 'naive-ui'
import ChartMap from './components/ChartMap.vue'
import ToolPanel from './components/ToolPanel.vue'
import RightPanel from './components/RightPanel.vue'
import { useWorkspaceStore } from './stores/workspace'
import { useValidationStore } from './stores/validation'
import { useContourStore } from './stores/contour'
import { useSoundingStore } from './stores/sounding'
import { useProjectStore } from './stores/project'
import { useHistoryStore } from './stores/history'
import { ToolType, ProjectStatus, HistoryActionType, type ExportOptions } from './types'

const messageRef = ref<ReturnType<typeof useMessage> | null>(null)
const dialogRef = ref<ReturnType<typeof useDialog> | null>(null)

const MessageSetup = defineComponent({
  name: 'MessageSetup',
  setup() {
    const msg = useMessage()
    const dlg = useDialog()
    onMounted(() => {
      messageRef.value = msg
      dialogRef.value = dlg
    })
    return () => null
  }
})

const chartMapRef = ref<InstanceType<typeof ChartMap> | null>(null)
const workspaceStore = useWorkspaceStore()
const validationStore = useValidationStore()
const contourStore = useContourStore()
const soundingStore = useSoundingStore()
const projectStore = useProjectStore()
const historyStore = useHistoryStore()

const showNewProjectModal = ref(false)
const showProjectListModal = ref(false)
const showSaveAsModal = ref(false)
const showExportModal = ref(false)
const showBasemapModal = ref(false)
const showSubmitReviewModal = ref(false)

const newProjectName = ref('')
const newProjectDesc = ref('')
const saveAsName = ref('')
const saveAsDesc = ref('')
const customBasemapName = ref('')
const customBasemapUrl = ref('')
const customBasemapAttr = ref('')

const exportOptions = ref<ExportOptions>({
  format: 'geojson',
  includeSoundings: true,
  includeContours: true,
  includeMetadata: true
})

const currentToolLabel = computed(() => {
  const map: Record<string, string> = {
    none: '选择模式',
    add_sounding: '添加测深点',
    edit_point: '编辑测深点',
    draw_contour: '绘制等深线',
    move_node: '编辑节点',
    delete: '删除模式'
  }
  return map[workspaceStore.currentTool] || '选择模式'
})

const statusLabel = computed(() => {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: '草稿', color: 'default' },
    pending_review: { label: '待复核', color: 'warning' },
    reviewed: { label: '已复核', color: 'info' },
    completed: { label: '已完成', color: 'success' }
  }
  return map[workspaceStore.status.projectStatus || 'draft']
})



function applyHistoryState(state: { soundings: any[]; contours: any[] }) {
  soundingStore.clearAll()
  contourStore.clearAll()
  state.soundings.forEach((p) => soundingStore.points.push(p))
  state.contours.forEach((l) => contourStore.lines.push(l))
  validationStore.runFullValidation()
}

function getCurrentState() {
  return {
    soundings: JSON.parse(JSON.stringify(soundingStore.points)),
    contours: JSON.parse(JSON.stringify(contourStore.lines))
  }
}

function recordHistory(type: HistoryActionType, description: string) {
  historyStore.recordAction(type, description)
  projectStore.markDirty()
}

function handleUndo() {
  if (historyStore.canUndo) {
    historyStore.undo()
    messageRef.value?.info('已撤销: ' + (historyStore.undoAction?.description || ''))
    projectStore.markDirty()
  }
}

function handleRedo() {
  if (historyStore.canRedo) {
    historyStore.redo()
    messageRef.value?.info('已重做: ' + (historyStore.redoAction?.description || ''))
    projectStore.markDirty()
  }
}

function handleRunValidation() {
  const result = validationStore.runFullValidation()
  const msg = messageRef.value
  if (!msg) return
  if (result.hasErrors) {
    msg.error(`发现 ${result.issues.filter(i => i.severity === 'error').length} 个错误，请检查校绘面板`)
  } else if (result.hasWarnings) {
    msg.warning(`发现 ${result.issues.filter(i => i.severity === 'warning').length} 个警告`)
  } else {
    msg.success('所有校绘检查通过')
  }
}

function handleMarkComplete() {
  const msg = messageRef.value
  const dlg = dialogRef.value
  if (!msg || !dlg) return
  if (validationStore.hasCriticalErrors) {
    msg.error('存在严重校绘错误，无法标记为完成')
    workspaceStore.setRightPanelTab('validation')
    return
  }
  if (workspaceStore.status.isCompleted) {
    dlg.warning({
      title: '取消完成标记',
      content: '确定要取消该项目的已完成状态吗？',
      positiveText: '确认',
      negativeText: '取消',
      onPositiveClick: () => {
        workspaceStore.unmarkCompleted()
        msg.info('已取消完成标记')
        historyStore.clearHistory()
      }
    })
  } else {
    dlg.success({
      title: '标记完成',
      content: '确认所有校绘工作已完成并标记项目？',
      positiveText: '确认完成',
      negativeText: '取消',
      onPositiveClick: () => {
        const success = workspaceStore.markAsCompleted()
        if (success) {
          msg.success('项目已标记为完成')
          historyStore.clearHistory()
        } else {
          msg.error('无法标记完成，请检查错误')
        }
      }
    })
  }
}

function handleSubmitForReview() {
  const msg = messageRef.value
  if (!msg) return
  if (validationStore.hasCriticalErrors) {
    msg.error(`存在 ${validationStore.errors.length} 个严重校绘错误，无法提交待复核。请先修复错误。`)
    workspaceStore.setRightPanelTab('validation')
    showSubmitReviewModal.value = true
    return
  }
  showSubmitReviewModal.value = true
}

function confirmSubmitReview() {
  const msg = messageRef.value
  if (!msg) return
  if (validationStore.hasCriticalErrors) {
    msg.error('存在严重错误，无法提交')
    return
  }
  const success = workspaceStore.submitForReview()
  if (success) {
    msg.success('项目已提交待复核')
    showSubmitReviewModal.value = false
    handleSaveProject()
  } else {
    msg.error('提交失败')
  }
}

function handleCancelReview() {
  const msg = messageRef.value
  const dlg = dialogRef.value
  if (!msg || !dlg) return
  dlg.warning({
    title: '撤回待复核',
    content: '确定要将项目从待复核状态撤回吗？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: () => {
      workspaceStore.cancelReview()
      msg.info('已撤回待复核状态')
    }
  })
}

function handleMarkReviewed() {
  const msg = messageRef.value
  if (!msg) return
  workspaceStore.markAsReviewed()
  msg.success('项目已标记为已复核')
}

function handleNewProject() {
  const dlg = dialogRef.value
  const msg = messageRef.value
  if (!dlg || !msg) return
  if (projectStore.isDirty) {
    dlg.warning({
      title: '当前项目未保存',
      content: '是否保存当前项目后再新建？',
      positiveText: '保存并新建',
      negativeText: '放弃并新建',
      onPositiveClick: () => {
        handleSaveProject()
        resetAndShowNew()
      },
      onNegativeClick: () => {
        resetAndShowNew()
      }
    })
  } else {
    resetAndShowNew()
  }
}

function resetAndShowNew() {
  newProjectName.value = ''
  newProjectDesc.value = ''
  showNewProjectModal.value = true
}

function confirmNewProject() {
  const msg = messageRef.value
  if (!msg) return
  if (!newProjectName.value.trim()) {
    msg.warning('请输入项目名称')
    return
  }
  soundingStore.clearAll()
  contourStore.clearAll()
  validationStore.clearIssues()
  historyStore.clearHistory()
  workspaceStore.resetWorkspace()
  workspaceStore.updateMapCenter(31.2304, 121.4737)
  workspaceStore.updateMapZoom(14)
  const project = projectStore.createNewProject(newProjectName.value.trim(), newProjectDesc.value.trim() || undefined)
  workspaceStore.setProjectStatus(project.status)
  showNewProjectModal.value = false
  msg.success('新项目已创建')
}

function handleSaveProject() {
  const msg = messageRef.value
  if (!msg) return
  if (!projectStore.currentProjectId) {
    saveAsName.value = ''
    saveAsDesc.value = ''
    showSaveAsModal.value = true
    return
  }
  const saved = projectStore.saveProject(
    soundingStore.points,
    contourStore.lines,
    workspaceStore.mapCenter,
    workspaceStore.mapZoom
  )
  if (saved) {
    msg.success('项目已保存')
  } else {
    msg.error('保存失败')
  }
}

function handleSaveAs() {
  saveAsName.value = projectStore.currentProject?.name ? projectStore.currentProject.name + ' 副本' : ''
  saveAsDesc.value = projectStore.currentProject?.description || ''
  showSaveAsModal.value = true
}

function confirmSaveAs() {
  const msg = messageRef.value
  if (!msg) return
  if (!saveAsName.value.trim()) {
    msg.warning('请输入项目名称')
    return
  }
  if (!projectStore.currentProjectId) {
    const proj = projectStore.createNewProject(saveAsName.value.trim(), saveAsDesc.value.trim() || undefined)
    projectStore.saveProject(
      soundingStore.points,
      contourStore.lines,
      workspaceStore.mapCenter,
      workspaceStore.mapZoom
    )
    workspaceStore.setProjectStatus(proj.status)
  } else {
    const saved = projectStore.saveProjectAs(saveAsName.value.trim(), saveAsDesc.value.trim() || undefined)
    if (saved) {
      workspaceStore.setProjectStatus(saved.status)
    }
  }
  showSaveAsModal.value = false
  msg.success('项目已保存')
}

function handleOpenProject() {
  projectStore.loadFromStorage()
  showProjectListModal.value = true
}

function loadProject(projectId: string) {
  const msg = messageRef.value
  const dlg = dialogRef.value
  if (!msg || !dlg) return
  if (projectStore.isDirty) {
    dlg.warning({
      title: '当前项目未保存',
      content: '是否保存当前项目后再打开？',
      positiveText: '保存并打开',
      negativeText: '放弃并打开',
      onPositiveClick: () => {
        handleSaveProject()
        doLoadProject(projectId)
      },
      onNegativeClick: () => {
        doLoadProject(projectId)
      }
    })
  } else {
    doLoadProject(projectId)
  }
}

function doLoadProject(projectId: string) {
  const msg = messageRef.value
  if (!msg) return
  const project = projectStore.loadProject(projectId)
  if (!project) {
    msg.error('加载项目失败')
    return
  }
  soundingStore.clearAll()
  contourStore.clearAll()
  validationStore.clearIssues()
  historyStore.clearHistory()
  project.soundings.forEach((p) => soundingStore.points.push(p))
  project.contours.forEach((l) => contourStore.lines.push(l))
  workspaceStore.updateMapCenter(project.mapCenter.lat, project.mapCenter.lng)
  workspaceStore.updateMapZoom(project.mapZoom)
  workspaceStore.setProjectStatus(project.status)
  if (project.status === ProjectStatus.COMPLETED) {
    workspaceStore.status.isCompleted = true
  }
  showProjectListModal.value = false
  validationStore.runFullValidation()
  msg.success(`已打开项目: ${project.name}`)
}

function handleDeleteProject(projectId: string, e: Event) {
  e.stopPropagation()
  const dlg = dialogRef.value
  const msg = messageRef.value
  if (!dlg || !msg) return
  dlg.warning({
    title: '删除项目',
    content: '确定要删除这个项目吗？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' },
    onPositiveClick: () => {
      const success = projectStore.deleteProject(projectId)
      if (success) {
        msg.success('项目已删除')
        if (!projectStore.currentProjectId) {
          soundingStore.clearAll()
          contourStore.clearAll()
          workspaceStore.resetWorkspace()
        }
      }
    }
  })
}

function handleExport() {
  showExportModal.value = true
}

function confirmExport() {
  const msg = messageRef.value
  if (!msg) return
  const opts = exportOptions.value
  let content = ''
  let filename = ''
  let mimeType = ''

  if (opts.format === 'geojson') {
    content = projectStore.exportToGeoJSON(opts, soundingStore.points, contourStore.lines)
    filename = `${projectStore.currentProject?.name || 'chart'}.geojson`
    mimeType = 'application/geo+json'
  } else if (opts.format === 'json') {
    content = projectStore.exportProjectToJSON()
    filename = `${projectStore.currentProject?.name || 'chart'}.json`
    mimeType = 'application/json'
  } else if (opts.format === 'csv') {
    const { soundingsCSV, contoursCSV } = projectStore.exportToCSV(soundingStore.points, contourStore.lines)
    downloadFile(soundingsCSV, `${projectStore.currentProject?.name || 'chart'}_soundings.csv`, 'text/csv')
    downloadFile(contoursCSV, `${projectStore.currentProject?.name || 'chart'}_contours.csv`, 'text/csv')
    showExportModal.value = false
    msg.success('CSV 文件已导出')
    return
  }

  downloadFile(content, filename, mimeType)
  showExportModal.value = false
  msg.success('文件已导出')
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function handleImportProject(file: File) {
  const msg = messageRef.value
  if (!msg) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    const project = projectStore.importProjectFromJSON(content)
    if (project) {
      doLoadProject(project.id)
      msg.success('项目已导入')
    } else {
      msg.error('导入失败，请检查文件格式')
    }
  }
  reader.readAsText(file)
}

function handleBasemapSettings() {
  showBasemapModal.value = true
}

function addCustomBasemap() {
  const msg = messageRef.value
  if (!msg) return
  if (!customBasemapName.value.trim() || !customBasemapUrl.value.trim()) {
    msg.warning('请填写底图名称和URL')
    return
  }
  workspaceStore.addCustomBasemap({
    id: 'custom-' + Date.now(),
    name: customBasemapName.value.trim(),
    url: customBasemapUrl.value.trim(),
    attribution: customBasemapAttr.value.trim() || undefined
  })
  customBasemapName.value = ''
  customBasemapUrl.value = ''
  customBasemapAttr.value = ''
  msg.success('自定义底图已添加')
}

function handleRemoveCustomBasemap(id: string) {
  workspaceStore.removeCustomBasemap(id)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return
  if (e.target && (e.target as HTMLElement).tagName === 'TEXTAREA') return
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
      return
    }
    if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
      e.preventDefault()
      handleRedo()
      return
    }
    if (e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSaveProject()
      return
    }
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault()
      handleNewProject()
      return
    }
    if (e.key.toLowerCase() === 'o') {
      e.preventDefault()
      handleOpenProject()
      return
    }
  }
  switch (e.key.toLowerCase()) {
    case 'escape':
      workspaceStore.setTool(ToolType.NONE)
      if (contourStore.isDrawing && chartMapRef.value) {
        chartMapRef.value.cancelDrawing()
      }
      contourStore.stopEditingNodes()
      break
    case 'enter':
      if (contourStore.isDrawing && chartMapRef.value) {
        chartMapRef.value.finishDrawing(e.shiftKey)
      }
      break
    case '1':
      workspaceStore.setTool(ToolType.ADD_SOUNDING)
      break
    case '2':
      workspaceStore.setTool(ToolType.EDIT_POINT)
      break
    case '3':
      workspaceStore.setTool(ToolType.DRAW_CONTOUR)
      break
    case '4':
      workspaceStore.setTool(ToolType.MOVE_NODE)
      break
    case '5':
      workspaceStore.setTool(ToolType.DELETE)
      break
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  historyStore.registerStateHandlers(getCurrentState, applyHistoryState)
  projectStore.loadFromStorage()
  if (projectStore.currentProject) {
    const project = projectStore.currentProject
    project.soundings.forEach((p) => soundingStore.points.push(p))
    project.contours.forEach((l) => contourStore.lines.push(l))
    workspaceStore.updateMapCenter(project.mapCenter.lat, project.mapCenter.lng)
    workspaceStore.updateMapZoom(project.mapZoom)
    workspaceStore.setProjectStatus(project.status)
    if (project.status === ProjectStatus.COMPLETED) {
      workspaceStore.status.isCompleted = true
    }
    validationStore.runFullValidation()
  }
})

watch(
  () => [soundingStore.points.length, contourStore.lines.length],
  () => {
    if (projectStore.currentProjectId) {
      projectStore.markDirty()
    }
  },
  { deep: true }
)
</script>

<template>
  <NNotificationProvider>
    <NDialogProvider>
      <NMessageProvider>
        <MessageSetup />
        <div class="app-container" @keydown="handleKeydown" tabindex="0">
          <header class="app-header">
            <div class="header-left">
              <div class="logo">🗺️</div>
              <div class="title-group">
                <h1 class="app-title">海图等深线校绘工作台</h1>
                <span class="app-subtitle">Hydrographic Contour Editor</span>
              </div>
              <div v-if="projectStore.currentProject" class="project-info">
                <span class="project-name">{{ projectStore.currentProject.name }}</span>
                <n-tag
                  :type="statusLabel.color as any"
                  size="small"
                  round
                >
                  {{ statusLabel.label }}
                </n-tag>
                <span v-if="projectStore.isDirty" class="dirty-indicator">• 未保存</span>
              </div>
            </div>
            <div class="header-center">
              <span class="current-tool">
                当前: <strong>{{ currentToolLabel }}</strong>
              </span>
              <span v-if="workspaceStore.status.isCompleted" class="status-badge completed">
                ✓ 已完成
              </span>
              <span
                v-else-if="validationStore.errors.length > 0"
                class="status-badge error"
              >
                ⚠ {{ validationStore.errors.length }} 个错误
              </span>
              <span
                v-if="workspaceStore.status.projectStatus === 'pending_review'"
                class="status-badge warning"
              >
                待复核
              </span>
            </div>
            <div class="header-right">
              <div class="toolbar-buttons">
                <button class="toolbar-btn" @click="handleNewProject" title="新建项目 (Ctrl+N)">
                  📄
                </button>
                <button class="toolbar-btn" @click="handleOpenProject" title="打开项目 (Ctrl+O)">
                  📂
                </button>
                <button class="toolbar-btn" @click="handleSaveProject" title="保存 (Ctrl+S)">
                  💾
                </button>
                <button class="toolbar-btn" @click="handleSaveAs" title="另存为">
                  📝
                </button>
                <div class="toolbar-divider"></div>
                <button
                  class="toolbar-btn"
                  :class="{ disabled: !historyStore.canUndo }"
                  :disabled="!historyStore.canUndo"
                  @click="handleUndo"
                  title="撤销 (Ctrl+Z)"
                >
                  ↶
                </button>
                <button
                  class="toolbar-btn"
                  :class="{ disabled: !historyStore.canRedo }"
                  :disabled="!historyStore.canRedo"
                  @click="handleRedo"
                  title="重做 (Ctrl+Y)"
                >
                  ↷
                </button>
                <div class="toolbar-divider"></div>
                <button class="toolbar-btn" @click="handleBasemapSettings" title="底图设置">
                  🗺️
                </button>
                <button class="toolbar-btn" @click="handleExport" title="导出">
                  📤
                </button>
                <div class="toolbar-divider"></div>
                <button
                  v-if="workspaceStore.status.projectStatus === 'draft' || !workspaceStore.status.projectStatus"
                  class="toolbar-btn primary"
                  @click="handleSubmitForReview"
                  title="提交待复核"
                >
                  📨 提交复核
                </button>
                <button
                  v-if="workspaceStore.status.projectStatus === 'pending_review'"
                  class="toolbar-btn warning"
                  @click="handleCancelReview"
                  title="撤回待复核"
                >
                  ↩️ 撤回
                </button>
                <button
                  v-if="workspaceStore.status.projectStatus === 'pending_review'"
                  class="toolbar-btn success"
                  @click="handleMarkReviewed"
                  title="标记已复核"
                >
                  ✓ 复核通过
                </button>
              </div>
              <span class="coords" v-if="soundingStore.selectedPoint">
                选中: {{ soundingStore.selectedPoint.position.lat.toFixed(4) }},
                {{ soundingStore.selectedPoint.position.lng.toFixed(4) }}
              </span>
              <span v-else-if="contourStore.selectedLine">
                等深线: {{ contourStore.selectedLine.depth }}m
                ({{ contourStore.selectedLine.points.length }} 节点)
              </span>
              <span v-else class="coords">
                {{ soundingStore.totalPoints }} 测深点 ·
                {{ contourStore.lines.length }} 等深线
              </span>
            </div>
          </header>

          <main class="app-main">
            <aside
              class="left-panel"
              :class="{ collapsed: workspaceStore.leftPanelCollapsed }"
            >
              <ToolPanel
                @run-validation="handleRunValidation"
                @mark-complete="handleMarkComplete"
                @undo="handleUndo"
                @redo="handleRedo"
                @new-project="handleNewProject"
                @open-project="handleOpenProject"
                @save-project="handleSaveProject"
                @export="handleExport"
                @submit-review="handleSubmitForReview"
              />
              <button
                class="collapse-btn left"
                @click="workspaceStore.toggleLeftPanel()"
              >
                {{ workspaceStore.leftPanelCollapsed ? '›' : '‹' }}
              </button>
            </aside>

            <section class="map-area">
              <ChartMap ref="chartMapRef" @record-history="recordHistory" />
            </section>

            <aside
              class="right-panel-wrapper"
              :class="{ collapsed: workspaceStore.rightPanelCollapsed }"
            >
              <RightPanel />
              <button
                class="collapse-btn right"
                @click="workspaceStore.toggleRightPanel()"
              >
                {{ workspaceStore.rightPanelCollapsed ? '‹' : '›' }}
              </button>
            </aside>
          </main>

          <footer class="app-footer">
            <div class="footer-left">
              <span class="shortcut-hint">快捷键: 1-添加测深点 | 2-编辑测深点 | 3-绘制等深线 | 4-编辑节点 | 5-删除 | Ctrl+Z撤销 | Ctrl+Y重做 | Ctrl+S保存 | Esc-取消 | Enter-完成</span>
            </div>
            <div class="footer-right">
              <span>缩放: {{ workspaceStore.mapZoom.toFixed(1) }}</span>
              <span>中心: {{ workspaceStore.mapCenter.lat.toFixed(4) }}, {{ workspaceStore.mapCenter.lng.toFixed(4) }}</span>
            </div>
          </footer>
        </div>

        <NModal
          v-model:show="showNewProjectModal"
          preset="card"
          title="新建项目"
          :mask-closable="false"
          style="width: 460px"
        >
          <n-form label-placement="top">
            <n-form-item label="项目名称" required>
              <n-input v-model:value="newProjectName" placeholder="请输入项目名称" />
            </n-form-item>
            <n-form-item label="项目描述">
              <n-input v-model:value="newProjectDesc" type="textarea" placeholder="请输入项目描述（可选）" :rows="3" />
            </n-form-item>
          </n-form>
          <template #footer>
            <n-space justify="end">
              <n-button @click="showNewProjectModal = false">取消</n-button>
              <n-button type="primary" @click="confirmNewProject">创建</n-button>
            </n-space>
          </template>
        </NModal>

        <NModal
          v-model:show="showSaveAsModal"
          preset="card"
          title="另存为"
          :mask-closable="false"
          style="width: 460px"
        >
          <n-form label-placement="top">
            <n-form-item label="项目名称" required>
              <n-input v-model:value="saveAsName" placeholder="请输入项目名称" />
            </n-form-item>
            <n-form-item label="项目描述">
              <n-input v-model:value="saveAsDesc" type="textarea" placeholder="请输入项目描述（可选）" :rows="3" />
            </n-form-item>
          </n-form>
          <template #footer>
            <n-space justify="end">
              <n-button @click="showSaveAsModal = false">取消</n-button>
              <n-button type="primary" @click="confirmSaveAs">保存</n-button>
            </n-space>
          </template>
        </NModal>

        <NModal
          v-model:show="showProjectListModal"
          preset="card"
          title="打开项目"
          style="width: 600px; max-height: 560px"
        >
          <div v-if="projectStore.sortedProjects.length === 0" style="padding: 40px 0">
            <n-empty description="暂无保存的项目" />
          </div>
          <n-list v-else bordered style="max-height: 400px; overflow-y: auto">
            <n-list-item
              v-for="project in projectStore.sortedProjects"
              :key="project.id"
              clickable
              @click="loadProject(project.id)"
              :style="{
                background: project.id === projectStore.currentProjectId ? '#e3f2fd' : undefined
              }"
            >
              <div class="list-item-meta">
                <div class="meta-title">{{ project.name }}</div>
                <div class="meta-desc">{{ project.soundings.length }} 测深点 · {{ project.contours.length }} 等深线 · 更新于 {{ formatDate(project.updatedAt) }}</div>
              </div>
              <template #suffix>
                <n-space>
                  <n-tag
                    v-if="project.status === 'completed'"
                    type="success"
                    size="small"
                  >
                    已完成
                  </n-tag>
                  <n-tag
                    v-else-if="project.status === 'pending_review'"
                    type="warning"
                    size="small"
                  >
                    待复核
                  </n-tag>
                  <n-tag
                    v-else-if="project.status === 'reviewed'"
                    type="info"
                    size="small"
                  >
                    已复核
                  </n-tag>
                  <n-button
                    size="small"
                    type="error"
                    quaternary
                    @click="(e: Event) => handleDeleteProject(project.id, e)"
                  >
                    删除
                  </n-button>
                </n-space>
              </template>
            </n-list-item>
          </n-list>
          <template #footer>
            <n-space justify="end">
              <label class="import-label">
                <n-button>导入 JSON</n-button>
                <input
                  type="file"
                  accept=".json"
                  style="display: none"
                  @change="(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (file) handleImportProject(file)
                  }"
                />
              </label>
              <n-button @click="showProjectListModal = false">关闭</n-button>
            </n-space>
          </template>
        </NModal>

        <NModal
          v-model:show="showExportModal"
          preset="card"
          title="导出数据"
          :mask-closable="false"
          style="width: 440px"
        >
          <n-form label-placement="top">
            <n-form-item label="导出格式">
              <n-radio-group v-model:value="exportOptions.format">
                <n-space vertical>
                  <n-radio value="geojson">GeoJSON (GIS通用格式)</n-radio>
                  <n-radio value="json">项目 JSON (完整项目数据)</n-radio>
                  <n-radio value="csv">CSV (分别导出测深点和等深线)</n-radio>
                </n-space>
              </n-radio-group>
            </n-form-item>
            <n-form-item label="包含内容">
              <n-space vertical>
                <n-checkbox v-model:checked="exportOptions.includeSoundings">测深点数据</n-checkbox>
                <n-checkbox v-model:checked="exportOptions.includeContours">等深线数据</n-checkbox>
                <n-checkbox v-model:checked="exportOptions.includeMetadata">项目元数据</n-checkbox>
              </n-space>
            </n-form-item>
          </n-form>
          <template #footer>
            <n-space justify="end">
              <n-button @click="showExportModal = false">取消</n-button>
              <n-button type="primary" @click="confirmExport">导出</n-button>
            </n-space>
          </template>
        </NModal>

        <NModal
          v-model:show="showBasemapModal"
          preset="card"
          title="底图设置"
          style="width: 520px"
        >
          <div style="margin-bottom: 16px">
            <div style="font-weight: 500; margin-bottom: 8px">选择底图</div>
            <n-list bordered style="max-height: 240px; overflow-y: auto">
              <n-list-item
                v-for="basemap in workspaceStore.allBasemaps"
                :key="basemap.id"
                clickable
                @click="workspaceStore.setBasemap(basemap.id)"
                :style="{
                  background: workspaceStore.currentBasemapId === basemap.id ? '#e3f2fd' : undefined
                }"
              >
                <div class="list-item-meta">
                  <div class="meta-title">{{ basemap.name }}</div>
                  <div class="meta-desc">{{ basemap.attribution || basemap.url.slice(0, 60) }}</div>
                </div>
                <template #suffix>
                  <n-tag
                    v-if="workspaceStore.currentBasemapId === basemap.id"
                    type="success"
                    size="small"
                  >
                    当前
                  </n-tag>
                  <n-button
                    v-if="basemap.id.startsWith('custom-')"
                    size="small"
                    type="error"
                    quaternary
                    @click.stop="handleRemoveCustomBasemap(basemap.id)"
                  >
                    移除
                  </n-button>
                </template>
              </n-list-item>
            </n-list>
          </div>
          <n-divider />
          <div style="margin-bottom: 8px; font-weight: 500">添加自定义底图</div>
          <n-form label-placement="top">
            <n-form-item label="底图名称">
              <n-input v-model:value="customBasemapName" placeholder="例如：我的海图" />
            </n-form-item>
            <n-form-item label="瓦片URL">
              <n-input v-model:value="customBasemapUrl" placeholder="https://{s}.example.com/{z}/{x}/{y}.png" />
            </n-form-item>
            <n-form-item label="版权声明">
              <n-input v-model:value="customBasemapAttr" placeholder="可选" />
            </n-form-item>
          </n-form>
          <template #footer>
            <n-space justify="end">
              <n-button type="primary" @click="addCustomBasemap">添加底图</n-button>
              <n-button @click="showBasemapModal = false">关闭</n-button>
            </n-space>
          </template>
        </NModal>

        <NModal
          v-model:show="showSubmitReviewModal"
          preset="card"
          title="提交待复核"
          :mask-closable="false"
          style="width: 520px"
        >
          <n-alert
            v-if="validationStore.hasCriticalErrors"
            type="error"
            style="margin-bottom: 16px"
          >
            <template #header>存在严重错误，无法提交</template>
            项目中存在 {{ validationStore.errors.length }} 个严重校绘错误，请先修复以下问题后再提交：
          </n-alert>
          <div v-if="validationStore.hasCriticalErrors" style="max-height: 240px; overflow-y: auto; margin-bottom: 16px">
            <n-list bordered>
              <n-list-item
                v-for="issue in validationStore.errors"
                :key="issue.id"
              >
                <div class="list-item-meta">
                  <div class="meta-title">{{ issue.message }}</div>
                  <div class="meta-desc">类型: {{ issue.type }}</div>
                </div>
              </n-list-item>
            </n-list>
          </div>
          <div v-else style="padding: 16px 0; color: #388e3c">
            <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px">✓ 校绘检查通过</div>
            <p>所有校绘检查已通过，项目可以提交待复核。</p>
            <p style="margin-top: 8px; color: #666; font-size: 13px">
              项目名称：<strong>{{ projectStore.currentProject?.name || '未命名项目' }}</strong><br />
              测深点：{{ soundingStore.totalPoints }} 个<br />
              等深线：{{ contourStore.lines.length }} 条
            </p>
          </div>
          <template #footer>
            <n-space justify="end">
              <n-button
                v-if="validationStore.hasCriticalErrors"
                type="primary"
                @click="showSubmitReviewModal = false; workspaceStore.setRightPanelTab('validation')"
              >
                查看错误详情
              </n-button>
              <n-button v-if="!validationStore.hasCriticalErrors" type="primary" @click="confirmSubmitReview">
                确认提交
              </n-button>
              <n-button @click="showSubmitReviewModal = false">
                {{ validationStore.hasCriticalErrors ? '关闭' : '取消' }}
              </n-button>
            </n-space>
          </template>
        </NModal>
      </NMessageProvider>
    </NDialogProvider>
  </NNotificationProvider>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f0f2f5;
  outline: none;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(135deg, #0d47a1 0%, #1565c0 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  gap: 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  font-size: 28px;
}
.title-group {
  display: flex;
  flex-direction: column;
}
.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.app-subtitle {
  font-size: 11px;
  opacity: 0.7;
}
.project-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}
.project-name {
  font-size: 14px;
  font-weight: 500;
}
.dirty-indicator {
  font-size: 12px;
  opacity: 0.8;
}
.header-center {
  display: flex;
  align-items: center;
  gap: 12px;
}
.current-tool {
  background: rgba(255, 255, 255, 0.15);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
}
.current-tool strong {
  margin-left: 4px;
}
.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge.completed {
  background: #4caf50;
}
.status-badge.error {
  background: #f44336;
}
.status-badge.warning {
  background: #ff9800;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  opacity: 0.95;
}
.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-btn {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.toolbar-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.25);
}
.toolbar-btn:disabled,
.toolbar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar-btn.primary {
  background: #4caf50;
}
.toolbar-btn.primary:hover {
  background: #43a047;
}
.toolbar-btn.warning {
  background: #f57c00;
}
.toolbar-btn.warning:hover {
  background: #ef6c00;
}
.toolbar-btn.success {
  background: #388e3c;
}
.toolbar-btn.success:hover {
  background: #2e7d32;
}
.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.25);
  margin: 0 4px;
}
.coords {
  font-family: monospace;
}
.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}
.left-panel {
  position: relative;
  flex-shrink: 0;
  transition: all 0.2s;
}
.left-panel.collapsed {
  width: 0;
  margin-left: -240px;
}
.map-area {
  flex: 1;
  position: relative;
  min-width: 0;
}
.right-panel-wrapper {
  position: relative;
  flex-shrink: 0;
  transition: all 0.2s;
}
.right-panel-wrapper.collapsed {
  width: 0;
  margin-right: -320px;
}
.collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 60px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  z-index: 10;
  transition: all 0.15s;
}
.collapse-btn:hover {
  background: #f5f5f5;
  color: #1976d2;
}
.collapse-btn.left {
  right: -10px;
}
.collapse-btn.right {
  left: -10px;
}
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 20px;
  background: #fff;
  border-top: 1px solid #e0e0e0;
  font-size: 11px;
  color: #666;
}
.footer-left {
  display: flex;
  align-items: center;
}
.shortcut-hint {
  color: #888;
}
.footer-right {
  display: flex;
  gap: 20px;
  font-family: monospace;
}
.import-label {
  cursor: pointer;
  display: inline-block;
}
.list-item-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.meta-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
}
.meta-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
