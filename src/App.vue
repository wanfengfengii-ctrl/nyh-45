<script setup lang="ts">
import { ref, computed, onMounted, defineComponent } from 'vue'
import {
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  useMessage,
  useDialog
} from 'naive-ui'
import ChartMap from './components/ChartMap.vue'
import ToolPanel from './components/ToolPanel.vue'
import RightPanel from './components/RightPanel.vue'
import { useWorkspaceStore } from './stores/workspace'
import { useValidationStore } from './stores/validation'
import { useContourStore } from './stores/contour'
import { useSoundingStore } from './stores/sounding'
import { ToolType } from './types'

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

const currentToolLabel = computed(() => {
  const map: Record<string, string> = {
    none: '选择模式',
    add_sounding: '添加测深点',
    draw_contour: '绘制等深线',
    move_node: '编辑节点',
    delete: '删除模式'
  }
  return map[workspaceStore.currentTool] || '选择模式'
})

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
        } else {
          msg.error('无法标记完成，请检查错误')
        }
      }
    })
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return
  if (e.target && (e.target as HTMLElement).tagName === 'TEXTAREA') return
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
      workspaceStore.setTool(ToolType.DRAW_CONTOUR)
      break
    case '3':
      workspaceStore.setTool(ToolType.MOVE_NODE)
      break
    case '4':
      workspaceStore.setTool(ToolType.DELETE)
      break
  }
}
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
            </div>
            <div class="header-right">
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
              />
              <button
                class="collapse-btn left"
                @click="workspaceStore.toggleLeftPanel()"
              >
                {{ workspaceStore.leftPanelCollapsed ? '›' : '‹' }}
              </button>
            </aside>

            <section class="map-area">
              <ChartMap ref="chartMapRef" />
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
              <span class="shortcut-hint">快捷键: 1-测深点 | 2-等深线 | 3-编辑 | 4-删除 | Esc-取消 | Enter-完成</span>
            </div>
            <div class="footer-right">
              <span>缩放: {{ workspaceStore.mapZoom.toFixed(1) }}</span>
              <span>中心: {{ workspaceStore.mapCenter.lat.toFixed(4) }}, {{ workspaceStore.mapCenter.lng.toFixed(4) }}</span>
            </div>
          </footer>
        </div>
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
.header-right {
  font-size: 12px;
  opacity: 0.9;
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
</style>
