# The Thermal Divide

Neighborhood-first scrollytelling prototype for the Boston heat / canopy / equity assignment.

## Run

```bash
npm run prepare:heat
npm run prepare:data
npm run dev
```

For a production build:

```bash
npm run build
```

## Data Outputs

`npm run prepare:data` generates:

- `public/data/neighborhoods_enriched.geojson`
- `public/data/open_space_simplified.geojson`
- `public/data/story_stats.json`

`npm run prepare:heat` generates:

- `data/extreme-heat/neighborhood_heat_approx.geojson`

## Heat Pipeline

The workspace includes the Climate Ready Boston `.lpk` layer packages. The app now defaults to the official public ArcGIS tile services for:

- Urban Heat Island Intensity
- Daytime Air Temperature (3PM)
- Nighttime Air Temperature (3AM)
- Heat Event Duration

The approximation script samples those published tile caches against the 26 neighborhood polygons and writes neighborhood-level means to `data/extreme-heat/neighborhood_heat_approx.geojson`. The main prep step automatically merges that file into `public/data/neighborhoods_enriched.geojson`.

To regenerate the heat summaries:

```bash
npm run prepare:heat
npm run prepare:data
```

`heat-layer-urls.json` is optional; use it only if you want to override the official service defaults for the map overlays.

The neighborhood heat values are an approximation derived from tile colors and published legends, not direct zonal statistics from source GeoTIFF rasters.
