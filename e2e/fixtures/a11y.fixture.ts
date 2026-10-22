/**
 * Shared plumbing for the accessibility gate (`e2e/specs/51-a11y.spec.ts`).
 *
 * The gate runs axe-core against every route in light and dark mode and fails
 * on serious/critical violations. Because the app is not yet WCAG 2.1 AA
 * conformant, violations that already exist are recorded in
 * `e2e/a11y-baseline.json` (per route + theme + rule + node count). The gate
 * fails when a *new* rule appears or a known rule grows — i.e. it locks in the
 * current debt instead of going red on day one. Run with `A11Y_STRICT=1` to
 * ignore the baseline and require zero serious/critical violations, which is
 * the end state once the P0 fixes in docs/a11y/REPORT.md land.
 *
 * Regenerate the baseline with `A11Y_UPDATE_BASELINE=1 npm run e2e:a11y`
 * followed by `npm run e2e:a11y:baseline`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { AxeResults, ImpactValue, Result } from 'axe-core';
import type { Page } from '@playwright/test';

const require = createRequire(path.resolve('package.json'));
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Fail the gate on these axe impact levels. `moderate`/`minor` are reported, not gated. */
export const GATED_IMPACTS: readonly ImpactValue[] = ['serious', 'critical'];

/**
 * Extra node allowance for rules measured from rendered geometry. Button hit
 * areas move a few pixels between the macOS and the Linux CI font stack, so an
 * exact count would flake without hiding a real regression (a page with 6
 * small targets would need 11 before this trips). Colors are computed from CSS,
 * not rasterised text, so contrast keeps an exact count.
 */
const LAYOUT_RULE_TOLERANCE: Record<string, number> = { 'target-size': 4 };

/** WCAG 2.0/2.1/2.2 A + AA, plus axe best-practice rules. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];

export const A11Y_THEMES = ['light', 'dark'] as const;
export type A11yTheme = (typeof A11Y_THEMES)[number];

export type A11yRoute = { path: string; label: string };

const now = new Date('2026-10-18T09:00:00.000Z').toISOString();
const uid = (prefix: string) => `${prefix}-a11y-1`;

const CLASS_ID = uid('class');
const RUBRIC_ID = uid('rubric');
const RUBRIC2_ID = uid('rubric2');
const STUDENT_ID = uid('student');
const TEST_ID = uid('test');
const DECK_ID = uid('deck');
const STUDENT_TEST_ID = uid('student-test');
const ESSAY_KEY = uid('essay');

const levels = [
    { label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Outstanding work', subItems: [] },
    { label: 'Good', minPoints: 3, maxPoints: 3, description: 'Solid work', subItems: [] },
    { label: 'Adequate', minPoints: 2, maxPoints: 2, description: 'Acceptable work', subItems: [] },
    { label: 'Poor', minPoints: 1, maxPoints: 1, description: 'Needs improvement', subItems: [] },
];

const criterion = (id: string, title: string, weight: number) => ({
    id,
    title,
    description: 'How well the student meets this criterion',
    weight,
    levels: levels.map((level) => ({ ...level, id: `${id}-${level.label.toLowerCase()}` })),
});

const format = Object.fromEntries(
    [
        'showLevelDescriptions',
        'showCriteriaDescriptions',
        'showPoints',
        'showWeight',
        'showTotal',
        'showGradeScale',
        'showStudentName',
        'showDate',
        'showComments',
        'showOverallComment',
        'showSubject',
        'showFormat',
    ].map((key) => [key, true])
);

const rubric = {
    id: RUBRIC_ID,
    name: 'Argumentative Essay B1',
    subject: 'English',
    description: 'Assessment rubric for a B1 argumentative essay',
    criteria: [
        criterion('crit-content', 'Content', 50),
        criterion('crit-organisation', 'Organisation', 25),
        criterion('crit-language', 'Language', 25),
    ],
    gradeScaleId: 'letter-10',
    format,
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
    totalMaxPoints: 12,
    scoringMode: 'weighted-percentage',
    cefrTargetLevel: 'B1',
    cefrSkill: 'writing',
};

const rubric2 = {
    ...rubric,
    id: RUBRIC2_ID,
    name: 'Speaking Presentation',
    criteria: [criterion('crit-fluency', 'Fluency', 50), criterion('crit-pronunciation', 'Pronunciation', 50)],
    cefrSkill: 'speaking',
};

/**
 * Local-mode seed. Every route renders from this data, so the scan set does not
 * depend on Supabase or on a user's own data. Keep this in sync with
 * docs/a11y/fixtures.mjs (the offline audit harness uses the same shape).
 */
