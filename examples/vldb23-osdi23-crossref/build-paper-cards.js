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
    'Sy', 'Ac', 'Lp', 'Tq', 'Cf', 'Sa', 'Un', 'Ls'
]);

const PUBLISHED_SOURCES = {
    osdi23: {
        collection: 'OSDI 2023',
        collectionType: 'conference',
        order: 1
    },
    vldb2023: {
        collection: 'VLDB 2023',
        collectionType: 'conference',
        order: 2
    },
    cs764: {
        collection: 'CS 764 Reading List',
        collectionType: 'reading-list',
        sourceUrl: 'https://pages.cs.wisc.edu/~jignesh/cs764/',
        order: 3
    }
};

const outputPath = path.resolve(__dirname, 'paper-cards.json');

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

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeYear(value) {
    const year = String(value || '');
    if (year.length === 2) return '20' + year;
    return year;
}

function displayNameFromSource(sourceName) {
    const normalized = sourceName.replace(/[_-]+/g, ' ');
    const match = normalized.match(/^([a-z]+)\s*(\d{2,4})$/i);
    if (match) return match[1].toUpperCase() + ' ' + normalizeYear(match[2]);
    return normalized.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); });
}

function sourceMetadata(sourceName) {
    const id = slugify(sourceName);
    const configured = PUBLISHED_SOURCES[id] || {};
    return {
        id,
        name: sourceName,
        collection: configured.collection || displayNameFromSource(sourceName),
        collectionType: configured.collectionType || 'collection',
        sourceUrl: configured.sourceUrl || '',
        order: configured.order || 999
    };
}

function candidateDataRoots() {
    const roots = [];
    const repoRoot = path.resolve(__dirname, '..', '..');
    if (process.env.PAPER_CARD_DATA_ROOT) roots.push(path.resolve(process.env.PAPER_CARD_DATA_ROOT));
    roots.push(path.join(repoRoot, 'paper-card-data'));
    const workspaceParent = path.dirname(repoRoot);
    if (fs.existsSync(workspaceParent)) {
        const entries = fs.readdirSync(workspaceParent, { withFileTypes: true })
            .filter(function(entry) { return entry.isDirectory(); })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });
        for (const entry of entries) {
            roots.push(path.join(workspaceParent, entry.name, 'data'));
        }
    }
    return roots;
}

function discoverSources() {
    if (process.env.PAPER_CARD_SUMMARY_DIRS) {
        return process.env.PAPER_CARD_SUMMARY_DIRS
            .split(path.delimiter)
            .map(function(summaryDir) {
                const resolved = path.resolve(summaryDir);
                const sourceName = path.basename(path.dirname(resolved));
                return {
                    ...sourceMetadata(sourceName),
                    summaryDir: resolved
                };
            });
    }

    for (const root of candidateDataRoots()) {
        if (!fs.existsSync(root)) continue;
        const sources = fs.readdirSync(root, { withFileTypes: true })
            .filter(function(entry) { return entry.isDirectory(); })
            .filter(function(entry) { return Boolean(PUBLISHED_SOURCES[slugify(entry.name)]); })
            .map(function(entry) {
                return {
                    ...sourceMetadata(entry.name),
                    summaryDir: path.join(root, entry.name, 'summaries')
                };
            })
            .filter(function(source) { return fs.existsSync(source.summaryDir); })
            .sort(function(a, b) { return a.order - b.order || a.collection.localeCompare(b.collection); });

        if (sources.length) return sources;
    }

    return [];
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }

    if (field || row.length) {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
    }
    return rows;
}

function readPaperManifest(summaryDir) {
    const manifestPath = path.join(path.dirname(summaryDir), 'papers.csv');
    if (!fs.existsSync(manifestPath)) return {};
    const rows = parseCsv(fs.readFileSync(manifestPath, 'utf8'));
    const headers = rows.shift() || [];
    const byNumber = {};

    for (const values of rows) {
        const entry = {};
        headers.forEach(function(header, index) {
            entry[header] = values[index] || '';
        });
        if (entry.index) byNumber[String(parseInt(entry.index, 10))] = entry;
    }
    return byNumber;
}

