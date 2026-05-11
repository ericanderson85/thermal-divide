#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import proj4 from "proj4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const BOUNDARIES_PATH = path.join(
  ROOT,
  "data",
  "geographic-boundaries",
  "neighborhoods.geojson",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "extreme-heat",
  "neighborhood_heat_approx.geojson",
);
const SERVICE_ROOT =
  "https://tiles.arcgis.com/tiles/sFnw0xNflSi8J0uh/arcgis/rest/services";
const DEFAULT_LOD = 4;
const DEFAULT_STRIDE = 4;
const FETCH_CONCURRENCY = 8;
const WGS84 = "EPSG:4326";
const STATE_PLANE = "EPSG:2249";

proj4.defs(
  STATE_PLANE,
  "+proj=lcc +lat_0=41 +lon_0=-71.5 +lat_1=42.6833333333333 " +
    "+lat_2=41.7166666666667 +x_0=200000.0001016 +y_0=750000 " +
    "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
);

const LAYERS = [
  {
    id: "uhi",
    label: "Urban Heat Island Intensity",
    serviceName: "Test_Symbology_UHII_WTL1",
    meanField: "uhi_mean_f",
    maxField: "uhi_max_f",
  },
  {
    id: "day3pm",
    label: "Daytime Air Temperature (3PM)",
    serviceName: "Ta_3pm_cb_prj_city_tif_WTL1",
    meanField: "day_3pm_mean_f",
  },
  {
    id: "night3am",
    label: "Nighttime Air Temperature (3AM)",
    serviceName: "night_3am_cb_prj_city_tif_WTL1",
    fallbackServiceNames: ["nighttime_temp_test_WTL1"],
    meanField: "night_3am_mean_f",
  },
  {
    id: "duration",
    label: "Heat Event Duration",
    serviceName: "Heat_Event_Duration_CRB_Heat_Resilience_Study_WTL1",
    meanField: "heat_duration_mean",
  },
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function roundOrNull(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function iteratePolygons(geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function transformCoordinates(coordinates) {
  if (typeof coordinates[0] === "number") {
    return proj4(WGS84, STATE_PLANE, coordinates);
  }
  return coordinates.map((value) => transformCoordinates(value));
}

function transformGeometry(geometry) {
  return {
    type: geometry.type,
    coordinates: transformCoordinates(geometry.coordinates),
  };
}

function featureBbox(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of iteratePolygons(geometry)) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function boxesIntersect(a, b) {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function bboxContainsPoint(bbox, point) {
  return (
    point[0] >= bbox[0] &&
    point[0] <= bbox[2] &&
    point[1] >= bbox[1] &&
    point[1] <= bbox[3]
  );
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    const intersects =
      y1 > y !== y2 > y &&
      x < ((x2 - x1) * (y - y1)) / (y2 - y1 || 1e-12) + x1;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!pointInRing(point, polygon[0])) {
    return false;
  }
  for (const hole of polygon.slice(1)) {
    if (pointInRing(point, hole)) {
      return false;
    }
  }
  return true;
}

function pointInGeometry(point, geometry) {
  return iteratePolygons(geometry).some((polygon) => pointInPolygon(point, polygon));
}

function unionBbox(features) {
  return features.reduce(
    (current, feature) => [
      Math.min(current[0], feature.projectedBbox[0]),
      Math.min(current[1], feature.projectedBbox[1]),
      Math.max(current[2], feature.projectedBbox[2]),
      Math.max(current[3], feature.projectedBbox[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed request ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed request ${response.status} for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function decodeImage(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return PNG.sync.read(buffer);
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const image = jpeg.decode(buffer, { useTArray: true });
    return {
      width: image.width,
      height: image.height,
      data: image.data,
    };
  }
  throw new Error("Unsupported image format");
}

function decodeLegendColor(imageData) {
  const image = decodeImage(Buffer.from(imageData, "base64"));
  const xStart = Math.floor(image.width * 0.25);
  const xEnd = Math.max(xStart + 1, Math.ceil(image.width * 0.75));
  const yStart = Math.floor(image.height * 0.25);
  const yEnd = Math.max(yStart + 1, Math.ceil(image.height * 0.75));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3] ?? 255;
      if (alpha < 200) {
        continue;
      }
      red += image.data[offset];
      green += image.data[offset + 1];
      blue += image.data[offset + 2];
      count += 1;
    }
  }
  if (!count) {
    throw new Error("Legend swatch had no opaque pixels");
  }
  return [red / count, green / count, blue / count];
}

function parseLegendValue(label) {
  const match = String(label).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

async function resolveLayerService(layer) {
  const serviceNames = [layer.serviceName, ...(layer.fallbackServiceNames || [])];
  let lastError = null;
  for (const serviceName of serviceNames) {
    const serviceUrl = `${SERVICE_ROOT}/${serviceName}/MapServer`;
    try {
      const [metadata, legend] = await Promise.all([
        fetchJson(`${serviceUrl}?f=pjson`),
        fetchJson(`${serviceUrl}/legend?f=pjson`),
      ]);
      const stops = (legend.layers?.[0]?.legend || [])
        .map((entry) => ({
          value: parseLegendValue(entry.label),
          color: decodeLegendColor(entry.imageData),
        }))
        .filter((entry) => entry.value !== null);
      if (!stops.length) {
        throw new Error(`No legend stops for ${serviceName}`);
      }
      return {
        ...layer,
        serviceName,
        serviceUrl,
        metadata,
        stops,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function getLodInfo(metadata, level) {
  const lod = metadata.tileInfo?.lods?.find((entry) => entry.level === level);
  if (!lod) {
    throw new Error(`Service does not expose LOD ${level}`);
  }
  return {
    level,
    resolution: lod.resolution,
    rows: metadata.tileInfo.rows,
    cols: metadata.tileInfo.cols,
    originX: metadata.tileInfo.origin.x,
    originY: metadata.tileInfo.origin.y,
  };
}

function tileRangeForBbox(bbox, lodInfo) {
  const tileWorldWidth = lodInfo.cols * lodInfo.resolution;
  const tileWorldHeight = lodInfo.rows * lodInfo.resolution;
  return {
    colMin: Math.floor((bbox[0] - lodInfo.originX) / tileWorldWidth),
    colMax: Math.floor((bbox[2] - lodInfo.originX) / tileWorldWidth),
    rowMin: Math.floor((lodInfo.originY - bbox[3]) / tileWorldHeight),
    rowMax: Math.floor((lodInfo.originY - bbox[1]) / tileWorldHeight),
    tileWorldWidth,
    tileWorldHeight,
  };
}

function tileBbox(row, col, lodInfo, tileRange) {
  const minX = lodInfo.originX + col * tileRange.tileWorldWidth;
  const maxX = minX + tileRange.tileWorldWidth;
  const maxY = lodInfo.originY - row * tileRange.tileWorldHeight;
  const minY = maxY - tileRange.tileWorldHeight;
  return [minX, minY, maxX, maxY];
}

function nearestLegendValue(stops, colorCache, red, green, blue) {
  const key = `${red},${green},${blue}`;
  if (colorCache.has(key)) {
    return colorCache.get(key);
  }
  let best = null;
  let bestDistance = Infinity;
  for (const stop of stops) {
    const dr = red - stop.color[0];
    const dg = green - stop.color[1];
    const db = blue - stop.color[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stop.value;
    }
  }
  colorCache.set(key, best);
  return best;
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function makeProjectedFeatures(boundaries) {
  return boundaries.features.map((feature) => {
    const name = normalizeName(feature.properties.name);
    const projectedGeometry = transformGeometry(feature.geometry);
    return {
      type: "Feature",
      properties: {
        name,
        neighborhood_id: feature.properties.neighborhood_id ?? null,
      },
      geometry: feature.geometry,
      projectedGeometry,
      projectedBbox: featureBbox(projectedGeometry),
    };
  });
}

function initStats(features) {
  const stats = new Map();
  for (const feature of features) {
    stats.set(feature.properties.name, {
      count: 0,
      sum: 0,
      max: -Infinity,
    });
  }
  return stats;
}

async function approximateLayer(layer, features, options) {
  const resolvedLayer = await resolveLayerService(layer);
  const lodInfo = getLodInfo(resolvedLayer.metadata, options.lod);
  const cityBbox = unionBbox(features);
  const tileRange = tileRangeForBbox(cityBbox, lodInfo);
  const tasks = [];
  for (let row = tileRange.rowMin; row <= tileRange.rowMax; row += 1) {
    for (let col = tileRange.colMin; col <= tileRange.colMax; col += 1) {
      const bbox = tileBbox(row, col, lodInfo, tileRange);
      const candidates = features.filter((feature) =>
        boxesIntersect(bbox, feature.projectedBbox),
      );
      if (candidates.length) {
        tasks.push({ row, col, bbox, candidates });
      }
    }
  }

  const stats = initStats(features);
  const colorCache = new Map();
  console.log(
    `Approximating ${resolvedLayer.label}: ${tasks.length} tiles at LOD ${options.lod}, stride ${options.stride}`,
  );

  await runPool(tasks, FETCH_CONCURRENCY, async (task) => {
    const tileUrl = `${resolvedLayer.serviceUrl}/tile/${lodInfo.level}/${task.row}/${task.col}`;
    const buffer = await fetchBuffer(tileUrl);
    if (!buffer) {
      return;
    }
    const image = decodeImage(buffer);
    for (let y = 0; y < image.height; y += options.stride) {
      for (let x = 0; x < image.width; x += options.stride) {
        const offset = (y * image.width + x) * 4;
        const alpha = image.data[offset + 3] ?? 255;
        if (alpha < 24) {
          continue;
        }
        const point = [
          task.bbox[0] + (x + 0.5) * lodInfo.resolution,
          task.bbox[3] - (y + 0.5) * lodInfo.resolution,
        ];
        let matchedFeature = null;
        for (const candidate of task.candidates) {
          if (!bboxContainsPoint(candidate.projectedBbox, point)) {
            continue;
          }
          if (pointInGeometry(point, candidate.projectedGeometry)) {
            matchedFeature = candidate;
            break;
          }
        }
        if (!matchedFeature) {
          continue;
        }
        const value = nearestLegendValue(
          resolvedLayer.stops,
          colorCache,
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
        );
        if (value === null || value === undefined) {
          continue;
        }
        const entry = stats.get(matchedFeature.properties.name);
        entry.count += 1;
        entry.sum += value;
        entry.max = Math.max(entry.max, value);
      }
    }
  });

  return {
    ...resolvedLayer,
    stats,
  };
}

function mergeLayerStats(features, layerResults, options) {
  return features.map((feature) => {
    const properties = {
      ...feature.properties,
      approximation_method: "arcgis_tile_legend_sampling",
      heat_tile_lod: options.lod,
      heat_sample_stride: options.stride,
    };
    for (const layer of layerResults) {
      const stat = layer.stats.get(feature.properties.name);
      if (!stat || !stat.count) {
        properties[layer.meanField] = null;
        properties[`${layer.id}_sample_count`] = 0;
        if (layer.maxField) {
          properties[layer.maxField] = null;
        }
        continue;
      }
      properties[layer.meanField] = roundOrNull(stat.sum / stat.count, 3);
      properties[`${layer.id}_sample_count`] = stat.count;
      if (layer.maxField) {
        properties[layer.maxField] = roundOrNull(stat.max, 3);
      }
    }
    properties.heat_available =
      properties.uhi_mean_f !== null ||
      properties.day_3pm_mean_f !== null ||
      properties.night_3am_mean_f !== null ||
      properties.heat_duration_mean !== null;
    return {
      type: "Feature",
      properties,
      geometry: feature.geometry,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lod = Number(args.lod || DEFAULT_LOD);
  const stride = Number(args.stride || DEFAULT_STRIDE);
  if (!Number.isFinite(lod) || !Number.isFinite(stride) || stride < 1) {
    throw new Error("Usage: node scripts/approximate_heat_tiles.js --lod 4 --stride 4");
  }

  const boundaries = JSON.parse(await fs.readFile(BOUNDARIES_PATH, "utf8"));
  const features = makeProjectedFeatures(boundaries);
  const layerResults = [];
  for (const layer of LAYERS) {
    layerResults.push(await approximateLayer(layer, features, { lod, stride }));
  }

  const output = {
    type: "FeatureCollection",
    metadata: {
      approximation_method: "arcgis_tile_legend_sampling",
      generated_at: new Date().toISOString(),
      tile_lod: lod,
      sample_stride: stride,
      source_services: layerResults.map((layer) => ({
        id: layer.id,
        label: layer.label,
        service_name: layer.serviceName,
        service_url: layer.serviceUrl,
      })),
    },
    features: mergeLayerStats(features, layerResults, { lod, stride }),
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output));
  console.log(`Wrote ${output.features.length} features to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
