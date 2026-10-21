const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fingerprint, extendCard, appendTerms, applyAdditions, loadReview} = require('./principle-additions');
const {filter} = require('../../use-cases/paper-card-explorer/filters');
const published = JSON.parse(fs.readFileSync(path.join(__dirname, 'paper-cards.json')));

function fixture() {
    const card = {
        paper_id: 'fixture-1', source_id: 'fixture', paper_title: 'Example',
        baseline_name: 'Baseline', limiting_design_assumption: 'Author wording',
        equation: 'Baseline + Ad -> System', core_principle_tags: ['Ad'],
        supporting_principle_tags: ['Se'], key_deltas: [{delta_id: 'D1', summary: 'Original delta'}],
        principle_composition_rationale: 'Author-approved explanation.',
        usagesByTag: {Ad: [{why_it_applies: 'Preserve this correction.'}]},
        similarity_principle_tags: ['Ad'], similarity_principle_source: 'equation_core'
    };
    const additions = [
        {tag: 'Rs', role: 'core', explanation: 'More memory replaces lookup work.', sections: ['3.2 Layout']},
        {tag: 'Rw', role: 'supporting', explanation: 'Reuse a saved result.', sections: ['4 Cache']}
    ];
    const data = {cards_by_id: {'fixture-1': card}, papers: [{paper_id: 'fixture-1', tags: ['Ad', 'Se']}]};
    const review = {schema_version: 1, protected_cards: {}, entries: [{
        paper_id: card.paper_id, source_id: card.source_id, before_sha256: fingerprint(card),
        after_sha256: fingerprint(extendCard(card, additions)), additions
    }]};
    return {data, review};
}

test('additions preserve prior text and roles; only core additions extend the equation', () => {
    const {data, review} = fixture();
    const original = structuredClone(data);
    const result = applyAdditions(data, review);
    const card = result.cards_by_id['fixture-1'];
    assert.deepEqual(data, original);
    assert.equal(card.equation, 'Baseline + Ad + Rs -> System');
    assert.deepEqual(card.core_principle_tags, ['Ad', 'Rs']);
    assert.deepEqual(card.supporting_principle_tags, ['Se', 'Rw']);
    assert.deepEqual(card.similarity_principle_tags, ['Ad', 'Rs']);
    assert.deepEqual(result.papers[0].tags, ['Ad', 'Se', 'Rs', 'Rw']);
    for (const field of ['baseline_name', 'limiting_design_assumption', 'key_deltas', 'principle_composition_rationale']) {
        assert.deepEqual(card[field], original.cards_by_id['fixture-1'][field]);
    }
    assert.deepEqual(card.usagesByTag.Ad, original.cards_by_id['fixture-1'].usagesByTag.Ad);
    assert.equal(card.usagesByTag.Rw[0].delta_id, '');
    assert.equal(card.usagesByTag.Rw[0].mapping_scope, 'paper');
});

test('application is idempotent and repairs a missing derived search tag', () => {
    const {data, review} = fixture();
    const once = applyAdditions(data, review);
    assert.deepEqual(applyAdditions(once, review), once);
    once.papers[0].tags = once.papers[0].tags.filter(t => t !== 'Rs');
    assert.ok(applyAdditions(once, review).papers[0].tags.includes('Rs'));
});

test('later curation and edits to an applied explanation fail closed', () => {
    const {data, review} = fixture();
    data.cards_by_id['fixture-1'].baseline_name = 'New author correction';
    assert.throws(() => applyAdditions(data, review), /changed since review/);
    const fresh = fixture();
    const result = applyAdditions(fresh.data, fresh.review);
    result.cards_by_id['fixture-1'].usagesByTag.Rw[0].why_it_applies = 'Another correction';
    assert.throws(() => applyAdditions(result, fresh.review), /changed since review/);
});

test('protected cards cannot be extended or replaced', () => {
    const {data, review} = fixture();
    review.protected_cards['fixture-1'] = fingerprint(data.cards_by_id['fixture-1']);
    assert.throws(() => applyAdditions(data, review), /targets protected/);
    review.entries = [];
    data.cards_by_id['fixture-1'].equation = 'Changed';
    assert.throws(() => applyAdditions(data, review), /Protected author/);
});

