# VLDB 2003 research collection

[Browse all 75 papers](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?conf=VLDB+2003).

This collection includes every paper under **Research Sessions** in the
[official proceedings](https://vldb.org/conf/2003/homepage/uni_hro/proceedings.html):
75 papers in 25 sessions, ordered as in the program. The conference's
[newsletter](https://www.vldb.org/archives/website/2003/ressources/Newsletter_11092003.pdf)
independently reports 48 Core and 27 IIS research papers. Industrial papers,
keynotes, panels, demonstrations, tutorials, and PhD posters are excluded.

## Analysis and review status

The structured summaries use the original principle-analysis workflow and
Gemini 2.5 Pro at temperature 0. The input covers all 901 PDF pages without
truncation. Docling extraction was supplemented with 400 dpi Tesseract OCR
for 26 papers (312 pages) and visual transcription of 512 displayed formula
or code regions. Publication years were reconciled with the official inventory.

These are model-generated annotations with structural validation and targeted
agent review, **not exhaustive semantic verification or author review**. In
particular, paper 37's Wv assignment remains flagged: preserving approximation
guarantees does not automatically establish strict result preservation. The
generated assignment is retained, and its review note appears in the explorer.

- `papers.csv`: complete official inventory, PDF URLs, and session links.
- `summaries/1.json`–`75.json`: final structured analyses, unchanged from the audited corpus.
- `provenance.json`: workflow, extraction coverage, review notes, and per-paper hashes.

The provenance distinguishes hashes of files included here from identifiers for
upstream artifacts. Original PDFs, full-text OCR, and raw model responses are not
redistributed. The 2023 cards have no per-call generation receipts; the workflow's
configured original model is recorded, rather than claiming identical model runs.
Official session labels are preserved and are not harmonized across years.

## Rebuild and compare

From the repository root:

```sh
PAPER_CARD_SUMMARY_DIRS="$PWD/paper-card-data/vldb2003/summaries" \
  node examples/vldb23-osdi23-crossref/build-paper-cards.js --merge
node --test examples/vldb23-osdi23-crossref/*.test.js use-cases/paper-card-explorer/*.test.js
```

The incremental build replaces this collection and preserves existing cards from
other collections. A partial rebuild without `--merge` fails before writing.

Select **VLDB 2003** and **VLDB 2023** to browse both years. Within a paper card,
enable **Search across conferences** to compare core-principle overlap using the
explorer's existing Jaccard ranking. Similarity does not establish historical
influence or identical mechanisms. Supporting principles remain distinct from
core principles even when they appear in a top-three list.
