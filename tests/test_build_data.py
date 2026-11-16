import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_data as build


def flight(objects):
    text = '1:' + json.dumps(objects)
    return '<script>self.__next_f.push([1,' + json.dumps(text) + '])</script>'


class DataTests(unittest.TestCase):
    def test_current_page_keeps_reasoning_variants_and_release_dates(self):
        common = dict(release={"slug": "example", "name": "Example"},
                      isOpenWeights=True, intelligenceIndex=42, outputSpeed=80,
                      timeToFirstToken=2, timeToFirstAnswerToken=3)
        models, _ = build.parse_page(flight([
            dict(common, id="max-id", name="Example (Max)"),
            dict(common, id="low-id", name="Example (Low)"),
            {"slug": "example", "releaseDate": "2026-11-15",
             "modelNames": ["Example (Max)", "Example (Low)"]},
        ]))
        self.assertEqual(len(models), 2)
        record = build.build_record(models["max-id"], {})
        self.assertEqual(record["releaseSlug"], "example")
        self.assertEqual(record["release"], "2026-11-15")
        self.assertEqual((record["tps"], record["ttft"], record["ttfa"]), (80, 2, 3))

    def test_page_key_order_and_legacy_fields(self):
        models, benches = build.parse_page(flight([
            {"name": "Old", "isOpenWeights": False, "slug": "old",
             "medianOutputTokensPerSecond": 10},
            {"name": "Benchmark", "keywords": [], "slug": "bench"},
        ]))
        self.assertEqual(build.build_record(models["old"], {})["tps"], 10)
        self.assertEqual(benches, {"bench": "Benchmark"})

    def test_api_reads_all_pages(self):
        responses = [json.dumps({"data": [{"id": "one", "name": "One"}],
                                 "pagination": {"page": 1, "has_more": True}}),
                     json.dumps({"data": [{"id": "two", "name": "Two"}],
                                 "pagination": {"page": 2, "has_more": False}})]
        with patch.object(build, "http_get", side_effect=responses) as get:
            self.assertEqual(set(build.fetch_api("test-key")), {"one", "two"})
        self.assertIn("/api/v2/language/models/free?page=2", get.call_args.args[0])

    def test_api_fallback_matches_old_snapshot_by_name(self):
        previous = {"generatedAt": "2026-11-13T00:00:00Z", "source": "api",
                    "totalListed": 1, "benchmarks": {}, "models": [
                        {"slug": "old-slug", "name": "Example", "ii": 40,
                         "priceIn": 1, "priceOut": 2, "tps": 10, "scores": {}}]}
        api = {"new-id": {"id": "new-id", "name": "Example", "slug": "example",
                          "release_date": "2026-11-15", "pricing": {},
                          "evaluations": {"artificial_analysis_intelligence_index": 43},
                          "performance_v3": {"mean_output_tokens_per_second": 81}}}
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "data.json"
            out.write_text(json.dumps(previous))
            with patch.object(build, "ROOT", Path(directory)), patch.object(build, "OUT", out), \
                    patch.object(build, "load_api_key", return_value="test-key"), \
                    patch.object(build, "fetch_api", return_value=api), \
                    patch.object(build, "http_get", return_value="unavailable"):
                build.main()
            model = json.loads(out.read_text())["models"][0]
            self.assertEqual((model["ii"], model["tps"], model["priceIn"]), (43, 81, 1))

    def test_failure_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "data.json"
            original = '{"models":[],"benchmarks":{},"totalListed":0}'
            out.write_text(original)
            with patch.object(build, "OUT", out), \
                    patch.object(build, "load_api_key", return_value=""), \
                    patch.object(build, "http_get", return_value="unavailable"), \
                    self.assertRaises(SystemExit):
                build.main()
            self.assertEqual(out.read_text(), original)

    def test_empty_scored_page_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "data.json"
            original = '{"models":[],"benchmarks":{},"totalListed":0}'
            out.write_text(original)
            models = {str(i): {"slug": str(i), "name": "Unknown"} for i in range(50)}
            with patch.object(build, "OUT", out), \
                    patch.object(build, "load_api_key", return_value=""), \
                    patch.object(build, "http_get", return_value=""), \
                    patch.object(build, "parse_page", return_value=(models, {})), \
                    self.assertRaises(SystemExit):
                build.main()
            self.assertEqual(out.read_text(), original)

    def test_api_stops_on_invalid_pagination(self):
        raw = json.dumps({"data": [], "pagination": {"page": 1, "has_more": True}})
        with patch.object(build, "http_get", return_value=raw), self.assertRaises(ValueError):
            build.fetch_api("test-key")


if __name__ == "__main__":
    unittest.main()
