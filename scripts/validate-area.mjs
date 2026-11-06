// Checks one area's meta.json and boundary.geojson. Returns a list of problems (empty when fine).

const PROVIDERS = new Set(['tesla', 'waymo', 'zoox'])

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

export function validateMeta(meta, provider, slug) {
  const problems = []
  if (meta.provider == null) problems.push('meta.provider is missing')
  else if (!PROVIDERS.has(meta.provider)) problems.push(`meta.provider "${meta.provider}" is not one of ${[...PROVIDERS].join(', ')}`)
  else if (meta.provider !== provider) problems.push(`meta.provider "${meta.provider}" does not match folder "${provider}"`)
  if (meta.slug == null) problems.push('meta.slug is missing')
  else if (meta.slug !== slug) problems.push(`meta.slug "${meta.slug}" does not match folder "${slug}"`)
  if (typeof meta.name !== 'string' || meta.name.trim() === '') problems.push('meta.name is missing')
  for (const [key, min, max] of [['centerLat', -90, 90], ['centerLng', -180, 180], ['defaultZoom', 0, 24]]) {
    const value = meta[key]
    if (value != null && (!isNumber(value) || value < min || value > max)) problems.push(`meta.${key} must be a number from ${min} to ${max}`)
  }
  if (meta.isTestRegion != null && typeof meta.isTestRegion !== 'boolean') problems.push('meta.isTestRegion must be true or false')
  if (meta.aliases != null && !(Array.isArray(meta.aliases) && meta.aliases.every((alias) => typeof alias === 'string'))) {
    problems.push('meta.aliases must be a list of strings')
  }
  return problems
}

// Proper crossing or touching of segments ab and cd (shared endpoints of neighbouring segments are skipped by the caller).
function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  const onSegment = (p, q, r) =>
    Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1])
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b)) || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d))
}

function ringProblems(ring, label) {
  if (!Array.isArray(ring) || ring.length < 4) return [`${label} needs at least 4 positions`]
  const problems = []
  for (const position of ring) {
    const [lng, lat] = Array.isArray(position) ? position : []
    if (!isNumber(lng) || !isNumber(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return [`${label} has an invalid position ${JSON.stringify(position)} (expected [longitude, latitude])`]
    }
  }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) problems.push(`${label} is not closed (first and last positions differ)`)
  for (let i = 1; i < ring.length; i += 1) {
    if (ring[i][0] === ring[i - 1][0] && ring[i][1] === ring[i - 1][1]) {
      problems.push(`${label} repeats position ${JSON.stringify(ring[i])} at index ${i}`)
      break
    }
  }
  if (problems.length) return problems

  const n = ring.length - 1 // segments
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue // first and last segments share the closing position
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return [`${label} crosses itself near ${JSON.stringify(ring[i])} and ${JSON.stringify(ring[j])}`]
      }
    }
  }
  return []
}

export function validateBoundary(boundary, meta) {
  if (boundary?.type !== 'Feature' || !boundary.geometry) return ['boundary.geojson must be a GeoJSON Feature with a geometry']
  const { type, coordinates } = boundary.geometry
  let polygons
  if (type === 'Polygon') polygons = [coordinates]
  else if (type === 'MultiPolygon') polygons = coordinates
  else return [`boundary geometry must be a Polygon or MultiPolygon, not ${type}`]
  if (!Array.isArray(polygons) || polygons.length === 0 || polygons.some((rings) => !Array.isArray(rings) || rings.length === 0)) {
    return ['boundary geometry has no coordinates']
  }

  const problems = []
  polygons.forEach((rings, p) => {
    rings.forEach((ring, r) => {
      const label = `${polygons.length > 1 ? `polygon ${p + 1} ` : ''}${r === 0 ? 'outer ring' : `hole ${r}`}`
      problems.push(...ringProblems(ring, label))
    })
  })
  if (problems.length) return problems

  if (isNumber(meta.centerLat) && isNumber(meta.centerLng)) {
    const positions = polygons.flatMap((rings) => rings[0])
    const lngs = positions.map((position) => position[0])
    const lats = positions.map((position) => position[1])
    const inside =
      meta.centerLng >= Math.min(...lngs) && meta.centerLng <= Math.max(...lngs) && meta.centerLat >= Math.min(...lats) && meta.centerLat <= Math.max(...lats)
    if (!inside) problems.push(`map centre ${meta.centerLat}, ${meta.centerLng} lies outside the boundary's bounding box`)
  }
  return problems
}
