#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const KNOWN_TAGS = new Set([
    'Si', 'Mo', 'Co', 'Ex', 'Pm', 'Gr', 'Pd',
    'Sc', 'Rc', 'Wv', 'Cc', 'Bo', 'Ha', 'Op', 'La',
    'Al', 'Lu', 'Se', 'Fs', 'Ig',
    'Lt', 'Dc', 'Fp', 'Lo', 'Cz',
    'Ep', 'Cm', 'Cp', 'Gd', 'Bb', 'Ah',
    'Ad', 'Ec', 'Wa', 'Au', 'Ho', 'Ev',
    'Ft', 'Is', 'At', 'Cr',
    'Sy', 'Ac', 'Lp', 'Tq', 'Cf', 'Sa'
]);

const summariesDir = process.env.PAPER_CARD_SUMMARIES_DIR ||
    path.resolve(__dirname, '..', '..', '..', ['Gemi', 'ni'].join(''), 'summaries');
const outputPath = path.resolve(__dirname, 'vldb-paper-cards.json');

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function firstString(values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function uniqueTags(values) {
    const tags = [];
    for (const value of values.flat()) {
        if (!value) continue;
        const tag = String(value).trim();
        if (KNOWN_TAGS.has(tag) && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

function sanitizePointer(value) {
    if (!value) return '';
    let text = String(value).trim();
    if (!text) return '';

    text = text.replace(/\[([^\]]*)\]/g, function(match, inner) {
        const pieces = [];
        const patterns = [
            /\bp\.?\s*\d+(?:\s*[-–]\s*\d+)?/gi,
            /\bSection\s+\d+(?:\.\d+)*/gi,
            /\bFigure\s+\d+/gi,
            /\bTable\s+\d+/gi,
            /\bAlgorithm\s+\d+/gi,
            /\bLine\s+\d+/gi,
            /\bProposition\s+[\d.]+/gi,
            /\bTheorem\s+[\d.]+/gi,
            /\bDefinition\s+[\d.]+/gi,
            /\bLemma\s+[\d.]+/gi,
            /\bAppendix\s+[A-Z0-9.]+/gi,
            /\bAbstract\b/gi,
            /\bIntroduction\b/gi
        ];
        for (const pattern of patterns) {
            const matches = inner.match(pattern) || [];
            for (const found of matches) {
                const piece = found.replace(/\s+/g, ' ').trim();
                if (!pieces.includes(piece)) pieces.push(piece);
            }
        }
        if (pieces.length) return '[' + pieces.join(', ') + ']';

        let cleaned = inner
            .replace(/(['"]).*?\1/g, '')
            .replace(/\bquote\s*:.*/gi, '')
            .replace(/['"].*/g, '')
            .replace(/,\s*$/g, '')
            .trim();
        return cleaned ? '[' + cleaned + ']' : '';
    });
    text = text.replace(/\]\s*:\s*.*$/g, ']');
    if (/^\s*p\.?\s*\d+/i.test(text) && text.indexOf(':') !== -1) {
        text = text.slice(0, text.indexOf(':'));
    }
    return text.replace(/\s+/g, ' ').trim();
}

function normalizePointers(items) {
    return asArray(items).map(function(item) {
        return {
            ...item,
            pointer: sanitizePointer(item.pointer)
        };
    });
}

function compositionRationale(section7) {
    const rationale = section7 && section7.principle_composition_rationale;
    if (!rationale) return '';
    if (typeof rationale === 'string') return rationale;
    return firstString([
        rationale.why_these_principles_work_together,
        rationale.summary,
        rationale.rationale
    ]);
}

function principleEntries(summary) {
    const entries = [];
    for (const delta of asArray(summary.section_5_principle_mapping_minimum_set)) {
        for (const principle of asArray(delta.principles)) {
            if (!KNOWN_TAGS.has(principle.symbol)) continue;
            entries.push({
                delta_id: principle.delta_id || delta.delta_id || '',
                symbol: principle.symbol,
                name: principle.name || '',
                core_or_supporting: principle.core_or_supporting || '',
                evidence_strength: principle.evidence_strength || '',
                mechanism_trigger: principle.mechanism_trigger || '',
                why_it_applies: principle.why_it_applies || '',
                pointer: sanitizePointer(principle.pointer)
            });
        }
    }
    return entries;
}

function tagsForSummary(summary, entries) {
    const section7 = summary.section_7_compound_equation || {};
    const normalized = summary.section_11_normalized_summary || {};
    return uniqueTags([
        section7.all_principle_tags_for_deltas,
        section7.top_3_principle_tags,
        section7.core_principle_tags,
        section7.supporting_principle_tags,
        normalized.top_3_principles,
        entries.map(function(entry) { return entry.symbol; })
    ]);
}

function buildCard(summary, fileNumber) {
    const identification = summary.section_0_paper_identification || {};
    const goal = summary.section_1_goal_and_primary_metric || {};
    const baseline = summary.section_2_comparison_baseline || {};
    const tooling = summary.section_3_primary_mechanism_tooling_classification || {};
    const deltas = asArray(summary.section_4_key_deltas_vs_baseline);
    const section7 = summary.section_7_compound_equation || {};
    const normalized = summary.section_11_normalized_summary || {};
    const entries = principleEntries(summary);
    const usagesByTag = {};

    for (const entry of entries) {
        if (!usagesByTag[entry.symbol]) usagesByTag[entry.symbol] = [];
        usagesByTag[entry.symbol].push({
            delta_id: entry.delta_id,
            name: entry.name,
            core_or_supporting: entry.core_or_supporting,
            evidence_strength: entry.evidence_strength,
            mechanism_trigger: entry.mechanism_trigger,
            why_it_applies: entry.why_it_applies,
            pointer: entry.pointer
        });
    }

    return {
        paper_number: identification.paper_number || String(fileNumber),
        gemini_title: identification.paper_title || '',
        authors: asArray(identification.authors),
        venue_or_source: identification.venue_or_source || '',
        system_or_method_name: identification.system_or_method_name || section7.new_system_name || '',
        problem_domain: identification.problem_domain || '',
        goal: goal.goal || '',
        primary_optimized_metric: goal.primary_optimized_metric || '',
        secondary_metrics: asArray(goal.secondary_metrics),
        concrete_numbers: normalizePointers(goal.concrete_numbers),
        baseline_name: baseline.baseline_name || section7.baseline_name || '',
        limiting_design_assumption: baseline.limiting_design_assumption || '',
        primary_tool_specific_type: tooling.primary_tool_specific_type || tooling.primary_tool_category || '',
        state_or_ir: tooling.state_or_ir || '',
        output: tooling.output || '',
        equation: section7.equation || '',
        core_principle_tags: uniqueTags([section7.core_principle_tags, normalized.top_3_principles]),
        supporting_principle_tags: uniqueTags([section7.supporting_principle_tags]),
        principle_composition_rationale: compositionRationale(section7),
        one_sentence_mechanism: normalized.one_sentence_mechanism || '',
        mechanism_family: normalized.mechanism_family || '',
        primary_design_archetype: normalized.primary_design_archetype || '',
        principle_mapping_confidence: normalized.principle_mapping_confidence || '',
        key_deltas: deltas.map(function(delta) {
            return {
                delta_id: delta.delta_id || '',
                summary: delta.summary || '',
                primary_metric_improved: delta.primary_metric_improved || '',
                tradeoffs_or_costs: delta.tradeoffs_or_costs || ''
            };
        }),
        usagesByTag
    };
}

if (!fs.existsSync(summariesDir)) {
    throw new Error('Paper card summaries directory not found: ' + summariesDir);
}

const files = fs.readdirSync(summariesDir)
    .filter(function(file) { return /^\d+\.json$/.test(file); })
    .sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });

const cards = {};
const cardTitlesByNumber = {};
const papers = [];

for (const file of files) {
    const fileNumber = parseInt(file, 10);
    const summary = JSON.parse(fs.readFileSync(path.join(summariesDir, file), 'utf8'));
    const identification = summary.section_0_paper_identification || {};
    const title = identification.paper_title || '';
    const entries = principleEntries(summary);
    const tags = tagsForSummary(summary, entries);
    const card = buildCard(summary, fileNumber);

    if (!title || tags.length === 0) continue;

    cards[title] = card;
    cardTitlesByNumber[card.paper_number] = title;
    papers.push({
        title,
        conference: 'VLDB 2023',
        tags,
        paper_number: card.paper_number
    });
}

const output = {
    generated_from: 'paper card summaries',
    scope: 'VLDB 2023 papers with paper cards',
    matched_vldb_papers: papers.length,
    total_vldb_papers_in_explorer: papers.length,
    papers,
    cards,
    card_titles_by_number: cardTitlesByNumber
};

fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({
    output: outputPath,
    papers: papers.length,
    cards: Object.keys(cards).length,
    bytes: fs.statSync(outputPath).size
}, null, 2));
