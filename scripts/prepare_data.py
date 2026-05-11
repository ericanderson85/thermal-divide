#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import subprocess
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

BOUNDARIES_PATH = DATA_DIR / "geographic-boundaries" / "neighborhoods.geojson"
OPEN_SPACE_PATH = DATA_DIR / "geographic-boundaries" / "open-space.geojson"
CANOPY_PATH = DATA_DIR / "tree-canopy-assessment" / "NBHD_Planning_wAP24_Land_Tree_Metrics.geojson"
VULNERABILITY_PATH = DATA_DIR / "social-vulnerability" / "Climate_Ready_Boston_Social_Vulnerability.geojson"
ACS_PATH = DATA_DIR / "social-vulnerability" / "2015-2019_neighborhood_tables_2021.12.21.xlsm"
HEAT_APPROX_PATH = DATA_DIR / "extreme-heat" / "neighborhood_heat_approx.geojson"

HEAT_LAYER_CONFIG = {
    "uhi": {
        "package": DATA_DIR / "extreme-heat" / "Urban Heat Island Intensity (UHII) Index _CRB Heat Plan.lpk",
        "portal_item_id": "a49befcba14b16ad",
        "service_item_id": "d2f0f365ec9d4609836534c970ce2ab4",
        "service_name": "Test_Symbology_UHII_WTL1",
        "label": "Urban Heat Island Intensity",
    },
    "day3pm": {
        "package": DATA_DIR / "extreme-heat" / "Daytime Air Temperature (3PM)_CRB Heat Plan.lpk",
        "portal_item_id": "a3c0bcba3e7552a2",
        "service_item_id": None,
        "service_name": "Ta_3pm_cb_prj_city_tif_WTL1",
        "label": "Daytime Air Temperature (3PM)",
    },
    "night3am": {
        "package": DATA_DIR / "extreme-heat" / "Nighttime Air Temperature (3AM)_CRB Heat Plan.lpk",
        "portal_item_id": "a2e3ba225a8127b8",
        "service_item_id": None,
        "service_name": "nighttime_temp_test_WTL1",
        "label": "Nighttime Air Temperature (3AM)",
    },
    "duration": {
        "package": DATA_DIR / "extreme-heat" / "Heat Event Duration_CRB Heat Plan.lpk",
        "portal_item_id": None,
        "service_item_id": None,
        "service_name": "Heat_Event_Duration_CRB_Heat_Resilience_Study_WTL1",
        "label": "Heat Event Duration",
    },
}

HEAT_TILE_URLS_PATH = ROOT / "heat-layer-urls.json"
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
        entry["households_total"] = round_or_none(to_float(row.get("C")), 0)

    for row in workbook.sheet_rows("Per Capita Income"):
        name = normalize_name((row.get("A") or "").strip())
        if not name or not valid_name(name):
            continue
        entry = upsert(name)
        entry["per_capita_income"] = round_or_none(to_float(row.get("D")), 1)

    for row in workbook.sheet_rows("Poverty Rates"):
        name = normalize_name((row.get("A") or "").strip())
        if not name or not valid_name(name):
            continue
        entry = upsert(name)
        entry["poverty_population"] = round_or_none(to_float(row.get("B")), 0)
        entry["poverty_total"] = round_or_none(to_float(row.get("C")), 0)
        entry["poverty_rate"] = round_or_none(to_float(row.get("D")), 4)

    for row in workbook.sheet_rows("Race"):
        name = normalize_name((row.get("A") or "").strip())
        if not name or not valid_name(name):
            continue
        entry = upsert(name)
        entry["race_population"] = round_or_none(to_float(row.get("B")), 0)
        entry["white_pct"] = round_or_none(to_float(row.get("D")), 4)
        entry["black_pct"] = round_or_none(to_float(row.get("F")), 4)
        entry["hispanic_pct"] = round_or_none(to_float(row.get("H")), 4)
        entry["asian_pct"] = round_or_none(to_float(row.get("J")), 4)

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


def aggregate_open_space(neighborhoods: list[dict], open_space: dict) -> dict[str, dict]:
    aggregates = defaultdict(lambda: {"open_space_acres": 0.0, "open_space_count": 0})
    for feature in open_space["features"]:
        point = geometry_centroid(feature["geometry"])
        name = assign_neighborhood(point, neighborhoods)
        if not name:
            continue
        aggregates[name]["open_space_acres"] += to_float(feature["properties"].get("ACRES")) or 0.0
        aggregates[name]["open_space_count"] += 1
    return aggregates


