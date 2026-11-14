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
