(function(root) {
    'use strict';

    function normalizeTag(tag) {
        const value = String(tag || '').trim();
        return value === 'Rc' ? 'Rw' : value;
    }

    function normalizeText(text) {
        return text.replace(/\bReuse of Computation\b/g, 'Reuse of Prior Work')
            .replace(/\bRc\b/g, 'Rw')
            .replace(/\\RcP\b/g, '\\RwP');
    }

    // Source cards and shared URLs may retain the earlier reuse symbol.
    // Preserve prose and assignments apart from the explicit label migration.
    function normalizeData(value) {
        if (typeof value === 'string') return normalizeText(value);
        if (Array.isArray(value)) return value.map(normalizeData);
        if (!value || typeof value !== 'object') return value;
        const entries = new Map();
        for (const [key, item] of Object.entries(value)) {
            const tag = key === 'Rc' ? 'Rw' : key;
            const normalized = normalizeData(item);
            if (entries.has(tag)) {
                const previous = entries.get(tag);
                if (!Array.isArray(previous) || !Array.isArray(normalized)) {
                    throw new Error('Conflicting principle keys: ' + tag);
                }
                entries.set(tag, previous.concat(normalized));
            } else {
                entries.set(tag, normalized);
            }
        }
        return Object.fromEntries(entries);
    }

    const api = {normalizeTag, normalizeText, normalizeData};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PrincipleTags = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
