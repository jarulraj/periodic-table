(function(root) {
    'use strict';

    function filter(papers, state) {
        const tags = [...new Set(state.tags || [])];
        return papers.filter(function(paper) {
            if (state.collections && !state.collections.has(paper.collection || paper.conference)) return false;
            if (state.category && !(paper.conference_session_categories || []).includes(state.category)) return false;
            if (state.matchesSearch && !state.matchesSearch(paper)) return false;
            if (!tags.length) return true;
            const paperTags = paper.tags || [];
            return state.mode === 'all' ? tags.every(tag => paperTags.includes(tag)) : tags.some(tag => paperTags.includes(tag));
        });
    }

    // Counts predict the full result set after adding an unselected principle.
    function tagCounts(papers, state, candidates) {
        const scope = filter(papers, {...state, tags: []});
        return Object.fromEntries(candidates.map(function(tag) {
            return [tag, filter(scope, {tags: [...(state.tags || []), tag], mode: state.mode}).length];
        }));
    }

    // Replacing the session must not intersect with the session already selected.
    function sessionCounts(papers, state) {
        const scope = filter(papers, {...state, category: ''});
        const counts = {};
        scope.forEach(function(paper) {
            [...new Set(paper.conference_session_categories || [])].forEach(function(category) {
                counts[category] = (counts[category] || 0) + 1;
            });
        });
        return {counts, total: scope.length};
    }

    function occurrences(papers) {
        const counts = {};
        papers.forEach(function(paper) {
            [...new Set(paper.tags || [])].forEach(function(tag) {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        return counts;
    }

    const api = {filter, tagCounts, sessionCounts, occurrences};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PaperFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
