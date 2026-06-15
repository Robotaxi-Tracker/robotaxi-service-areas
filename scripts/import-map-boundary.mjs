import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PROVIDERS = new Set(['tesla', 'waymo', 'zoox'])

function usage() {
  return `Usage: node scripts/import-map-boundary.mjs --input <geojson> --output <dir> [options]

Convert map-boundary-builder GeoJSON into robotaxi-service-areas layout:
  <output>/boundary.geojson
  <output>/meta.json

Options:
  --input <path>          Source FeatureCollection from map-boundary-builder (required)
  --output <dir>          Destination area directory (required)
  --provider <name>       Provider id: tesla, waymo, or zoox
  --slug <slug>           Area slug, e.g. los-angeles
  --name <name>           Display name, e.g. "Los Angeles"
  --default-zoom <n>      Map zoom level (default: 10)
  --test-region           Mark the area as a test region
  --dry-run               Print output without writing files
  --help                  Show this help

When --provider, --slug, or --name are omitted, the script infers them from the
first feature's properties (catalog_slug, city) when available.`
}

function parseArgs(argv) {
  const options = {
    input: null,
    output: null,
    provider: null,
    slug: null,
    name: null,
    defaultZoom: 10,
    isTestRegion: false,
    dryRun: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--input':
        options.input = argv[++index]
        break
      case '--output':
        options.output = argv[++index]
        break
      case '--provider':
        options.provider = argv[++index]
        break
      case '--slug':
        options.slug = argv[++index]
        break
      case '--name':
        options.name = argv[++index]
        break
      case '--default-zoom':
        options.defaultZoom = Number(argv[++index])
        break
      case '--test-region':
        options.isTestRegion = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function parseCatalogSlug(catalogSlug) {
  if (!catalogSlug || typeof catalogSlug !== 'string') {
    return { provider: null, slug: null }
  }

  for (const provider of PROVIDERS) {
    const suffix = `-${provider}`
    if (catalogSlug.endsWith(suffix)) {
      return {
        provider,
        slug: catalogSlug.slice(0, -suffix.length),
      }
    }
  }

  return { provider: null, slug: catalogSlug }
}

function centerFromBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { centerLng: null, centerLat: null }
  }

  const [minLng, minLat, maxLng, maxLat] = bbox
  return {
    centerLng: round2((minLng + maxLng) / 2),
    centerLat: round2((minLat + maxLat) / 2),
  }
}

function centerFromGeometry(geometry) {
  const ring = geometry?.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length === 0) {
    return { centerLng: null, centerLat: null }
  }

  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }

  return centerFromBbox([minLng, minLat, maxLng, maxLat])
}

function pickBoundaryFeature(source) {
  if (source?.type === 'Feature' && source.geometry) {
    return source
  }

  if (source?.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('Expected a GeoJSON Feature or FeatureCollection from map-boundary-builder')
  }

  const feature = source.features.find((entry) => {
    const type = entry?.geometry?.type
    return type === 'Polygon' || type === 'MultiPolygon'
  })

  if (!feature) {
    throw new Error('No Polygon or MultiPolygon feature found in input GeoJSON')
  }

  return feature
}

function buildAreaFiles(source, options) {
  const feature = pickBoundaryFeature(source)
  const properties = feature.properties ?? {}
  const inferred = parseCatalogSlug(properties.catalog_slug)

  const provider = options.provider ?? inferred.provider
  const slug = options.slug ?? inferred.slug
  const name = options.name ?? properties.city ?? null

  if (!provider || !PROVIDERS.has(provider)) {
    throw new Error('Missing or invalid provider. Pass --provider or include catalog_slug in the source file.')
  }
  if (!slug) {
    throw new Error('Missing slug. Pass --slug or include catalog_slug in the source file.')
  }
  if (!name) {
    throw new Error('Missing display name. Pass --name or include city in the source file.')
  }

  const bboxCenter = centerFromBbox(properties.geodesic_bbox_lonlat)
  const geometryCenter = centerFromGeometry(feature.geometry)
  const centerLng = bboxCenter.centerLng ?? geometryCenter.centerLng
  const centerLat = bboxCenter.centerLat ?? geometryCenter.centerLat

  const boundary = {
    type: 'Feature',
    properties: {},
    geometry: feature.geometry,
  }

  const meta = {
    provider,
    slug,
    name,
    centerLat,
    centerLng,
    defaultZoom: options.defaultZoom,
    isTestRegion: options.isTestRegion,
    aliases: [],
  }

  return { boundary, meta }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  if (!options.input || !options.output) {
    throw new Error('Both --input and --output are required.')
  }
  if (!Number.isFinite(options.defaultZoom)) {
    throw new Error('--default-zoom must be a number.')
  }

  const inputPath = path.resolve(options.input)
  const outputDir = path.resolve(options.output)
  const source = JSON.parse(await readFile(inputPath, 'utf8'))
  const { boundary, meta } = buildAreaFiles(source, options)

  if (options.dryRun) {
    console.log(JSON.stringify({ outputDir, meta, boundary }, null, 2))
    return
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'boundary.geojson'), `${JSON.stringify(boundary, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

  console.log(`Wrote ${path.join(outputDir, 'boundary.geojson')}`)
  console.log(`Wrote ${path.join(outputDir, 'meta.json')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exit(1)
})
