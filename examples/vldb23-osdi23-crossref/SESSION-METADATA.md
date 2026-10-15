# Conference Session Metadata and Similar Papers

VLDB 2023 categories come from the official conference program. They are scheduling labels, not a manually validated research-area taxonomy. Preserve broad and miscellaneous sessions rather than inferring a narrower area for each paper.

## Reproduce

From the repository root, download the official program and regenerate the metadata:

```sh
curl -L --fail -A 'Mozilla/5.0' 'https://www.vldb.org/2023/?program-schedule' -o /tmp/vldb2023-program.html
python3 examples/vldb23-osdi23-crossref/extract-vldb-sessions.py /tmp/vldb2023-program.html
```

The extractor uses the standard Python library. It stores source checksums, original labels, normalized categories, program paper titles, PDF URLs, and matching methods in `vldb2023-sessions.json`. PDF identity takes precedence over normalized-title matching. Ambiguities are retained for review. Only trailing session numbers are removed; verified spelling corrections live in `LABEL_ALIASES`. Four title variations are documented in `TITLE_REVIEWS`.

Enrich the current published cards without rebuilding their existing contents:

```sh
PAPER_CARD_DATA_ROOT=/path/to/Gemini/data node examples/vldb23-osdi23-crossref/paper-metadata.js
```

The full `build-paper-cards.js` also incorporates these fields on future rebuilds. The enrichment command only adds session fields and similarity fields; it does not change equations, principle assignments, or author-reviewed prose.

Generate the report, optionally reading the manuscript's frozen memberships:

```sh
node examples/vldb23-osdi23-crossref/analyze-sessions.js /path/to/looking-glass-paper/outputs/manuscript_principle_clusters.json
node --test examples/vldb23-osdi23-crossref/session-metadata.test.js
PYTHONDONTWRITEBYTECODE=1 python3 examples/vldb23-osdi23-crossref/test_session_extraction.py
```

The analysis never writes to the manuscript or membership input. It records the input checksum and produces `vldb2023-session-analysis.md` and `.json` here. Omit the membership argument to generate only the corpus and nearest-match analysis.

## Retrieval

The explorer ranks papers within the selected card's collection using direct Jaccard similarity: shared core principles divided by distinct core principles across both cards. At least two principles must be shared. Ties break by shared count and then numeric paper ID. The top five are shown; there is no graph threshold, transitive neighbor expansion, or clustering step.

`similarity_principle_tags` uses the source equation's explicit core tags. An absent core field falls back to the source top-three tags with an explicit `similarity_principle_source` marker. An explicitly empty core set stays empty. Existing display fields are unchanged, including their historical core/top-three union. All 321 currently published cards have explicit equation-core tags.

The cross-category filter requires known, disjoint categories. Missing metadata does not count as a different area, and papers sharing any category are excluded. Session categories are available for VLDB 2023; other collections can still use within-collection principle matching.

"Papers in the same session category" lists all other published cards in that collection sharing a normalized category, alphabetically by title. It has no principle-overlap requirement or top-five limit. The list is collapsed by default; `peers=1` preserves an expanded view. Principle labels in paper views are colored by table family and sorted alphabetically by symbol.

Session badges toggle the single category filter, synchronized with the category dropdown. Principle buttons use the same appearance and toggle behavior in the search palette, selected filters, paper cards, similar papers, and session peers. These filters combine with the existing collection and text filters. Clicking a filter button inside a result does not open that paper.

URLs preserve the existing `paper`, `q`, `tags`, `mode`, and `conf` parameters. New parameters are `category`, `similar=1`, and `different=0` (allow same-category matches). Similar papers are collapsed by default, including after selecting another card or following a match. An explicit `similar=1` preserves an expanded view when sharing or reloading its URL. Links in the legacy example directory continue to redirect with their query parameters intact. Match links clear unrelated list filters so the destination card remains visible.

For local preview, serve the repository root over HTTP and open `/use-cases/paper-card-explorer/?paper=vldb2023-59`. The explorer fetches JSON and cannot be previewed reliably with `file://`.
