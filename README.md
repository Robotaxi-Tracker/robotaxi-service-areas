# robotaxi-service-areas

Public service-area boundary data for robotaxi and autonomous ride-hail providers.

This repository contains provider-organized GeoJSON boundaries and metadata for mapped operating areas. Each area has a small metadata file plus a boundary file, and the build script combines them into a single generated bundle.

Current coverage includes:
- Tesla: Austin, Bay Area, Dallas, Houston
- Waymo: Atlanta, Austin, Bay Area, Dallas, Houston, Los Angeles, Miami, Nashville, Orlando, Phoenix, San Antonio
- Zoox: Bay Area, Las Vegas

## Layout
- `areas/<provider>/<slug>/meta.json`: provider, slug, display name, map center, default zoom, test-region flag, and aliases
- `areas/<provider>/<slug>/boundary.geojson`: GeoJSON `Feature` containing the service-area boundary geometry
- `dist/service-areas.json`: generated aggregate bundle containing all area metadata and boundaries
- `schema/service-area.schema.json`: JSON schema for area metadata

## Commands
- `npm run build` regenerates `dist/service-areas.json`
- `npm run check` validates the source tree can be parsed successfully
- `npm run import-boundary --input "Los Angeles boundary.geojson" --output areas/waymo/los-angeles` extracts and imports GeoJSON boundaries and metadata created using [Map Boundary Builder](https://mapboundary.app/)

## License

MIT