function publicationYear(value) {
    const match = String(value || '').match(/\b(?:19|20)\d{2}\b/);
    return match ? match[0] : '';
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

function buildCard(summary, fileNumber, source, paperId, paperLabel, manifestEntry) {
    const identification = summary.section_0_paper_identification || {};
    const goal = summary.section_1_goal_and_primary_metric || {};
    const baseline = summary.section_2_comparison_baseline || {};
    const tooling = summary.section_3_primary_mechanism_tooling_classification || {};
    const deltas = asArray(summary.section_4_key_deltas_vs_baseline);
    const section7 = summary.section_7_compound_equation || {};
    const normalized = summary.section_11_normalized_summary || {};
    const properties = asArray(summary.section_8_physical_properties_summary);
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
        paper_id: paperId,
        paper_label: paperLabel,
        paper_number: identification.paper_number || String(fileNumber),
        paper_title: identification.paper_title || '',
        collection: source.collection,
        collection_type: source.collectionType,
        conference: source.collection,
        source_id: source.id,
        source_url: source.sourceUrl,
        paper_url: firstString([
            manifestEntry && manifestEntry.pdf_url,
            manifestEntry && manifestEntry.url,
            manifestEntry && manifestEntry.presentation_url
        ]),
        authors: asArray(identification.authors),
        venue_or_source: identification.venue_or_source || '',
        publication_year: publicationYear(identification.year),
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
        physical_properties: properties.map(function(property) {
            return {
                property: property.property || '',
                direction: property.direction || '',
                concrete_number: property.concrete_number || '',
                pointer: sanitizePointer(property.pointer)
            };
        }),
        usagesByTag
    };
}

const sources = discoverSources();
if (sources.length === 0) {
    throw new Error('No paper card summary folders found. Set PAPER_CARD_DATA_ROOT or PAPER_CARD_SUMMARY_DIRS.');
}

const cardsById = {};
const cardIdsByTitle = {};
const collectionCounts = {};
const papers = [];
const sourceSummaries = [];

for (const source of sources) {
    const manifestByNumber = readPaperManifest(source.summaryDir);
    const files = fs.readdirSync(source.summaryDir)
        .filter(function(file) { return /^\d+\.json$/.test(file); })
        .sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });

    let sourceCount = 0;

    for (const file of files) {
        const fileNumber = parseInt(file, 10);
        const summary = JSON.parse(fs.readFileSync(path.join(source.summaryDir, file), 'utf8'));
        const identification = summary.section_0_paper_identification || {};
        const title = identification.paper_title || '';
        const entries = principleEntries(summary);
        const tags = tagsForSummary(summary, entries);
        const paperNumber = identification.paper_number || String(fileNumber);
        const paperId = source.id + '-' + (slugify(paperNumber) || fileNumber);
        const paperLabel = source.collection + ' #' + paperNumber;
        const manifestEntry = manifestByNumber[String(parseInt(paperNumber, 10))] || {};

        if (!title || tags.length === 0) continue;

        const card = buildCard(summary, fileNumber, source, paperId, paperLabel, manifestEntry);
        cardsById[paperId] = card;
        cardIdsByTitle[title] = paperId;
        papers.push({
            title,
            collection: source.collection,
            conference: source.collection,
            source_id: source.id,
            paper_id: paperId,
            paper_number: card.paper_number,
            paper_label: paperLabel,
            publication_year: card.publication_year,
            tags
        });
        collectionCounts[source.collection] = (collectionCounts[source.collection] || 0) + 1;
        sourceCount += 1;
    }

    sourceSummaries.push({
        id: source.id,
        name: source.name,
        collection: source.collection,
        collection_type: source.collectionType,
        source_url: source.sourceUrl,
        conference: source.collection,
        paper_count: sourceCount
    });
}

papers.sort(function(a, b) {
    return a.collection.localeCompare(b.collection) || Number(a.paper_number) - Number(b.paper_number) || a.title.localeCompare(b.title);
});

const output = {
    generated_from: 'paper card summary folders',
    scope: 'Papers with paper cards',
    paper_count: papers.length,
    card_count: Object.keys(cardsById).length,
    collection_counts: collectionCounts,
    conference_counts: collectionCounts,
    sources: sourceSummaries,
    papers,
    cards_by_id: cardsById,
    card_ids_by_title: cardIdsByTitle
};

fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({
    output: outputPath,
    papers: papers.length,
    cards: Object.keys(cardsById).length,
    collections: collectionCounts,
    bytes: fs.statSync(outputPath).size
}, null, 2));
