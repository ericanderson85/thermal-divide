#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import zipfile
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

BOUNDARIES_PATH = DATA_DIR / "geographic-boundaries" / "neighborhoods.geojson"
OPEN_SPACE_PATH = DATA_DIR / "geographic-boundaries" / "open-space.geojson"
CANOPY_PATH = DATA_DIR / "tree-canopy-assessment" / "NBHD_Planning_wAP24_Land_Tree_Metrics.geojson"
ACS_PATH = DATA_DIR / "acs" / "2015-2019_neighborhood_tables_2021.12.21.xlsm"
HEAT_APPROX_PATH = DATA_DIR / "extreme-heat" / "neighborhood_heat_approx.geojson"

HEAT_LAYER_CONFIG = {
    "uhi": {
        "portal_item_id": "a49befcba14b16ad",
        "service_item_id": "d2f0f365ec9d4609836534c970ce2ab4",
        "service_name": "Test_Symbology_UHII_WTL1",
        "label": "Urban Heat Island Intensity",
    },
}

HEAT_SERVICE_ROOT = "https://tiles.arcgis.com/tiles/sFnw0xNflSi8J0uh/arcgis/rest/services"
MISSING_ACS_NAMES = {"Bay Village", "Chinatown", "Harbor Islands", "Leather District"}
ACS_SKIP_ROWS = {
    "",
    "Age",
    "Household Income",
    "Per Capita Income",
    "Poverty Rates",
    "Race & Ethnicity",
    "United States",
    "Massachusetts",
    "Boston",
}
NEIGHBORHOOD_NAME_ALIASES = {
    "Longwood Medical Area": "Longwood",
}

NS_SPREADSHEET = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CELL_REF_RE = re.compile(r"([A-Z]+)")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def ensure_public_dir() -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)


