import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  ValidationIssueType,
  SoundingPoint,
  ContourLine,
  LatLng
} from '@/types'
import {
  ValidationIssueType as IssueType,
  ValidationSeverity as Severity
} from '@/types'
import { generateId, segmentsIntersect, pointToLineDistance, distance } from '@/utils/geometry'
import { useSoundingStore } from './sounding'
import { useContourStore } from './contour'

export const useValidationStore = defineStore('validation', () => {
  const result = ref<ValidationResult>({
    issues: [],
    hasErrors: false,
    hasWarnings: false,
    timestamp: 0
  })
  const autoValidate = ref(true)
  const lastValidatedContours = ref<string[]>([])

  const errors = computed(() =>
    result.value.issues.filter((i) => i.severity === Severity.ERROR)
  )
  const warnings = computed(() =>
    result.value.issues.filter((i) => i.severity === Severity.WARNING)
  )

  const hasCriticalErrors = computed(() => errors.value.length > 0)

  function createIssue(
    type: ValidationIssueType,
    severity: ValidationSeverity,
    message: string,
    relatedIds: string[],
    position?: LatLng
  ): ValidationIssue {
    return {
      id: generateId(),
      type,
      severity,
      message,
      relatedIds,
      position
    }
  }

  function validateSoundingPoint(point: SoundingPoint, allPoints: SoundingPoint[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (point.depth < 0) {
      issues.push(
        createIssue(
          IssueType.NEGATIVE_DEPTH,
          Severity.ERROR,
          `测深点深度为负数 (${point.depth}m)`,
          [point.id],
          point.position
        )
      )
    }
    for (const other of allPoints) {
      if (other.id === point.id) continue
      if (distance(point.position, other.position) < 3) {
        if (Math.abs(point.depth - other.depth) > 0.01) {
          issues.push(
            createIssue(
              IssueType.DUPLICATE_POSITION,
              Severity.ERROR,
              `同一位置存在不同深度值 (${point.depth}m vs ${other.depth}m)`,
              [point.id, other.id],
              point.position
            )
          )
        }
      }
    }
    return issues
  }

  function validateAllSoundingPoints(): ValidationIssue[] {
    const soundingStore = useSoundingStore()
    const issues: ValidationIssue[] = []
    for (const point of soundingStore.points) {
      issues.push(...validateSoundingPoint(point, soundingStore.points))
    }
    return issues
  }

  function validateContourIntersections(lines: ContourLine[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const lineA = lines[i]
        const lineB = lines[j]
        if (lineA.depth === lineB.depth) continue
        const intersections = findLineIntersections(lineA, lineB)
        for (const pos of intersections) {
          issues.push(
            createIssue(
              IssueType.CONTOUR_INTERSECTION,
              Severity.ERROR,
              `不同深度等深线交叉 (${lineA.depth}m 与 ${lineB.depth}m)`,
              [lineA.id, lineB.id],
              pos
            )
          )
        }
      }
    }
    return issues
  }

  function findLineIntersections(lineA: ContourLine, lineB: ContourLine): LatLng[] {
    const result: LatLng[] = []
    const ptsA = lineA.points
    const ptsB = lineB.points
    for (let i = 0; i < ptsA.length - 1; i++) {
      for (let j = 0; j < ptsB.length - 1; j++) {
        const intersect = segmentsIntersect(
          ptsA[i],
          ptsA[i + 1],
          ptsB[j],
          ptsB[j + 1]
        )
        if (intersect) {
          const dup = result.some((p) => distance(p, intersect) < 5)
          if (!dup) result.push(intersect)
        }
      }
    }
    return result
  }

  function validateContourDepthConsistency(line: ContourLine, points: SoundingPoint[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (line.points.length < 2) return issues
    const nearbyPoints = points.filter((p) => {
      const d = pointToLineDistance(p.position, line.points)
      return d < 200
    })
    if (nearbyPoints.length === 0) return issues
    const avgDepth = nearbyPoints.reduce((s, p) => s + p.depth, 0) / nearbyPoints.length
    const tolerance = Math.max(5, Math.abs(line.depth) * 0.3)
    if (Math.abs(avgDepth - line.depth) > tolerance) {
      const midIdx = Math.floor(line.points.length / 2)
      issues.push(
        createIssue(
          IssueType.DATA_INCONSISTENCY,
          Severity.WARNING,
          `等深线 ${line.depth}m 与附近测深点数据不一致 (附近平均深度 ${avgDepth.toFixed(1)}m)`,
          [line.id, ...nearbyPoints.map((p) => p.id)],
          line.points[midIdx]
        )
      )
    }
    return issues
  }

  function validateContourDepthJump(line: ContourLine): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (line.points.length < 3) return issues
    const contourStore = useContourStore()
    const otherLines = contourStore.lines.filter((l) => l.id !== line.id)
    for (const other of otherLines) {
      const depthDiff = Math.abs(line.depth - other.depth)
      if (depthDiff === 0) continue
      const minDist = getMinDistanceBetweenLines(line, other)
      if (minDist < 50 && depthDiff > 20) {
        const midIdx = Math.floor(line.points.length / 2)
        issues.push(
          createIssue(
            IssueType.DEPTH_JUMP,
            Severity.WARNING,
            `深度跳变异常: ${line.depth}m 与 ${other.depth}m 距离仅 ${minDist.toFixed(0)}m`,
            [line.id, other.id],
            line.points[midIdx]
          )
        )
      }
    }
    return issues
  }

  function getMinDistanceBetweenLines(lineA: ContourLine, lineB: ContourLine): number {
    let min = Infinity
    for (const p of lineA.points) {
      const d = pointToLineDistance(p, lineB.points)
      if (d < min) min = d
    }
    for (const p of lineB.points) {
      const d = pointToLineDistance(p, lineA.points)
      if (d < min) min = d
    }
    return min
  }

  function validateClosedContours(lines: ContourLine[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const line of lines) {
      if (line.points.length >= 4 && !line.isClosed) {
        const first = line.points[0]
        const last = line.points[line.points.length - 1]
        const dist = distance(first, last)
        if (dist < 100) {
          issues.push(
            createIssue(
              IssueType.UNCLOSED_CONTOUR,
              Severity.WARNING,
              `等深线 ${line.depth}m 可能未闭合 (首尾距离 ${dist.toFixed(0)}m)`,
              [line.id],
              first
            )
          )
        }
      }
    }
    return issues
  }

  function runFullValidation(): ValidationResult {
    const soundingStore = useSoundingStore()
    const contourStore = useContourStore()
    const issues: ValidationIssue[] = []
    issues.push(...validateAllSoundingPoints())
    issues.push(...validateContourIntersections(contourStore.lines))
    issues.push(...validateClosedContours(contourStore.lines))
    for (const line of contourStore.lines) {
      issues.push(...validateContourDepthJump(line))
      issues.push(...validateContourDepthConsistency(line, soundingStore.points))
    }
    const uniqueIssues = deduplicateIssues(issues)
    const validationResult: ValidationResult = {
      issues: uniqueIssues,
      hasErrors: uniqueIssues.some((i) => i.severity === Severity.ERROR),
      hasWarnings: uniqueIssues.some((i) => i.severity === Severity.WARNING),
      timestamp: Date.now()
    }
    result.value = validationResult
    lastValidatedContours.value = contourStore.lines.map((l) => l.id)
    return validationResult
  }

  function deduplicateIssues(issues: ValidationIssue[]): ValidationIssue[] {
    const seen = new Set<string>()
    const result: ValidationIssue[] = []
    for (const issue of issues) {
      const key = `${issue.type}-${issue.relatedIds.sort().join(',')}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(issue)
      }
    }
    return result
  }

  function validateAfterPointMove(pointId: string) {
    const soundingStore = useSoundingStore()
    const contourStore = useContourStore()
    const point = soundingStore.getPointById(pointId)
    if (!point) return
    const affectedContourIds: string[] = []
    for (const line of contourStore.lines) {
      const dist = pointToLineDistance(point.position, line.points)
      if (dist < 500) {
        affectedContourIds.push(line.id)
      }
    }
    const allLineIds = new Set<string>(affectedContourIds)
    for (const cid of affectedContourIds) {
      const line = contourStore.lines.find((l) => l.id === cid)
      if (!line) continue
      for (const other of contourStore.lines) {
        if (other.id === cid) continue
        const minDist = getMinDistanceBetweenLines(line, other)
        if (minDist < 500) {
          allLineIds.add(other.id)
        }
      }
    }
    const relatedLineIds = Array.from(allLineIds)
    const keptIssues = result.value.issues.filter((issue) => {
      if (
        issue.type === IssueType.DATA_INCONSISTENCY ||
        issue.type === IssueType.DEPTH_JUMP ||
        issue.type === IssueType.CONTOUR_INTERSECTION ||
        issue.type === IssueType.UNCLOSED_CONTOUR
      ) {
        for (const rid of relatedLineIds) {
          if (issue.relatedIds.includes(rid)) return false
        }
      }
      if (issue.relatedIds.includes(pointId) && issue.type === IssueType.DATA_INCONSISTENCY) {
        return false
      }
      return true
    })
    const newIssues: ValidationIssue[] = []
    const relatedLines = contourStore.lines.filter((l) => relatedLineIds.includes(l.id))
    newIssues.push(...validateContourIntersections(relatedLines))
    newIssues.push(...validateClosedContours(relatedLines))
    for (const line of relatedLines) {
      newIssues.push(...validateContourDepthJump(line))
      newIssues.push(...validateContourDepthConsistency(line, soundingStore.points))
    }
    const allIssues = deduplicateIssues([...keptIssues, ...newIssues])
    result.value = {
      issues: allIssues,
      hasErrors: allIssues.some((i) => i.severity === Severity.ERROR),
      hasWarnings: allIssues.some((i) => i.severity === Severity.WARNING),
      timestamp: Date.now()
    }
  }

  function validateAfterDelete(pointId: string) {
    const soundingStore = useSoundingStore()
    const contourStore = useContourStore()
    const affectedContourIds = soundingStore.findAffectedContours(pointId)
    const allLineIds = new Set<string>()
    for (const cid of affectedContourIds) {
      allLineIds.add(cid)
    }
    for (const cid of affectedContourIds) {
      const line = contourStore.lines.find((l) => l.id === cid)
      if (!line) continue
      for (const other of contourStore.lines) {
        if (other.id === cid) continue
        const minDist = getMinDistanceBetweenLines(line, other)
        if (minDist < 500) {
          allLineIds.add(other.id)
        }
      }
    }
    const relatedLineIds = Array.from(allLineIds)
    const keptIssues = result.value.issues.filter((issue) => {
      if (issue.relatedIds.includes(pointId)) return false
      if (
        issue.type === IssueType.DATA_INCONSISTENCY ||
        issue.type === IssueType.DEPTH_JUMP ||
        issue.type === IssueType.CONTOUR_INTERSECTION ||
        issue.type === IssueType.UNCLOSED_CONTOUR
      ) {
        for (const rid of relatedLineIds) {
          if (issue.relatedIds.includes(rid)) return false
        }
      }
      return true
    })
    const newIssues: ValidationIssue[] = []
    const relatedLines = contourStore.lines.filter((l) => relatedLineIds.includes(l.id))
    newIssues.push(...validateContourIntersections(relatedLines))
    newIssues.push(...validateClosedContours(relatedLines))
    for (const line of relatedLines) {
      newIssues.push(...validateContourDepthJump(line))
      newIssues.push(...validateContourDepthConsistency(line, soundingStore.points))
    }
    const allIssues = deduplicateIssues([...keptIssues, ...newIssues])
    result.value = {
      issues: allIssues,
      hasErrors: allIssues.some((i) => i.severity === Severity.ERROR),
      hasWarnings: allIssues.some((i) => i.severity === Severity.WARNING),
      timestamp: Date.now()
    }
  }

  function clearIssues() {
    result.value = {
      issues: [],
      hasErrors: false,
      hasWarnings: false,
      timestamp: 0
    }
  }

  function setAutoValidate(value: boolean) {
    autoValidate.value = value
  }

  return {
    result,
    errors,
    warnings,
    hasCriticalErrors,
    autoValidate,
    runFullValidation,
    validateAfterDelete,
    validateAfterPointMove,
    clearIssues,
    setAutoValidate,
    validateAllSoundingPoints,
    validateContourIntersections,
    validateClosedContours
  }
})
