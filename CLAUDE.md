# unfencd

A self-hosted, offline-capable map application for identifying legal dispersed camping areas on public land in Utah. Shows parcel ownership, access routes, and satellite/topo imagery with GPS overlay.

## Project goals

- **Primary:** Render a map of Utah that classifies every parcel as legal/restricted/illegal for dispersed camping.
- **Secondary:** Overlay roads, trails, and satellite imagery so routes to remote areas can be evaluated visually.
- **Hard requirements:**
  - Fully offline-capable (field use with no cell signal is the whole point).
  - GPS position displayed when the device supports it.
  - Self-hosted, Docker-based deployment.
  - No reliance on proprietary tile services (Mapbox/Google/Esri TOS prohibit offline caching).

## Legal classification model

Every parcel gets a classification. Do not simplify this to "BLM = yes" — that's wrong and the whole value of the app is getting this right.

- **Green (open to dispersed camping):** BLM SMA land not overlapping any restriction layer; USFS land allowing dispersed camping per MVUM.
- **Yellow (restricted / permit required / seasonal):** BLM Wilderness Study Areas, Areas of Critical Environmental Concern, Special Recreation Management Areas; SITLA (requires permit); seasonal closures; areas within 200ft of water (federal rule, derived via NHD buffer).
- **Red (closed):** Private land (including inholdings), National Parks, Wilderness Areas, tribal land, military, designated closed areas.

Classification is computed in PostGIS as a materialized view that intersects the ownership layer with all restriction layers. The view is the source of truth; the frontend just styles based on the classification column.

The 14-day stay limit is federal policy, not spatial data — surface it as informational UI, not a layer.

## Tech stack

- **Database:** PostGIS (Postgres 16 + PostGIS 3.x). All parcel, ownership, restriction, road, trail, and hydrography data lives here.
- **Vector tile server:** Martin (Rust, serves MVT directly from PostGIS queries). Chosen over pg_tileserv for performance.
- **Raster tile server:** tileserver-gl-light serving MBTiles for satellite/topo. Pre-generated per-region, not global.
- **Backend (if needed beyond tiles):** Node.js. Keep it thin — most logic should be in PostGIS.
- **Frontend:** Vue 3 + MapLibre GL JS. PWA with service worker for offline.
- **Deployment:** docker-compose stack, deployed alongside existing TrueNAS/Dockge setup.
- **Ingress:** Cloudflare tunnel to a subdomain (likely `unfencd.samwarr.dev`). HTTPS required for Geolocation API.

Avoid adding dependencies lightly. Prefer PostGIS SQL over application-layer geoprocessing.

## Data sources

All data must be public-domain or compatibly-licensed. Attribution goes in an in-app "Data sources" panel.

| Layer | Source | Format | Update cadence |
|---|---|---|---|
| BLM Surface Management Agency | BLM National Data portal | Shapefile / GeoJSON | Quarterly check |
| BLM WSAs, ACECs, SRMAs | BLM National Data portal | Shapefile | Quarterly check |
| USFS ownership + MVUMs | USFS Enterprise Data Warehouse | Shapefile | Annual |
| SITLA trust lands | UGRC | Shapefile | Annual |
| Utah parcels (private inholdings) | UGRC aggregated county data | Shapefile | Annual |
| Roads | OSM + UGRC + USFS (reconciled) | PBF / Shapefile | Monthly for OSM |
| Hydrography (for water setback) | USGS NHD | Shapefile | Annual |
| Satellite imagery | USDA NAIP (public domain, ~1m) | GeoTIFF → MBTiles | Every 2-3 yrs per Utah cycle |
| Topo | USGS The National Map | GeoTIFF → MBTiles | As revised |
| Optional: Sentinel-2 | Copernicus | GeoTIFF → MBTiles | Monthly availability |

Ingestion is a set of scripts in `/ingest` that download, reproject to EPSG:3857, and load via `ogr2ogr` into PostGIS. Each source has an idempotent loader so re-running only updates changed data.

## Offline strategy

- **Vector data:** App shell and vector tiles for a user-selected region cached in IndexedDB via service worker. "Download region" UI lets the user pre-sync before heading out.
- **Raster data:** MBTiles pre-built per region (e.g. `westdesert.mbtiles`, `sanrafael.mbtiles`, `grandstaircase.mbtiles`). Served over HTTP when online; downloaded to device for offline.
- **Region presets:** Start with hand-picked Utah regions rather than arbitrary rectangles. Users who want other areas can request a build.
- **Size budget:** Keep each region's total offline package under 500MB if possible. NAIP at zoom 16 over a full county is the main pressure point.

The app must degrade gracefully: GPS + cached tiles + cached parcel data = fully functional in the field.

