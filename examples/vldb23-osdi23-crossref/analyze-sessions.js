#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {rank, compare} = require('../../use-cases/paper-card-explorer/similarity');
const {readSessions} = require('./paper-metadata');

const cardPath = path.join(__dirname, 'paper-cards.json');
const data = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
const metadata = readSessions();
const cards = Object.values(data.cards_by_id).filter(card => card.source_id === 'vldb2023');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const count = values => values.reduce((result, value) => {result[value] = (result[value] || 0) + 1; return result;}, {});
const sortedCounts = values => Object.entries(count(values)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const categories = sortedCounts(cards.flatMap(card => card.conference_session_categories || []));
const nearest = Object.fromEntries(cards.map(card => [card.paper_id, rank(card, cards, {differentCategories: true}).map(match => ({
    paper_id: match.card.paper_id, title: match.card.paper_title,
    categories: match.card.conference_session_categories,
    score: match.score, shared: match.shared, only_source: match.only_source, only_target: match.only_target
}))]));
const coverage = {
    cards: cards.length,
    matched: cards.filter(card => card.conference_session_status === 'matched').length,
    match_methods: count(Object.values(metadata.papers).map(paper => paper.match_method || paper.status)),
    raw_sessions: new Set(cards.flatMap(card => card.conference_sessions || []).map(session => session.session_id)).size,
    normalized_categories: categories.length,
    multiple_session_cards: cards.filter(card => (card.conference_sessions || []).length > 1).length,
    unmatched: cards.filter(card => card.conference_session_status !== 'matched').map(card => card.paper_id),
    title_differences: Object.entries(metadata.papers).filter(([, entry]) => entry.title_differs).map(([paper_id, entry]) => ({paper_id, title: entry.paper_title, program_title: entry.sessions.map(s => s.paper_title), review: entry.title_review})),
    cards_with_cross_category_matches: Object.values(nearest).filter(matches => matches.length).length,
    similarity_tag_sources: count(cards.map(card => card.similarity_principle_source))
};

const clusterPath = process.argv[2];
let clusters = [];
if (clusterPath) {
    const frozen = JSON.parse(fs.readFileSync(clusterPath, 'utf8'));
    clusters = frozen.clusters.map(cluster => {
        const members = cluster.members.map(id => data.cards_by_id['vldb2023-' + id]);
        if (members.some(card => !card)) throw new Error('Unknown cluster member in ' + cluster.cluster);
        if (members.length !== cluster.cards) throw new Error('Cluster count mismatch');
        const distribution = sortedCounts(members.flatMap(card => card.conference_session_categories || []));
        return {
            cluster: cluster.cluster, name: cluster.name, cards: cluster.cards,
            members: members.map(card => card.paper_id),
            matched: members.filter(card => card.conference_session_status === 'matched').length,
            category_count: distribution.length, categories: Object.fromEntries(distribution)
        };
    });
}

const output = {
    inputs: {
        paper_cards_sha256: sha256(cardPath),
        sessions_sha256: sha256(path.join(__dirname, 'vldb2023-sessions.json')),
        cluster_memberships_sha256: clusterPath ? sha256(clusterPath) : null
    },
    method: 'Direct Jaccard over equation core-principle sets; at least two shared principles; same collection; known, disjoint session categories; top five; ties by shared count then numeric paper ID. No clustering is recomputed.',
    caveat: metadata.category_caveat,
    coverage, categories: Object.fromEntries(categories), clusters, nearest_cross_category: nearest
};
fs.writeFileSync(path.join(__dirname, 'vldb2023-session-analysis.json'), JSON.stringify(output, null, 2) + '\n');

function cell(value) { return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
function link(card) {
    const label = card.system_or_method_name || card.paper_title;
    return '[' + cell(label) + '](https://jarulraj.github.io/periodic-table/use-cases/paper-card-explorer/?paper=' + card.paper_id + ')';
}
const lines = [
    '# VLDB 2023 Session Coverage and Cross-Category Matches', '',
    'Source: [official conference program](' + metadata.source_url + '), retrieved ' + metadata.retrieved_on + '.', '',
    '## Coverage', '',
    `- ${coverage.matched}/${coverage.cards} cards matched (${coverage.match_methods.pdf_url || 0} by PDF URL).`,
    `- ${coverage.raw_sessions} original sessions; ${coverage.normalized_categories} normalized categories.`,
    `- ${coverage.unmatched.length} unresolved cards; ${coverage.multiple_session_cards} cards in multiple sessions.`,
    `- ${coverage.cards_with_cross_category_matches}/${coverage.cards} cards have at least one cross-category match sharing two or more core principles.`,
    '- Four PDF-matched title differences were reviewed: a subtitle, mathematical notation, and two singular/plural variations.',
    '- Existing author-reviewed text, principle assignments, manuscript, and cluster memberships were not changed.', '',
    metadata.category_caveat, '',
    '## Matching Method', '', output.method, '',
    'Similarity is a comparison of card annotations, not evidence that the mechanisms are interchangeable. A score of 1 means identical core tag sets, not identical systems. The website initially searches within the selected card\'s collection; session filtering is currently available for VLDB 2023 only.', '',
    '## Selected Cross-Category Matches', '',
    'These are selected examples from the computed rankings, not a separate clustering.', '',
    '| Source | Session category | Match | Session category | Shared principles | Jaccard |',
    '| --- | --- | --- | --- | --- | --- |'
];
for (const [left, right] of [[59,28],[58,157],[99,52],[74,227],[19,27]]) {
    const a = data.cards_by_id['vldb2023-' + left], b = data.cards_by_id['vldb2023-' + right];
    const match = compare(a, b);
    if (!nearest[a.paper_id].some(item => item.paper_id === b.paper_id)) throw new Error('Selected example is not in top-five cross-category results');
    lines.push(`| ${link(a)} | ${cell(a.conference_session_categories.join('; '))} | ${link(b)} | ${cell(b.conference_session_categories.join('; '))} | ${match.shared.join(' + ')} | ${match.score.toFixed(2)} |`);
}
if (clusters.length) {
    lines.push('', '## Existing Manuscript Clusters', '',
        'The frozen memberships cover ' + clusters.reduce((sum, c) => sum + c.cards, 0) + ' papers, not the entire corpus. Categories below are scheduling labels; broad and mixed sessions are retained. Counts have not been used to reassign or recluster papers.', '',
        '| Cluster | Papers | Matched | Session categories | Category distribution |',
        '| --- | ---: | ---: | ---: | --- |');
    for (const c of clusters) lines.push(`| ${c.cluster}: ${c.name} | ${c.cards} | ${c.matched} | ${c.category_count} | ${cell(Object.entries(c.categories).map(([name, n]) => name + ' (' + n + ')').join('; '))} |`);
}
lines.push('', '## All Normalized Session Categories', '', '| Category | Cards |', '| --- | ---: |');
for (const [name, n] of categories) lines.push(`| ${cell(name)} | ${n} |`);
lines.push('', '## Audit', '',
    '`vldb2023-sessions.json` retains original headings, official links, matched titles, and PDF URLs. `vldb2023-session-analysis.json` contains every card\'s nearest matches and the input checksums.', '',
    'Normalization removes only trailing session numbers, standardizes whitespace and ampersands, and corrects the program typo "Multi-Dimesnional" to "Multi-Dimensional". Distinct thematic headings, including the two differently themed Potpourri sessions, remain separate.', '');
fs.writeFileSync(path.join(__dirname, 'vldb2023-session-analysis.md'), lines.join('\n'));
console.log(JSON.stringify({coverage, clusters: clusters.map(({cluster, cards, category_count}) => ({cluster, cards, category_count}))}, null, 2));
