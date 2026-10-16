# VLDB 2023 Session Coverage and Cross-Category Matches

Source: [official conference program](https://www.vldb.org/2023/?program-schedule), retrieved 2026-10-15.

## Coverage

- 234/234 cards matched (234 by PDF URL).
- 64 original sessions; 50 normalized categories.
- 0 unresolved cards; 0 cards in multiple sessions.
- 226/234 cards have at least one cross-category match sharing two or more core principles.
- Four PDF-matched title differences were reviewed: a subtitle, mathematical notation, and two singular/plural variations.
- Existing author-reviewed text, principle assignments, manuscript, and cluster memberships were not changed.

Conference session categories are scheduling labels, not validated research areas. Mixed and miscellaneous sessions are retained.

## Matching Method

Direct Jaccard over equation core-principle sets; at least two shared principles; same collection; known, disjoint session categories; top five; ties by shared count then numeric paper ID. No clustering is recomputed.

Similarity is a comparison of card annotations, not evidence that the mechanisms are interchangeable. A score of 1 means identical core tag sets, not identical systems. This report uses within-VLDB rankings. The explorer searches across VLDB 2023 and OSDI 2023 by default and supports session filtering for both conferences.

## Selected Cross-Category Matches

These are selected examples from the computed rankings, not a separate clustering.

| Source | Session category | Match | Session category | Shared principles | Jaccard |
| --- | --- | --- | --- | --- | --- |
| [HMAB](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-59) | Benchmarking and Performance | [Excalibur](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-28) | Hardware Acceleration | Ad + La + Mo | 0.60 |
| [JoinNFA](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-58) | Sketching and Streaming | [CacheDP](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-157) | Differential Privacy | Cm + Ep | 0.67 |
| [MiCS](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-99) | Scalable ML | [LeanStore](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-52) | Modern Memory and Storage | Bo + Ha | 0.67 |
| [VIVA](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-74) | Video Data | [SHiFT](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-227) | Scalable ML | Cm + Se | 0.50 |
| [Auto-Tables](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-19) | Data Exploration/Transformation and Usability | [CatSQL](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=vldb2023-27) | Foundation Models and Databases | Ig + La | 0.50 |

## Existing Manuscript Clusters

The frozen memberships cover 93 papers, not the entire corpus. Categories below are scheduling labels; broad and mixed sessions are retained. Counts have not been used to reassign or recluster papers.

| Cluster | Papers | Matched | Session categories | Category distribution |
| --- | ---: | ---: | ---: | --- |
| C1: Learned and Hardware-Aware Optimization | 17 | 17 | 14 | Modern Memory and Storage (3); Data Discovery and Integration (2); Community Search in Graphs (1); Data Discovery and Learning over Related Data (1); Data Exploration/Transformation and Usability (1); Foundation Models and Databases (1); Graph Analytics (1); Hardware Acceleration (1); Indexing (1); Information Integration and Mining (1); Learned Indexes and Query Processing/Optimization (1); Scalable ML (1); Spatial, Spatio-Temporal (1); View and Change Management (1) |
| C2: Semantic Reformulation | 16 | 16 | 11 | Compression (2); Fairness (2); Foundations for Patterns, Constraints, and Dependencies (2); Graph Analytics (2); Potpourri Online I (Systems and Algorithms) (2); Data Discovery and Integration (1); Data Discovery and Learning over Related Data (1); Learning, Recommendations, Social Networks (1); Provenance, Trace Capture, and Process Mining (1); Reasoning, Recommendation, Classification (1); Scalable ML (1) |
| C3: Learned Adaptive Control | 12 | 12 | 9 | Learned Indexes and Query Processing/Optimization (3); Learning and Systems (2); Benchmarking and Performance (1); Blockchains (1); Hardware Acceleration (1); Queries and Systems (1); Scalable ML (1); Search and Aggregation (1); Sketching and Streaming (1) |
| C4: Reuse and Work Avoidance | 10 | 10 | 9 | Graph Analytics (2); Differential Privacy (1); Foundations for Patterns, Constraints, and Dependencies (1); Graph Structures and Queries (1); Optimizing Queries and Beyond (1); Potpourri Online I (Systems and Algorithms) (1); Sketching and Streaming (1); Temporal and Evolving Graphs (1); Text Processing and Search (1) |
| C5: Adaptive Planning under Uncertainty | 10 | 10 | 7 | Optimizing Queries and Beyond (2); Potpourri Online II (Learning and Mining) (2); Similarity Search (2); Reasoning, Recommendation, Classification (1); Scalable ML (1); Time-Series Analytics (1); Trajectories and Time Series (1) |
| C6: Workload-Adaptive Optimization | 9 | 9 | 9 | Cloud DB and Parallelism (1); Indexing (1); Learned Indexes and Query Processing/Optimization (1); Learning, Recommendations, Social Networks (1); Queries and Systems (1); Reasoning, Recommendation, Classification (1); Scalable ML (1); Spatial and Multi-Dimensional Indexing (1); Video Data (1) |
| C7: Cost-Based Reformulation | 9 | 9 | 7 | Differential Privacy (2); Optimizing Queries and Beyond (2); Sketching and Streaming (1); Spatial and Multi-Dimensional Indexing (1); Spatial, Spatio-Temporal (1); Time-Series Analytics (1); Trajectories and Time Series (1) |
| C8: Cost-Guided Work Reduction | 5 | 5 | 5 | Indexing and Learned Indexing (1); Learned Indexes and Query Processing/Optimization (1); Matching and Spatial Crowdsourcing (1); Similarity Join and Entity Resolution (1); Spatial and Multi-Dimensional Indexing (1) |
| C9: Explicit Constraints and Uncertainty | 5 | 5 | 2 | Differential Privacy (4); Fairness (1) |

## All Normalized Session Categories

| Category | Cards |
| --- | ---: |
| Graph Analytics | 15 |
| Differential Privacy | 12 |
| Scalable ML | 12 |
| Modern Memory and Storage | 11 |
| Private Retrieval and Secure Execution | 9 |
| Transaction Processing | 7 |
| Learned Indexes and Query Processing/Optimization | 6 |
| Queries and Systems | 6 |
| Cloud DB and Parallelism | 5 |
| Data Discovery and Integration | 5 |
| Data Samples and Summaries | 5 |
| Graph Structures and Queries | 5 |
| Indexing | 5 |
| Learning and Systems | 5 |
| Optimizing Queries and Beyond | 5 |
| Reasoning, Recommendation, Classification | 5 |
| Sketching and Streaming | 5 |
| Blockchains | 4 |
| Fairness | 4 |
| Foundations for Patterns, Constraints, and Dependencies | 4 |
| Hardware Acceleration | 4 |
| Indexing and Learned Indexing | 4 |
| Information Integration and Mining | 4 |
| Learning, Recommendations, Social Networks | 4 |
| Matching and Spatial Crowdsourcing | 4 |
| Potpourri Online I (Systems and Algorithms) | 4 |
| Potpourri Online II (Learning and Mining) | 4 |
| Search and Aggregation | 4 |
| Spatial and Multi-Dimensional Indexing | 4 |
| Spatial, Spatio-Temporal | 4 |
| Temporal and Evolving Graphs | 4 |
| Text Processing and Search | 4 |
| Transactions, Tuning, and Compression | 4 |
| View and Change Management | 4 |
| Causality and Explanation | 3 |
| Community Search in Graphs | 3 |
| Compression | 3 |
| Data Discovery and Learning over Related Data | 3 |
| Data Exploration/Transformation and Usability | 3 |
| Parallelization and Analytics | 3 |
| Provenance, Trace Capture, and Process Mining | 3 |
| Rethinking Query Optimization and Execution | 3 |
| Similarity Join and Entity Resolution | 3 |
| Similarity Search | 3 |
| Time-Series Analytics | 3 |
| Trajectories and Time Series | 3 |
| Video Data | 3 |
| Trust, Security, Verifiability | 2 |
| Benchmarking and Performance | 1 |
| Foundation Models and Databases | 1 |

## Audit

`vldb2023-sessions.json` retains original headings, official links, matched titles, and PDF URLs. `vldb2023-session-analysis.json` contains every card's nearest matches and the input checksums.

Normalization removes only trailing session numbers, standardizes whitespace and ampersands, and corrects the program typo "Multi-Dimesnional" to "Multi-Dimensional". Distinct thematic headings, including the two differently themed Potpourri sessions, remain separate.
