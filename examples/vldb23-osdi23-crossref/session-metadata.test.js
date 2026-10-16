const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {similarityFields, sessionFields, readSessions, enrichSessionFields, enrichPublishedCards} = require('./paper-metadata');
const {compare, rank, differentCategories, sameCategoryPapers} = require('../../use-cases/paper-card-explorer/similarity');
const metadata = readSessions();
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'paper-cards.json'), 'utf8'));
const card = (id, tags, categories = ['A']) => ({paper_id: id, source_id: 'vldb2023', similarity_principle_tags: tags, conference_session_categories: categories});

test('conference-specific metadata retains provenance and keeps VLDB analysis scoped', () => {
    const vldb = readSessions('vldb2023');
    assert.equal(Object.keys(vldb.papers).length,234);
    assert.equal(vldb.source_url,'https://www.vldb.org/2023/?program-schedule');
    assert.ok(vldb.retrieved_on && vldb.category_caveat && vldb.source_html_sha256);
    assert.equal(Object.keys(readSessions('osdi23').papers).length,55);
    assert.equal(Object.keys(readSessions('vldb2003').papers).length,75);
    assert.equal(Object.keys(metadata.papers).length,364);
    assert.throws(()=>readSessions('unknown'),/Unknown session source/);
});

test('all 234 VLDB cards have verified PDF-matched sessions', () => {
    const entries = Object.entries(metadata.papers).filter(([id]) => id.startsWith('vldb2023-')).map(([, entry]) => entry);
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
    for (const paper of data.papers.filter(p => metadata.papers[p.paper_id])) {
        assert.deepEqual(paper.conference_session_categories, metadata.papers[paper.paper_id].categories);
        const c = data.cards_by_id[paper.paper_id];
        for (const [key, value] of Object.entries(sessionFields(paper.paper_id, metadata))) assert.deepEqual(c[key], value);
    }
});
test('all 55 OSDI cards have exact normalized-title matches and sourced labels', () => {
    const osdi = JSON.parse(fs.readFileSync(path.join(__dirname, 'osdi23-sessions.json'), 'utf8'));
    assert.equal(osdi.program_records.length, 55);
    assert.equal(Object.keys(osdi.papers).length, 55);
    assert.match(osdi.source_html_sha256, /^[a-f0-9]{64}$/);
    const normalize = title => title.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const categories = new Set();
    for (const [id, entry] of Object.entries(osdi.papers)) {
        assert.equal(entry.status, 'matched', id);
        assert.equal(entry.match_method, 'normalized_title');
        for (const session of entry.sessions) {
            assert.equal(normalize(session.paper_title), normalize(data.cards_by_id[id].paper_title));
            assert.equal(session.source_url, osdi.source_url + '#' + session.session_id);
            assert.ok(session.paper_url.startsWith('https://www.usenix.org/conference/osdi23/presentation/'));
            categories.add(session.category);
        }
    }
    assert.equal(categories.size, 9);
    assert.equal(Object.values(osdi.papers).filter(p => p.categories.includes('Secure Your Bits')).length, 10);
});
test('cross-conference ranking uses the same scores and excludes reading lists', () => {
    const source = {...card('vldb2023-1', ['La','Ad']), collection_type:'conference'};
    const osdi = {...card('osdi23-1', ['Ad','La'], ['B']), source_id:'osdi23', collection_type:'conference'};
    const weaker = {...card('vldb2023-2', ['Ad','La','Mo'], ['C']), collection_type:'conference'};
    const reading = {...osdi, paper_id:'cs764-1', source_id:'cs764', collection_type:'reading-list'};
    const unknown = {...osdi, paper_id:'osdi23-2', conference_session_categories:[]};
    const candidates = [source, weaker, osdi, reading, unknown];
    const options = {acrossConferences:true, differentCategories:true};
    const matches = rank(source,candidates,options);
    assert.deepEqual(matches.map(m=>m.card.paper_id), ['osdi23-1','vldb2023-2']);
    assert.equal(matches[0].score,1);
    assert.deepEqual(rank(source,candidates,{differentCategories:true}).map(m=>m.card.paper_id), ['vldb2023-2']);
    assert.deepEqual(rank(source,candidates,options),rank(source,candidates.slice().reverse(),options));
    assert.deepEqual(rank(reading,candidates,{acrossConferences:true}),[]);
});
test('same-named categories across conferences are not presumed different', () => {
    const source = {...card('vldb2023-1',['La','Ad'],['Learning']),collection_type:'conference'};
    const other = {...source,paper_id:'osdi23-1',source_id:'osdi23'};
    assert.equal(rank(source,[other],{acrossConferences:true}).length,1);
    assert.equal(rank(source,[other],{acrossConferences:true,differentCategories:true}).length,0);
});
test('OSDI same-session peers stay in OSDI and include both numbered sessions', () => {
    const source = Object.values(data.cards_by_id).find(c => c.source_id==='osdi23' && c.conference_session_categories.includes('Secure Your Bits'));
    const peers = sameCategoryPapers(source,Object.values(data.cards_by_id));
    assert.equal(peers.length,9);
    assert.ok(peers.every(p=>p.source_id==='osdi23'));
    assert.equal(new Set([source,...peers].flatMap(p=>p.conference_sessions.map(s=>s.raw_label))).size,2);
});
test('session-only enrichment preserves every existing non-session field', () => {
    const output = structuredClone(data);
    enrichSessionFields(output,metadata);
    assert.deepEqual(output,data);
    for (const c of Object.values(output.cards_by_id)) {
        delete c.conference_session_status;
        delete c.conference_session_categories;
        delete c.conference_sessions;
    }
    for (const p of output.papers) delete p.conference_session_categories;
    const before = structuredClone(output);
    enrichSessionFields(output,metadata);
    for (const [id, c] of Object.entries(before.cards_by_id)) {
        for (const key of Object.keys(c)) assert.deepEqual(output.cards_by_id[id][key],c[key]);
    }
    for (let i=0;i<before.papers.length;i++) {
        for (const key of Object.keys(before.papers[i])) assert.deepEqual(output.papers[i][key],before.papers[i][key]);
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
