import type { LatLng } from '@/types'

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export function distance(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function latLngToMeters(p: LatLng, origin: LatLng): { x: number; y: number } {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x = toRad(p.lng - origin.lng) * R * Math.cos(toRad(origin.lat))
  const y = toRad(p.lat - origin.lat) * R
  return { x, y }
}

export function metersToLatLng(
  x: number,
  y: number,
  origin: LatLng
): LatLng {
  const R = 6371000
  const toDeg = (rad: number) => (rad * 180) / Math.PI
  const lat = origin.lat + toDeg(y / R)
  const lng = origin.lng + toDeg(x / (R * Math.cos((origin.lat * Math.PI) / 180)))
  return { lat, lng }
}

export function ccw(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number }
): number {
  return (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)
}

export function segmentsIntersect(
  p1: LatLng,
  p2: LatLng,
  p3: LatLng,
  p4: LatLng
): LatLng | null {
  const origin = {
    lat: (p1.lat + p2.lat + p3.lat + p4.lat) / 4,
    lng: (p1.lng + p2.lng + p3.lng + p4.lng) / 4
  }
  const a = latLngToMeters(p1, origin)
  const b = latLngToMeters(p2, origin)
  const c = latLngToMeters(p3, origin)
  const d = latLngToMeters(p4, origin)

  const d1 = ccw(c, d, a)
  const d2 = ccw(c, d, b)
  const d3 = ccw(a, b, c)
  const d4 = ccw(a, b, d)

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)
    if (Math.abs(denom) < 1e-10) return null
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom
    const ix = a.x + t * (b.x - a.x)
    const iy = a.y + t * (b.y - a.y)
    return metersToLatLng(ix, iy, origin)
  }
  return null
}

export function pointToSegmentDistance(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng
): number {
  const origin = {
    lat: (point.lat + segStart.lat + segEnd.lat) / 3,
    lng: (point.lng + segStart.lng + segEnd.lng) / 3
  }
  const p = latLngToMeters(point, origin)
  const a = latLngToMeters(segStart, origin)
  const b = latLngToMeters(segEnd, origin)

  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-10) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
}

export function pointToLineDistance(point: LatLng, linePoints: LatLng[]): number {
  if (linePoints.length < 2) return Infinity
  let minDist = Infinity
  for (let i = 0; i < linePoints.length - 1; i++) {
    const d = pointToSegmentDistance(point, linePoints[i], linePoints[i + 1])
    if (d < minDist) minDist = d
  }
  return minDist
}

export function isPointNear(
  a: LatLng,
  b: LatLng,
  thresholdMeters: number = 5
): boolean {
  return distance(a, b) <= thresholdMeters
}

export function findNearestPointOnLine(
  point: LatLng,
  linePoints: LatLng[]
): { point: LatLng; index: number; distance: number } | null {
  if (linePoints.length < 2) return null
  const origin = {
    lat: point.lat,
    lng: point.lng
  }
  const p = latLngToMeters(point, origin)
  let best = { point: linePoints[0], index: 0, distance: Infinity }
  for (let i = 0; i < linePoints.length - 1; i++) {
    const a = latLngToMeters(linePoints[i], origin)
    const b = latLngToMeters(linePoints[i + 1], origin)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-10) continue
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
    if (dist < best.distance) {
      const projLatLng = metersToLatLng(projX, projY, origin)
      best = { point: projLatLng, index: i, distance: dist }
    }
  }
  return best
}