export function buildA11ySeed(theme: A11yTheme) {
    return {
        rm_local_mode: true,
        rm_settings: {
            defaultGradeScaleId: 'letter-10',
            theme,
            language: 'en',
            defaultFormat: format,
            hasSeenTutorial: true,
            needsOnboarding: false,
            userRole: 'admin',
            activeClassId: CLASS_ID,
        },
        rm_classes: [
            {
                id: CLASS_ID,
                name: 'Class 4A',
                subject: 'English',
                year: '2025-2026',
                rubricIds: [RUBRIC_ID, RUBRIC2_ID],
            },
            { id: 'class-a11y-2', name: 'Class 4B', subject: 'English', year: '2025-2026', rubricIds: [RUBRIC_ID] },
        ],
        rm_students: [
            {
                id: STUDENT_ID,
                name: 'Alice Jansen',
                email: 'alice@example.com',
                studentNumber: 'S001',
                classId: CLASS_ID,
            },
            {
                id: 'student-a11y-2',
                name: 'Bram de Vries',
                email: 'bram@example.com',
                studentNumber: 'S002',
                classId: CLASS_ID,
            },
            { id: 'student-a11y-3', name: 'Chloe Martin', classId: CLASS_ID },
            { id: 'student-a11y-4', name: 'Daan Smit', classId: CLASS_ID },
        ],
        rm_rubrics: [rubric, rubric2],
        rm_student_rubrics: [
            {
                id: 'student-rubric-a11y-1',
                rubricId: RUBRIC_ID,
                studentId: STUDENT_ID,
                entries: rubric.criteria.map((item) => ({
                    criterionId: item.id,
                    levelId: item.levels[1].id,
                    comment: 'Good structure, could use more evidence.',
                    checkedSubItems: [],
                })),
                overallComment: 'A solid essay.',
                isPeerReview: false,
                gradedAt: now,
            },
        ],
        rm_tests: [
            {
                id: TEST_ID,
                name: 'Unit 3 Reading Test',
                description: 'Reading comprehension and vocabulary',
                questions: [
                    {
                        id: 'question-a11y-1',
                        prompt: 'What is the main idea of the passage?',
                        type: 'multiple-choice',
                        points: 2,
                        options: [
                            { id: 'option-a11y-1', text: 'The importance of sleep', correct: true },
                            { id: 'option-a11y-2', text: 'The history of tea', correct: false },
                        ],
                    },
                    {
                        id: 'question-a11y-2',
                        prompt: 'Summarise the second paragraph.',
                        type: 'short-answer',
                        points: 3,
                    },
                ],
                requireSEB: false,
                shuffleQuestions: false,
                gradeScaleId: 'letter-10',
                createdAt: now,
            },
        ],
        rm_student_tests: [
            {
                id: STUDENT_TEST_ID,
                testId: TEST_ID,
                studentId: STUDENT_ID,
                answers: [
                    { questionId: 'question-a11y-1', response: 'option-a11y-1', pointsEarned: 2 },
                    {
                        questionId: 'question-a11y-2',
                        response: 'Sleep is essential for memory consolidation.',
                        pointsEarned: 2,
                    },
                ],
                status: 'graded',
                startedAt: now,
                submittedAt: now,
                gradedAt: now,
                rawTotalPoints: 4,
            },
        ],
        rm_essay_assignments: [
            {
                rubricId: RUBRIC_ID,
                studentId: STUDENT_ID,
                teacherKey: ESSAY_KEY,
                title: 'Argumentative Essay B1',
                prompt: 'Argue for or against school uniforms.',
                minWords: 200,
                readOnlyAfterSubmit: false,
                createdAt: now,
            },
        ],
        rm_flashcard_decks: [
            {
                id: DECK_ID,
                name: 'Unit 3 Vocabulary',
                description: 'Words from unit 3',
                cards: [
                    { id: 'card-a11y-1', front: 'ubiquitous', back: 'everywhere', createdAt: now },
                    { id: 'card-a11y-2', front: 'meticulous', back: 'very careful', createdAt: now },
                ],
                createdAt: now,
                updatedAt: now,
                deckKind: 'vocabulary',
            },
        ],
        rm_question_bank: [
            {
                id: 'question-bank-a11y-1',
                kind: 'question',
                question: {
                    id: 'question-a11y-3',
                    prompt: 'What is the capital of France?',
                    type: 'short-answer',
                    points: 2,
                },
                tags: ['geography'],
                createdAt: now,
            },
        ],
        rm_comment_bank: [
            { id: 'comment-a11y-1', text: 'Well structured argument.', tags: ['structure'], createdAt: now },
            { id: 'comment-a11y-2', text: 'Watch your verb tenses.', tags: ['grammar'], createdAt: now },
        ],
        rm_news_flashes: [
            {
                id: 'news-a11y-1',
                title: 'Unit 3 test moved to Friday',
                summary: 'The reading test now takes place on Friday.',
                kind: 'announcement',
                tags: ['tests'],
                createdAt: now,
                updatedAt: now,
            },
        ],
        rm_messages: [
            {
                id: 'message-a11y-1',
                studentId: STUDENT_ID,
                contextType: 'rubric',
                contextId: RUBRIC_ID,
                contextLabel: 'Argumentative Essay B1',
                sender: 'student',
                body: 'Could you explain the feedback on my introduction?',
                createdAt: now,
                readByTeacher: false,
                readByStudent: true,
            },
        ],
    };
}

