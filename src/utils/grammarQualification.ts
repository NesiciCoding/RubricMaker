import type { TFunction } from 'i18next';
import type { LinkedFrameworkDescriptor } from '../types';
import { detectGrammar } from './grammarChecker';
import { getGrammarItemById } from '../data/grammarStandards';

export const DEMONSTRATED_THRESHOLD = 1;

export interface GrammarItemResult {
    descriptorId: string;
    descriptionEn: string;
    descriptionNl: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    autoDetectable: boolean;
    found: boolean;
    occurrences: number;
}

export interface GrammarQualificationResult {
    items: GrammarItemResult[];
    autoDetectableCount: number;
    foundCount: number;
    /** True when every auto-detectable linked structure was demonstrated. */
    passed: boolean;
}

type DescLang = 'en' | 'nl';

export function evaluateGrammar(linked: LinkedFrameworkDescriptor[], text: string): GrammarQualificationResult {
    const grammar = linked.filter((d) => d.framework === 'grammar');

    const shorthands = grammar
        .map((d) => getGrammarItemById(d.descriptorId)?.detectShorthand)
        .filter((s): s is string => !!s);
    const counts = detectGrammar(text, shorthands);

    const items: GrammarItemResult[] = grammar.map((d) => {
        const item = getGrammarItemById(d.descriptorId);
        const shorthand = item?.detectShorthand;
        const occurrences = shorthand ? (counts[shorthand] ?? 0) : 0;
        return {
            descriptorId: d.descriptorId,
            descriptionEn: d.descriptionEn,
            descriptionNl: d.descriptionNl,
            categoryLabelEn: d.categoryLabelEn,
            categoryLabelNl: d.categoryLabelNl,
            autoDetectable: !!shorthand,
            found: !!shorthand && occurrences >= DEMONSTRATED_THRESHOLD,
            occurrences,
        };
    });

    const autoDetectableCount = items.filter((i) => i.autoDetectable).length;
    const foundCount = items.filter((i) => i.found).length;

    return {
        items,
        autoDetectableCount,
        foundCount,
        passed: autoDetectableCount > 0 && foundCount === autoDetectableCount,
    };
}

// Fixed labels come from i18n (localised for all UI languages); the grammar
// descriptions only exist in en/nl, so descLang selects between those two.
export function buildGrammarComment(result: GrammarQualificationResult, t: TFunction, descLang: DescLang): string {
    const heading = t('analysis.grammar_qualification');
    const manual = t('analysis.manual_check');
    const notFound = t('analysis.not_found');

    const lines = result.items.map((i) => {
        const cat = descLang === 'nl' ? i.categoryLabelNl : i.categoryLabelEn;
        const desc = descLang === 'nl' ? i.descriptionNl : i.descriptionEn;
        const label = `${cat} — ${desc}`;
        if (!i.autoDetectable) return `<li>⊘ ${label} (${manual})</li>`;
        if (i.found) return `<li>✔ ${label} (${i.occurrences}×)</li>`;
        return `<li>✘ ${label}: ${notFound}</li>`;
    });

    return `<p><strong>${heading}:</strong></p><ul>${lines.join('')}</ul>`;
}
