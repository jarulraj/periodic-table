"""Reproduce principle clustering, abstract comparison, and frequencies offline."""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist, squareform
from sklearn.metrics import adjusted_mutual_info_score


ROOT = Path(__file__).resolve().parent


def load(root, name):
    return json.loads((root / name).read_text())


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_files(root, manifest):
    require(bool(manifest["files"]), "Missing file checksums")
    for name, expected in manifest["files"].items():
        require(Path(name).name == name, "Manifest paths must be local filenames")
        actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
        require(actual == expected, f"Checksum mismatch: {name}")


def validate_cards(cards, names, expected):
    require(len(cards) == expected, f"Expected {expected} cards")
    require(len({c["id"] for c in cards}) == expected, "Duplicate paper IDs")
    require([c["id"] for c in cards] == [str(i) for i in range(1, expected + 1)],
            "Cards must be in numeric paper order")
    for card in cards:
        require(bool(card["core"]), f"Missing core tags: {card['id']}")
        require(len(set(card["core"])) == len(card["core"]), f"Repeated core tags: {card['id']}")
        require(set(card["core"]) <= set(names), f"Unknown core tags: {card['id']}")
        require(set(card["core"]) == set(card["website_similarity"]),
                f"Core/similarity mismatch: {card['id']}")


def project_inputs(root):
    current = load(root, "paper-cards.json")
    require(len(current) == 309, "Expected 309 reviewer cards")
    cohorts = {}
    for year, count in ((2003, 75), (2023, 234)):
        cohorts[year] = [
            {"id": str(c["paper_number"]), "title": c["paper_title"], "system": c["system_or_method_name"],
             "core": sorted(c["core_principle_tags"]),
             "sessions": c["conference_session_categories"],
             "website_similarity": sorted(c["similarity_principle_tags"])}
            for c in current if c["source_id"] == f"vldb{year}"
        ]
        cohorts[year].sort(key=lambda c: int(c["id"]))
        validate_cards(cohorts[year], load(root, "principles.json"), count)
    return cohorts


def embedding_distances(abstracts, metadata, vectors, ids):
    require([a["id"] for a in abstracts] == ids == metadata["ids"], "Embedding/card ID order differs")
    require(vectors.shape == (len(ids), metadata["dimensions"]), "Embedding shape differs")
    require(vectors.dtype == np.dtype("float64"), "Expected float64 cached vectors")
    require(np.isfinite(vectors).all(), "Non-finite embedding")
    for abstract in abstracts:
        require(fingerprint(abstract["abstract"]) == abstract["abstract_sha256"],
                f"Abstract checksum differs: {abstract['id']}")
    inputs = [metadata["prefix"] + a["abstract"] for a in abstracts]
    require(fingerprint(inputs) == metadata["input_sha256"], "Model input checksum differs")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    require((norms > 0).all(), "Zero-length embedding")
    normalized = vectors / norms
    distances = np.clip(1 - normalized @ normalized.T, 0, 2)
    distances = (distances + distances.T) / 2
    np.fill_diagonal(distances, 0)
    return distances


def tag_distances(cards, field="core"):
    tags = sorted({t for c in cards for t in c[field]})
    require(all(c[field] for c in cards), "Empty tag signature")
    encoded = np.array([[t in c[field] for t in tags] for c in cards], dtype=bool)
    return squareform(pdist(encoded, metric="jaccard"))


def cluster(distances, prefix, cutoff=None, count=None):
    require((cutoff is None) != (count is None), "Choose a distance cutoff or a group count")
    tree = linkage(squareform(distances), method="average")
    raw = fcluster(tree, cutoff if cutoff is not None else count,
                   criterion="distance" if cutoff is not None else "maxclust")
    groups = [np.flatnonzero(raw == label).tolist() for label in sorted(set(raw))]
    groups.sort(key=lambda group: (-len(group), min(group)))
    labels = [""] * len(raw)
    for number, group in enumerate(groups, 1):
        for index in group:
            labels[index] = f"{prefix}{number}"
    return groups, labels


def counts(cards, field):
    return dict(sorted(Counter(t for c in cards for t in set(c[field])).items()))


def group_report(cards, groups, labels):
    return [
        {"group": labels[group[0]], "size": len(group),
         "members": [cards[i]["id"] for i in group],
         "core_counts": counts([cards[i] for i in group], "core"),
         "session_categories": len({s for i in group for s in cards[i]["sessions"]})}
        for group in groups
    ]