def aggregate_vulnerability(neighborhoods: list[dict], vulnerability: dict) -> tuple[dict[str, dict], list[str]]:
    aggregates = defaultdict(
        lambda: {
            "population": 0.0,
            "disabled_total": 0.0,
            "older_total": 0.0,
            "lep_total": 0.0,
            "poc_total": 0.0,
            "low_vehicle_total": 0.0,
            "med_illness_total": 0.0,
            "tract_count": 0,
        }
    )
    unmatched: list[str] = []
    for feature in vulnerability["features"]:
        properties = feature["properties"]
        point = geometry_centroid(feature["geometry"])
        name = assign_neighborhood(point, neighborhoods)
        if not name:
            name = normalize_name(properties.get("Name"))
        if not name:
            unmatched.append(str(properties.get("GEOID10")))
            continue
        entry = aggregates[name]
        entry["population"] += to_float(properties.get("POP100_RE")) or 0.0
        entry["disabled_total"] += to_float(properties.get("TotDis")) or 0.0
        entry["older_total"] += to_float(properties.get("OlderAdult")) or 0.0
        entry["lep_total"] += to_float(properties.get("LEP")) or 0.0
        entry["poc_total"] += to_float(properties.get("POC2")) or 0.0
        entry["low_vehicle_total"] += to_float(properties.get("Low_to_No")) or 0.0
        entry["med_illness_total"] += to_float(properties.get("MedIllnes")) or 0.0
        entry["tract_count"] += 1

    finalized = {}
    for name, entry in aggregates.items():
        population = entry["population"] or 0.0
        if population > 0:
            entry["disabled_share"] = round_or_none(entry["disabled_total"] / population, 4)
            entry["older_share"] = round_or_none(entry["older_total"] / population, 4)
            entry["lep_share"] = round_or_none(entry["lep_total"] / population, 4)
            entry["poc_share"] = round_or_none(entry["poc_total"] / population, 4)
            entry["low_vehicle_share"] = round_or_none(entry["low_vehicle_total"] / population, 4)
        else:
            entry["disabled_share"] = None
            entry["older_share"] = None
            entry["lep_share"] = None
            entry["poc_share"] = None
            entry["low_vehicle_share"] = None
        entry["population"] = round_or_none(population, 0)
        entry["med_illness_total"] = round_or_none(entry["med_illness_total"], 2)
        finalized[name] = entry
    return finalized, unmatched


