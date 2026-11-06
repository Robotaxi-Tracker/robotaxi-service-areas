import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { validateBoundary, validateMeta } from './validate-area.mjs'

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
  const problems = []

  for (const provider of providers) {
    const slugs = await getDirectories(path.join(AREAS_DIR, provider))
    for (const slug of slugs) {
      const areaDir = path.join(AREAS_DIR, provider, slug)
      const key = `${provider}:${slug}`
      const report = (message) => problems.push(`${provider}/${slug}: ${message}`)

      let meta
      try {
        meta = JSON.parse(await readFile(path.join(areaDir, 'meta.json'), 'utf8'))
      } catch (error) {
        report(`cannot read meta.json (${error.message})`)
        continue
      }
      validateMeta(meta, provider, slug).forEach(report)

      // An area may have no boundary yet, but a boundary file that exists must parse and be valid.
      let boundary = null
      let boundaryText = null
      try {
        boundaryText = await readFile(path.join(areaDir, 'boundary.geojson'), 'utf8')
      } catch (error) {
        if (error.code !== 'ENOENT') report(`cannot read boundary.geojson (${error.message})`)
      }
      if (boundaryText !== null) {
        try {
          boundary = JSON.parse(boundaryText)
          validateBoundary(boundary, meta).forEach(report)
        } catch (error) {
          report(`boundary.geojson is not valid JSON (${error.message})`)
        }
      }

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

  if (problems.length) {
    throw new Error(`${problems.length} problem(s) in areas/:\n- ${problems.join('\n- ')}`)
  }

  if (CHECK_ONLY) {
    // dist/ must match the sources; generatedAt changes on every build, so it is ignored.
    let current = null
    try {
      current = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'))
    } catch {}
    const comparable = (bundle) => JSON.stringify({ ...bundle, generatedAt: null })
    if (!current || comparable(current) !== comparable(output)) {
      throw new Error('dist/service-areas.json is out of date; run `npm run build` and commit the result')
    }
    console.log(`Checked ${areas.length} areas; dist/service-areas.json is up to date`)
    return
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
