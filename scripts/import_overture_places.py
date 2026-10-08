#!/usr/bin/env python3
"""Stream Overture GeoJSONSeq places into Loop's server-only Supabase index.

Run this after applying supabase-loop-places.sql. It does not import reviews.
The overturemaps official CLI downloads only the selected geographic bbox.
Environment variables (never commit their values): SUPABASE_URL, SUPABASE_SECRET_KEY.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REGIONS = {
    # Coordinates: west, south, east, north.
    "broward": (-80.53, 25.94, -80.04, 26.42),
    "miami_dade": (-80.90, 25.35, -80.06, 25.99),
    "palm_beach": (-80.80, 26.35, -79.95, 27.06),
}

def text(value, limit=256):
    return str(value or "").strip()[:limit]

def first_item(value):
    return value[0] if isinstance(value, list) and value else None

def normalize_feature(feature, bbox, release, min_confidence=0.5):
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        return None
    props = feature.get("properties") or {}
    coordinates = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coordinates) < 2:
        return None
    try:
        lon, lat = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
        return None
    name = text((props.get("names") or {}).get("primary"), 220)
    place_id = text(props.get("id"), 100)
    if not name or not place_id:
        return None
    if props.get("operating_status") == "permanently_closed":
        return None
    confidence = props.get("confidence")
    if confidence is not None:
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            return None
        if not 0 <= confidence <= 1 or confidence < min_confidence:
            return None
    address = first_item(props.get("addresses")) or {}
    if not isinstance(address, dict):
        address = {}
    taxonomy = props.get("taxonomy") or {}
    hierarchy = taxonomy.get("hierarchy") or []
    if not isinstance(hierarchy, list):
        hierarchy = []
    source_names = [text(s.get("dataset"), 80) for s in (props.get("sources") or [])
                    if isinstance(s, dict) and s.get("dataset")]
    url = text(first_item(props.get("websites")), 420)
    if not url.startswith(("https://", "http://")):
        url = ""
    return {
        "overture_id": place_id,
        "name": name,
        "basic_category": text(props.get("basic_category"), 100) or None,
        "taxonomy_primary": text(taxonomy.get("primary"), 120) or None,
        "taxonomy_hierarchy": [text(v, 120) for v in hierarchy[:12]],
        "full_address": text(address.get("freeform"), 320) or None,
        "locality": text(address.get("locality"), 160) or None,
        "region": text(address.get("region"), 100) or None,
        "country": text(address.get("country"), 5) or None,
        "website": url or None,
        "confidence": confidence,
        "operating_status": text(props.get("operating_status"), 32) or None,
        "position": f"SRID=4326;POINT({lon:.7f} {lat:.7f})",
        "source_release": text(release, 60),
        "source_datasets": sorted(set(source_names))[:20],
    }

def records(filename, bbox, release, min_confidence):
    # GeoJSONSeq: one GeoJSON Feature per line, optional ASCII RS prefix.
    with open(filename, "r", encoding="utf-8") as source:
        for raw in source:
            raw = raw.lstrip("\x1e").strip()
            if not raw:
                continue
            place = normalize_feature(json.loads(raw), bbox, release, min_confidence)
            if place:
                yield place

def latest_release():
    request = Request("https://stac.overturemaps.org/catalog.json",
                      headers={"User-Agent": "LoopAlphaPlaceImporter/1.0"})
    with urlopen(request, timeout=18) as response:
        release = json.load(response).get("latest")
    if not isinstance(release, str) or len(release) > 60:
        raise RuntimeError("Could not determine current Overture release")
    return release

def send_batch(items, endpoint, secret_key):
    body = json.dumps(items, separators=(",", ":")).encode("utf-8")
    headers = {
        "apikey": secret_key, "Authorization": "Bearer " + secret_key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
    }
    for attempt in range(4):
        try:
            request = Request(endpoint, data=body, headers=headers, method="POST")
            with urlopen(request, timeout=30) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError("Unexpected Supabase status " + str(response.status))
                return
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                message = error.read(350).decode("utf-8", errors="replace")
                raise RuntimeError(f"Supabase write error HTTP {error.code}: {message}") from error
        except (URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("Supabase upload retries exhausted")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--region", choices=sorted(REGIONS), required=True)
    parser.add_argument("--release", default="")
    parser.add_argument("--min-confidence", type=float, default=0.55)
    parser.add_argument("--max-records", type=int, default=30000)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error("Source GeoJSONSeq file not found")
    if not (0 <= args.min_confidence <= 1):
        parser.error("min-confidence must be between 0 and 1")
    if not (1 <= args.max_records <= 50000 and 1 <= args.batch_size <= 500):
        parser.error("Invalid import safety limits")
    release = args.release or latest_release()
    bbox = REGIONS[args.region]

    # Preflight first, so exceeding the safety limit never creates a partial import.
    count = 0
    for _ in records(args.input, bbox, release, args.min_confidence):
        count += 1
        if count > args.max_records:
            raise RuntimeError(
                f"Region {args.region} exceeds safety limit {args.max_records}; "
                "split the region or review confidence filters before importing."
            )
    print(f"PREVIEW region={args.region} release={release} accepted={count} "
          f"minimum_confidence={args.min_confidence} dry_run={args.dry_run}")
    if args.dry_run:
        return 0
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not base.startswith("https://") or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY are required for writes")
    endpoint = base + "/rest/v1/loop_place_index?on_conflict=overture_id"
    batch, uploaded = [], 0
    for place in records(args.input, bbox, release, args.min_confidence):
        batch.append(place)
        if len(batch) >= args.batch_size:
            send_batch(batch, endpoint, key)
            uploaded += len(batch)
            batch = []
    if batch:
        send_batch(batch, endpoint, key)
        uploaded += len(batch)
    print(f"IMPORTED region={args.region} release={release} places={uploaded}")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("Import stopped: " + str(error), file=sys.stderr)
        sys.exit(1)
