import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np

import reproduce as r


class ReproductionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result, cls.memberships = r.compute(r.ROOT)

    def test_expected_results(self):
        r.assert_close(self.result, r.load(r.ROOT, "results.json"))
        self.assertEqual(self.memberships, (r.ROOT / "memberships.csv").read_text())
        self.assertEqual(r.cluster_report(r.ROOT, self.result),
                         (r.ROOT / "clusters.txt").read_text())

    def test_input_and_code_checksums(self):
        r.verify_files(r.ROOT, r.load(r.ROOT, "manifest.json"))

    def test_all_papers_covered_once(self):
        groups = self.result["groups"]
        self.assertEqual(sorted(int(i) for g in groups for i in g["members"]), list(range(1, 235)))
        self.assertEqual(sorted(int(i) for g in self.result["abstract_groups"] for i in g), list(range(1, 235)))
        self.assertEqual(len(groups), len(self.result["abstract_groups"]))

    def test_counts_and_group_order(self):
        cards = {c["id"]: c for c in r.project_inputs(r.ROOT)[2023]}
        groups = self.result["groups"]
        keys = [(-g["size"], min(int(i) for i in g["members"])) for g in groups]
        self.assertEqual(keys, sorted(keys))
        for index, group in enumerate(groups, 1):
            self.assertEqual(group["group"], f"C{index}")
            members = [cards[i] for i in group["members"]]
            self.assertEqual(group["size"], len(members))
            self.assertEqual(group["core_counts"], r.counts(members, "core"))
            self.assertEqual(group["session_categories"], len({s for c in members for s in c["sessions"]}))

    def test_frequency_counts_once_per_card(self):
        self.assertEqual(r.counts([{"core": ["Ad", "Ad"]}, {"core": ["Ad", "La"]}], "core"),
                         {"Ad": 2, "La": 1})
        for year, cards in r.project_inputs(r.ROOT).items():
            self.assertEqual(self.result["frequencies"][str(year)], r.counts(cards, "core"))

    def test_reject_duplicate_ids(self):
        cards = r.project_inputs(r.ROOT)[2003]
        cards[1]["id"] = cards[0]["id"]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            r.validate_cards(cards, r.load(r.ROOT, "principles.json"), 75)

    def test_reject_empty_signature(self):
        with self.assertRaisesRegex(ValueError, "Empty"):
            r.tag_distances([{"core": []}, {"core": ["Ad"]}])

    def test_reject_embedding_reordering(self):
        abstracts = r.load(r.ROOT, "abstracts.json")
        metadata = r.load(r.ROOT, "embedding_metadata.json")
        vectors = np.load(r.ROOT / "embeddings.npy", allow_pickle=False)
        with self.assertRaisesRegex(ValueError, "ID order"):
            r.embedding_distances(abstracts[::-1], metadata, vectors, metadata["ids"])

    def test_reject_zero_embedding(self):
        abstracts = r.load(r.ROOT, "abstracts.json")
        metadata = r.load(r.ROOT, "embedding_metadata.json")
        vectors = np.load(r.ROOT / "embeddings.npy", allow_pickle=False)
        vectors[0] = 0
        with self.assertRaisesRegex(ValueError, "Zero-length"):
            r.embedding_distances(abstracts, metadata, vectors, metadata["ids"])

    def test_reject_changed_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "input.json").write_text("changed")
            manifest = {"files": {"input.json": hashlib.sha256(b"original").hexdigest()}}
            with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                r.verify_files(root, manifest)

    def test_protected_examples_remain_connected(self):
        by_ids = {tuple(p["ids"]): p for p in self.result["pairs"]}
        for ids in (("54", "59"), ("34", "57")):
            pair = by_ids[ids]
            self.assertEqual(len(set(pair["principle_groups"])), 1)
            self.assertEqual(len(set(pair["abstract_groups"])), 2)
        self.assertEqual(by_ids[("34", "57")]["jaccard"], 1.0)
        self.assertEqual(by_ids[("183", "189")]["jaccard"], 0.8)
        self.assertEqual(len(set(by_ids[("183", "189")]["principle_groups"])), 1)

    def test_core_and_similarity_signatures_agree(self):
        for cards in r.project_inputs(r.ROOT).values():
            for card in cards:
                self.assertEqual(card["core"], card["website_similarity"])

    def test_reject_similarity_disagreement(self):
        cards = r.project_inputs(r.ROOT)[2023]
        cards[0]["website_similarity"] = []
        with self.assertRaisesRegex(ValueError, "Core/similarity mismatch"):
            r.validate_cards(cards, r.load(r.ROOT, "principles.json"), 234)

    def test_approved_core_roles_and_equations(self):
        expected = {
            12: {"Cp", "Cm", "Mo"}, 22: {"Bo", "Pd"}, 33: {"La", "Se"},
            55: {"Wv", "Gr", "Co", "Ep"}, 82: {"Pd", "La"}, 86: {"Pd", "Si"},
            87: {"Pd", "Ad"}, 95: {"Ep", "Rw"}, 134: {"La", "Gr"},
            139: {"Sa", "Cc"}, 142: {"Ep", "Sc"},
        }
        cards = {c["paper_id"]: c for c in r.load(r.ROOT, "paper-cards.json")}
        for number, tags in expected.items():
            card = cards[f"vldb2023-{number}"]
            self.assertEqual(set(card["core_principle_tags"]), tags)
            self.assertEqual(set(card["similarity_principle_tags"]), tags)
            self.assertFalse(tags & set(card["supporting_principle_tags"]))
            self.assertEqual(set(card["equation"].split(" -> ")[0].split(" + ")[1:]), tags)
            for tag in tags:
                self.assertTrue(any(u["core_or_supporting"] == "core"
                                    for u in card["usagesByTag"][tag]))
        self.assertNotIn("Ad", cards["vldb2023-33"]["usagesByTag"])
        for number, tag in ((22, "Qr"), (55, "Rw"), (87, "Qr")):
            self.assertIn(tag, cards[f"vldb2023-{number}"]["supporting_principle_tags"])

    def test_independent_jaccard_check(self):
        cards = r.project_inputs(r.ROOT)[2023]
        actual = r.tag_distances(cards)
        for i, first in enumerate(cards):
            a = set(first["core"])
            for j, second in enumerate(cards):
                b = set(second["core"])
                self.assertAlmostEqual(actual[i, j], 1 - len(a & b) / len(a | b))


if __name__ == "__main__":
    unittest.main()
