# The Thermal Divide

CS 617 scrollytelling project

## Run

```bash
npm run prepare:data
npm run dev
```

## Data Outputs

`npm run prepare:data` generates:

- `public/data/neighborhoods_enriched.geojson`
- `public/data/open_space_simplified.geojson`
- `public/data/story_stats.json`

## Heat Pipeline

The app uses the official public ArcGIS tile service for Urban Heat Island
Intensity and merges existing neighborhood-level UHI summaries from
`data/extreme-heat/neighborhood_heat_approx.geojson`.

The neighborhood heat values are an approximation derived from tile colors and published legends, not direct zonal statistics from source GeoTIFF rasters.