def extract_heat_metadata() -> dict:
    heat_metadata = {}
    for key, config in HEAT_LAYER_CONFIG.items():
        raw_xml = subprocess.check_output(
            ["bsdtar", "-xOf", str(config["package"]), "esriinfo/iteminfo.xml"],
            cwd=ROOT,
            text=True,
        )
        root = ET.fromstring(raw_xml)
        description = (root.findtext("description") or "").strip().replace("\n\n", "\n")
        xmin = to_float(root.findtext("./extent/xmin"))
        ymin = to_float(root.findtext("./extent/ymin"))
        xmax = to_float(root.findtext("./extent/xmax"))
        ymax = to_float(root.findtext("./extent/ymax"))
        heat_metadata[key] = {
            "label": config["label"],
            "portalItemId": config["portal_item_id"],
            "serviceItemId": config["service_item_id"],
            "serviceName": config["service_name"],
            "serviceUrl": f"{HEAT_SERVICE_ROOT}/{config['service_name']}/MapServer",
            "bounds": [[round_or_none(ymin, 6), round_or_none(xmin, 6)], [round_or_none(ymax, 6), round_or_none(xmax, 6)]],
            "description": description,
            "tileUrl": f"{HEAT_SERVICE_ROOT}/{config['service_name']}/MapServer/tile/{{z}}/{{y}}/{{x}}",
            "attribution": "Climate Ready Boston",
            "mode": "tile",
        }

    if HEAT_TILE_URLS_PATH.exists():
        overrides = json.loads(HEAT_TILE_URLS_PATH.read_text())
        for key, override in overrides.items():
            if key in heat_metadata:
                if "tileUrl" in override:
                    heat_metadata[key]["tileUrl"] = override.get("tileUrl")
                heat_metadata[key]["attribution"] = override.get("attribution") or heat_metadata[key]["attribution"]
                heat_metadata[key]["mode"] = override.get("mode") or "tile"
                if "serviceUrl" in override:
                    heat_metadata[key]["serviceUrl"] = override.get("serviceUrl")
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
    vulnerability_metrics: dict[str, dict],
    open_space_metrics: dict[str, dict],
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
        vulnerability_props = vulnerability_metrics.get(name, {})
        open_space_props = open_space_metrics.get(name, {})
        heat_props = heat_metrics.get(name, {})
        acs_available = name not in MISSING_ACS_NAMES and bool(acs_props)

        properties = {
            "name": name,
            "neighborhood_id": feature["properties"].get("neighborhood_id"),
            "acres": round_or_none(to_float(feature["properties"].get("acres")), 2),
            "sqmiles": round_or_none(to_float(feature["properties"].get("sqmiles")), 2),
            "canopy_pct": round_or_none(to_float(canopy_props.get("Can_P")), 2),
            "impervious_pct": round_or_none(to_float(canopy_props.get("Imperv_P")), 2),
            "canopy_change_relative_pct": round_or_none(to_float(canopy_props.get("Change_Per")), 2),
            "canopy_change_pp": round_or_none(to_float(canopy_props.get("Change_P_1")), 2),
            "median_household_income": acs_props.get("median_household_income"),
            "per_capita_income": acs_props.get("per_capita_income"),
            "poverty_rate": acs_props.get("poverty_rate"),
            "white_pct": acs_props.get("white_pct"),
            "black_pct": acs_props.get("black_pct"),
            "hispanic_pct": acs_props.get("hispanic_pct"),
            "asian_pct": acs_props.get("asian_pct"),
            "vulnerability_population": vulnerability_props.get("population"),
            "disabled_share": vulnerability_props.get("disabled_share"),
            "older_share": vulnerability_props.get("older_share"),
            "lep_share": vulnerability_props.get("lep_share"),
            "poc_share": vulnerability_props.get("poc_share"),
            "low_vehicle_share": vulnerability_props.get("low_vehicle_share"),
            "vulnerability_tract_count": vulnerability_props.get("tract_count"),
            "open_space_acres": round_or_none(open_space_props.get("open_space_acres"), 2),
            "open_space_count": open_space_props.get("open_space_count"),
            "uhi_mean_f": round_or_none(to_float(heat_props.get("uhi_mean_f")), 3),
            "uhi_max_f": round_or_none(to_float(heat_props.get("uhi_max_f")), 3),
            "day_3pm_mean_f": round_or_none(to_float(heat_props.get("day_3pm_mean_f")), 3),
            "night_3am_mean_f": round_or_none(to_float(heat_props.get("night_3am_mean_f")), 3),
            "heat_duration_mean": round_or_none(to_float(heat_props.get("heat_duration_mean")), 3),
            "heat_available": bool(heat_props.get("heat_available")),
            "heat_approximation_method": heat_props.get("approximation_method"),
            "heat_tile_lod": heat_props.get("heat_tile_lod"),
            "heat_sample_stride": heat_props.get("heat_sample_stride"),
            "uhi_sample_count": heat_props.get("uhi_sample_count"),
            "day3pm_sample_count": heat_props.get("day3pm_sample_count"),
            "night3am_sample_count": heat_props.get("night3am_sample_count"),
            "duration_sample_count": heat_props.get("duration_sample_count"),
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
    unmatched_tracts: list[str],
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
        "unmatchedVulnerabilityTracts": unmatched_tracts,
        "highlights": {
            "highestCanopy": top_feature(neighborhoods, "canopy_pct", descending=True),
            "mostImpervious": top_feature(neighborhoods, "impervious_pct", descending=True),
            "lowestIncome": top_feature(neighborhoods, "median_household_income", descending=False),
            "highestPoverty": top_feature(neighborhoods, "poverty_rate", descending=True),
            "highestUhi": top_feature(neighborhoods, "uhi_mean_f", descending=True),
            "hottestDay": top_feature(neighborhoods, "day_3pm_mean_f", descending=True),
            "warmestNight": top_feature(neighborhoods, "night_3am_mean_f", descending=True),
            "longestHeatDuration": top_feature(neighborhoods, "heat_duration_mean", descending=True),
            "highestDisabledShare": top_feature(
                neighborhoods,
                "disabled_share",
                descending=True,
                predicate=lambda feature: (feature["properties"].get("vulnerability_population") or 0) >= 1000,
            ),
        },
    }


def main() -> None:
    ensure_public_dir()

    boundaries = load_json(BOUNDARIES_PATH)
    canopy = load_json(CANOPY_PATH)
    vulnerability = load_json(VULNERABILITY_PATH)
    open_space = load_json(OPEN_SPACE_PATH)

    neighborhoods = boundaries["features"]
    for feature in neighborhoods:
        feature["_bbox"] = feature_bbox(feature)

    acs_metrics = parse_acs_metrics()
    open_space_metrics = aggregate_open_space(neighborhoods, open_space)
    vulnerability_metrics, unmatched_tracts = aggregate_vulnerability(neighborhoods, vulnerability)
    heat_layers = extract_heat_metadata()
    heat_metrics = load_heat_approximation()

    neighborhood_features = build_neighborhood_features(
        boundaries,
        canopy,
        acs_metrics,
        vulnerability_metrics,
        open_space_metrics,
        heat_metrics,
    )
    for feature in neighborhood_features:
        feature["_bbox"] = feature_bbox(feature)

    open_space_features = build_open_space_features(neighborhood_features, open_space)
    story_stats = build_story_stats(neighborhood_features, heat_layers, unmatched_tracts)

    write_geojson(PUBLIC_DATA_DIR / "neighborhoods_enriched.geojson", neighborhood_features)
    write_geojson(PUBLIC_DATA_DIR / "open_space_simplified.geojson", open_space_features)
    write_json(PUBLIC_DATA_DIR / "story_stats.json", story_stats)

    print(
        f"Wrote {len(neighborhood_features)} neighborhoods and "
        f"{len(open_space_features)} open-space features to {PUBLIC_DATA_DIR}"
    )


if __name__ == "__main__":
    main()
