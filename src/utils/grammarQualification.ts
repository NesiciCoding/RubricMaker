import type { TFunction } from 'i18next';
import type { LinkedFrameworkDescriptor } from '../types';
import { detectGrammar } from './grammarChecker';
import { getGrammarItemById } from '../data/grammarStandards';
import { constructionsForItem } from '../data/grammarLinkerMap';

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
    /** Which detector produced the count; undefined for items that need a manual check */
    detectedBy?: 'ud' | 'compromise';
}

export interface GrammarQualificationResult {
    items: GrammarItemResult[];
    autoDetectableCount: number;
    foundCount: number;
    /** True when every auto-detectable linked structure was demonstrated. */
    passed: boolean;
    /** 'ud' when the UD parse decided at least one item */
    engine: 'ud' | 'compromise';
}

type DescLang = 'en' | 'nl';

export interface EvaluateGrammarOptions {
    /** Construction id → count from the UD grammar profile, once the parser has loaded. */
    udCounts?: Record<string, number>;
}

export function evaluateGrammar(
    linked: LinkedFrameworkDescriptor[],
    text: string,
    options: EvaluateGrammarOptions = {}
): GrammarQualificationResult {
    const { udCounts } = options;
    const grammar = linked.filter((d) => d.framework === 'grammar');
    const itemFor = (d: LinkedFrameworkDescriptor) => getGrammarItemById(d.descriptorId);
    const udIds = (d: LinkedFrameworkDescriptor) => {
        const item = itemFor(d);
        return udCounts && item ? constructionsForItem(item) : undefined;
    };

    const shorthands = grammar
        .filter((d) => !udIds(d))
        .map((d) => itemFor(d)?.detectShorthand)
        .filter((s): s is string => !!s);
    const counts = detectGrammar(text, shorthands);

    const items: GrammarItemResult[] = grammar.map((d) => {
        const shorthand = itemFor(d)?.detectShorthand;
        const ids = udIds(d);
        let occurrences = 0;
        let detectedBy: GrammarItemResult['detectedBy'];
        if (ids) {
            occurrences = ids.reduce((n, id) => n + (udCounts?.[id] ?? 0), 0);
            detectedBy = 'ud';
        } else if (shorthand) {
            /* v8 ignore next -- detectGrammar seeds every wanted shorthand (all standards shorthands have a pattern), so the key is always present */
            occurrences = counts[shorthand] ?? 0;
            detectedBy = 'compromise';
        }
        return {
            descriptorId: d.descriptorId,
            descriptionEn: d.descriptionEn,
            descriptionNl: d.descriptionNl,
            categoryLabelEn: d.categoryLabelEn,
            categoryLabelNl: d.categoryLabelNl,
            autoDetectable: !!detectedBy,
            found: !!detectedBy && occurrences >= DEMONSTRATED_THRESHOLD,
            occurrences,
            detectedBy,
        };
    });

    const autoDetectableCount = items.filter((i) => i.autoDetectable).length;
    const foundCount = items.filter((i) => i.found).length;

    return {
        items,
        autoDetectableCount,
        foundCount,
        passed: autoDetectableCount > 0 && foundCount === autoDetectableCount,
        engine: items.some((i) => i.detectedBy === 'ud') ? 'ud' : 'compromise',
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
