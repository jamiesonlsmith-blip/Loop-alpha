import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "import_overture_places", ROOT / "scripts" / "import_overture_places.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test_feature(name="Cafe Alpha", longitude=-80.28, latitude=26.15,
                 category="cafe", confidence=0.9, status="open"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
        "properties": {
            "id": "test-overture-place-id",
            "names": {"primary": name},
            "basic_category": category,
            "taxonomy": {"primary": category, "hierarchy": ["food", category]},
            "confidence": confidence,
            "operating_status": status,
            "addresses": [{"freeform": "123 Example St", "locality": "Sunrise",
                           "region": "FL", "country": "US"}],
            "websites": ["https://example.com"],
            "sources": [{"dataset": "meta"}, {"dataset": "foursquare"}]
        }
    }


class OvertureImporterTest(unittest.TestCase):
    def test_preserves_name_geography_taxonomy_and_provenance(self):
        row = mod.normalize_feature(test_feature(), mod.REGIONS["broward"], "2026-test")
        self.assertEqual(row["name"], "Cafe Alpha")
        self.assertEqual(row["taxonomy_primary"], "cafe")
        self.assertEqual(row["taxonomy_hierarchy"], ["food", "cafe"])
        self.assertEqual(row["position"], "SRID=4326;POINT(-80.2800000 26.1500000)")
        self.assertEqual(row["source_release"], "2026-test")
        self.assertEqual(row["source_datasets"], ["foursquare", "meta"])
        self.assertEqual(row["locality"], "Sunrise")
        self.assertEqual(row["website"], "https://example.com")

    def test_rejects_closed_low_confidence_and_wrong_area(self):
        bbox = mod.REGIONS["broward"]
        self.assertIsNone(mod.normalize_feature(
            test_feature(status="permanently_closed"), bbox, "test"))
        self.assertIsNone(mod.normalize_feature(
            test_feature(confidence=0.2), bbox, "test", min_confidence=0.55))
        self.assertIsNone(mod.normalize_feature(
            test_feature(latitude=34.0), bbox, "test"))
        self.assertIsNone(mod.normalize_feature(
            test_feature(name=""), bbox, "test"))

    def test_reads_geojson_sequence_without_network_or_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "places.geojsonseq"
            with path.open("w", encoding="utf-8") as dest:
                dest.write("\x1e" + json.dumps(test_feature()) + "\n")
                dest.write(json.dumps(test_feature(status="permanently_closed")) + "\n")
            rows = list(mod.records(path, mod.REGIONS["broward"], "test", 0.55))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["overture_id"], "test-overture-place-id")


if __name__ == "__main__":
    unittest.main()
