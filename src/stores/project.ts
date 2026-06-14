import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChartProject, SoundingPoint, ContourLine, SectionLine, ExportOptions } from '@/types'
import { ProjectStatus } from '@/types'
import { generateId } from '@/utils/geometry'

const STORAGE_KEY = 'nyh45_chart_projects'
const CURRENT_PROJECT_KEY = 'nyh45_current_project_id'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<ChartProject[]>([])
  const currentProjectId = ref<string | null>(null)
  const isDirty = ref(false)

  const currentProject = computed<ChartProject | null>(() =>
    projects.value.find((p) => p.id === currentProjectId.value) || null
  )

  const sortedProjects = computed(() =>
    [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const loaded = JSON.parse(saved) as ChartProject[]
        loaded.forEach((p) => {
          if (!Array.isArray(p.sections)) {
            p.sections = []
          }
        })
        projects.value = loaded
      }
      const current = localStorage.getItem(CURRENT_PROJECT_KEY)
      if (current && projects.value.some((p) => p.id === current)) {
        currentProjectId.value = current
      }
    } catch (e) {
      console.error('Failed to load projects from storage:', e)
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.value))
      if (currentProjectId.value) {
        localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId.value)
      } else {
        localStorage.removeItem(CURRENT_PROJECT_KEY)
      }
    } catch (e) {
      console.error('Failed to save projects to storage:', e)
    }
  }

  function createNewProject(name: string, description?: string): ChartProject {
    const now = Date.now()
    const project: ChartProject = {
      id: generateId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      soundings: [],
      contours: [],
      sections: [],
      mapCenter: { lat: 31.2304, lng: 121.4737 },
      mapZoom: 14,
      status: ProjectStatus.DRAFT
    }
    projects.value.push(project)
    currentProjectId.value = project.id
    isDirty.value = false
    saveToStorage()
    return project
  }

  function saveProject(
    soundings: SoundingPoint[],
    contours: ContourLine[],
    sections: SectionLine[],
    mapCenter: { lat: number; lng: number },
    mapZoom: number
  ): ChartProject | null {
    const project = currentProject.value
    if (!project) {
      return null
    }
    project.soundings = JSON.parse(JSON.stringify(soundings))
    project.contours = JSON.parse(JSON.stringify(contours))
    project.sections = JSON.parse(JSON.stringify(sections))
    project.mapCenter = { ...mapCenter }
    project.mapZoom = mapZoom
    project.updatedAt = Date.now()
    isDirty.value = false
    saveToStorage()
    return project
  }

  function saveProjectAs(name: string, description?: string): ChartProject | null {
    const project = currentProject.value
    if (!project) return null
    const now = Date.now()
    const newProject: ChartProject = {
      ...JSON.parse(JSON.stringify(project)),
      id: generateId(),
      name,
      description,
      createdAt: now,
      updatedAt: now
    }
    projects.value.push(newProject)
    currentProjectId.value = newProject.id
    isDirty.value = false
    saveToStorage()
    return newProject
  }

  function loadProject(projectId: string): ChartProject | null {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return null
    currentProjectId.value = projectId
    isDirty.value = false
    saveToStorage()
    return JSON.parse(JSON.stringify(project))
  }

  function deleteProject(projectId: string): boolean {
    const idx = projects.value.findIndex((p) => p.id === projectId)
    if (idx === -1) return false
    projects.value.splice(idx, 1)
    if (currentProjectId.value === projectId) {
      currentProjectId.value = projects.value.length > 0 ? projects.value[0].id : null
    }
    saveToStorage()
    return true
  }

  function renameProject(projectId: string, name: string, description?: string): boolean {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return false
    project.name = name
    if (description !== undefined) project.description = description
    project.updatedAt = Date.now()
    saveToStorage()
    return true
  }

  function updateProjectStatus(projectId: string, status: ProjectStatus): boolean {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return false
    project.status = status
    project.updatedAt = Date.now()
    saveToStorage()
    return true
  }

  function markDirty() {
    isDirty.value = true
  }

  function exportProjectToJSON(projectId?: string): string {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : currentProject.value
    if (!project) return ''
    return JSON.stringify(project, null, 2)
  }

  function importProjectFromJSON(json: string): ChartProject | null {
    try {
      const parsed = JSON.parse(json) as ChartProject
      if (!parsed.id || !parsed.name || !Array.isArray(parsed.soundings) || !Array.isArray(parsed.contours)) {
        return null
      }
      if (!Array.isArray(parsed.sections)) {
        parsed.sections = []
      }
      const existing = projects.value.find((p) => p.id === parsed.id)
      if (existing) {
        parsed.id = generateId()
        parsed.name = `${parsed.name} (导入副本)`
      }
      parsed.createdAt = parsed.createdAt || Date.now()
      parsed.updatedAt = Date.now()
      parsed.status = parsed.status || ProjectStatus.DRAFT
      projects.value.push(parsed)
      currentProjectId.value = parsed.id
      saveToStorage()
      return parsed
    } catch (e) {
      console.error('Failed to import project:', e)
      return null
    }
  }

  function exportToGeoJSON(options: ExportOptions, soundings: SoundingPoint[], contours: ContourLine[]): string {
    const features: any[] = []

    if (options.includeSoundings) {
      soundings.forEach((sp) => {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [sp.position.lng, sp.position.lat]
          },
          properties: {
            id: sp.id,
            type: 'sounding',
            depth: sp.depth,
            note: sp.note || null,
            createdAt: sp.createdAt
          }
        })
      })
    }

    if (options.includeContours) {
      contours.forEach((line) => {
        const coords = line.isClosed
          ? [...line.points, line.points[0]].map((p) => [p.lng, p.lat])
          : line.points.map((p) => [p.lng, p.lat])
        features.push({
          type: 'Feature',
          geometry: {
            type: line.isClosed ? 'Polygon' : 'LineString',
            coordinates: line.isClosed ? [coords] : coords
          },
          properties: {
            id: line.id,
            type: 'contour',
            depth: line.depth,
            label: line.label || null,
            color: line.color,
            isClosed: line.isClosed,
            createdAt: line.createdAt
          }
        })
      })
    }

    const geojson: any = {
      type: 'FeatureCollection',
      features
    }

    if (options.includeMetadata && currentProject.value) {
      geojson.metadata = {
        projectName: currentProject.value.name,
        projectId: currentProject.value.id,
        description: currentProject.value.description,
        exportedAt: Date.now()
      }
    }

    return JSON.stringify(geojson, null, 2)
  }

  function exportToCSV(soundings: SoundingPoint[], contours: ContourLine[]): { soundingsCSV: string; contoursCSV: string } {
    const soundingsCSV = [
      'id,latitude,longitude,depth,note,createdAt',
      ...soundings.map((sp) =>
        `${sp.id},${sp.position.lat},${sp.position.lng},${sp.depth},${(sp.note || '').replace(/,/g, ' ')},${sp.createdAt}`
      )
    ].join('\n')

    const contoursCSV = [
      'id,depth,label,isClosed,pointCount,color,createdAt',
      ...contours.map((line) =>
        `${line.id},${line.depth},${(line.label || '').replace(/,/g, ' ')},${line.isClosed},${line.points.length},${line.color},${line.createdAt}`
      )
    ].join('\n')

    return { soundingsCSV, contoursCSV }
  }

  return {
    projects,
    currentProjectId,
    isDirty,
    currentProject,
    sortedProjects,
    loadFromStorage,
    saveToStorage,
    createNewProject,
    saveProject,
    saveProjectAs,
    loadProject,
    deleteProject,
    renameProject,
    updateProjectStatus,
    markDirty,
    exportProjectToJSON,
    importProjectFromJSON,
    exportToGeoJSON,
    exportToCSV
  }
})
