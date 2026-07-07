import { normalize } from './globalSearch';

export type PortalSearchResultType = 'grade' | 'work' | 'flashcard';

export interface PortalSearchResult {
    type: PortalSearchResultType;
    id: string;
    label: string;
    sectionId: string;
}

export interface PortalSearchableData {
    /** Graded rubrics, one per StudentRubric shown in the "Rubric Grades" section. */
    history: { rubricId: string; rubricName: string }[];
    /** Unified essay + test assignments shown in the "My Work" section. */
    work: { key: string; label: string }[];
    /** Assigned flashcard decks. */
    flashcards: { deckId: string; deckName: string }[];
}

export function searchPortal(query: string, data: PortalSearchableData): PortalSearchResult[] {
    const text = normalize(query.trim());
    if (!text) return [];

    const results: PortalSearchResult[] = [];

    for (const h of data.history) {
        if (normalize(h.rubricName).includes(text)) {
            results.push({
                type: 'grade',
                id: h.rubricId,
                label: h.rubricName,
                sectionId: 'portal-section-feedback',
            });
        }
    }

    for (const w of data.work) {
        if (normalize(w.label).includes(text)) {
            results.push({ type: 'work', id: w.key, label: w.label, sectionId: 'portal-section-work' });
        }
    }

    for (const f of data.flashcards) {
        if (normalize(f.deckName).includes(text)) {
            results.push({
                type: 'flashcard',
                id: f.deckId,
                label: f.deckName,
                sectionId: 'portal-section-flashcards',
            });
        }
    }

    return results;
}
