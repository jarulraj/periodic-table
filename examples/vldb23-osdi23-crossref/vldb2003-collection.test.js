const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {spawnSync} = require('child_process');
const {readSessions} = require('./paper-metadata');
const {normalizeData} = require('../../assets/principle-tags');
const {filter} = require('../../use-cases/paper-card-explorer/filters');
const {compare, rank} = require('../../use-cases/paper-card-explorer/similarity');
const root = path.resolve(__dirname, '../../paper-card-data/vldb2003');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'paper-cards.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('all 75 audited summaries are published with official PDF and session links', () => {
    const sessions = readSessions('vldb2003');
    const papers = filter(data.papers, {collections: new Set(['VLDB 2003'])});
    assert.equal(papers.length, 75);
    assert.equal(Object.keys(provenance.papers).length, 75);
    assert.equal(hash(fs.readFileSync(path.join(root, 'papers.csv'))), provenance.papers_csv_sha256);
    const sessionIds = new Set();
    for (let n = 1; n <= 75; n++) {
        const id = 'vldb2003-' + n;
        const card = data.cards_by_id[id];
        const receipt = provenance.papers[id];
        const bytes = fs.readFileSync(path.join(root, 'summaries', n + '.json'));
        const summary = normalizeData(JSON.parse(bytes));
        assert.equal(hash(bytes), receipt.summary_sha256, id);
        assert.equal(card.paper_title, summary.section_0_paper_identification.paper_title);
        assert.equal(card.publication_year, '2003');
        assert.equal(card.collection_type, 'conference');
        assert.equal(card.paper_url, receipt.paper_url);
        assert.match(card.paper_url, /^https:\/\/vldb\.org\/conf\/2003\/papers\/.+\.pdf$/);
        assert.equal(card.analysis_note, provenance.review_status);
        assert.equal(receipt.truncated, false);
        assert.deepEqual(card.core_principle_tags, summary.section_7_compound_equation.core_principle_tags);
        assert.deepEqual([...card.core_principle_tags].sort(), card.similarity_principle_tags);
        assert.equal(sessions.papers[id].paper_url, card.paper_url);
        for (const session of card.conference_sessions) {
            sessionIds.add(session.session_id);
            assert.equal(session.source_url, sessions.source_url + '#' + session.session_id);
            assert.ok(filter(papers, {category: session.category}).some(p => p.paper_id === id));
        }
    }
    assert.equal(sessionIds.size, 25);
    assert.match(data.cards_by_id['vldb2003-37'].review_note, /Wv merits further review/);
});

test('2003 and 2023 can be filtered together and compared with the existing ranker', () => {
    assert.equal(filter(data.papers, {collections: new Set(['VLDB 2003', 'VLDB 2023'])}).length, 309);
    const source = data.cards_by_id['vldb2003-33'];
    const target = data.cards_by_id['vldb2023-51'];
    assert.equal(compare(source, target).score, 0.75);
    const candidates = Object.values(data.cards_by_id);
    assert.ok(rank(source, candidates, {acrossConferences: true, limit: Infinity}).some(m => m.card.paper_id === target.paper_id));
    assert.ok(rank(source, candidates).every(m => m.card.source_id === 'vldb2003'));
});

test('incremental import preserves curated collections, is repeatable, and guards against deletion', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vldb2003-import-test-'));
    try {
        const output = path.join(temp, 'paper-cards.json');
        const original = structuredClone(data);
        original.cards_by_id['vldb2023-1'].goal = 'Curated sentinel: preserve exactly';
        fs.writeFileSync(output, JSON.stringify(original));
        const run = args => spawnSync(process.execPath, [path.join(__dirname, 'build-paper-cards.js'), ...args], {
            env: {...process.env, PAPER_CARD_SUMMARY_DIRS: path.join(root, 'summaries'), PAPER_CARD_OUTPUT_PATH: output}, encoding: 'utf8'
        });
        const rejected = run([]);
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /would remove published collections/);
        assert.deepEqual(JSON.parse(fs.readFileSync(output)), original);
        const merged = run(['--merge']);
        assert.equal(merged.status, 0, merged.stderr);
        const first = fs.readFileSync(output, 'utf8');
        const result = JSON.parse(first);
        for (const [id, card] of Object.entries(original.cards_by_id).filter(([, c]) => c.source_id !== 'vldb2003')) {
            assert.deepEqual(result.cards_by_id[id], card, id);
        }
        assert.deepEqual(result.papers.filter(p => p.source_id !== 'vldb2003'), original.papers.filter(p => p.source_id !== 'vldb2003'));
        assert.equal(result.paper_count, original.paper_count);
        assert.equal(result.card_count, original.card_count);
        assert.equal(run(['--merge']).status, 0);
        assert.equal(fs.readFileSync(output, 'utf8'), first);

        const legacy = structuredClone(result);
        const card = legacy.cards_by_id['vldb2023-1'];
        card.core_principle_tags = ['Rc'];
        card.equation = 'Baseline + Rc (Reuse of Computation) -> System';
        fs.writeFileSync(output, JSON.stringify(legacy));
        assert.equal(run(['--merge']).status, 0);
        const migrated = JSON.parse(fs.readFileSync(output));
        assert.deepEqual(migrated.cards_by_id['vldb2023-1'], normalizeData(card));
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
});
