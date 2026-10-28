import gzip
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from deep_research_bench import connectome


CSV = (
    "root_id,group,nt_type,nt_type_score,ach_avg\n"
    "720575940625448968,HSN left,ACH,0.91,0.9\n"
    "720575940640978048,HSN right,GABA,0.87,0.1\n"
    "720575940600000001,,ACH,,0.8\n"
)


class ConnectomeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = Path(self.directory.name) / "flywire"
        self.cache_patch = patch.object(connectome, "DEFAULT_CACHE_DIR", self.cache)
        self.cache_patch.start()
        self.addCleanup(self.cache_patch.stop)
        for name in ("_MEMO_SIGNATURE", "_MEMO"):
            if hasattr(connectome, name):
                memo_patch = patch.object(connectome, name, None)
                memo_patch.start()
                self.addCleanup(memo_patch.stop)

    def test_corrupt_cached_archive_is_replaced_after_one_valid_refetch(self):
        self.cache.mkdir()
        cached_file = self.cache / "neurons-v783.csv.gz"
        cached_file.write_bytes(b"interrupted download")
        valid = gzip.compress(CSV.encode())
        with patch.object(connectome, "_fetch_bytes", return_value=valid) as fetch:
            self.assertEqual(connectome.query_neurons()["total_neurons"], 3)
            self.assertEqual(cached_file.read_bytes(), valid)
            connectome.query_neurons("hsn")
            fetch.assert_called_once_with()

    def test_failed_recovery_does_not_publish_invalid_replacement(self):
        self.cache.mkdir()
        cached_file = self.cache / "neurons-v783.csv.gz"
        original = b"incomplete prior cache"
        cached_file.write_bytes(original)
        with patch.object(connectome, "_fetch_bytes", return_value=gzip.compress(b"wrong,header\n1,2\n")) as fetch:
            with self.assertRaises(connectome.ConnectomeError):
                connectome.query_neurons()
            self.assertEqual(cached_file.read_bytes(), original)
            fetch.assert_called_once_with()

    def test_concurrent_queries_parse_one_snapshot_and_invalidate_changed_cache(self):
        valid = gzip.compress(CSV.encode())
        with patch.object(connectome, "_fetch_bytes", return_value=valid) as fetch, patch.object(connectome, "_rows", wraps=connectome._rows) as rows:
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda _: connectome.query_neurons("hsn"), range(8)))
            self.assertTrue(all(result["matching_neurons"] == 2 for result in results))
            fetch.assert_called_once_with()
            self.assertEqual(rows.call_count, 1)
            changed = CSV + "720575940600000002,new group,DA,0.8,0.1\n"
            (self.cache / "neurons-v783.csv.gz").write_bytes(gzip.compress(changed.encode()))
            result = connectome.query_neurons("new group")
            self.assertEqual(result["total_neurons"], 4)
            self.assertEqual(result["matching_neurons"], 1)
            self.assertEqual(result["neurons"][0]["neurotransmitter"], "DA")
            self.assertEqual(rows.call_count, 2)
            fetch.assert_called_once_with()

    def test_real_parser_filters_and_keeps_large_ids_exact(self):
        with patch.object(connectome, "_fetch_bytes", return_value=gzip.compress(CSV.encode())) as fetch:
            result = connectome.query_neurons("hsn", "ach", 1)
            self.assertEqual(result["total_neurons"], 3)
            self.assertEqual(result["matching_neurons"], 1)
            self.assertEqual(result["neurons"][0]["id"], "720575940625448968")
            self.assertEqual(result["neurons"][0]["confidence"], 0.91)
            self.assertEqual(result["neurotransmitters"], [{"name": "ACH", "count": 2}, {"name": "GABA", "count": 1}])
            self.assertTrue(result["snapshot"])
            self.assertEqual(result["license"], "CC BY-NC 4.0")
            self.assertEqual(result["source_url"], connectome.SOURCE_URL)
            cached = connectome.query_neurons("does not exist")
            self.assertEqual(cached["matching_neurons"], 0)
            self.assertEqual(cached["neurons"], [])
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(cached["retrieved_at"], result["retrieved_at"])
            json.dumps(result, allow_nan=False)

    def test_invalid_requests_do_not_fetch(self):
        with patch.object(connectome, "_fetch_bytes") as fetch:
            for args in [(None, "", 1), ("x" * 129, "", 1), ("", None, 1), ("", "", True), ("", "", 0), ("", "", 101)]:
                with self.subTest(args=args), self.assertRaises(ValueError):
                    connectome.query_neurons(*args)
            fetch.assert_not_called()

    def test_network_error_is_safe_and_does_not_publish_cache(self):
        with patch.object(connectome, "_fetch_bytes", side_effect=URLError("private diagnostic")):
            with self.assertRaises(connectome.ConnectomeError) as failure:
                connectome.query_neurons()
            self.assertNotIn("private diagnostic", str(failure.exception))
            self.assertFalse(self.cache.exists())

    def test_bad_archive_or_schema_is_not_cached(self):
        for data in (b"not gzip", gzip.compress(b"wrong,header\n1,2\n"), gzip.compress(b"root_id,group,nt_type,nt_type_score\n")):
            with self.subTest(data=data[:15]), patch.object(connectome, "_fetch_bytes", return_value=data):
                with self.assertRaises(connectome.ConnectomeError):
                    connectome.query_neurons()
                self.assertFalse(self.cache.exists())

    def test_decoded_archive_limit_is_enforced(self):
        with patch.object(connectome, "MAX_DECODED_BYTES", 40), patch.object(connectome, "_fetch_bytes", return_value=gzip.compress(CSV.encode())):
            with self.assertRaises(connectome.ConnectomeError):
                connectome.query_neurons()
            self.assertFalse(self.cache.exists())

    def test_record_limit_bounds_the_parsed_snapshot(self):
        with patch.object(connectome, "MAX_NEURONS", 2), patch.object(connectome, "_fetch_bytes", return_value=gzip.compress(CSV.encode())):
            with self.assertRaises(connectome.ConnectomeError):
                connectome.query_neurons()
            self.assertFalse(self.cache.exists())

    def test_fetch_reads_a_bounded_body(self):
        class Response(io.BytesIO):
            def geturl(self):
                return connectome.SOURCE_URL

        with patch.object(connectome, "MAX_COMPRESSED_BYTES", 12), patch.object(connectome, "urlopen", return_value=Response(b"x" * 13)) as fetch:
            with self.assertRaises(connectome.ConnectomeError):
                connectome._fetch_bytes()
            self.assertEqual(fetch.call_args.kwargs["timeout"], 15)
            self.assertEqual(fetch.call_args.args[0].full_url, connectome.SOURCE_URL)

    def test_unexpected_redirect_is_refused(self):
        class Response(io.BytesIO):
            def geturl(self):
                return "https://other.invalid/source"

        with patch.object(connectome, "urlopen", return_value=Response(b"")):
            with self.assertRaises(connectome.ConnectomeError):
                connectome._fetch_bytes()


if __name__ == "__main__":
    unittest.main()
