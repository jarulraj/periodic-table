#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAMES = Object.freeze({
    Rw: 'Reuse of Prior Work', Qr: 'Quality Relaxation',
    Rv: 'Resource Virtualization', Rs: 'Resource Substitution'
});
const GUARDED_FIELDS = [
    'paper_id', 'paper_title', 'authors', 'system_or_method_name', 'problem_domain',
    'goal', 'primary_optimized_metric', 'secondary_metrics', 'concrete_numbers',
    'baseline_name', 'limiting_design_assumption', 'primary_tool_specific_type',
    'state_or_ir', 'output', 'equation', 'core_principle_tags',
    'supporting_principle_tags', 'principle_composition_rationale',
    'one_sentence_mechanism', 'mechanism_family', 'primary_design_archetype',
    'principle_mapping_confidence', 'key_deltas', 'physical_properties', 'usagesByTag'
];

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    }
    return value;
}

function fingerprint(card) {
    const content = Object.fromEntries(GUARDED_FIELDS.filter(k => Object.hasOwn(card, k)).map(k => [k, card[k]]));
    return crypto.createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}

function appendTerms(equation, tags) {
    if (!tags.length) return equation;
    const arrows = [...String(equation).matchAll(/--?>|\u2192|\\rightarrow|=>/g)];
    if (arrows.length !== 1) throw new Error('Expected one equation arrow; review before editing');
    const arrow = arrows[0];
    const left = equation.slice(0, arrow.index).trimEnd();
    const right = equation.slice(arrow.index + arrow[0].length).trimStart();
    if (!left.trim() || !right) throw new Error('Incomplete design equation');
    return left + ' + ' + tags.join(' + ') + ' ' + arrow[0] + ' ' + right;
}

function extendCard(card, additions) {
    const result = structuredClone(card);
    const seen = new Set([
        ...(card.core_principle_tags || []), ...(card.supporting_principle_tags || []),
        ...Object.keys(card.usagesByTag || {})
    ]);
    const core = [];
    for (const addition of additions) {
        const {tag, role, explanation, sections} = addition;
        if (!Object.hasOwn(NAMES, tag) || !['core', 'supporting'].includes(role)) throw new Error('Invalid addition');
        if (seen.has(tag) || new RegExp('\\b' + tag + '\\b').test(card.equation)) throw new Error('Cannot replace an existing mapping: ' + tag);
        if (!explanation || !Array.isArray(sections) || !sections.length) throw new Error('Missing explanation or source pointer');
        seen.add(tag);
        const field = role === 'core' ? 'core_principle_tags' : 'supporting_principle_tags';
        result[field] = [...(result[field] || []), tag];
        result.usagesByTag ||= {};
        result.usagesByTag[tag] = [{
            delta_id: '', mapping_scope: 'paper', name: NAMES[tag],
            core_or_supporting: role, evidence_strength: 'source-checked',
            mechanism_trigger: '', why_it_applies: explanation,
            pointer: sections.join('; '),
            review_provenance: '2026-10-19 additive source review; not author endorsement'
        }];
        if (role === 'core') core.push(tag);
    }
    result.equation = appendTerms(card.equation, core);
    if (core.length) {
        result.similarity_principle_tags = [...new Set([...(card.similarity_principle_tags || card.core_principle_tags || []), ...core])].sort();
        result.similarity_principle_source = 'equation_core';
    }
    return result;
}

function loadReview(filename = path.resolve(__dirname, '../../paper-card-data/principle-additions.json')) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function applyAdditions(data, review = loadReview(), sourceIds = null) {
    if (review.schema_version !== 1 || !Array.isArray(review.entries)) throw new Error('Unsupported additions manifest');
    const result = structuredClone(data);
    const papers = new Map(result.papers.map(p => [p.paper_id, p]));
    const ids = new Set();
    const selected = card => !sourceIds || sourceIds.has(card.source_id);
    for (const [id, hash] of Object.entries(review.protected_cards || {})) {
        const card = result.cards_by_id[id];
        if (card && selected(card) && fingerprint(card) !== hash) throw new Error('Protected author/curated card changed: ' + id);
    }
    // Compare both states so reruns are no-ops, while later curation fails closed.
    for (const entry of review.entries) {
        const id = entry.paper_id;
        if (ids.has(id)) throw new Error('Duplicate review entry: ' + id);
        ids.add(id);
        if (Object.hasOwn(review.protected_cards || {}, id)) throw new Error('Addition targets protected card: ' + id);
        const card = result.cards_by_id[id];
        if (!card) {
            if (sourceIds && !sourceIds.has(entry.source_id)) continue;
            throw new Error('Reviewed card missing: ' + id);
        }
        if (!selected(card)) continue;
        if (!entry.additions.length || !/^[a-f0-9]{64}$/.test(entry.after_sha256)) throw new Error('Incomplete review entry: ' + id);
        const current = fingerprint(card);
        if (current !== entry.before_sha256 && current !== entry.after_sha256) throw new Error('Card changed since review: ' + id);
        if (current === entry.before_sha256) {
            result.cards_by_id[id] = extendCard(card, entry.additions);
            if (fingerprint(result.cards_by_id[id]) !== entry.after_sha256) throw new Error('Unexpected revision: ' + id);
        }
        const paper = papers.get(id);
        if (!paper) throw new Error('Search index entry missing: ' + id);
        for (const addition of entry.additions) {
            if (!paper.tags.includes(addition.tag)) paper.tags.push(addition.tag);
        }
    }
    return result;
}

function writeAtomic(filename, data) {
    const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    try {
        fs.writeFileSync(temporary, JSON.stringify(data), {flag: 'wx'});
        fs.renameSync(temporary, filename);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

if (require.main === module) {
    const [mode, filename] = process.argv.slice(2);
    if (mode !== '--apply' || !filename) throw new Error('Usage: principle-additions.js --apply paper-cards.json');
    const original = JSON.parse(fs.readFileSync(filename, 'utf8'));
    writeAtomic(filename, applyAdditions(original));
}

module.exports = {NAMES, fingerprint, extendCard, appendTerms, loadReview, applyAdditions, writeAtomic};
