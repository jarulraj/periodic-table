# Reviewer Data: Principle and Abstract Clustering

This package reproduces the VLDB 2023 clustering and abstract comparison,
and the VLDB 2003/2023 principle frequencies reported in the manuscript.
It includes 234 VLDB 2023 cards and 75 VLDB 2003 cards.

## Reproduce Offline

Use Python 3.10--3.12 in a separate environment (the original run used 3.10.6):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python reproduce.py
.venv/bin/python -m unittest -q test_reproduce
```

After installing the dependencies, reproduction requires no network, API key,
LLM calls, or running Ollama instance. The script validates checksums and
recomputes all memberships, frequencies, session agreement, and example pairs.
Use `--output-dir /tmp/principle-review` to save recomputed results separately.

## Files

| File | Contents |
| --- | --- |
| `paper-cards.json` | The 309 analyzed cards, including core/supporting assignments, rationales, and source pointers. |
| `principles.json` | Principle symbols and names. |
| `abstracts.json` | The 234 original VLDB 2023 program abstracts, paper URLs, IDs, and text checksums. |
| `embeddings.npy` | The cached 234-by-768 float64 vectors, loaded without pickle. |
| `embedding_metadata.json` | Nomic/Ollama model digest, input prefix, ordered IDs, dimensions, and hashes. |
| `results.json`, `memberships.csv` | Computed statistics and per-paper principle/abstract assignments. |
| `clusters.txt` | All cluster memberships, titles, sessions, and frequent core principles. |
| `manifest.json` | Source revisions, hashes, method settings, and file checksums. |

The embedding row order is `embedding_metadata.json`'s `ids`, not title order.
Inputs were `clustering: ` followed by each abstract, without the title, with
truncation disabled. The exact model digest is retained; a future `latest`
model download is not assumed to reproduce these cached vectors.

## Method

Both frequency counts and clustering use explicit core principles. Each
principle is counted at most once per card; supporting principles are excluded.
The analysis rejects disagreements between core tags and the website's
similarity tags.

Principle clustering uses individual-tag Jaccard distance, average linkage,
numeric paper order, and a 0.90 distance cutoff. The twelve clusters cover all
234 papers and are labeled C1--C12 in decreasing size, breaking size ties by
the lowest paper number. Abstract clustering uses cosine distance and average
linkage, with twelve groups for comparison. Conference session labels do not
enter either clustering.

Groups are exploratory: linkage ties, the cutoff, and annotation changes can
affect membership. Frequent principles need not be shared by every member.
Session agreement is not a measure of clustering quality.
Principle cards use full papers; embeddings use abstracts alone. These are
complementary views, not a controlled comparison of equally informed models.

Abstracts and paper metadata come from the
[VLDB 2023 program](https://www.vldb.org/2023/?program-schedule); their rights
remain with their authors/publishers. Full paper PDFs, private correspondence,
credentials, and unrelated experiments are not included.