def to_float(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def round_or_none(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def normalize_name(name: str | None) -> str | None:
    if name is None:
        return None
    clean = " ".join(str(name).split())
    return NEIGHBORHOOD_NAME_ALIASES.get(clean, clean)


class WorkbookReader:
    def __init__(self, path: Path):
        self._zip = zipfile.ZipFile(path)
        self._shared_strings = self._load_shared_strings()
        self._sheet_targets = self._load_sheet_targets()

    def _load_shared_strings(self) -> list[str]:
        shared_strings: list[str] = []
        root = ET.fromstring(self._zip.read("xl/sharedStrings.xml"))
        for shared_item in root.findall("a:si", NS_SPREADSHEET):
            parts = [
                node.text or ""
                for node in shared_item.iterfind(".//a:t", NS_SPREADSHEET)
            ]
            shared_strings.append("".join(parts))
        return shared_strings

    def _load_sheet_targets(self) -> dict[str, str]:
        workbook_root = ET.fromstring(self._zip.read("xl/workbook.xml"))
        rel_root = ET.fromstring(self._zip.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: "xl/" + rel.attrib["Target"]
            for rel in rel_root
        }
        return {
            sheet.attrib["name"]: rel_map[
                sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
            ]
            for sheet in workbook_root.find("a:sheets", NS_SPREADSHEET)
        }

    def sheet_rows(self, sheet_name: str) -> list[dict[str, str]]:
        sheet_path = self._sheet_targets[sheet_name]
        root = ET.fromstring(self._zip.read(sheet_path))
        rows = []
        for row in root.find("a:sheetData", NS_SPREADSHEET):
            current = {}
            for cell in row.findall("a:c", NS_SPREADSHEET):
                ref = cell.attrib.get("r", "")
                match = CELL_REF_RE.match(ref)
                if not match:
                    continue
                current[match.group(1)] = self._cell_value(cell)
            rows.append(current)
        return rows

    def _cell_value(self, cell) -> str:
        cell_type = cell.attrib.get("t")
        if cell_type == "s":
            value_node = cell.find("a:v", NS_SPREADSHEET)
            if value_node is None:
                return ""
            return self._shared_strings[int(value_node.text)]
        if cell_type == "inlineStr":
            return "".join(
                node.text or ""
                for node in cell.iterfind(".//a:t", NS_SPREADSHEET)
            )
        value_node = cell.find("a:v", NS_SPREADSHEET)
        return value_node.text if value_node is not None else ""


def parse_acs_metrics() -> dict[str, dict]:
    workbook = WorkbookReader(ACS_PATH)
    metrics: dict[str, dict] = {}

    def upsert(name: str) -> dict:
        return metrics.setdefault(name, {"acs_available": True})

    def valid_name(value: str) -> bool:
        return (
            value not in ACS_SKIP_ROWS
            and not value.startswith("Source:")
            and not value.startswith("Table ")
            and not value.startswith("Universe:")
            and not value.startswith("Note:")
        )

    for row in workbook.sheet_rows("Household Income"):
        name = normalize_name((row.get("A") or "").strip())
        if not name or not valid_name(name):
            continue
        entry = upsert(name)
        entry["median_household_income"] = round_or_none(to_float(row.get("B")), 1)

    for row in workbook.sheet_rows("Poverty Rates"):
        name = normalize_name((row.get("A") or "").strip())
        if not name or not valid_name(name):
            continue
        entry = upsert(name)
        entry["poverty_rate"] = round_or_none(to_float(row.get("D")), 4)

    return metrics


def iter_polygons(geometry: dict) -> Iterable[list[list[list[float]]]]:
    geometry_type = geometry["type"]
    coordinates = geometry["coordinates"]
    if geometry_type == "Polygon":
        yield coordinates
        return
    if geometry_type == "MultiPolygon":
        for polygon in coordinates:
            yield polygon
        return
    raise ValueError(f"Unsupported geometry type: {geometry_type}")


def ring_area(ring: list[list[float]]) -> float:
    area = 0.0
    for index in range(len(ring)):
        x1, y1 = ring[index]
        x2, y2 = ring[(index + 1) % len(ring)]
        area += (x1 * y2) - (x2 * y1)
    return area / 2.0


def ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    signed_area = ring_area(ring)
    if abs(signed_area) < 1e-9:
        xs = [point[0] for point in ring]
        ys = [point[1] for point in ring]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    factor = 1 / (6 * signed_area)
    cx = 0.0
    cy = 0.0
    for index in range(len(ring)):
        x1, y1 = ring[index]
        x2, y2 = ring[(index + 1) % len(ring)]
        cross = (x1 * y2) - (x2 * y1)
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    return (cx * factor, cy * factor)


def geometry_centroid(geometry: dict) -> tuple[float, float]:
    total_area = 0.0
    weighted_x = 0.0
    weighted_y = 0.0
    for polygon in iter_polygons(geometry):
        exterior = polygon[0]
        area = abs(ring_area(exterior))
        centroid = ring_centroid(exterior)
        total_area += area
        weighted_x += centroid[0] * area
        weighted_y += centroid[1] * area
    if total_area <= 0:
        first = next(iter_polygons(geometry))[0][0]
        return (first[0], first[1])
    return (weighted_x / total_area, weighted_y / total_area)


def point_in_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for index in range(len(ring)):
        x1, y1 = ring[index]
        x2, y2 = ring[(index + 1) % len(ring)]
        intersects = ((y1 > y) != (y2 > y)) and (
            x < ((x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12)) + x1
        )
        if intersects:
            inside = not inside
    return inside


def point_in_polygon(point: tuple[float, float], polygon: list[list[list[float]]]) -> bool:
    if not point_in_ring(point, polygon[0]):
        return False
    for hole in polygon[1:]:
        if point_in_ring(point, hole):
            return False
    return True


def point_in_geometry(point: tuple[float, float], geometry: dict) -> bool:
    return any(point_in_polygon(point, polygon) for polygon in iter_polygons(geometry))


def feature_bbox(feature: dict) -> tuple[float, float, float, float]:
    xs = []
    ys = []
    for polygon in iter_polygons(feature["geometry"]):
        for ring in polygon:
            for x, y in ring:
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_contains(bbox: tuple[float, float, float, float], point: tuple[float, float]) -> bool:
    x, y = point
    min_x, min_y, max_x, max_y = bbox
    return min_x <= x <= max_x and min_y <= y <= max_y


def assign_neighborhood(point: tuple[float, float], neighborhoods: list[dict]) -> str | None:
    for neighborhood in neighborhoods:
        bbox = neighborhood["_bbox"]
        if not bbox_contains(bbox, point):
            continue
        if point_in_geometry(point, neighborhood["geometry"]):
            return neighborhood["properties"]["name"]
    return None


def extract_heat_metadata() -> dict:
    heat_metadata = {}
    for key, config in HEAT_LAYER_CONFIG.items():
        heat_metadata[key] = {
            "label": config["label"],
            "portalItemId": config["portal_item_id"],
            "serviceItemId": config["service_item_id"],
            "serviceName": config["service_name"],
            "serviceUrl": f"{HEAT_SERVICE_ROOT}/{config['service_name']}/MapServer",
            "tileUrl": f"{HEAT_SERVICE_ROOT}/{config['service_name']}/MapServer/tile/{{z}}/{{y}}/{{x}}",
            "attribution": "Climate Ready Boston",
            "mode": "tile",
        }

    return heat_metadata


def load_heat_approximation() -> dict[str, dict]:
    if not HEAT_APPROX_PATH.exists():
        return {}
    approximation = load_json(HEAT_APPROX_PATH)
    metrics = {}
    for feature in approximation.get("features", []):
        name = normalize_name(feature["properties"].get("name"))
        if not name:
            continue
        metrics[name] = feature["properties"]
    return metrics


def bbox_for_features(features: list[dict]) -> list[list[float]]:
    xs = []
    ys = []
    for feature in features:
        min_x, min_y, max_x, max_y = feature["_bbox"]
        xs.extend([min_x, max_x])
        ys.extend([min_y, max_y])
    return [[round_or_none(min(ys), 6), round_or_none(min(xs), 6)], [round_or_none(max(ys), 6), round_or_none(max(xs), 6)]]


def top_feature(
    features: list[dict],
    field: str,
    descending: bool = True,
    predicate=None,
) -> dict | None:
    candidates = [
        feature
        for feature in features
        if feature["properties"].get(field) is not None
        and (predicate(feature) if predicate else True)
    ]
    if not candidates:
        return None
    feature = sorted(
        candidates,
        key=lambda current: current["properties"][field],
        reverse=descending,
    )[0]
    return {
        "name": feature["properties"]["name"],
        "value": feature["properties"][field],
    }


def build_neighborhood_features(
    boundaries: dict,
    canopy: dict,
    acs_metrics: dict[str, dict],
    heat_metrics: dict[str, dict],
) -> list[dict]:
    canopy_by_name = {
        normalize_name(feature["properties"]["name"]): feature["properties"]
        for feature in canopy["features"]
    }

    features = []
    for feature in boundaries["features"]:
        name = normalize_name(feature["properties"]["name"])
        canopy_props = canopy_by_name.get(name, {})
        acs_props = acs_metrics.get(name, {})
        heat_props = heat_metrics.get(name, {})
        acs_available = name not in MISSING_ACS_NAMES and bool(acs_props)

        properties = {
            "name": name,
            "neighborhood_id": feature["properties"].get("neighborhood_id"),
            "acres": round_or_none(to_float(feature["properties"].get("acres")), 2),
            "sqmiles": round_or_none(to_float(feature["properties"].get("sqmiles")), 2),
            "canopy_pct": round_or_none(to_float(canopy_props.get("Can_P")), 2),
            "median_household_income": acs_props.get("median_household_income"),
            "poverty_rate": acs_props.get("poverty_rate"),
            "uhi_mean_f": round_or_none(to_float(heat_props.get("uhi_mean_f")), 3),
            "heat_available": bool(heat_props.get("heat_available")),
            "acs_available": acs_available,
        }
        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": feature["geometry"],
                "_bbox": feature["_bbox"],
            }
        )
    return features


