import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sessions", Path(__file__).with_name("extract-vldb-sessions.py"))
sessions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sessions)


class SessionTests(unittest.TestCase):
    def test_numbered_sessions(self):
        for value in ["Transaction Processing I", "Transaction Processing II", " Transaction  Processing 2 "]:
            self.assertEqual(sessions.normalize_label(value), "Transaction Processing")

    def test_preserves_distinct_topics(self):
        self.assertEqual(sessions.normalize_label("Transactions, Tuning, and Compression"), "Transactions, Tuning, and Compression")
        self.assertNotEqual(sessions.normalize_label("Potpourri Online I (Systems & Algorithms)"), sessions.normalize_label("Potpourri Online II (Learning & Mining)"))
        self.assertEqual(sessions.normalize_label("Spatial & Multi-Dimesnional Indexing"), "Spatial and Multi-Dimensional Indexing")

    def test_pdf_identity_includes_volume(self):
        self.assertNotEqual(sessions.pdf_key("https://www.vldb.org/pvldb/vol15/p1.pdf"), sessions.pdf_key("https://www.vldb.org/pvldb/vol16/p1.pdf"))

    def test_parser_entities_and_provenance(self):
        parser = sessions.ProgramParser()
        parser.feed('<div><a id="C7"></a><h3>Queries &amp; Systems II</h3><p><strong>A &amp; B</strong><em>Author</em><a href="https://www.vldb.org/pvldb/vol16/p1.pdf">Download Paper</a></p></div>')
        self.assertEqual(len(parser.records), 1)
        self.assertEqual(parser.records[0]["raw_label"], "Queries & Systems II")
        self.assertEqual(parser.records[0]["category"], "Queries and Systems")
        self.assertEqual(parser.records[0]["paper_title"], "A & B")
        self.assertTrue(parser.records[0]["source_url"].endswith("#C7"))

    def test_title_fallback_ambiguity_and_unknown(self):
        card = {"source_id": "vldb2023", "paper_id": "vldb2023-1", "paper_title": "A paper", "paper_url": ""}
        record = {"paper_title": "A paper", "paper_url": "https://www.vldb.org/pvldb/vol16/p1.pdf", "category": "Queries"}
        result = sessions.match_cards([card], [record])[card["paper_id"]]
        self.assertEqual(result["match_method"], "normalized_title")
        ambiguous = sessions.match_cards([card], [record, {**record, "paper_url": "https://www.vldb.org/pvldb/vol16/p2.pdf"}])[card["paper_id"]]
        self.assertEqual(ambiguous["status"], "ambiguous")
        self.assertEqual(ambiguous["categories"], [])
        self.assertEqual(sessions.match_cards([card], [])[card["paper_id"]]["status"], "unmatched")


if __name__ == "__main__":
    unittest.main()
