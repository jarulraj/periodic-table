(function(root) {
    'use strict';

    function tags(card) {
        return [...new Set(card && card.similarity_principle_tags || [])].sort();
    }

    function compare(left, right) {
        const a = tags(left);
        const b = tags(right);
        const shared = a.filter(function(tag) { return b.includes(tag); });
        const union = new Set(a.concat(b)).size;
        return {
            score: union ? shared.length / union : 0,
            shared,
            only_source: a.filter(function(tag) { return !b.includes(tag); }),
            only_target: b.filter(function(tag) { return !a.includes(tag); })
        };
    }

    function differentCategories(left, right) {
        const a = left.conference_session_categories || [];
        const b = right.conference_session_categories || [];
        // Missing metadata is not evidence of a different category.
        return a.length > 0 && b.length > 0 && !a.some(function(category) { return b.includes(category); });
    }

    function rank(source, candidates, options) {
        options = options || {};
        return candidates.filter(function(card) {
            const inScope = card.source_id === source.source_id ||
                (options.acrossConferences && source.collection_type === 'conference' && card.collection_type === 'conference');
            return card.paper_id !== source.paper_id && inScope &&
                (!options.differentCategories || differentCategories(source, card));
        }).map(function(card) {
            return {card, ...compare(source, card)};
        }).filter(function(match) {
            return match.shared.length >= 2;
        }).sort(function(a, b) {
            return b.score - a.score || b.shared.length - a.shared.length ||
                a.card.paper_id.localeCompare(b.card.paper_id, 'en', {numeric: true});
        }).slice(0, options.limit === undefined ? 5 : options.limit);
    }

    function sameCategoryPapers(source, candidates) {
        const categories = source.conference_session_categories || [];
        return candidates.filter(function(card) {
            return card.paper_id !== source.paper_id && card.source_id === source.source_id &&
                (card.conference_session_categories || []).some(function(category) { return categories.includes(category); });
        }).sort(function(a, b) {
            return a.paper_title.localeCompare(b.paper_title, 'en') || a.paper_id.localeCompare(b.paper_id, 'en', {numeric: true});
        });
    }

    const api = {tags, compare, differentCategories, rank, sameCategoryPapers};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PaperSimilarity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