/**
 * Every routable page in src/App.tsx, in the same order as the audit report.
 * `/this-route-does-not-exist` is intentional: the 404 page is a real screen.
 */
export const A11Y_ROUTES: readonly A11yRoute[] = [
    { path: '/', label: 'Dashboard' },
    { path: '/rubrics', label: 'Rubric list' },
    { path: '/rubrics/new', label: 'Rubric builder (new)' },
    { path: `/rubrics/${RUBRIC_ID}`, label: 'Rubric builder (edit)' },
    { path: `/rubrics/${RUBRIC_ID}/grade/${STUDENT_ID}`, label: 'Grading' },
    { path: `/rubrics/${RUBRIC_ID}/peer-review/${STUDENT_ID}`, label: 'Peer review' },
    { path: `/peer-analytics/${RUBRIC_ID}`, label: 'Peer analytics' },
    { path: `/rubrics/${RUBRIC_ID}/self-assess/${STUDENT_ID}`, label: 'Self assessment' },
    { path: `/speaking/${RUBRIC2_ID}/${STUDENT_ID}`, label: 'Speaking session' },
    { path: `/grade-comparative/${CLASS_ID}/${RUBRIC_ID}`, label: 'Comparative grading' },
    { path: '/students', label: 'Students' },
    { path: `/students/${STUDENT_ID}`, label: 'Student profile' },
    { path: `/students/${STUDENT_ID}/cefr-overview`, label: 'Student CEFR overview' },
    { path: `/students/${STUDENT_ID}/learning-path`, label: 'Student learning path' },
    { path: '/cefr-overview', label: 'CEFR overview' },
    { path: '/vocabulary', label: 'Vocabulary dashboard' },
    { path: '/tests', label: 'Test list' },
    { path: '/tests/new', label: 'Test builder (new)' },
    { path: `/tests/${TEST_ID}`, label: 'Test builder (edit)' },
    { path: `/tests/${TEST_ID}/results/${STUDENT_TEST_ID}`, label: 'Test results' },
    { path: `/tests/${TEST_ID}/monitor`, label: 'Test live monitor' },
    { path: '/essays', label: 'Essay list' },
    { path: '/essays/new', label: 'Essay builder (new)' },
    { path: `/essays/${ESSAY_KEY}`, label: 'Essay builder (edit)' },
    { path: `/essays/${ESSAY_KEY}/monitor`, label: 'Essay live monitor' },
    { path: '/flashcards', label: 'Flashcards' },
    { path: `/flashcards/${DECK_ID}`, label: 'Flashcard deck' },
    { path: '/news-flashes', label: 'News flashes' },
    { path: `/portal/${STUDENT_ID}`, label: 'Student portal' },
    { path: `/portal/${STUDENT_ID}/flashcards/${DECK_ID}`, label: 'Student flashcard study' },
    { path: '/attachments', label: 'Attachments' },
    { path: '/export', label: 'Export' },
    { path: '/statistics', label: 'Statistics' },
    { path: '/activity-dashboard', label: 'Activity dashboard' },
    { path: '/moderation', label: 'Moderation queue' },
    { path: '/notifications', label: 'Notifications' },
    { path: '/messages', label: 'Messages' },
    { path: '/comments', label: 'Comment bank' },
    { path: '/question-bank', label: 'Question bank' },
    { path: '/marketplace', label: 'Marketplace' },
    { path: '/settings', label: 'Settings' },
    { path: '/admin', label: 'Admin' },
    { path: '/docs', label: 'Docs' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/this-route-does-not-exist', label: 'Not found' },
];

export type A11yBaselineViolation = { rule: string; nodes: number };
export type A11yBaselineEntry = {
    route: string;
    theme: A11yTheme;
    violations: A11yBaselineViolation[];
};
export type A11yBaseline = {
    version: 1;
    entries: A11yBaselineEntry[];
};

export type A11yViolation = {
    rule: string;
    impact: ImpactValue;
    help: string;
    wcag: string[];
    nodes: { target: string[]; html: string; summary: string }[];
};

export type A11yScan = {
    route: string;
    label: string;
    theme: A11yTheme;
    pageUrl: string;
    violations: A11yViolation[];
};

export const BASELINE_PATH = path.resolve('e2e/a11y-baseline.json');

/** Short, non-cryptographic hash for filename uniqueness — not a security boundary. */
function shortHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function loadBaseline(): A11yBaseline {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as A11yBaseline;
}

/** Write one scan's baseline slice; `npm run e2e:a11y:baseline` merges the slices. */
export function writeBaselinePart(scan: A11yScan): void {
    const dir = path.resolve('test-results/a11y-baseline');
    mkdirSync(dir, { recursive: true });
    const slug = scan.route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
    const hash = shortHash(`${scan.theme}:${scan.route}`);
    const file = path.join(dir, `${scan.theme}-${slug}-${hash}.json`);
    const entry: A11yBaselineEntry = {
        route: scan.route,
        theme: scan.theme,
        violations: scan.violations
            .map((violation) => ({ rule: violation.rule, nodes: violation.nodes.length }))
            .sort((a, b) => a.rule.localeCompare(b.rule)),
    };
    writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
}

/** Seed localStorage before the app boots so the route renders with this theme and data. */
export async function seedApp(page: Page, theme: A11yTheme): Promise<void> {
    const seed = buildA11ySeed(theme);
    // Comparative grading picks its matchup with Math.random. Which students land in it changes what
    // axe sees (an ungraded student's red "0 pts" fails contrast, a graded one's score passes), so a
    // random pick made the gate's node counts differ between runs. A fixed sequence keeps every scan
    // identical.
    await page.addInitScript(() => {
        let state = 0x2f6b1d;
        Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 2 ** 32;
        };
    });
    await page.addInitScript((data: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
        }
    }, seed);
}

