# robotaxi-service-areas

Canonical public service-area source for [Robotaxi Tracker](https://github.com/EthanMcKanna/robotaxitracker).

## Layout
- `areas/<provider>/<slug>/meta.json`
- `areas/<provider>/<slug>/boundary.geojson`
- `dist/service-areas.json`
- `schema/service-area.schema.json`

## Commands
- `npm run build` regenerates `dist/service-areas.json`
- `npm run check` validates the source tree can be parsed successfully

## Syncing Robotaxi Tracker

Pushes to `main` trigger `.github/workflows/dispatch-private-sync.yml`, which dispatches an update event to the private Robotaxi Tracker repo so the site can sync the latest public service-area bundle.

## License

MIT
