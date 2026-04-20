import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const AREAS_DIR = path.join(ROOT, 'areas')
const OUTPUT_PATH = path.join(ROOT, 'dist', 'service-areas.json')
const CHECK_ONLY = process.argv.includes('--check')

async function getDirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
}

async function main() {
  const providers = await getDirectories(AREAS_DIR)
  const areas = []
  const seen = new Set()

  for (const provider of providers) {
    const slugs = await getDirectories(path.join(AREAS_DIR, provider))
    for (const slug of slugs) {
      const areaDir = path.join(AREAS_DIR, provider, slug)
      const meta = JSON.parse(await readFile(path.join(areaDir, 'meta.json'), 'utf8'))
      const boundaryPath = path.join(areaDir, 'boundary.geojson')
      let boundary = null
      try {
        boundary = JSON.parse(await readFile(boundaryPath, 'utf8'))
      } catch {}

      const key = `${provider}:${slug}`
      if (seen.has(key)) {
        throw new Error(`Duplicate service area key: ${key}`)
      }
      seen.add(key)

      areas.push({
        key,
        provider,
        slug,
        name: meta.name,
        centerLat: meta.centerLat ?? null,
        centerLng: meta.centerLng ?? null,
        defaultZoom: meta.defaultZoom ?? null,
        boundary,
        isTestRegion: meta.isTestRegion ?? false,
        aliases: meta.aliases ?? [],
      })
    }
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    publicSourceSha: null,
    mergedCount: areas.length,
    areas: areas.sort((a, b) => a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider)),
  }

  if (CHECK_ONLY) {
    return
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
