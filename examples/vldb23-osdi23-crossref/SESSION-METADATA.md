# Conference Session Metadata and Similar Papers

VLDB 2023 and OSDI 2023 categories come from their official conference programs. They are scheduling labels, not a manually validated research-area taxonomy or a common taxonomy across conferences. Preserve broad, playful, and miscellaneous session names rather than inferring a narrower area for each paper.

Coverage: all 234 VLDB cards and all 55 OSDI cards have verified program matches. OSDI's 12 original sessions normalize to nine categories; for example, "Secure Your Bits I" and "Secure Your Bits II" become "Secure Your Bits". Original labels, session identifiers, and source links remain available in each card's metadata.

## Reproduce

From the repository root, download the official program and regenerate the metadata:

```sh
curl -L --fail -A 'Mozilla/5.0' 'https://www.vldb.org/2023/?program-schedule' -o /tmp/vldb2023-program.html
python3 examples/vldb23-osdi23-crossref/extract-vldb-sessions.py /tmp/vldb2023-program.html
curl -L --fail -A 'Mozilla/5.0' 'https://www.usenix.org/conference/osdi23/technical-sessions' -o /tmp/osdi23-program.html
python3 examples/vldb23-osdi23-crossref/extract-osdi-sessions.py /tmp/osdi23-program.html
```

The extractor uses the standard Python library. It stores source checksums, original labels, normalized categories, program paper titles, PDF URLs, and matching methods in `vldb2023-sessions.json`. PDF identity takes precedence over normalized-title matching. Ambiguities are retained for review. Only trailing session numbers are removed; verified spelling corrections live in `LABEL_ALIASES`. Four title variations are documented in `TITLE_REVIEWS`.

The OSDI extractor also uses the standard library and writes `osdi23-sessions.json`. USENIX's schedule links to presentation pages, so OSDI matching uses exact normalized titles, with no fuzzy matching. Presentation URLs disambiguate duplicate titles; unknown or ambiguous matches remain unassigned. All 55 current OSDI titles match. Both files retain the downloaded HTML checksum and retrieval date.

Add session metadata to the current published cards without touching their existing text or principle assignments:

```sh
node examples/vldb23-osdi23-crossref/paper-metadata.js --sessions-only
```

To additionally refresh similarity tags from the source summaries:

```sh
PAPER_CARD_DATA_ROOT=/path/to/Gemini/data node examples/vldb23-osdi23-crossref/paper-metadata.js
```

The full `build-paper-cards.js` also incorporates session fields for both conferences on future rebuilds. The default enrichment command updates session and similarity fields; `--sessions-only` preserves every non-session field, including existing similarity tags and author-reviewed prose.

Generate the report, optionally reading the manuscript's frozen memberships:

```sh
node examples/vldb23-osdi23-crossref/analyze-sessions.js /path/to/looking-glass-paper/outputs/manuscript_principle_clusters.json
node --test examples/vldb23-osdi23-crossref/session-metadata.test.js
PYTHONDONTWRITEBYTECODE=1 python3 examples/vldb23-osdi23-crossref/test_session_extraction.py
PYTHONDONTWRITEBYTECODE=1 python3 examples/vldb23-osdi23-crossref/test_osdi_session_extraction.py
node --test use-cases/paper-card-explorer/filters.test.js
node --test assets/principle-tags.test.js
```

The analysis never writes to the manuscript or membership input. It records the input checksum and produces `vldb2023-session-analysis.md` and `.json` here. Omit the membership argument to generate only the corpus and nearest-match analysis.

## Principle Labels

`Rw` (Reuse of Prior Work) replaces `Rc` (Reuse of Computation). The card builder accepts legacy source cards and normalizes their symbols, names, equations, and usage keys. Similarity enrichment also normalizes `Rc` to `Rw`. The explorer accepts old `?tags=Rc` links and reads either version of the card labels. The README retains the `principle-rc` anchor and the legacy tile URL remains available.

`Qr` (Quality Relaxation, Semantics) and `Rv` (Resource Virtualization, Structure) are available for future mappings. Adding them does not assign them to existing cards. The reuse rename preserves principle memberships and similarity scores; source summaries in other repositories are unchanged. Set `PAPER_CARD_OUTPUT_PATH` to build cards into a separate file for inspection without replacing the published data.

`Rs` (Resource Substitution, Efficiency) is also registered for future mappings. A mapping must identify the resources exchanged and the mechanism that makes the exchange possible. Registering the principle does not change existing cards or similarity results.

## Retrieval

For conference cards, the explorer searches both VLDB 2023 and OSDI 2023 by default, independently of the collection filters on the main search list. Unchecking "Search across conferences" restricts matches to the source conference. Each match shows its conference and session category. Reading-list cards keep within-collection matching and are excluded from cross-conference results.

Ranking uses direct Jaccard similarity: shared core principles divided by distinct core principles across both cards. At least two principles must be shared. Ties break by shared count and then numeric paper ID. The top five are shown; there is no conference bonus, forced cross-conference match, graph threshold, transitive neighbor expansion, or clustering step. The low-level `rank` API enables cross-conference matching only with `acrossConferences: true`, preserving the existing within-VLDB analysis reports.

`similarity_principle_tags` uses the source equation's explicit core tags. An absent core field falls back to the source top-three tags with an explicit `similarity_principle_source` marker. An explicitly empty core set stays empty. Explicit core assignments remain separate from supporting tags.

The cross-category filter requires known, disjoint category names. Missing metadata does not count as a different area, and papers sharing any normalized category name are excluded even if they belong to different conferences. Different names across conferences are not proof of different research areas; the original program labels are retained without inferring equivalences between them.

"Papers in the same session category" lists all other published cards in that collection sharing a normalized category, alphabetically by title. It has no principle-overlap requirement or top-five limit. The list is collapsed by default; `peers=1` preserves an expanded view. Principle labels in paper views are colored by table family and sorted alphabetically by symbol.

Session badges toggle the single category filter, synchronized with the category dropdown. Clicking a session badge on a cross-conference match also enables that paper's collection in the main search, so the label is not filtered out by the original conference selection. Principle buttons use the same appearance and toggle behavior in the search palette, selected filters, paper cards, similar papers, and session peers. These filters combine with the existing collection and text filters. Clicking a filter button inside a result does not open that paper.

URLs preserve the existing `paper`, `q`, `tags`, `mode`, and `conf` parameters. Session and matching parameters are `category`, `similar=1`, `different=0` (allow same-category matches), and `across=0` (restrict matches to the source conference). Similar papers are collapsed by default, including after selecting another card or following a match. An explicit `similar=1` preserves an expanded view when sharing or reloading its URL. Links in the legacy example directory continue to redirect with their query parameters intact. Match links retain the matching preferences but clear unrelated list filters so the destination card remains visible.

For local preview, serve the repository root over HTTP and open `/use-cases/paper-card-explorer/?paper=vldb2023-59`. The explorer fetches JSON and cannot be previewed reliably with `file://`.