/** Wait until the lazy route has rendered and its skeleton is gone. */
export async function waitForRoute(page: Page): Promise<void> {
    await page.waitForFunction(
        () => {
            const root = document.querySelector('#root');
            const main = document.querySelector('.main-area');
            if (!root || !root.firstElementChild) return false;
            if (main && main.querySelector('[aria-busy="true"]')) return false;
            return (root.textContent ?? '').trim().length > 0;
        },
        undefined,
        { timeout: 20_000 }
    );
    // Lazy chunks and CSS transitions can still settle after first paint.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(300);
}

/** Run axe with the gate's rule tags. */
export async function runAxe(page: Page): Promise<AxeResults> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        (tags) =>
            (
                window as unknown as {
                    axe: { run: (context: Document, options: unknown) => Promise<AxeResults> };
                }
            ).axe.run(document, { runOnly: { type: 'tag', values: tags } }),
        AXE_TAGS
    );
}

function toViolation(violation: Result): A11yViolation {
    return {
        rule: violation.id,
        impact: violation.impact ?? null,
        help: violation.help,
        wcag: violation.tags.filter((tag) => tag.startsWith('wcag')),
        nodes: violation.nodes.map((node) => ({
            target: node.target.map(String),
            html: node.html.slice(0, 240),
            summary: (node.failureSummary ?? '').replace(/\s+/g, ' ').trim(),
        })),
    };
}