## Architecture

```
┌─────────────────────────────────────────┐
│  Vue 3 + MapLibre PWA                   │
│  (service worker, IndexedDB cache)      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────┐         ┌──────▼──────────┐
│ Martin │         │ tileserver-gl   │
│ (MVT)  │         │ (MBTiles raster)│
└───┬────┘         └─────────────────┘
    │
┌───▼──────────┐
│  PostGIS     │
│  - ownership │
│  - restr.    │
│  - roads     │
│  - hydro     │
│  - classified│
│    (matview) │
└──────────────┘
```

Ingestion scripts run as one-shot containers or host cron, not as a long-running service.

## Repository layout (target)

```
/
├── CLAUDE.md              # this file
├── README.md
├── docker-compose.yml
├── .env.example
├── db/
│   ├── migrations/        # ordered SQL files
│   ├── views/             # classification matview definitions
│   └── seed/              # reference data (region definitions, etc.)
├── ingest/
│   ├── blm-sma.sh
│   ├── blm-restrictions.sh
│   ├── sitla.sh
│   ├── usfs.sh
│   ├── nhd.sh
│   ├── osm.sh
│   └── lib/               # shared bash helpers
├── tiles/
│   ├── build-mbtiles.sh   # NAIP/topo → MBTiles per region
│   └── regions/           # region bbox definitions
├── martin/
│   └── config.yaml
├── frontend/
│   ├── src/
│   ├── public/
│   └── vite.config.ts
└── docs/
    ├── data-sources.md
    ├── classification-rules.md
    └── offline-sync.md
```

## Development conventions

- **SQL style:** lowercase keywords, snake_case identifiers, explicit schema prefixes (`public.blm_sma`). CTEs over nested subqueries.
- **Projections:** store geometry in EPSG:4326, index in EPSG:3857 where tile performance matters. Always SRID-tag.
- **Migrations:** numbered SQL files, forward-only. No ORM.
- **Frontend:** Vue 3 Composition API, TypeScript, Pinia for state. Tailwind for styling.
- **Commits:** conventional commits (`feat:`, `fix:`, `data:`, `infra:`).
- **Secrets:** `.env` for local, Docker secrets for deployment. Never commit real data source URLs that require auth tokens.

## Gotchas and things already considered

- Mapbox/Google/Esri/Bing satellite tiles cannot be legally cached offline. Do not suggest them. NAIP or Sentinel-2 only.
- SITLA parcels look like BLM on casual inspection but have different rules. Distinguish them visually and in the legend.
- BLM parcel boundaries and county parcel datasets will have slivers and gaps at edges. Expect topology cleanup; use `ST_MakeValid` and small buffer tolerances.
- OSM, USFS, and UGRC roads will disagree. USFS MVUM is authoritative for motorized legality on USFS land; OSM is best for general road geometry; UGRC is best for Utah-specific annotations. Reconciliation strategy: prefer MVUM for legality attributes, OSM for geometry.
- Water setback (200ft from water) is a federal dispersed-camping rule. Implement as `ST_Buffer(nhd_streams, 61)` (meters) subtracted from green zones, marking them yellow.
- Geolocation API requires HTTPS. The dev environment must either use a self-signed cert or be accessed via `localhost` (which browsers exempt).
- The BLM SMA dataset is large. Use `ST_Subdivide` on large polygons before indexing to keep tile query times sane.
- Plan for a "report bad data" button early. User corrections + a review queue beat trying to get the data perfect from upstream sources.

## Out of scope (for now)

- States other than Utah. The data pipelines are Utah-specific.
- Reservation-based campground data (that's a solved problem — Recreation.gov, Campendium, etc.).
- Route planning / navigation. Display routes, don't compute them.
- Social features (reviews, photos, check-ins).
- Weather / fire restriction overlays. Valuable but a phase-2 concern.

## Current state

Planning / scaffolding. Nothing deployed yet. Start with:

1. docker-compose skeleton (postgis + martin + tileserver-gl + frontend stub).
2. First ingest: BLM SMA for Utah only, loaded into PostGIS.
3. First matview: naive classification (BLM = green, everything else = gray).
4. MapLibre frontend rendering the classification layer over a single NAIP MBTiles region.
5. Iterate restrictions layer by layer.

## Working with Claude on this project

- Default to editing existing files over creating new ones.
- When adding a data source, update `docs/data-sources.md` and add an ingest script in the same PR.
- When changing classification rules, update `docs/classification-rules.md` — this file is the user-facing explanation of what green/yellow/red mean.
- Prefer PostGIS for geoprocessing; reach for Python/Node only when SQL genuinely can't do it.
- Don't add authentication until there's a reason to. This is a personal-use app first.