test('invalid tags, changed roles, duplicate entries and missing cards are rejected', () => {
    const {data, review} = fixture();
    for (const addition of [
        {tag: 'Ad', role: 'supporting'}, {tag: 'Rc', role: 'core'}, {tag: 'Rs', role: 'inherited'}
    ]) {
        assert.throws(() => extendCard(data.cards_by_id['fixture-1'], [{...addition, explanation: 'x', sections: ['1']}]));
    }
    review.entries.push(review.entries[0]);
    assert.throws(() => applyAdditions(data, review), /Duplicate/);
    review.entries.pop();
    delete data.cards_by_id['fixture-1'];
    assert.throws(() => applyAdditions(data, review), /missing/);
});

test('partial builds do not reapply additions to retained collections', () => {
    const {data, review} = fixture();
    data.cards_by_id['fixture-1'].goal = 'Later curation in an unrelated collection';
    assert.deepEqual(applyAdditions(data, review, new Set(['other'])), data);
});

test('equation parsing preserves supported arrows and rejects ambiguous equations', () => {
    for (const arrow of ['->', '-->', '\u2192', '\\rightarrow', '=>']) {
        assert.equal(appendTerms('Base + Ad ' + arrow + ' Result', ['Rs']), 'Base + Ad + Rs ' + arrow + ' Result');
    }
    assert.throws(() => appendTerms('No equation', ['Rs']), /arrow/);
    assert.throws(() => appendTerms('A -> B -> C', ['Rs']), /arrow/);
});

test('published additions have source pointers and reproduce their recorded before/after states', () => {
    const review = loadReview();
    assert.equal(published.card_count, 396);
    assert.deepEqual(applyAdditions(published, review), published);
    let additions = 0;
    for (const entry of review.entries) {
        const card = published.cards_by_id[entry.paper_id];
        const base = structuredClone(card);
        base.equation = entry.base_equation;
        for (const a of entry.additions) {
            additions++;
            assert.ok(a.sections.length && a.source_passages.length && a.paper_url);
            assert.equal(card.usagesByTag[a.tag][0].why_it_applies, a.explanation);
            base.core_principle_tags = base.core_principle_tags.filter(t => t !== a.tag);
            base.supporting_principle_tags = base.supporting_principle_tags.filter(t => t !== a.tag);
            delete base.usagesByTag[a.tag];
            const paper = published.papers.find(p => p.paper_id === entry.paper_id);
            assert.ok(paper.tags.includes(a.tag));
        }
        assert.equal(fingerprint(base), entry.before_sha256, entry.paper_id);
        assert.equal(fingerprint(card), entry.after_sha256, entry.paper_id);
    }
    assert.equal(additions, 95);
    for (const [id, hash] of Object.entries(review.protected_cards)) assert.equal(fingerprint(published.cards_by_id[id]), hash);
    for (const [id, tag] of [['cs764-6', 'Rw'], ['vldb2023-77', 'Qr'], ['osdi23-51', 'Rv'], ['cs764-8', 'Rs']]) {
        assert.equal(published.cards_by_id[id].usagesByTag[tag], undefined);
    }
});

test('VIVA curation keeps quality relaxation supporting and preserves its core signature', () => {
    const card = published.cards_by_id['vldb2023-74'];
    assert.equal(card.equation, 'Black-Box UDF Optimization + Se + Ah + Cm -> VIVA');
    assert.deepEqual(card.core_principle_tags, ['Se', 'Ah', 'Cm']);
    assert.deepEqual(card.similarity_principle_tags, ['Ah', 'Cm', 'Se']);
    assert.deepEqual(card.supporting_principle_tags, ['Ex', 'Qr']);
    assert.equal(card.usagesByTag.Ep, undefined);
    assert.equal(card.usagesByTag.Qr[0].core_or_supporting, 'supporting');
    assert.match(card.usagesByTag.Qr[0].pointer, /Section 5\.4/);
    assert.match(card.usagesByTag.Qr[0].pointer, /Section 7\.4/);
    assert.match(card.output, /estimated F1.*canary.*original plan/);
    assert.match(card.key_deltas[0].tradeoffs_or_costs, /Without hints.*predicate reorderings/);
    const paper = published.papers.find(p => p.paper_id === card.paper_id);
    assert.deepEqual(paper.tags, ['Se', 'Ah', 'Ex', 'Qr', 'Cm']);
    const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../../reviewer-data/paper-cards.json')));
    assert.deepEqual(snapshot.find(c => c.paper_id === card.paper_id), card);
    assert.equal(fingerprint(card), loadReview().protected_cards[card.paper_id]);
});
