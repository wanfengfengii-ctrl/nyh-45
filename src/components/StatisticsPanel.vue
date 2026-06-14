<script setup lang="ts">
import { computed } from 'vue'
import { useSoundingStore } from '@/stores/sounding'
import { useContourStore } from '@/stores/contour'

const soundingStore = useSoundingStore()
const contourStore = useContourStore()

const stats = computed(() => soundingStore.statistics)

const depthLevelStats = computed(() => {
  const result = contourStore.depthLevels.map((level) => {
    const nearby = soundingStore.points.filter((p) => {
      const diff = Math.abs(p.depth - level.depth)
      return diff <= Math.max(0.5, level.depth * 0.1)
    })
    return {
      ...level,
      count: nearby.length
    }
  })
  return result
})

const contourStats = computed(() => {
  const byDepth: Record<number, number> = {}
  contourStore.lines.forEach((l) => {
    byDepth[l.depth] = (byDepth[l.depth] || 0) + 1
  })
  return Object.entries(byDepth)
    .map(([depth, count]) => ({ depth: parseFloat(depth), count }))
    .sort((a, b) => a.depth - b.depth)
})

const maxDistributionCount = computed(() => {
  if (stats.value.depthDistribution.length === 0) return 1
  return Math.max(...stats.value.depthDistribution.map((d) => d.count))
})

function formatArea(sqMeters: number): string {
  if (sqMeters < 1000) return `${sqMeters.toFixed(0)} m²`
  if (sqMeters < 1000000) return `${(sqMeters / 1000).toFixed(2)} km²`
  return `${(sqMeters / 1000000).toFixed(2)} km²`
}
</script>

<template>
  <div class="statistics-panel">
    <div class="stat-section">
      <div class="section-title">测深点统计</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value primary">{{ stats.totalPoints }}</div>
          <div class="stat-label">总测深点数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value success">{{ stats.averageDepth.toFixed(1) }}m</div>
          <div class="stat-label">平均深度</div>
        </div>
        <div class="stat-card">
          <div class="stat-value warning">{{ stats.depthRange.min }}m</div>
          <div class="stat-label">最小深度</div>
        </div>
        <div class="stat-card">
          <div class="stat-value danger">{{ stats.depthRange.max }}m</div>
          <div class="stat-label">最大深度</div>
        </div>
      </div>
      <div class="stat-card wide">
        <div class="stat-value info">{{ formatArea(stats.areaCoverage) }}</div>
        <div class="stat-label">覆盖面积 (估算)</div>
      </div>
    </div>

    <div class="stat-section">
      <div class="section-title">深度分布</div>
      <div v-if="stats.depthDistribution.length > 0" class="distribution-chart">
        <div
          v-for="item in stats.depthDistribution"
          :key="item.depth"
          class="dist-row"
        >
          <span class="dist-label">{{ item.depth }}m</span>
          <div class="dist-bar-wrapper">
            <div
              class="dist-bar"
              :style="{ width: `${(item.count / maxDistributionCount) * 100}%` }"
            ></div>
          </div>
          <span class="dist-count">{{ item.count }}</span>
        </div>
      </div>
      <div v-else class="empty-hint small">
        <p>暂无数据</p>
      </div>
    </div>

    <div class="stat-section">
      <div class="section-title">深度等级匹配</div>
      <div class="level-list">
        <div
          v-for="level in depthLevelStats"
          :key="level.depth"
          class="level-item"
        >
          <span
            class="level-color"
            :style="{ background: level.color }"
          ></span>
          <span class="level-label">{{ level.label }}</span>
          <span class="level-count">{{ level.count }} 个附近点</span>
        </div>
      </div>
    </div>

    <div class="stat-section">
      <div class="section-title">等深线统计</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value primary">{{ contourStore.lines.length }}</div>
          <div class="stat-label">总等深线数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value success">
            {{ contourStore.lines.filter((l) => l.isClosed).length }}
          </div>
          <div class="stat-label">闭合等深线</div>
        </div>
        <div class="stat-card">
          <div class="stat-value info">
            {{ contourStore.lines.reduce((sum, l) => sum + l.points.length, 0) }}
          </div>
          <div class="stat-label">总节点数</div>
        </div>
      </div>
      <div v-if="contourStats.length > 0" class="contour-stats">
        <div
          v-for="stat in contourStats"
          :key="stat.depth"
          class="contour-stat-row"
        >
          <span class="cs-label">{{ stat.depth }}m</span>
          <span class="cs-count">{{ stat.count }} 条</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.statistics-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.stat-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.stat-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  padding: 12px;
  border-radius: 8px;
  text-align: center;
}
.stat-card.wide {
  grid-column: span 2;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}
.stat-value.primary {
  color: #1976d2;
}
.stat-value.success {
  color: #388e3c;
}
.stat-value.warning {
  color: #f57c00;
}
.stat-value.danger {
  color: #d32f2f;
}
.stat-value.info {
  color: #00796b;
}
.stat-label {
  font-size: 11px;
  color: #777;
}
.distribution-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.dist-label {
  min-width: 50px;
  color: #555;
  font-weight: 500;
}
.dist-bar-wrapper {
  flex: 1;
  height: 16px;
  background: #eee;
  border-radius: 8px;
  overflow: hidden;
}
.dist-bar {
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #2196f3);
  border-radius: 8px;
  transition: width 0.3s;
}
.dist-count {
  min-width: 30px;
  text-align: right;
  color: #666;
  font-family: monospace;
}
.level-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.level-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #fafafa;
  border-radius: 4px;
  font-size: 12px;
}
.level-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}
.level-label {
  font-weight: 600;
  color: #333;
  min-width: 50px;
}
.level-count {
  margin-left: auto;
  color: #666;
}
.contour-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.contour-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
}
.cs-label {
  font-weight: 500;
  color: #333;
}
.cs-count {
  color: #666;
}
.empty-hint {
  text-align: center;
  padding: 20px;
  color: #999;
}
.empty-hint.small p {
  margin: 0;
  font-size: 12px;
}
</style>
