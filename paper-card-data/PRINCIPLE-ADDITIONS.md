# Additive Principle Review

The `principle-additions.json` overlay records a conservative selection from the
joint Argon review of Rw, Qr, Rv, and Rs across 396 cards. Each accepted addition
has a source-backed explanation, a paper URL, section pointers, and provenance
hashes. Model confidence alone did not determine acceptance. These annotations
do not imply author endorsement.

The overlay adds mappings only. It does not remove, replace, or re-rank existing
principles, rewrite existing explanations, or modify source summaries. Core
additions extend the existing equation; supporting additions stay outside it.
Search tags are updated for both, while principle similarity continues to use
core tags. The original composition prose is preserved. New annotations are
paper-level because the review did not assign mechanisms to existing delta IDs.

Cards with known author corrections or concurrent curated changes are explicitly
protected. Other existing card fields and usages remain unchanged. Baseline and
revised-content hashes prevent a later rebuild from silently overwriting new
curation. A hash conflict requires reviewing and regenerating the relevant entry,
not deleting the guard. Reapplying the same overlay is a no-op.

`build-paper-cards.js` applies the overlay to collections being rebuilt. Retained
collections are left alone. To apply it to the current generated collection:

```sh
node examples/vldb23-osdi23-crossref/principle-additions.js --apply examples/vldb23-osdi23-crossref/paper-cards.json
```

Unselected audit proposals remain pending; absence from this overlay is not a
negative classification. The source summaries, manuscript, and frozen clustering
analyses were not regenerated. Historical session-analysis reports remain
snapshots of their original inputs; the explorer computes similarity from the
updated card data.
