export interface LatLng {
  lat: number
  lng: number
}

export interface SoundingPoint {
  id: string
  position: LatLng
  depth: number
  createdAt: number
  note?: string
}

export interface ContourLine {
  id: string
  depth: number
  points: LatLng[]
  isClosed: boolean
  createdAt: number
  color: string
  label?: string
}

export interface DepthLevel {
  depth: number
  color: string
  label: string
}

export enum ToolType {
  NONE = 'none',
  ADD_SOUNDING = 'add_sounding',
  DRAW_CONTOUR = 'draw_contour',
  EDIT_POINT = 'edit_point',
  MOVE_NODE = 'move_node',
  DELETE = 'delete'
}

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface ValidationIssue {
  id: string
  type: ValidationIssueType
  severity: ValidationSeverity
  message: string
  relatedIds: string[]
  position?: LatLng
}

export enum ValidationIssueType {
  NEGATIVE_DEPTH = 'negative_depth',
  DUPLICATE_POSITION = 'duplicate_position',
  CONTOUR_INTERSECTION = 'contour_intersection',
  DEPTH_JUMP = 'depth_jump',
  UNCLOSED_CONTOUR = 'unclosed_contour',
  DATA_INCONSISTENCY = 'data_inconsistency'
}

export interface ValidationResult {
  issues: ValidationIssue[]
  hasErrors: boolean
  hasWarnings: boolean
  timestamp: number
}

export interface DepthStatistics {
  totalPoints: number
  depthRange: { min: number; max: number }
  averageDepth: number
  depthDistribution: { depth: number; count: number }[]
  areaCoverage: number
}

export interface WorkspaceStatus {
  isCompleted: boolean
  completedAt?: number
  hasCriticalErrors: boolean
}