export type A11yScanOptions = {
    /** Ignore e2e/a11y-baseline.json and require zero gated violations. */
    strict?: boolean;
    /** How many extra nodes a baselined rule may grow by before failing. */
    tolerance?: number;
};

export type A11yEvaluation = {
    failures: string[];
    gated: A11yViolation[];
    /** Baselined rules whose node count dropped — the baseline can be tightened. */
    improvements: string[];
};

/**
 * Compare the serious/critical violations on a page against the baseline.
 * Everything is expressed as human-readable failure strings so the Playwright
 * report (and CI log) points at the offending selector and WCAG criterion.
 */
export function evaluateScan(scan: A11yScan, baseline: A11yBaseline, options: A11yScanOptions = {}): A11yEvaluation {
    const gated = scan.violations.filter((violation) => GATED_IMPACTS.includes(violation.impact));
    const allowed = new Map<string, number>();
    for (const entry of baseline.entries) {
        if (entry.route !== scan.route || entry.theme !== scan.theme) continue;
        for (const violation of entry.violations) allowed.set(violation.rule, violation.nodes);
    }

    const failures: string[] = [];
    const improvements: string[] = [];

    if (options.strict) {
        for (const violation of gated) {
            failures.push(formatViolation(scan, violation, `strict mode: ${violation.nodes.length} node(s)`));
        }
    } else {
        for (const violation of gated) {
            const maxNodes = allowed.get(violation.rule);
            const tolerance = options.tolerance ?? LAYOUT_RULE_TOLERANCE[violation.rule] ?? 0;
            if (maxNodes === undefined) {
                failures.push(
                    formatViolation(
                        scan,
                        violation,
                        `not in e2e/a11y-baseline.json (${violation.nodes.length} node(s)) — fix it, or re-baseline if the debt is accepted`
                    )
                );
                continue;
            }
            if (violation.nodes.length > maxNodes + tolerance) {
                failures.push(
                    formatViolation(
                        scan,
                        violation,
                        `${violation.nodes.length} node(s), baseline allows ${maxNodes}` +
                            (tolerance ? ` (+${tolerance} tolerance)` : '')
                    )
                );
            } else if (violation.nodes.length < maxNodes) {
                improvements.push(
                    `${violation.rule}: ${violation.nodes.length} node(s), was ${maxNodes} — tighten the baseline`
                );
            }
        }
        // A rule that now passes entirely disappears from `gated`, so report it
        // from the baseline side — otherwise fully fixing a rule goes unnoticed
        // and its stale allowance lingers until the next regeneration.
        for (const [rule, maxNodes] of allowed) {
            if (!gated.some((violation) => violation.rule === rule)) {
                improvements.push(`${rule}: 0 node(s), was ${maxNodes} — rule now passes; tighten the baseline`);
            }
        }
    }

    return { failures, gated, improvements };
}

function formatViolation(scan: A11yScan, violation: A11yViolation, detail: string): string {
    const criteria = violation.wcag.length ? violation.wcag.join(', ') : 'best-practice';
    const nodes = violation.nodes
        .slice(0, 5)
        .map((node) => `      ${node.target.join(' ')}\n        ${node.html}\n        ${node.summary}`)
        .join('\n');
    const more = violation.nodes.length > 5 ? `\n      …and ${violation.nodes.length - 5} more node(s)` : '';
    return (
        `[${scan.theme}] ${scan.route} — ${violation.rule} (${violation.impact}; ${criteria}): ${violation.help}\n` +
        `    ${detail}\n${nodes}${more}`
    );
}

export function toScan(route: A11yRoute, theme: A11yTheme, pageUrl: string, results: AxeResults): A11yScan {
    return {
        route: route.path,
        label: route.label,
        theme,
        pageUrl,
        violations: results.violations.map(toViolation),
    };
}
