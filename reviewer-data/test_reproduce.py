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

    def test_two_sided_p_value(self):
        null = np.array([0.1, 0.2, 0.3, 0.4])
        self.assertEqual(r.two_sided_p_value(0.9, null), 0.4)
        self.assertEqual(r.two_sided_p_value(0.0, null), 0.4)
        self.assertEqual(r.two_sided_p_value(0.25, null), 1.0)
        self.assertEqual(r.two_sided_p_value(0.4, null), 0.8)

    def test_abstract_analysis_mechanics_and_determinism(self):
        cards = [{"id": "1", "core": ["La", "X"]},
                 {"id": "2", "core": ["La", "Y"]},
                 {"id": "3", "core": ["X"]}]
        abstracts = [{"id": "1", "abstract": "Learned rules"},
                     {"id": "2", "abstract": "LEARNING rules"},
                     {"id": "3", "abstract": "Unlearned rules"}]
        distances = np.array([[0, 0.1, 0.1], [0.1, 0, 0.8], [0.1, 0.8, 0]])
        result = r.abstract_principle_analysis(cards, abstracts, distances, trials=30)
        self.assertEqual(result, r.abstract_principle_analysis(cards, abstracts, distances, trials=30))
        self.assertEqual(result["skipped_singleton_principles"], ["Y"])
        self.assertEqual([p["nearest_id"] for p in result["nearest_papers"]], ["2", "1", "1"])
        self.assertAlmostEqual(result["principles"]["La"]["mean_cosine"], 0.9)
        self.assertEqual(result["principles"]["La"]["nearest_shared"], 2)
        self.assertEqual(result["principles"]["La"]["nearest_chance_fraction"], 0.5)
        self.assertEqual(result["principles"]["La"]["random_mean_cosine"],
                         result["principles"]["X"]["random_mean_cosine"])
        self.assertEqual(result["learn_keyword"],
                         {"La": {"papers": 2, "matches": 2}, "other": {"papers": 1, "matches": 0}})
        with self.assertRaisesRegex(ValueError, "ID order"):
            r.abstract_principle_analysis(cards, abstracts[::-1], distances, trials=30)

    def test_abstract_claims_in_manuscript(self):
        analysis = self.result["abstract_principle_analysis"]
        self.assertEqual(analysis["method"]["trials"], 20000)
        for tag in ("Sy", "Ha", "Cz", "La"):
            result = analysis["principles"][tag]
            self.assertGreater(result["mean_cosine"], result["random_mean_cosine"])
            self.assertLess(result["two_sided_p"], 0.05)
        for tag in ("Ep", "Wv", "Bo"):
            self.assertGreater(analysis["principles"][tag]["two_sided_p"], 0.05)
        for tag, size, shared, percentage, chance in (("La", 39, 17, 44, 16), ("Wv", 50, 11, 22, 21)):
            result = analysis["principles"][tag]
            self.assertEqual((result["papers"], result["nearest_shared"]), (size, shared))
            self.assertEqual(round(100 * result["nearest_shared_fraction"]), percentage)
            self.assertEqual(round(100 * result["nearest_chance_fraction"]), chance)
        self.assertEqual(analysis["learn_keyword"],
                         {"La": {"papers": 39, "matches": 30}, "other": {"papers": 195, "matches": 34}})
        self.assertEqual(len(analysis["nearest_papers"]), 234)
        self.assertTrue(all(p["id"] != p["nearest_id"] for p in analysis["nearest_papers"]))

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

    def test_fq_reclassification_changes_only_its_principle_roles(self):
        cards = {c["paper_id"]: c for c in r.load(r.ROOT, "paper-cards.json")}
        card = cards["vldb2003-8"]
        self.assertEqual(card["core_principle_tags"], ["Wa", "Rw", "Ad"])
        self.assertEqual(card["similarity_principle_tags"], ["Ad", "Rw", "Wa"])
        self.assertEqual(card["supporting_principle_tags"], [])
        self.assertNotIn("La", card["usagesByTag"])
        self.assertEqual(card["usagesByTag"]["Rw"][0]["core_or_supporting"], "core")
        self.assertEqual(self.result["frequencies"]["2003"]["La"], 1)
        self.assertEqual(self.result["frequencies"]["2003"]["Rw"], 14)

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
