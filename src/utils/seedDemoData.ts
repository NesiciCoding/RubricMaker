import { nanoid } from './nanoid';
import {
    saveRubrics,
    saveStudents,
    saveClasses,
    saveStudentRubrics,
    savePeerReviews,
    saveCommentSnippets,
    saveTests,
    saveStudentTests,
    saveEssayAssignments,
} from '../store/storage';
import { DEFAULT_FORMAT } from '../types';
import type {
    Rubric,
    RubricCriterion,
    RubricLevel,
    Student,
    Class,
    StudentRubric,
    ScoreEntry,
    Test,
    TestQuestion,
    StudentTest,
    EssayAssignment,
    CommentSnippet,
    CefrLevel,
    CefrSkill,
    VoTrack,
} from '../types';

/**
 * Populates this browser's local storage with a realistic-looking demo dataset —
 * several classes/students, CEFR-tagged rubrics with grades, tests, essays, and
 * comment-bank entries — so every screen has content to look at during dev/design
 * review. Dev-only; gated behind import.meta.env.DEV at the call site.
 */
export function seedDemoData(): void {
    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

    // ── Classes & students ──────────────────────────────────────────────────
    const classDefs: { name: string; voTrack: VoTrack }[] = [
        { name: 'HAVO 4A', voTrack: 'havo' },
        { name: 'VWO 3B', voTrack: 'vwo' },
        { name: 'VMBO-TL 2C', voTrack: 'vmbo-tl' },
    ];
    const firstNames = ['Anna', 'Liam', 'Sara', 'Noah', 'Emma', 'Lucas', 'Mila', 'Finn', 'Zoe', 'Daan'];
    const lastNames = ['Jansen', 'de Vries', 'Bakker', 'Visser', 'Smit'];

    const classes: Class[] = classDefs.map((c) => ({ id: nanoid(), name: c.name, voTrack: c.voTrack }));
    const students: Student[] = [];
    classes.forEach((cls, ci) => {
        for (let i = 0; i < 9; i++) {
            students.push({
                id: nanoid(),
                name: `${firstNames[(ci * 9 + i) % firstNames.length]} ${lastNames[(ci * 3 + i) % lastNames.length]}`,
                classId: cls.id,
            });
        }
    });

    // ── Rubric builders ──────────────────────────────────────────────────────
    function mkLevel(label: string, min: number, max: number, description: string, cefrLevel?: CefrLevel): RubricLevel {
        return { id: nanoid(), label, minPoints: min, maxPoints: max, description, subItems: [], cefrLevel };
    }

    function mkCriterion(title: string, weight: number, levels: RubricLevel[], cefrSkill?: CefrSkill): RubricCriterion {
        return { id: nanoid(), title, description: '', weight, levels, cefrSkill };
    }

    function mkRubric(opts: {
        name: string;
        subject: string;
        criteria: RubricCriterion[];
        cefrTargetLevel?: CefrLevel;
        cefrSkill?: CefrSkill;
        scoringMode?: Rubric['scoringMode'];
    }): Rubric {
        return {
            id: nanoid(),
            name: opts.name,
            subject: opts.subject,
            description: '',
            criteria: opts.criteria,
            gradeScaleId: 'letter-10',
            format: DEFAULT_FORMAT,
            attachmentIds: [],
            createdAt: daysAgo(30),
            updatedAt: daysAgo(5),
            totalMaxPoints: 100,
            scoringMode: opts.scoringMode ?? 'weighted-percentage',
            cefrTargetLevel: opts.cefrTargetLevel,
            cefrSkill: opts.cefrSkill,
            cefrAchieveThreshold: 70,
        };
    }

    const cefrLevelTiers = (skill: CefrSkill, levels: [CefrLevel, CefrLevel, CefrLevel, CefrLevel]) => [
        mkLevel('Excellent', 90, 100, 'Consistently exceeds expectations', levels[0]),
        mkLevel('Good', 75, 89, 'Meets expectations with minor gaps', levels[1]),
        mkLevel('Adequate', 60, 74, 'Meets basic requirements', levels[2]),
        mkLevel('Developing', 0, 59, 'Below expectations', levels[3]),
    ];

    const rubrics: Rubric[] = [
        mkRubric({
            name: 'Persuasive Essay Writing',
            subject: 'English',
            cefrTargetLevel: 'B1',
            cefrSkill: 'writing',
            criteria: [
                mkCriterion('Task Response', 30, cefrLevelTiers('writing', ['B2', 'B1', 'A2', 'A1']), 'writing'),
                mkCriterion('Coherence & Cohesion', 30, cefrLevelTiers('writing', ['B2', 'B1', 'A2', 'A1']), 'writing'),
                mkCriterion('Grammar & Vocabulary', 40, cefrLevelTiers('writing', ['B2', 'B1', 'A2', 'A1']), 'writing'),
            ],
        }),
        mkRubric({
            name: 'Reading Comprehension A2',
            subject: 'English',
            cefrTargetLevel: 'A2',
            cefrSkill: 'reading',
            criteria: [
                mkCriterion(
                    'Main idea identification',
                    50,
                    cefrLevelTiers('reading', ['B1', 'A2', 'A1', 'A1']),
                    'reading'
                ),
                mkCriterion('Detail extraction', 50, cefrLevelTiers('reading', ['B1', 'A2', 'A1', 'A1']), 'reading'),
            ],
        }),
        mkRubric({
            name: 'Speaking Interaction B1',
            subject: 'English',
            cefrTargetLevel: 'B1',
            cefrSkill: 'speaking_interaction',
            scoringMode: 'single-point',
            criteria: [
                mkCriterion(
                    'Turn-taking & responsiveness',
                    50,
                    [mkLevel('Meets', 0, 100, 'Responds appropriately and keeps the conversation going', 'B1')],
                    'speaking_interaction'
                ),
                mkCriterion(
                    'Fluency',
                    50,
                    [mkLevel('Meets', 0, 100, 'Speaks with reasonable ease, few hesitations', 'B1')],
                    'speaking_interaction'
                ),
            ],
        }),
        mkRubric({
            name: 'Lab Report — Chemistry',
            subject: 'Science',
            criteria: [
                mkCriterion('Method', 40, [
                    mkLevel('Excellent', 90, 100, 'Clear, replicable method'),
                    mkLevel('Good', 70, 89, 'Mostly clear method'),
                    mkLevel('Needs work', 0, 69, 'Method unclear or incomplete'),
                ]),
                mkCriterion('Analysis', 60, [
                    mkLevel('Excellent', 90, 100, 'Insightful, well-supported analysis'),
                    mkLevel('Good', 70, 89, 'Sound analysis with minor gaps'),
                    mkLevel('Needs work', 0, 69, 'Superficial or unsupported analysis'),
                ]),
            ],
        }),
        mkRubric({
            name: 'Group Presentation',
            subject: 'General',
            criteria: [
                mkCriterion('Content', 50, [
                    mkLevel('Excellent', 90, 100, 'Accurate, well-researched content'),
                    mkLevel('Good', 70, 89, 'Solid content with minor gaps'),
                    mkLevel('Needs work', 0, 69, 'Thin or inaccurate content'),
                ]),
                mkCriterion('Delivery', 50, [
                    mkLevel('Excellent', 90, 100, 'Confident, engaging delivery'),
                    mkLevel('Good', 70, 89, 'Clear delivery, some hesitancy'),
                    mkLevel('Needs work', 0, 69, 'Hard to follow'),
                ]),
            ],
        }),
        mkRubric({
            name: 'Listening Comprehension B2',
            subject: 'English',
            cefrTargetLevel: 'B2',
            cefrSkill: 'listening',
            criteria: [
                mkCriterion(
                    'Gist understanding',
                    50,
                    cefrLevelTiers('listening', ['C1', 'B2', 'B1', 'A2']),
                    'listening'
                ),
                mkCriterion('Specific detail', 50, cefrLevelTiers('listening', ['C1', 'B2', 'B1', 'A2']), 'listening'),
            ],
        }),
    ];

    // ── Graded student rubrics (varied scores, some CEFR-tagged, one co-graded dispute) ──
    const studentRubrics: StudentRubric[] = [];
    const peerReviews: StudentRubric[] = [];

    function mkEntry(criterion: RubricCriterion, pct: number, comment: string): ScoreEntry {
        if (criterion.levels.length === 1) {
            return {
                criterionId: criterion.id,
                levelId: criterion.levels[0].id,
                checkedSubItems: [],
                comment,
                singlePointOutcome: pct >= 70 ? 'meets' : 'not-yet',
            };
        }
        const level =
            criterion.levels.find((l) => pct >= l.minPoints && pct <= l.maxPoints) ??
            criterion.levels[criterion.levels.length - 1];
        // Simulate a teacher moving the points slider within the band, rather than leaving it
        // at the band's default minimum (which is 0 for the bottom "Developing" tier) — otherwise
        // a 50%-ish grade renders as a literal 0, which reads as a scoring bug.
        const clampedPct = Math.min(Math.max(pct, level.minPoints), level.maxPoints);
        return {
            criterionId: criterion.id,
            levelId: level.id,
            checkedSubItems: [],
            comment,
            selectedPoints: clampedPct,
        };
    }

    // Every student gets 2-3 graded rubrics spread over the last month, scores varying by student index.
    students.forEach((student, i) => {
        const cls = classes.find((c) => c.id === student.classId)!;
        const clsRubrics = rubrics.slice(0, 4); // first 4 rubrics used broadly across classes
        clsRubrics.slice(0, 2 + (i % 2)).forEach((rubric, ri) => {
            const basePct = 55 + ((i * 7 + ri * 11) % 40); // 55-94%
            studentRubrics.push({
                id: nanoid(),
                rubricId: rubric.id,
                studentId: student.id,
                entries: rubric.criteria.map((c) =>
                    mkEntry(c, basePct + ((c.weight % 10) - 5), 'Good effort overall.')
                ),
                overallComment:
                    basePct >= 80 ? 'Strong work — keep it up!' : 'Solid effort, review the feedback below.',
                gradedAt: daysAgo(3 + ri * 4 + (i % 10)),
                isPeerReview: false,
            });
        });
        void cls;
    });

    // Co-graded dispute: second marker grades the same baseline with a noticeably different score (Moderation queue content).
    const disputeStudent = students[0];
    const disputeRubric = rubrics[0];
    const baseline = studentRubrics.find(
        (sr) => sr.studentId === disputeStudent.id && sr.rubricId === disputeRubric.id
    );
    if (baseline) {
        peerReviews.push({
            id: nanoid(),
            rubricId: disputeRubric.id,
            studentId: disputeStudent.id,
            entries: disputeRubric.criteria.map((c) => mkEntry(c, 60, 'Second marker: more conservative on grammar.')),
            overallComment: 'Second opinion — see delta per criterion.',
            gradedAt: daysAgo(2),
            gradedBy: 'colleague@example.com',
            isPeerReview: true,
            round: 1,
        });
    }

    // ── Tests + student submissions ─────────────────────────────────────────
    function mkQuestion(prompt: string, options: string[], correctIndex: number): TestQuestion {
        return {
            id: nanoid(),
            prompt,
            type: 'multiple-choice',
            points: 5,
            options: options.map((text, i) => ({ id: nanoid(), text, isCorrect: i === correctIndex })),
        };
    }

    const tests: Test[] = [
        {
            id: nanoid(),
            name: 'Vocabulary Quiz — Unit 4',
            description: 'Multiple-choice vocabulary check',
            questions: [
                mkQuestion('What does "persuade" mean?', ['To convince', 'To ignore', 'To delay', 'To forget'], 0),
                mkQuestion('Choose the synonym for "argument":', ['Reason', 'Silence', 'Color', 'Distance'], 0),
                mkQuestion('"Distract" most closely means:', ['Divert attention', 'Focus', 'Repair', 'Celebrate'], 0),
            ],
            requireSEB: false,
            shuffleQuestions: false,
            gradeScaleId: 'letter-10',
            createdAt: daysAgo(14),
        },
        {
            id: nanoid(),
            name: 'Grammar Check — Tenses',
            description: 'Past simple vs present perfect',
            questions: [
                mkQuestion('She ___ to Paris last year.', ['went', 'has gone', 'go', 'going'], 0),
                mkQuestion(
                    'I ___ never ___ sushi before.',
                    ['have / eaten', 'did / eat', 'has / eat', 'am / eating'],
                    0
                ),
            ],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: daysAgo(7),
        },
    ];

    const studentTests: StudentTest[] = [];
    students.slice(0, 12).forEach((student, i) => {
        const test = tests[i % tests.length];
        const status: StudentTest['status'] = i % 5 === 0 ? 'submitted' : 'graded';
        studentTests.push({
            id: nanoid(),
            testId: test.id,
            studentId: student.id,
            answers: test.questions.map((q) => ({
                questionId: q.id,
                response: q.options![i % 2 === 0 ? 0 : 1].id,
                pointsEarned: status === 'graded' ? (i % 2 === 0 ? q.points : 0) : undefined,
            })),
            status,
            startedAt: daysAgo(2),
            submittedAt: daysAgo(2),
            gradedAt: status === 'graded' ? daysAgo(1) : undefined,
        });
    });

    // ── Essay assignments (pending / submitted / expired) ───────────────────
    const essayRubric = rubrics[0];
    const essayAssignments: EssayAssignment[] = students.slice(0, 5).map((student, i) => ({
        rubricId: essayRubric.id,
        studentId: student.id,
        teacherKey: i < 3 ? 'demo-essay-group-1' : 'demo-essay-group-2',
        title: i < 3 ? 'Should schools ban smartphones?' : 'My favourite holiday memory',
        prompt: 'Write a well-structured essay of 250-400 words.',
        minWords: 250,
        maxWords: 400,
        timeLimitMinutes: 45,
        readOnlyAfterSubmit: true,
        createdAt: daysAgo(10),
        expiresAt: i === 4 ? daysAgo(1) : new Date(now + 7 * 86_400_000).toISOString(),
    }));

    // ── Comment bank (CommentSnippet — what CommentBankPage / grading chips read) ──
    const commentSnippets: CommentSnippet[] = [
        { id: nanoid(), text: 'Great use of varied vocabulary!', tag: 'positive' },
        { id: nanoid(), text: 'Watch your verb tense agreement.', tag: 'improvement' },
        { id: nanoid(), text: 'Try linking your paragraphs with transition words.', tag: 'structure' },
        { id: nanoid(), text: 'Excellent argument structure — clear thesis and support.', tag: 'positive' },
        { id: nanoid(), text: 'Re-read your work aloud to catch run-on sentences.', tag: 'improvement' },
        { id: nanoid(), text: 'Your examples really bring the content to life.', tag: 'content' },
        { id: nanoid(), text: 'Consider a more original angle here.', tag: 'creativity' },
    ];

    // ── Persist ───────────────────────────────────────────────────────────────
    saveClasses(classes);
    saveStudents(students);
    saveRubrics(rubrics);
    saveStudentRubrics(studentRubrics);
    savePeerReviews(peerReviews);
    saveTests(tests);
    saveStudentTests(studentTests);
    saveEssayAssignments(essayAssignments);
    saveCommentSnippets(commentSnippets);
}
