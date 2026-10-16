import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sessions", Path(__file__).with_name("extract-osdi-sessions.py"))
sessions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sessions)


class SessionTests(unittest.TestCase):
    def test_numbered_sessions_and_names(self):
        for value in ["Secure Your Bits I", "Secure Your Bits II", " Secure  Your Bits 2 "]:
            self.assertEqual(sessions.normalize_label(value), "Secure Your Bits")
        self.assertEqual(sessions.normalize_label("Make Your Bits Go Faster"), "Make Your Bits Go Faster")
        self.assertEqual(sessions.normalize_label("Storage & Memory"), "Storage and Memory")

    def test_nested_articles_entities_and_non_research_events(self):
        parser = sessions.ProgramParser()
        parser.feed('''<article class="node node-schedule"><article class="node node-session" id="node-1">
        <h2>Secure Your Bits II</h2><article class="node node-paper"><h2><a href="/conference/osdi23/presentation/a">A &amp; <em>B</em></a></h2>
        <article class="node node-speaker"><h2>Speaker</h2></article></article></article>
        <article class="node node-session" id="node-2"><h2>Joint Keynote</h2><article class="node node-paper"><h2><a href="/conference/atc23/presentation/keynote">Keynote</a></h2></article></article></article>''')
        self.assertEqual(len(parser.records), 1)
        record = parser.records[0]
        self.assertEqual(record["paper_title"], "A & B")
        self.assertEqual(record["raw_label"], "Secure Your Bits II")
        self.assertEqual(record["category"], "Secure Your Bits")
        self.assertEqual(record["source_url"], sessions.SOURCE_URL + "#node-1")

    def test_exact_title_matching_ambiguities_and_unknowns(self):
        card = {"source_id": "osdi23", "paper_id": "osdi23-1", "paper_title": "A: paper", "paper_url": "a.pdf"}
        record = {"paper_title": "A paper", "paper_url": sessions.PRESENTATION_PREFIX + "a", "category": "Secure Your Bits"}
        result = sessions.match_cards([card], [record])[card["paper_id"]]
        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["match_method"], "normalized_title")
        ambiguous = sessions.match_cards([card], [record, {**record, "paper_url": sessions.PRESENTATION_PREFIX + "b"}])[card["paper_id"]]
        self.assertEqual(ambiguous["status"], "ambiguous")
        self.assertEqual(ambiguous["categories"], [])
        self.assertEqual(sessions.match_cards([card], [])[card["paper_id"]]["status"], "unmatched")
        self.assertEqual(sessions.match_cards([{**card, "source_id": "vldb2023"}], [record]), {})


if __name__ == "__main__":
    unittest.main()
