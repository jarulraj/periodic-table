const test = require('node:test');
const assert = require('node:assert/strict');
const {filter, tagCounts, sessionCounts, occurrences} = require('./filters');

const papers = [
    {id: 1, collection: 'VLDB', tags: ['Ha', 'Bo', 'Bo'], conference_session_categories: ['Storage', 'Storage'], text: 'nvme'},
    {id: 2, collection: 'VLDB', tags: ['Ha'], conference_session_categories: ['Storage', 'Systems'], text: 'nvme'},
    {id: 3, collection: 'VLDB', tags: ['Bo'], conference_session_categories: ['Systems'], text: 'cpu'},
    {id: 4, collection: 'OSDI', tags: ['Bo', 'Ha'], conference_session_categories: ['Storage'], text: 'nvme'},
    {id: 5, collection: 'VLDB', tags: ['Rw'], conference_session_categories: ['Systems'], text: 'cache'},
    {id: 6, collection: 'VLDB', tags: [], text: 'nvme'}
];
const base = {collections: new Set(['VLDB']), tags: ['Ha'], mode: 'all'};

test('all-mode prospective counts narrow within the complete search context', () => {
    const state = {...base, category: 'Storage', matchesSearch: p => p.text === 'nvme'};
    assert.deepEqual(tagCounts(papers, state, ['Bo','Rw']), {Bo: 1, Rw: 0});
    assert.deepEqual(filter(papers, {...state, tags:['Ha','Bo']}).map(p=>p.id), [1]);
});
test('any-mode prospective counts include new matches outside the current results, without duplicates', () => {
    assert.deepEqual(tagCounts(papers, {...base, mode:'any'}, ['Bo','Rw']), {Bo:3, Rw:3});
    assert.deepEqual(tagCounts(papers, {...base, mode:'any', category:'Storage'}, ['Bo']), {Bo:2});
});
test('the first tag filters an unfiltered scope in either mode', () => {
    for (const mode of ['any','all']) {
        assert.deepEqual(tagCounts(papers, {...base, tags:[], mode}, ['Ha','Bo','Un']), {Ha:2, Bo:2, Un:0});
    }
});
test('session counts replace the selected category and count multi-session papers once per category', () => {
    assert.deepEqual(sessionCounts(papers, {...base, category:'Systems'}), {counts:{Storage:2, Systems:1}, total:2});
    assert.deepEqual(sessionCounts(papers, {...base, matchesSearch:p=>p.text==='cpu'}), {counts:{}, total:0});
});
test('zero-result states and empty collections retain their filters and allow recovery', () => {
    const state = {...base, tags:['Ha','Rw'], category:'Storage'};
    const before = JSON.stringify(state);
    assert.equal(filter(papers, state).length, 0);
    assert.equal(filter(papers, {...state, tags:['Ha']}).length, 2);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(tagCounts(papers, {...base, collections:new Set()}, ['Ha','Bo']), {Ha:0, Bo:0});
    assert.deepEqual(sessionCounts(papers, {...base, collections:new Set()}), {counts:{}, total:0});
});
test('related-tag occurrences count papers, rather than repeated assignments', () => {
    assert.deepEqual(occurrences(filter(papers, base)), {Ha:2, Bo:1});
});
test('predicted counts equal actual selections across the published corpus', () => {
    const data = require('../../examples/vldb23-osdi23-crossref/paper-cards.json');
    const rows = data.papers;
    for (const mode of ['any','all']) {
        for (const category of ['', 'Modern Memory and Storage']) {
            const state = {collections:new Set(['VLDB 2023']), tags:['Ha'], mode, category,
                matchesSearch: paper => /storage|index|query/i.test(paper.title)};
            const candidates = ['Bo','Rw','Wv','Un'];
            const counts = tagCounts(rows, state, candidates);
            for (const tag of candidates) {
                const expected = rows.filter(p => p.collection === 'VLDB 2023' &&
                    (!category || (p.conference_session_categories || []).includes(category)) &&
                    state.matchesSearch(p) && (mode === 'all' ? p.tags.includes('Ha') && p.tags.includes(tag) :
                        p.tags.includes('Ha') || p.tags.includes(tag))).length;
                assert.equal(counts[tag], expected, mode + ' ' + category + ' ' + tag);
            }
        }
    }
});
