// Parses a GeoJSON Polygon (bare geometry, Feature or one-feature FeatureCollection) into the
// shape lights.settings stores: [lat, lng] vertices plus their bounding box. Pure, so it is
// unit tested; contest-admin.mjs is the only caller. Throws Error with a plain message.

export function parseGeofencePolygon(text) {
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('is not valid JSON')
  }
  if (json?.type === 'FeatureCollection') {
    if (json.features?.length !== 1) throw new Error('must hold exactly one feature')
    json = json.features[0]
  }
  const geometry = json?.type === 'Feature' ? json.geometry : json
  if (geometry?.type !== 'Polygon') throw new Error('must be a GeoJSON Polygon (or a Feature holding one)')
  const rings = geometry.coordinates
  if (!Array.isArray(rings) || rings.length !== 1) throw new Error('must have exactly one ring and no holes')
  const ring = rings[0]
  if (!Array.isArray(ring) || ring.length < 3) throw new Error('needs at least 3 vertices')
  const polygon = ring.map((v) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n)))
      throw new Error('every vertex must be [lng, lat] with two numbers')
    const [lng, lat] = v // GeoJSON order; the database stores [lat, lng]
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('has a vertex out of range (lat ±90, lng ±180)')
    return [lat, lng]
  })
  if (selfIntersects(polygon)) throw new Error('crosses itself (edges must not cross or touch, except neighbors at their shared vertex)')
  const lats = polygon.map((v) => v[0])
  const lngs = polygon.map((v) => v[1])
  const box = {
    geofence_min_lat: Math.min(...lats),
    geofence_max_lat: Math.max(...lats),
    geofence_min_lng: Math.min(...lngs),
    geofence_max_lng: Math.max(...lngs),
  }
  if (!(box.geofence_min_lat < box.geofence_max_lat && box.geofence_min_lng < box.geofence_max_lng))
    throw new Error('is degenerate (zero width or height)')
  return { ...box, geofence_polygon: polygon }
}

// A crossing ring is always a tracing mistake, and inside/outside stops meaning what the map
// shows, so refuse it before it reaches the database. O(n^2) is nothing at this size.
function selfIntersects(ring) {
  const closed = ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
  const pts = closed ? ring.slice(0, -1) : ring
  const n = pts.length
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const onSegment = (a, b, c) =>
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
  const meet = (a, b, c, d) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b)
    if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true
    return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b))
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbors share a vertex by design (including the last edge and the first).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (meet(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
  }
  return false
}
