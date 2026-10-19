const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {execFileSync} = require('child_process');
const {normalizeTag, normalizeText, normalizeData} = require('./principle-tags');
const {similarityFields} = require('../examples/vldb23-osdi23-crossref/paper-metadata');
const {compare} = require('../use-cases/paper-card-explorer/similarity');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('use-cases/paper-card-explorer/index.html');
const registrySource = html.slice(html.indexOf('const PRINCIPLES ='), html.indexOf('const GROUP_ORDER ='));
const principles = vm.runInNewContext(registrySource + '\nPRINCIPLES;');

test('legacy symbols normalize without changing other identifiers', () => {
    assert.equal(normalizeTag(' Rc '), 'Rw');
    for (const tag of ['Rw', 'Qr', 'Rv', 'Rs', 'Cr', 'RcOther']) assert.equal(normalizeTag(tag), tag);
    assert.equal(normalizeText('Rc + \\RcP + Reuse of Computation'), 'Rw + \\RwP + Reuse of Prior Work');
    assert.equal(normalizeText('CRC RcOther RcP'), 'CRC RcOther RcP');
});

test('nested card migration preserves mechanisms and is idempotent', () => {
    const input = {
        tags: ['Rc', 'Cm'], equation: 'Baseline + Rc -> System',
        usagesByTag: {Rc: [{name: 'Reuse of Computation', why_it_applies: 'Reuse fetched data.'}]},
        mechanism: 'A cache of disk blocks.', cost: 3, reviewed: true, optional: null
    };
    const copy = structuredClone(input);
    const actual = normalizeData(input);
    assert.deepEqual(actual, {
        ...input, tags: ['Rw', 'Cm'], equation: 'Baseline + Rw -> System',
        usagesByTag: {Rw: [{name: 'Reuse of Prior Work', why_it_applies: 'Reuse fetched data.'}]}
    });
    assert.deepEqual(input, copy);
    assert.deepEqual(normalizeData(actual), actual);
    assert.deepEqual(normalizeData({Rc: ['first'], Rw: ['second']}), {Rw: ['first', 'second']});
    assert.throws(() => normalizeData({Rc: 1, Rw: 2}), /Conflicting principle keys/);
});

test('similarity enrichment canonicalizes both explicit and fallback tags', () => {
    for (const summary of [
        {section_7_compound_equation: {core_principle_tags: ['Rc', 'Rw', 'Cm']}},
        {section_11_normalized_summary: {top_3_principles: ['Rc', 'Rw', 'Cm']}}
    ]) assert.deepEqual(similarityFields(summary).similarity_principle_tags, ['Cm', 'Rw']);
    const left = {similarity_principle_tags: ['Rc', 'Cm']};
    const right = {similarity_principle_tags: ['Rc', 'Ep']};
    assert.equal(compare(left, right).score, compare(normalizeData(left), normalizeData(right)).score);
});

test('README tiles, definitions, and explorer registry agree', () => {
    const readme = read('README.md');
    const tableSymbols = [...readme.matchAll(/<td[^>]*><a href="#user-content-principle-([a-z]+)"><img/g)]
        .map(([, symbol]) => symbol[0].toUpperCase() + symbol.slice(1));
    assert.deepEqual(tableSymbols.sort(), Object.keys(principles).sort());
    for (const [symbol, name, group] of [
        ['Rw', 'Reuse of Prior Work', 'Efficiency'],
        ['Wv', 'Result-Preserving Work Avoidance', 'Efficiency'],
        ['Qr', 'Quality Relaxation', 'Semantics'],
        ['Rv', 'Resource Virtualization', 'Structure'],
        ['Rs', 'Resource Substitution', 'Efficiency']
    ]) {
        assert.equal(principles[symbol].name, name);
        assert.equal(principles[symbol].group, group);
        assert.ok(readme.includes('<a id="principle-' + symbol.toLowerCase() + '"></a>'));
        const tile = read('assets/tiles/' + symbol.toLowerCase() + '.svg');
        assert.ok(tile.includes(symbol + ' - ' + name));
        assert.ok(tile.includes('>' + symbol + '</text>'));
    }
    assert.equal(principles.Rc, undefined);
    assert.ok(readme.includes('<a id="principle-rc"></a>'));
    assert.equal(read('assets/tiles/rc.svg'), read('assets/tiles/rw.svg'));
    for (const match of readme.matchAll(/href="#user-content-((?:principle|ref)-[a-z0-9-]+)"/g)) {
        assert.ok(readme.includes('<a id="' + match[1] + '"></a>'), match[1]);
    }
});