def compute(root):
    cohorts = project_inputs(root)
    cards = cohorts[2023]
    ids = [c["id"] for c in cards]
    abstracts = load(root, "abstracts.json")
    metadata = load(root, "embedding_metadata.json")
    require(hashlib.sha256((root / "embeddings.npy").read_bytes()).hexdigest() == metadata["vectors_sha256"],
            "Embedding file checksum differs")
    vectors = np.load(root / "embeddings.npy", allow_pickle=False)
    distances = embedding_distances(abstracts, metadata, vectors, ids)
    require(all(len(c["sessions"]) == 1 for c in cards), "Expected one session category per VLDB 2023 paper")
    sessions = [c["sessions"][0] for c in cards]
    groups, labels = cluster(tag_distances(cards), "C", cutoff=0.90)
    abstract_groups, abstract_labels = cluster(distances, "E", count=len(groups))
    require(len(abstract_groups) == len(groups), "Abstract/principle group counts differ")
    frequencies = {str(year): counts(cohort, "core") for year, cohort in cohorts.items()}
    results = {
        "groups": group_report(cards, groups, labels),
        "abstract_groups": [[ids[i] for i in g] for g in abstract_groups],
        "session_ami": {
            "principles": float(adjusted_mutual_info_score(sessions, labels)),
            "abstracts": float(adjusted_mutual_info_score(sessions, abstract_labels)),
        },
        "frequency_basis": "core tags",
        "frequencies": frequencies,
        "shared_principles_across_years": len(frequencies["2003"].keys() & frequencies["2023"].keys()),
    }
    results["pairs"] = []
    for first, second in (("28", "59"), ("54", "59"), ("34", "57"), ("183", "189")):
        indices = [int(first) - 1, int(second) - 1]
        a, b = [set(cards[i]["core"]) for i in indices]
        results["pairs"].append({
            "ids": [first, second], "titles": [cards[i]["title"] for i in indices],
            "jaccard": len(a & b) / len(a | b), "shared_principles": sorted(a & b),
            "principle_groups": [labels[i] for i in indices],
            "abstract_groups": [abstract_labels[i] for i in indices],
        })
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(["paper_id", "title", "session", "core_principles", "principle_group", "abstract_group"])
    for index, card in enumerate(cards):
        writer.writerow([f"vldb2023-{card['id']}", card["title"], card["sessions"][0],
                         " ".join(card["core"]), labels[index], abstract_labels[index]])
    return results, stream.getvalue()


def assert_close(actual, expected, path="results"):
    if isinstance(expected, float):
        require(abs(actual - expected) < 1e-10, f"Numerical difference: {path}")
    elif isinstance(expected, dict):
        require(actual.keys() == expected.keys(), f"Keys differ: {path}")
        for key in expected:
            assert_close(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        require(len(actual) == len(expected), f"Length differs: {path}")
        for index, (a, e) in enumerate(zip(actual, expected)):
            assert_close(a, e, f"{path}[{index}]")
    else:
        require(actual == expected, f"Value differs: {path}")


def cluster_report(root, result):
    cards = {c["id"]: c for c in project_inputs(root)[2023]}
    names = load(root, "principles.json")
    lines = [
        "VLDB 2023 principle groups",
        "All 234 cards; individual-tag Jaccard distance; average linkage; distance cutoff 0.90.",
        "Groups are ordered by size. Frequent tags describe dominant signals, not a shared signature of every member.",
        ""
    ]
    for group in result["groups"]:
        lines.append(f"{group['group']}: {group['size']} papers, {group['session_categories']} session categories")
        counts = sorted(group["core_counts"].items(), key=lambda p: (-p[1], p[0]))[:5]
        lines.append("Frequent core principles: " + "; ".join(f"{t} ({names[t]}): {n}" for t, n in counts))
        for paper_id in group["members"]:
            card = cards[paper_id]
            lines.append(f"  vldb2023-{paper_id}: {card['title']}")
            lines.append("    " + ", ".join(card["core"]) + " | " + "; ".join(card["sessions"]))
        lines.append("")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, help="Also write recomputed results to a separate directory")
    args = parser.parse_args()
    verify_files(ROOT, load(ROOT, "manifest.json"))
    result, memberships = compute(ROOT)
    assert_close(result, load(ROOT, "results.json"))
    require(memberships == (ROOT / "memberships.csv").read_text(), "Membership CSV differs")
    report = cluster_report(ROOT, result)
    require(report == (ROOT / "clusters.txt").read_text(), "Cluster report differs")
    if args.output_dir:
        require(args.output_dir.resolve() != ROOT, "Choose a separate output directory")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
        (args.output_dir / "memberships.csv").write_text(memberships)
        (args.output_dir / "clusters.txt").write_text(report)
    print(f"Group sizes: {[g['size'] for g in result['groups']]}")
    print(f"Session AMI: principles={result['session_ami']['principles']:.6f}; abstracts={result['session_ami']['abstracts']:.6f}")
    print(f"Principles recurring in both years: {result['shared_principles_across_years']}")
    print("PASS: checksums, embedding alignment, all memberships, frequencies, AMI, and example pairs.")
    print("PASS: core tags and website similarity signatures agree across all 309 cards.")


if __name__ == "__main__":
    main()
