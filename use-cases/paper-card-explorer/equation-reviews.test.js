const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {reviews, apply} = require('./equation-reviews');
const root = process.env.PAPER_EXPLORER_ROOT || path.resolve(__dirname, '../..');
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'examples/vldb23-osdi23-crossref/paper-cards.json')));

test('reviewed equations have a mechanism, source evidence, and a note for every core principle', () => {
    for (const [id, review] of Object.entries(reviews)) {
        assert.ok(corpus.cards_by_id[id], id);
        assert.ok(review.baseline && review.system && review.mechanism && review.composition, id);
        assert.ok(review.properties.length >= 1 && review.evidence.length >= 3, id);
        assert.match(review.sourceUrl, /^https:\/\//);
        assert.equal(new Set(review.tags).size, review.tags.length, id);
        for (const tag of review.tags) assert.ok(review.principleNotes[tag], id + ' ' + tag);
        for (const e of review.evidence) {
            assert.ok(e.label && e.text && e.reference, id);
            if (e.page !== undefined) assert.ok(Number.isInteger(e.page) && e.page > 0, id);
        }
    }
});

test('equation corrections stay consistent with filters, detailed mappings, and similarity', () => {
    const result = apply(structuredClone(corpus));
    for (const [id, review] of Object.entries(reviews)) {
        const card = result.cards_by_id[id];
        const paper = result.papers.find(p => p.paper_id === id);
        for (const [field, value] of Object.entries(review.cardUpdates || {})) {
            assert.deepEqual(card[field], value, id + ' ' + field);
        }
        assert.deepEqual(card.core_principle_tags, review.tags);
        assert.deepEqual(card.similarity_principle_tags, [...review.tags].sort());
        for (const tag of review.tags) {
            assert.ok(paper.tags.includes(tag), id + ' ' + tag);
            assert.equal(card.usagesByTag[tag][0].core_or_supporting, 'core');
        }
        for (const tag of review.removedTags || []) {
            assert.ok(!paper.tags.includes(tag), id + ' ' + tag);
            assert.ok(!card.usagesByTag[tag], id + ' ' + tag);
        }
    }
    assert.deepEqual(apply(structuredClone(result)), result);
    for (const [id, card] of Object.entries(corpus.cards_by_id)) {
        if (!reviews[id]) assert.deepEqual(result.cards_by_id[id], card, id);
    }
    assert.equal(result.papers.length, corpus.papers.length);
});