test('Wv buttons use the result-preserving name without changing their filter symbol', () => {
    const context = {
        principle: tag => principles[tag],
        selectedTags: new Set(),
        escapeHtml: value => String(value)
    };
    vm.createContext(context);
    const start = html.indexOf('function principleButton(');
    const end = html.indexOf('function sessionBadges(', start);
    vm.runInContext(html.slice(start, end), context);
    for (const options of [{}, {count: 10, prospective: true, className: 'tag-button'}]) {
        const button = context.principleButton('Wv', options);
        assert.ok(button.includes('Wv (Result-Preserving Work Avoidance)'));
        assert.ok(button.includes('data-tag="Wv"'));
        assert.ok(button.includes('aria-pressed="false"'));
    }
    context.selectedTags.add('Wv');
    const selected = context.principleLabels(['Wv']);
    assert.ok(selected.includes('aria-pressed="true"'));
    assert.ok(selected.includes('Remove filter: Wv (Result-Preserving Work Avoidance)'));
});

test('browser URL handling accepts Rc and Rw without duplicate selection', () => {
    const context = {
        URLSearchParams,
        window: {location: {search: '?tags=Rc,Rw,Qr,Rv,Rs&conf=VLDB+2023'}},
        document: {getElementById: () => null},
        selectedTags: new Set()
    };
    vm.createContext(context);
    vm.runInContext(read('assets/principle-tags.js'), context);
    const start = html.indexOf('function loadUrlState()');
    const end = html.indexOf('function toggleTag(', start);
    vm.runInContext(registrySource + '\n' + html.slice(start, end) + '\nloadUrlState();', context);
    assert.deepEqual([...context.selectedTags], ['Rw', 'Qr', 'Rv', 'Rs']);
});

test('published cards use canonical labels and registered symbols', () => {
    const data = JSON.parse(read('examples/vldb23-osdi23-crossref/paper-cards.json'));
    assert.deepEqual(normalizeData(data), data);
    for (const paper of data.papers) {
        for (const tag of paper.tags) assert.ok(principles[tag], tag);
    }
    for (const card of Object.values(data.cards_by_id)) {
        for (const tag of [
            ...(card.core_principle_tags || []), ...(card.supporting_principle_tags || []),
            ...(card.similarity_principle_tags || []), ...Object.keys(card.usagesByTag || {})
        ]) assert.ok(principles[tag], tag);
    }
});

test('builder accepts legacy cards and new principles without editing the sources', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'principle-build-test-'));
    try {
        const summaries = path.join(temp, 'fixture', 'summaries');
        fs.mkdirSync(summaries, {recursive: true});
        const summary = {
            section_0_paper_identification: {paper_title: 'Synthetic migration test', paper_number: '1'},
            section_5_principle_mapping_minimum_set: [{principles: [
                {symbol: 'Rc', name: 'Reuse of Computation'},
                {symbol: 'Qr', name: 'Quality Relaxation'},
                {symbol: 'Rv', name: 'Resource Virtualization'},
                {symbol: 'Rs', name: 'Resource Substitution'}
            ]}],
            section_7_compound_equation: {
                core_principle_tags: ['Rc', 'Qr', 'Rv', 'Rs'], equation: 'Baseline + Rc + Qr + Rv + Rs -> Fixture'
            }
        };
        const sourceText = JSON.stringify(summary);
        const input = path.join(summaries, '1.json');
        fs.writeFileSync(input, sourceText);
        const output = path.join(temp, 'output.json');
        execFileSync(process.execPath, [path.join(root, 'examples/vldb23-osdi23-crossref/build-paper-cards.js')], {
            env: {...process.env, PAPER_CARD_SUMMARY_DIRS: summaries, PAPER_CARD_OUTPUT_PATH: output}
        });
        const data = JSON.parse(fs.readFileSync(output, 'utf8'));
        assert.equal(data.paper_count, 1);
        assert.deepEqual(data.papers[0].tags, ['Rw', 'Qr', 'Rv', 'Rs']);
        const card = data.cards_by_id['fixture-1'];
        assert.equal(card.equation, 'Baseline + Rw + Qr + Rv + Rs -> Fixture');
        assert.deepEqual(card.similarity_principle_tags, ['Qr', 'Rs', 'Rv', 'Rw']);
        assert.equal(card.usagesByTag.Rw[0].name, 'Reuse of Prior Work');
        assert.equal(fs.readFileSync(input, 'utf8'), sourceText);
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
});
