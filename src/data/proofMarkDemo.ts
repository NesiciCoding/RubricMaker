import type { DocumentMark } from '../types';
import { hashSnippet } from '../utils/proofRail';

/**
 * The 40-mark fixture PM-04 measures against, promoted from `spike/article.ts` so the rail can be
 * seen on real persisted records. Dev/demo data only: `seedDemoData()` writes it into the demo
 * essay attachment; nothing in the grading flow imports it.
 *
 * Positions are ProseMirror positions for a document made of top-level paragraphs — one token for
 * the paragraph start, one for its end — so they line up with what TipTap parses from the HTML.
 * `proofMarkDemo.test.ts` resolves every mark against a real editor and fails on any drift.
 */
const PARAGRAPHS = [
    'The debate about how much homework students should receive has continued for decades, and most schools still rely on a simple rule of thumb rather than evidence.',
    'Supporters argue that regular practice builds discipline and prepares learners for examinations, while critics point out that the same exercises are repeated long after they stop teaching anything new.',
    'Research on the subject is more ambiguous than either side usually admits, because the studies measure different things and rarely follow the same students for more than a single term.',
    'In one large survey, primary pupils who spent more than an hour each evening reported more stress and less sleep, but their results were not noticeably better than those of classmates who stopped after twenty minutes.',
    'A second study found the opposite pattern in secondary schools, where short daily tasks seemed to help weaker students consolidate basic skills they had missed earlier in the year.',
    'Neither finding is surprising once the purpose of the task is considered, since practice only improves performance when the learner can tell whether the attempt was correct.',
    'The reasonable conclusion is that quality matters more than quantity, and that a teacher who sets five thoughtful questions is likely to achieve more than one who sets fifty repetitive ones.',
    'Schools should therefore publish clear guidance about the purpose of each task, give students time to start it in class, and treat the homework diary as a planning tool rather than a record of punishment.',
    'Parents also need a realistic picture of what is expected, because a great deal of conflict at home comes from uncertainty about how much help is appropriate.',
    'If all of that sounds obvious, it is worth remembering how rarely the advice is followed in practice, and how quickly a sensible policy turns into an inflexible routine once it is written into a handbook.',
];

export const PROOF_MARK_DEMO_ESSAY = PARAGRAPHS.map((text) => `<p>${text}</p>`).join('');

const SYMBOLS = ['sp', 'lc', 'del', 'ital', 'tr', 'comma', 'caps', 'para'] as const;
const TOTAL = 40;

interface Word {
    text: string;
    from: number;
}

/** Words of a paragraph-only document, with the ProseMirror position each one starts at. */
function wordsWithPositions(paragraphs: string[]): Word[] {
    const words: Word[] = [];
    let contentStart = 1; // the first paragraph's content begins one token into the document
    for (const text of paragraphs) {
        for (const match of text.matchAll(/[A-Za-z]{3,}/g)) {
            words.push({ text: match[0], from: contentStart + (match.index ?? 0) });
        }
        contentStart += text.length + 2; // paragraph end token, then the next paragraph's start
    }
    return words;
}

/** 40 marks sampled evenly through the demo essay, one every `step` words. */
export function buildProofMarkDemo(
    attachmentId: string,
    authorId: string,
    createdAt = new Date().toISOString()
): DocumentMark[] {
    const words = wordsWithPositions(PARAGRAPHS);
    const step = Math.max(1, Math.floor(words.length / TOTAL));
    const marks: DocumentMark[] = [];

    for (let i = 0; i < words.length && marks.length < TOTAL; i += step) {
        const word = words[i];
        marks.push({
            id: `demo-mark-${marks.length + 1}`,
            attachmentId,
            authorId,
            symbolId: SYMBOLS[marks.length % SYMBOLS.length],
            anchor: { from: word.from, to: word.from + word.text.length },
            snippetHash: hashSnippet(word.text),
            status: 'noted',
            createdAt,
        });
    }

    return marks;
}
