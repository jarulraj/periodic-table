const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {similarityFields, sessionFields, readSessions, enrichPublishedCards} = require('./paper-metadata');
const {compare, rank, differentCategories, sameCategoryPapers} = require('../../use-cases/paper-card-explorer/similarity');
const metadata = readSessions();
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'paper-cards.json'), 'utf8'));
const card = (id, tags, categories = ['A']) => ({paper_id: id, source_id: 'vldb2023', similarity_principle_tags: tags, conference_session_categories: categories});

test('all 234 VLDB cards have verified PDF-matched sessions', () => {
    const entries = Object.values(metadata.papers);
    assert.equal(entries.length, 234);
    for (const entry of entries) {
        assert.equal(entry.status, 'matched');
        assert.equal(entry.match_method, 'pdf_url');
        assert.ok(entry.categories.length);
        assert.ok(!entry.title_differs || entry.title_review);
        for (const session of entry.sessions) assert.equal(new URL(session.paper_url).pathname, new URL(entry.paper_url).pathname);
    }
});
test('published list and detail session metadata agree', () => {
    for (const paper of data.papers.filter(p => p.source_id === 'vldb2023')) {
        assert.deepEqual(paper.conference_session_categories, metadata.papers[paper.paper_id].categories);
        const c = data.cards_by_id[paper.paper_id];
        for (const [key, value] of Object.entries(sessionFields(paper.paper_id, metadata))) assert.deepEqual(c[key], value);
    }
});
test('core principles are not unioned with top-three or supporting tags', () => {
    assert.deepEqual(similarityFields({section_7_compound_equation: {core_principle_tags: ['Ep', 'Cm', 'Ep'], supporting_principle_tags: ['Wv']}, section_11_normalized_summary: {top_3_principles: ['Ep','Cm','Wv']}}), {similarity_principle_tags: ['Cm','Ep'], similarity_principle_source: 'equation_core'});
});
test('missing core field has an explicit fallback; an empty core is not overridden', () => {
    assert.equal(similarityFields({section_11_normalized_summary: {top_3_principles: ['La']}}).similarity_principle_source, 'top_three_fallback');
    assert.deepEqual(similarityFields({section_7_compound_equation: {core_principle_tags: []}, section_11_normalized_summary: {top_3_principles: ['La']}}).similarity_principle_tags, []);
});
test('Jaccard includes unique core tags only, and empty sets score zero', () => {
    const result = compare(card('1', ['La','Ad','La']), card('2', ['La','Ad','Mo']));
    assert.equal(result.score, 2/3);
    assert.deepEqual(result.shared, ['Ad','La']);
    assert.deepEqual(result.only_target, ['Mo']);
    assert.equal(compare(card('1', []), card('2', [])).score, 0);
});
test('different category means known and disjoint, including multi-session cards', () => {
    assert.equal(differentCategories(card('1', [], ['A','B']), card('2', [], ['B','C'])), false);
    assert.equal(differentCategories(card('1', [], []), card('2', [], ['B'])), false);
    assert.equal(differentCategories(card('1', [], ['A']), card('2', [], ['B'])), true);
});
test('ranking excludes self, weak matches, other collections, and unknown categories', () => {
    const a = card('1', ['La','Ad']);
    const candidates = [a, card('2', ['La']), {...card('3', ['La','Ad']), source_id: 'osdi23'}, card('4', ['La','Ad'], []), card('5', ['La','Ad'], ['B'])];
    assert.deepEqual(rank(a,candidates,{differentCategories:true}).map(m => m.card.paper_id), ['5']);
});
test('ties and limits are deterministic across candidate order', () => {
    const a = card('source', ['Ep','Cm']);
    const candidates = ['vldb2023-10','vldb2023-2','vldb2023-4'].map(id => card(id,['Cm','Ep']));
    assert.deepEqual(rank(a,candidates,{limit:2}).map(m => m.card.paper_id), ['vldb2023-2','vldb2023-4']);
    assert.deepEqual(rank(a,candidates),rank(a,candidates.slice().reverse()));
});
test('strong cross-category examples survive the published data', () => {
    for (const [a,b] of [[59,28],[58,157],[99,52]]) {
        const matches = rank(data.cards_by_id['vldb2023-'+a],Object.values(data.cards_by_id),{differentCategories:true});
        assert.ok(matches.some(m => m.card.paper_id === 'vldb2023-'+b));
    }
});
test('category toggle removes same-category LeanStore matches', () => {
    const source = data.cards_by_id['vldb2023-52'];
    const candidates = Object.values(data.cards_by_id);
    const all = rank(source, candidates).map(match => match.card.paper_id);
    const different = rank(source, candidates, {differentCategories:true});
    assert.ok(all.includes('vldb2023-47') && all.includes('vldb2023-48'));
    assert.ok(different.every(match => differentCategories(source, match.card)));
    assert.ok(!different.some(match => ['vldb2023-47','vldb2023-48'].includes(match.card.paper_id)));
    assert.equal(different.length, 5);
});
test('HMAB results stay the same because it has no same-category peers', () => {
    const source = data.cards_by_id['vldb2023-59'];
    const candidates = Object.values(data.cards_by_id);
    assert.equal(candidates.filter(c => c.source_id === source.source_id &&
        (c.conference_session_categories || []).includes('Benchmarking and Performance')).length, 1);
    assert.deepEqual(rank(source, candidates), rank(source, candidates, {differentCategories:true}));
});
test('same-category browsing includes all peers regardless of shared principles', () => {
    const source = data.cards_by_id['vldb2023-179'];
    const peers = sameCategoryPapers(source, Object.values(data.cards_by_id));
    assert.equal(peers.length, 5);
    assert.ok(peers.every(c => c.paper_id !== source.paper_id && c.conference_session_categories.includes('Queries and Systems')));
    assert.ok(peers.some(c => compare(source, c).shared.length < 2));
    const titles = peers.map(c => c.paper_title);
    assert.deepEqual(titles, titles.slice().sort((a,b) => a.localeCompare(b,'en')));
});
test('same-category browsing handles missing labels, collections, and multiple categories', () => {
    const source = card('1', [], ['A','B']);
    const peer = {...card('2', [], ['B','C']),paper_title:'A peer'};
    const foreign = {...peer,paper_id:'3',source_id:'osdi23'};
    assert.deepEqual(sameCategoryPapers(source, [source,peer,foreign,card('4',[],[])]),[peer]);
    assert.deepEqual(sameCategoryPapers(card('5',[],[]),[peer]),[]);
    assert.deepEqual(sameCategoryPapers(data.cards_by_id['vldb2023-59'],Object.values(data.cards_by_id)),[]);
});
test('enrichment preserves curated contents and is idempotent', () => {
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-session-test-'));
    try {
        fs.mkdirSync(path.join(root, 'vldb2023', 'summaries'), {recursive:true});
        fs.writeFileSync(path.join(root, 'vldb2023', 'summaries', '1.json'), JSON.stringify({section_7_compound_equation: {core_principle_tags:['Ep','Se']}}));
        const original = {paper_id:'vldb2023-1', paper_number:'1', source_id:'vldb2023', equation:'Curated equation', core_principle_tags:['Ep','Se','Wv'], usagesByTag:{Ep:[{why_it_applies:'Author correction'}]}};
        const output = {cards_by_id:{'vldb2023-1':structuredClone(original)},papers:[{paper_id:'vldb2023-1', title:'Curated title'}]};
        enrichPublishedCards(output,root,metadata);
        for (const key of Object.keys(original)) assert.deepEqual(output.cards_by_id['vldb2023-1'][key],original[key]);
        const first = JSON.stringify(output);
        enrichPublishedCards(output,root,metadata);
        assert.equal(JSON.stringify(output),first);
    } finally {fs.rmSync(root,{recursive:true,force:true});}
});
