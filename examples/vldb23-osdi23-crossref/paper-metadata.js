const fs = require('fs');
const path = require('path');

function sessionFields(paperId, metadata) {
    const entry = metadata.papers[paperId];
    if (!entry) return {};
    return {
        conference_session_status: entry.status,
        conference_session_categories: entry.categories,
        conference_sessions: entry.sessions.map(function(session) {
            return {
                session_id: session.session_id,
                raw_label: session.raw_label,
                category: session.category,
                source_url: session.source_url
            };
        })
    };
}

function similarityFields(summary) {
    const equation = summary.section_7_compound_equation || {};
    const normalized = summary.section_11_normalized_summary || {};
    // Do not promote supporting tags merely because they also appear in a top-three list.
    const explicit = Array.isArray(equation.core_principle_tags);
    const tags = explicit ? equation.core_principle_tags : normalized.top_3_principles || [];
    return {
        similarity_principle_tags: [...new Set(tags)].sort(),
        similarity_principle_source: explicit ? 'equation_core' : 'top_three_fallback'
    };
}

function readSessions() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'vldb2023-sessions.json'), 'utf8'));
}

// Enrich the published JSON without rebuilding or replacing author-reviewed card text.
function enrichPublishedCards(data, dataRoot, metadata) {
    for (const card of Object.values(data.cards_by_id)) {
        const summaryPath = path.join(dataRoot, card.source_id, 'summaries', card.paper_number + '.json');
        if (!fs.existsSync(summaryPath)) throw new Error('Missing source summary: ' + summaryPath);
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        Object.assign(card, sessionFields(card.paper_id, metadata), similarityFields(summary));
    }
    for (const paper of data.papers) {
        const card = data.cards_by_id[paper.paper_id];
        if (card.source_id === 'vldb2023') {
            paper.conference_session_categories = card.conference_session_categories;
        }
    }
    return data;
}

module.exports = {sessionFields, similarityFields, readSessions, enrichPublishedCards};

if (require.main === module) {
    const dataRoot = process.env.PAPER_CARD_DATA_ROOT;
    if (!dataRoot) throw new Error('Set PAPER_CARD_DATA_ROOT to the source data directory.');
    const file = path.join(__dirname, 'paper-cards.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    enrichPublishedCards(data, dataRoot, readSessions());
    fs.writeFileSync(file, JSON.stringify(data));
    console.log('Enriched ' + data.papers.length + ' cards; existing fields preserved.');
}