def build_open_space_features(neighborhoods: list[dict], open_space: dict) -> list[dict]:
    features = []
    for feature in open_space["features"]:
        point = geometry_centroid(feature["geometry"])
        neighborhood = assign_neighborhood(point, neighborhoods)
        properties = feature["properties"]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "site_name": properties.get("SITE_NAME"),
                    "type": properties.get("TypeLong"),
                    "ownership": properties.get("OWNERSHIP"),
                    "district": properties.get("DISTRICT"),
                    "acres": round_or_none(to_float(properties.get("ACRES")), 2),
                    "neighborhood": neighborhood,
                    "open_space_id": properties.get("OS_ID"),
                },
                "geometry": feature["geometry"],
            }
        )
    return features


def write_geojson(path: Path, features: list[dict]) -> None:
    for feature in features:
        feature.pop("_bbox", None)
    collection = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(collection))


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload))


def build_story_stats(
    neighborhoods: list[dict],
    heat_layers: dict,
) -> dict:
    acs_missing = [
        feature["properties"]["name"]
        for feature in neighborhoods
        if not feature["properties"]["acs_available"]
    ]
    heat_configured = any(layer.get("tileUrl") for layer in heat_layers.values())
    heat_stats_available = any(
        feature["properties"].get("uhi_mean_f") is not None
        for feature in neighborhoods
    )
    return {
        "neighborhoodCount": len(neighborhoods),
        "acsCount": len(neighborhoods) - len(acs_missing),
        "acsMissing": acs_missing,
        "heatConfigured": heat_configured,
        "heatStatsAvailable": heat_stats_available,
        "heatLayers": heat_layers,
        "mapBounds": bbox_for_features(neighborhoods),
        "highlights": {
            "highestCanopy": top_feature(neighborhoods, "canopy_pct", descending=True),
            "lowestIncome": top_feature(neighborhoods, "median_household_income", descending=False),
            "highestPoverty": top_feature(neighborhoods, "poverty_rate", descending=True),
            "highestUhi": top_feature(neighborhoods, "uhi_mean_f", descending=True),
        },
    }


def main() -> None:
    ensure_public_dir()

    boundaries = load_json(BOUNDARIES_PATH)
    canopy = load_json(CANOPY_PATH)
    open_space = load_json(OPEN_SPACE_PATH)

    neighborhoods = boundaries["features"]
    for feature in neighborhoods:
        feature["_bbox"] = feature_bbox(feature)

    acs_metrics = parse_acs_metrics()
    heat_layers = extract_heat_metadata()
    heat_metrics = load_heat_approximation()

    neighborhood_features = build_neighborhood_features(
        boundaries,
        canopy,
        acs_metrics,
        heat_metrics,
    )
    for feature in neighborhood_features:
        feature["_bbox"] = feature_bbox(feature)

    open_space_features = build_open_space_features(neighborhood_features, open_space)
    story_stats = build_story_stats(neighborhood_features, heat_layers)

    write_geojson(PUBLIC_DATA_DIR / "neighborhoods_enriched.geojson", neighborhood_features)
    write_geojson(PUBLIC_DATA_DIR / "open_space_simplified.geojson", open_space_features)
    write_json(PUBLIC_DATA_DIR / "story_stats.json", story_stats)

    print(
        f"Wrote {len(neighborhood_features)} neighborhoods and "
        f"{len(open_space_features)} open-space features to {PUBLIC_DATA_DIR}"
    )


if __name__ == "__main__":
    main()
