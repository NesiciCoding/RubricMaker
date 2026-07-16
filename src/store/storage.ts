import type {
    Rubric,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    CommentSnippet,
    AppSettings,
    RubricFormat,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    DocumentAnalysisResult,
    RubricCriterion,
    UserTemplate,
    Test,
    StudentTest,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    GradingTask,
    Message,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
    StandardMasteryTarget,
    NewsFlash,
    NewsFlashRead,
    RubricVersion,
    QuestionBankItem,
    StaircaseStep,
} from '../types';
import { DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';
import { SCHOOL_YEARS } from '../data/schoolYears';

/**
 * `Class.year` used to be free text; classes carrying a pre-Phase-15.1 value that doesn't match
 * the new SchoolYear enum have it cleared so the class just shows as "year not set" (same as
 * today) rather than crashing type-narrowed code that assumes a valid enum member.
 */
export function sanitizeClassYears(classes: Class[]): Class[] {
    return classes.map((c) => (c.year && !SCHOOL_YEARS.includes(c.year) ? { ...c, year: undefined } : c));
}

// ─── Default Grade Scales ──────────────────────────────────────────────────────

export const DEFAULT_GRADE_SCALES: GradeScale[] = [
    {
        id: 'letter-10',
        name: 'Letter Grades (10-point)',
        type: 'letter',
        ranges: [
            { min: 90, max: 100, label: 'A', color: '#22c55e' },
            { min: 80, max: 89, label: 'B', color: '#84cc16' },
            { min: 70, max: 79, label: 'C', color: '#eab308' },
            { min: 60, max: 69, label: 'D', color: '#f97316' },
            { min: 0, max: 59, label: 'F', color: '#ef4444' },
        ],
    },
    {
        id: 'pass-fail',
        name: 'Pass / Fail',
        type: 'pass-fail',
        ranges: [
            { min: 55, max: 100, label: 'Pass', color: '#22c55e' },
            { min: 0, max: 54, label: 'Fail', color: '#ef4444' },
        ],
    },
    {
        id: 'dutch-10',
        name: 'Dutch Scale (1–10)',
        type: 'custom',
        ranges: [
            { min: 90, max: 100, label: '10', color: '#16a34a' },
            { min: 80, max: 89, label: '9', color: '#22c55e' },
            { min: 70, max: 79, label: '8', color: '#84cc16' },
            { min: 60, max: 69, label: '7', color: '#eab308' },
            { min: 55, max: 59, label: '6', color: '#f97316' },
            { min: 0, max: 54, label: '<6', color: '#ef4444' },
        ],
    },
];

export const DEFAULT_SETTINGS: AppSettings = {
    defaultGradeScaleId: 'letter-10',
    theme: 'light',
    language: 'en',
    accentColor: '',
    defaultFormat: DEFAULT_FORMAT,
};

// ─── Default Comment Bank ──────────────────────────────────────────────────────

const date = new Date().toISOString();

export const DEFAULT_COMMENT_BANK: CommentBankItem[] = [
    {
        id: 'cb-efl-1',
        text: 'Great effort in using new vocabulary in your writing today!',
        tags: ['EFL', 'Vocabulary', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-2',
        text: 'Your pronunciation of tricky sounds is improving steadily.',
        tags: ['EFL', 'Pronunciation', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-3',
        text: 'You communicated your ideas clearly and fluently.',
        tags: ['EFL', 'Fluency', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-4',
        text: 'Excellent use of transition words to connect your thoughts.',
        tags: ['EFL', 'Structure', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-5',
        text: 'Very natural pacing and intonation during your speaking task.',
        tags: ['EFL', 'Fluency', 'Pronunciation'],
        createdAt: date,
    },
    {
        id: 'cb-efl-6',
        text: 'Good job asking questions in English to clarify your understanding.',
        tags: ['EFL', 'Communication', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-7',
        text: 'Remember to double-check subject-verb agreement in your sentences.',
        tags: ['EFL', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-efl-8',
        text: 'Try to incorporate more complex sentence structures into your writing.',
        tags: ['EFL', 'Grammar', 'Structure'],
        createdAt: date,
    },
    {
        id: 'cb-efl-9',
        text: 'Pay close attention to verb tenses when describing past events.',
        tags: ['EFL', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-efl-10',
        text: 'Try to use more of the target vocabulary words we learned this week.',
        tags: ['EFL', 'Vocabulary', 'Improvement'],
        createdAt: date,
    },

    {
        id: 'cb-ef-1',
        text: 'Excellent job keeping your materials organized and ready for class.',
        tags: ['Exec Functions', 'Organization', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-2',
        text: 'You managed your time well and completed the task within the time limit.',
        tags: ['Exec Functions', 'Time Management', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-3',
        text: "Great focus and attention during today's independent work time.",
        tags: ['Exec Functions', 'Focus', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-4',
        text: 'You showed great resilience and stayed calm when facing a difficult problem.',
        tags: ['Exec Functions', 'Self-Regulation', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-5',
        text: 'Good job taking initiative and starting your work right away without needing reminders.',
        tags: ['Exec Functions', 'Initiative', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-6',
        text: 'You transitioned very smoothly between different activities today.',
        tags: ['Exec Functions', 'Flexibility', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-7',
        text: 'Try to break down larger projects into smaller, manageable steps so it feels less overwhelming.',
        tags: ['Exec Functions', 'Planning', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-ef-8',
        text: 'Remember to use your planner to keep track of upcoming deadlines and homework.',
        tags: ['Exec Functions', 'Organization', 'Time Management'],
        createdAt: date,
    },
    {
        id: 'cb-ef-9',
        text: 'Try to pause and double-check your work for small mistakes before turning it in.',
        tags: ['Exec Functions', 'Self-Monitoring', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-ef-10',
        text: 'If you feel yourself getting distracted, try using the strategies we discussed to refocus.',
        tags: ['Exec Functions', 'Focus', 'Self-Regulation'],
        createdAt: date,
    },

    // ── CEFR skill/level-tagged (Phase 21.5 convention: tags may include a CefrSkill and/or
    // CefrLevel string, matched against a criterion's cefrSkill/rubric's cefrTargetLevel to
    // drive comment-bank suggestions during grading) ──
    {
        id: 'cb-cefr-reading-1',
        text: "Great job picking out the main idea in a short text — you're reading with real confidence now.",
        tags: ['reading', 'A2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-2',
        text: 'Try re-reading tricky sentences slowly — it will help you catch details you might miss the first time.',
        tags: ['reading', 'A2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-3',
        text: 'You handled that longer text well, picking up on tone as well as content.',
        tags: ['reading', 'B1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-4',
        text: 'Work on skimming for the gist before diving into every detail — it will save you time on longer texts.',
        tags: ['reading', 'B1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-5',
        text: "Excellent inference skills — you're reading between the lines and picking up on implied meaning.",
        tags: ['reading', 'C1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-6',
        text: 'Push yourself with more nuanced, opinion-based texts to sharpen your critical reading further.',
        tags: ['reading', 'C1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-7',
        text: 'You matched simple words to pictures confidently — a great first step in reading.',
        tags: ['reading', 'A1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-8',
        text: 'Practice sounding out unfamiliar words slowly instead of guessing from the picture alone.',
        tags: ['reading', 'A1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-9',
        text: "You picked up on the writer's attitude, not just the facts — strong critical reading.",
        tags: ['reading', 'B2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-10',
        text: 'When a text uses more abstract vocabulary, slow down and reread the sentence before moving on.',
        tags: ['reading', 'B2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-11',
        text: 'You read with near-native ease, catching subtle humor and cultural references.',
        tags: ['reading', 'C2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-reading-12',
        text: 'Try texts with dense academic or literary style to keep stretching your reading range.',
        tags: ['reading', 'C2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-1',
        text: 'Nice, clear sentences — your basic writing is easy to follow.',
        tags: ['writing', 'A2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-2',
        text: 'Watch your word order in simple sentences — re-read your work out loud to catch mistakes.',
        tags: ['writing', 'A2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-3',
        text: 'Good paragraph structure — your ideas connect logically from one sentence to the next.',
        tags: ['writing', 'B1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-4',
        text: 'Try varying your sentence openings — too many sentences start the same way.',
        tags: ['writing', 'B1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-5',
        text: 'Sophisticated vocabulary choices and a confident, natural writing style.',
        tags: ['writing', 'C1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-6',
        text: 'Tighten up your argument structure — some points could be more concise.',
        tags: ['writing', 'C1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-7',
        text: 'You wrote simple, correct sentences about yourself — well done!',
        tags: ['writing', 'A1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-8',
        text: 'Practice writing full sentences instead of just words or phrases.',
        tags: ['writing', 'A1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-9',
        text: 'Your essay had a clear argument with well-organized paragraphs.',
        tags: ['writing', 'B2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-10',
        text: 'Work on linking paragraphs more smoothly with transition phrases.',
        tags: ['writing', 'B2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-11',
        text: "Precise, idiomatic writing that reads like a native speaker's.",
        tags: ['writing', 'C2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-writing-12',
        text: 'Push for even more stylistic variety — try switching between formal and informal register deliberately.',
        tags: ['writing', 'C2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-1',
        text: 'You spoke clearly and stayed on topic — well done!',
        tags: ['speaking_production', 'A2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-2',
        text: 'Try to slow down slightly so your pronunciation stays clear throughout.',
        tags: ['speaking_production', 'A2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-3',
        text: 'Good use of linking words to structure your talk.',
        tags: ['speaking_production', 'B1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-4',
        text: "Practice reducing filler words like 'um' — short pauses work just as well.",
        tags: ['speaking_production', 'B1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-5',
        text: 'Fluent and natural delivery, with a clear point of view throughout.',
        tags: ['speaking_production', 'C1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-6',
        text: 'Work on varying your intonation to keep listeners engaged during longer stretches.',
        tags: ['speaking_production', 'C1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-7',
        text: 'You introduced yourself clearly using simple, memorized phrases.',
        tags: ['speaking_production', 'A1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-8',
        text: "Practice a few more everyday phrases so you're not just relying on memorized lines.",
        tags: ['speaking_production', 'A1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-9',
        text: 'You gave a well-structured talk with a clear beginning, middle, and end.',
        tags: ['speaking_production', 'B2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-10',
        text: 'Work on speaking in longer stretches without stopping to search for words.',
        tags: ['speaking_production', 'B2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-11',
        text: 'Effortless, articulate delivery — you could easily pass as a native speaker.',
        tags: ['speaking_production', 'C2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-prod-12',
        text: 'Experiment with more rhetorical techniques (rhetorical questions, emphasis) to elevate an already excellent delivery.',
        tags: ['speaking_production', 'C2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-1',
        text: 'You answered questions with confidence and stayed engaged in the conversation.',
        tags: ['speaking_interaction', 'A2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-2',
        text: 'Try asking a follow-up question instead of just answering — it keeps the conversation going.',
        tags: ['speaking_interaction', 'A2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-3',
        text: 'Great turn-taking — you listened well and responded naturally.',
        tags: ['speaking_interaction', 'B1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-4',
        text: "Practice negotiating meaning when you don't understand — asking for clarification is a useful skill.",
        tags: ['speaking_interaction', 'B1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-5',
        text: 'You handled disagreement smoothly, defending your view while staying polite.',
        tags: ['speaking_interaction', 'C1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-6',
        text: 'Work on picking up on subtler cues from your conversation partner to react more quickly.',
        tags: ['speaking_interaction', 'C1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-7',
        text: 'You answered simple questions about yourself with confidence.',
        tags: ['speaking_interaction', 'A1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-8',
        text: 'Practice basic greetings and short exchanges until they feel automatic.',
        tags: ['speaking_interaction', 'A1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-9',
        text: 'You handled a spontaneous conversation smoothly, adapting to what your partner said.',
        tags: ['speaking_interaction', 'B2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-10',
        text: "Try to react a little faster in conversation — a short pause to think is fine, but don't over-plan your answer.",
        tags: ['speaking_interaction', 'B2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-11',
        text: 'You navigated a nuanced discussion effortlessly, including humor and idiom.',
        tags: ['speaking_interaction', 'C2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-speaking-inter-12',
        text: 'Keep seeking out native-speed group conversations to stay sharp at this level.',
        tags: ['speaking_interaction', 'C2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-1',
        text: 'You picked out the key information from the recording — nice work.',
        tags: ['listening', 'A2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-2',
        text: 'Listen to the audio a second time before answering — it helps catch details you missed.',
        tags: ['listening', 'A2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-3',
        text: 'Good job following the speaker even with some unfamiliar vocabulary.',
        tags: ['listening', 'B1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-4',
        text: 'Practice listening for tone and attitude, not just words — it changes the meaning.',
        tags: ['listening', 'B1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-5',
        text: 'You followed a fast, natural conversation with ease — impressive listening skills.',
        tags: ['listening', 'C1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-6',
        text: 'Challenge yourself with unscripted, authentic audio to sharpen listening at native speed.',
        tags: ['listening', 'C1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-7',
        text: 'You understood simple, slow instructions without help.',
        tags: ['listening', 'A1', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-8',
        text: 'Listen to short clips more than once — repetition really helps at this stage.',
        tags: ['listening', 'A1', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-9',
        text: 'You followed a conversation between two native speakers with only minor gaps.',
        tags: ['listening', 'B2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-10',
        text: 'Practice with different accents — you understood this one but might struggle with others.',
        tags: ['listening', 'B2', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-11',
        text: 'You caught every nuance in a fast, informal conversation — outstanding listening.',
        tags: ['listening', 'C2', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-cefr-listening-12',
        text: 'Try listening without subtitles to podcasts or films with regional dialects to keep progressing.',
        tags: ['listening', 'C2', 'Improvement'],
        createdAt: date,
    },

    // ── Grammar category comments (mirrors GRAMMAR_CATEGORIES in grammarStandards.ts —
    // one positive/improvement pair per category, tagged with the category label + its
    // typical CEFR level so these are filterable the same way as the CEFR-skill items above) ──
    {
        id: 'cb-grammar-present-simple-1',
        text: 'Solid use of present simple for daily routines and facts.',
        tags: ['Present Simple', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-present-simple-2',
        text: 'Watch the third-person -s (he go → he goes) in present simple.',
        tags: ['Present Simple', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-present-continuous-1',
        text: 'Nice use of the present continuous for things happening right now.',
        tags: ['Present Continuous', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-present-continuous-2',
        text: "Careful not to use present continuous for habits — 'I go to school every day', not 'I am going'.",
        tags: ['Present Continuous', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-simple-1',
        text: 'Good, consistent past simple forms throughout your writing.',
        tags: ['Past Simple', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-simple-2',
        text: 'A few irregular past forms need review (goed → went, buyed → bought).',
        tags: ['Past Simple', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-continuous-1',
        text: 'Nice use of past continuous to set the scene (I was walking when...).',
        tags: ['Past Continuous', 'A2', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-continuous-2',
        text: 'Practice combining past continuous and past simple in one sentence (I was reading when the phone rang).',
        tags: ['Past Continuous', 'A2', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-present-perfect-1',
        text: 'Correct use of present perfect for experiences and unfinished time periods.',
        tags: ['Present Perfect', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-present-perfect-2',
        text: "Watch the difference between past simple and present perfect — 'I have seen it' vs 'I saw it yesterday'.",
        tags: ['Present Perfect', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-perfect-1',
        text: 'Good use of past perfect to show one past event happened before another.',
        tags: ['Past Perfect', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-past-perfect-2',
        text: 'Try using past perfect a bit more in narratives to clarify the order of events.',
        tags: ['Past Perfect', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-future-1',
        text: "Confident use of 'going to' and 'will' for future plans.",
        tags: ['Future Forms', 'A2', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-future-2',
        text: "Review when to use 'will' (decisions/predictions) vs 'going to' (plans/intentions).",
        tags: ['Future Forms', 'A2', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-modals-1',
        text: 'Nice range of modals for ability, advice, and obligation.',
        tags: ['Modal Verbs', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-modals-2',
        text: "Double-check modal + deduction forms (must have, can't have) — these are still a bit shaky.",
        tags: ['Modal Verbs', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-conditionals-1',
        text: 'Clear, correctly formed first and second conditional sentences.',
        tags: ['Conditionals', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-conditionals-2',
        text: "Practice the third conditional (if I had known, I would have...) — it's the trickiest one.",
        tags: ['Conditionals', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-passive-1',
        text: "Good use of the passive voice where the doer of the action isn't the focus.",
        tags: ['Passive Voice', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-passive-2',
        text: 'Watch your past participles in passive sentences (the cake was maked → made).',
        tags: ['Passive Voice', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-reported-speech-1',
        text: 'Nice work shifting tenses correctly in reported speech.',
        tags: ['Reported Speech', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-reported-speech-2',
        text: 'Remember to also shift pronouns and time expressions (today → that day) in reported speech.',
        tags: ['Reported Speech', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-relative-clauses-1',
        text: 'Good use of relative pronouns (who, which, that) to combine ideas smoothly.',
        tags: ['Relative Clauses', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-relative-clauses-2',
        text: "Watch when to drop 'that/which' in defining relative clauses — it's often optional.",
        tags: ['Relative Clauses', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-clauses-1',
        text: 'Effective use of linking words to show cause, result, and contrast.',
        tags: ['Linking & Subordinate Clauses', 'B2', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-clauses-2',
        text: "Try varying your linkers beyond 'because' and 'but' — 'therefore', 'although', 'despite' add sophistication.",
        tags: ['Linking & Subordinate Clauses', 'B2', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-verb-patterns-1',
        text: "Correct choice between gerund and to-infinitive after verbs like 'enjoy' and 'want'.",
        tags: ['Verb Patterns', 'B1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-verb-patterns-2',
        text: 'A few verb + gerund/infinitive patterns need review — not all verbs follow the same rule.',
        tags: ['Verb Patterns', 'B1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-comparatives-1',
        text: 'Good use of comparatives and superlatives, including irregular forms.',
        tags: ['Comparatives & Superlatives', 'A2', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-comparatives-2',
        text: 'Watch the spelling of comparative/superlative forms (bigger, biggest — double the consonant).',
        tags: ['Comparatives & Superlatives', 'A2', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-articles-1',
        text: "Good instinct for when to use 'a/an' vs 'the'.",
        tags: ['Articles & Determiners', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-articles-2',
        text: 'Articles are tricky — review when no article is needed at all (uncountable/plural general nouns).',
        tags: ['Articles & Determiners', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-nouns-1',
        text: 'Solid, consistent use of regular and irregular plurals.',
        tags: ['Nouns & Plurals', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-nouns-2',
        text: 'A few irregular plurals need review (child → children, not childs).',
        tags: ['Nouns & Plurals', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-pronouns-1',
        text: 'Clear, accurate use of personal and possessive pronouns.',
        tags: ['Pronouns', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-pronouns-2',
        text: 'Watch subject vs object pronouns (me and him went → he and I went).',
        tags: ['Pronouns', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-adjectives-adverbs-1',
        text: 'Nice use of adverbs of manner to add detail to your writing.',
        tags: ['Adjectives & Adverbs', 'A2', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-adjectives-adverbs-2',
        text: 'Review adjective order (a beautiful old Italian car) — it can feel unnatural otherwise.',
        tags: ['Adjectives & Adverbs', 'A2', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-prepositions-1',
        text: 'Good, natural use of prepositions of time and place.',
        tags: ['Prepositions', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-prepositions-2',
        text: 'Prepositions of movement (into, onto, through) still need some practice.',
        tags: ['Prepositions', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-questions-negation-1',
        text: 'Clear, correctly formed questions and negatives.',
        tags: ['Questions & Negation', 'A1', 'Grammar', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-grammar-questions-negation-2',
        text: 'Watch auxiliary verb agreement in questions (Does she goes? → Does she go?).',
        tags: ['Questions & Negation', 'A1', 'Grammar', 'Improvement'],
        createdAt: date,
    },

    // ── Additional general-variety comments (broader than the original 20) ──
    {
        id: 'cb-general-1',
        text: 'You worked really well with your partner today, sharing ideas and listening to their input.',
        tags: ['EFL', 'Collaboration', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-general-2',
        text: "Try to include your partner's ideas more when working in pairs — it makes for stronger teamwork.",
        tags: ['EFL', 'Collaboration', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-general-3',
        text: 'Great job asking for help when you got stuck instead of giving up.',
        tags: ['Exec Functions', 'Self-Advocacy', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-general-4',
        text: 'It’s great to see you helping a classmate — that shows real kindness and leadership.',
        tags: ['Exec Functions', 'Leadership', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-general-5',
        text: "Try to check in with yourself midway through a task to see if you're on track.",
        tags: ['Exec Functions', 'Self-Monitoring', 'Improvement'],
        createdAt: date,
    },
];

// ─── Storage Keys ──────────────────────────────────────────────────────────────

const KEYS = {
    rubrics: 'rm_rubrics',
    students: 'rm_students',
    classes: 'rm_classes',
    studentRubrics: 'rm_student_rubrics',
    attachments: 'rm_attachments',
    gradeScales: 'rm_grade_scales',
    commentSnippets: 'rm_comment_snippets',
    settings: 'rm_settings',
    favoriteStandards: 'rm_favorite_standards',
    commentBank: 'rm_comment_bank',
    exportTemplates: 'rm_export_templates',
    peerReviews: 'rm_peer_reviews',
    selfAssessments: 'rm_self_assessments',
    speakingSessions: 'rm_speaking_sessions',
    analysisResults: 'rm_analysis_results',
    userTemplates: 'rm_user_templates',
    tests: 'rm_tests',
    studentTests: 'rm_student_tests',
    essayAssignments: 'rm_essay_assignments',
    essaySubmissions: 'rm_essay_submissions',
    essayTemplates: 'rm_essay_templates',
    gradingTasks: 'rm_grading_tasks',
    messages: 'rm_messages',
    flashcardDecks: 'rm_flashcard_decks',
    flashcardAssignments: 'rm_flashcard_assignments',
    flashcardReviews: 'rm_flashcard_reviews',
    standardMasteryTargets: 'rm_standard_mastery_targets',
    newsFlashes: 'rm_news_flashes',
    newsFlashReads: 'rm_news_flash_reads',
    questionBank: 'rm_question_bank',
};

// ─── Generic helpers ───────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function isQuotaExceededError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'QuotaExceededError';
}

let quotaExceededHandler: (() => void) | null = null;

/** Registers a callback fired whenever a write is dropped due to a full localStorage quota. */
export function onStorageQuotaExceeded(handler: () => void): void {
    quotaExceededHandler = handler;
}

function save<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('[storage] write failed (quota exceeded?):', key, e);
        if (isQuotaExceededError(e)) {
            quotaExceededHandler?.();
            return;
        }
        throw e;
    }
}

// ─── Rubric version history (Phase 18.4) ────────────────────────────────────────
// Kept in their own per-rubric key rather than embedded in `rubrics` (the old
// shape) so version snapshots never ride along in the payload that gets synced
// on every rubric save — that embedding was measured to inflate a save/hydrate
// ~20x. Not part of `StoreData`/`loadStore()`: fetched only when the version
// history UI actually opens (see AppContext's `fetchRubricVersions`).

const MAX_AUTO_VERSIONS = 20;

function rubricVersionsKey(rubricId: string): string {
    return `rm_rubric_versions_${rubricId}`;
}

export function loadRubricVersions(rubricId: string): RubricVersion[] {
    return load<RubricVersion[]>(rubricVersionsKey(rubricId), []);
}

/**
 * Upserts a version into the local cache. Returns the ids of any auto-versions
 * evicted by the cap so the caller can prune the same rows server-side —
 * otherwise remote history grows unbounded while the local cache stays capped.
 */
export function upsertRubricVersion(
    rubricId: string,
    version: RubricVersion
): { versions: RubricVersion[]; evictedIds: string[] } {
    const existing = loadRubricVersions(rubricId).filter((v) => v.id !== version.id);
    const isAuto = version.label?.startsWith('auto:') ?? false;
    const manuals = existing.filter((v) => !v.label?.startsWith('auto:'));
    const autos = existing.filter((v) => v.label?.startsWith('auto:'));
    const combinedAutos = isAuto ? [...autos, version] : autos;
    const evictedIds = combinedAutos.slice(0, Math.max(0, combinedAutos.length - MAX_AUTO_VERSIONS)).map((v) => v.id);
    const nextAutos = combinedAutos.slice(-MAX_AUTO_VERSIONS);
    const next = isAuto ? [...manuals, ...nextAutos] : [...manuals, version, ...autos];
    save(rubricVersionsKey(rubricId), next);
    return { versions: next, evictedIds };
}

export function deleteRubricVersions(rubricId: string): void {
    localStorage.removeItem(rubricVersionsKey(rubricId));
}

/**
 * Rubrics saved before Phase 18.4 still carry an embedded `versions` array.
 * Lifts it into the per-rubric store (deduped by id, so re-running this is a
 * no-op after the first time) and strips it from the rubric going forward.
 */
export function migrateLegacyRubricVersions(rubric: Rubric & { versions?: RubricVersion[] }): Rubric {
    if (!rubric.versions?.length) return rubric;
    const { versions: legacy, ...rest } = rubric;
    legacy.forEach((v, i) => upsertRubricVersion(rubric.id, { ...v, id: v.id ?? `legacy_${rubric.id}_${i}` }));
    return rest;
}

/**
 * The app used to have two parallel comment-bank features: the single-tag
 * `CommentSnippet` (fed only the old standalone Comment Bank page) and the
 * multi-tag, department-shareable `CommentBankItem` (used everywhere during
 * grading). They've been consolidated onto `CommentBankItem` — this lifts any
 * pre-existing snippets into the bank (deduped by id, so re-running this is a
 * no-op once nothing is left to migrate).
 */
export function mergeLegacyCommentSnippets(snippets: CommentSnippet[], bank: CommentBankItem[]): CommentBankItem[] {
    if (!snippets.length) return bank;
    const existingIds = new Set(bank.map((item) => item.id));
    const lifted: CommentBankItem[] = snippets
        .filter((s) => !existingIds.has(s.id))
        .map((s) => ({
            id: s.id,
            text: s.text,
            tags: [s.tag],
            createdAt: s.updatedAt ?? new Date().toISOString(),
            updatedAt: s.updatedAt,
        }));
    return lifted.length ? [...bank, ...lifted] : bank;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export interface StoreData {
    rubrics: Rubric[];
    students: Student[];
    classes: Class[];
    studentRubrics: StudentRubric[];
    attachments: Attachment[];
    gradeScales: GradeScale[];
    settings: AppSettings;
    favoriteStandards: LinkedStandard[];
    commentBank: CommentBankItem[];
    exportTemplates: ExportTemplate[];
    peerReviews: StudentRubric[];
    selfAssessments: SelfAssessment[];
    speakingSessions: SpeakingSession[];
    analysisResults: DocumentAnalysisResult[];
    userTemplates: UserTemplate[];
    tests: Test[];
    studentTests: StudentTest[];
    essayAssignments: EssayAssignment[];
    essaySubmissions: EssaySubmission[];
    essayTemplates: EssayTemplate[];
    gradingTasks: GradingTask[];
    messages: Message[];
    flashcardDecks: FlashcardDeck[];
    flashcardAssignments: FlashcardAssignment[];
    flashcardReviews: FlashcardReview[];
    standardMasteryTargets: StandardMasteryTarget[];
    newsFlashes: NewsFlash[];
    newsFlashReads: NewsFlashRead[];
    questionBank: QuestionBankItem[];
}

export function loadStore(): StoreData {
    const rawRubrics = load<(Rubric & { versions?: RubricVersion[] })[]>(KEYS.rubrics, []);
    const rubrics = rawRubrics.map(migrateLegacyRubricVersions);
    if (rubrics.some((r, i) => r !== rawRubrics[i])) save(KEYS.rubrics, rubrics);

    const legacySnippets = load<CommentSnippet[]>(KEYS.commentSnippets, []);
    const rawCommentBank = load<CommentBankItem[]>(KEYS.commentBank, DEFAULT_COMMENT_BANK);
    const commentBank = mergeLegacyCommentSnippets(legacySnippets, rawCommentBank);
    if (commentBank !== rawCommentBank) {
        save(KEYS.commentBank, commentBank);
        localStorage.removeItem(KEYS.commentSnippets);
    }

    return {
        rubrics,
        students: load<Student[]>(KEYS.students, []),
        classes: sanitizeClassYears(load<Class[]>(KEYS.classes, [{ id: 'default', name: 'Default Class' }])),
        studentRubrics: load<StudentRubric[]>(KEYS.studentRubrics, []),
        attachments: load<Attachment[]>(KEYS.attachments, []),
        gradeScales: load<GradeScale[]>(KEYS.gradeScales, DEFAULT_GRADE_SCALES),
        settings: load<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
        favoriteStandards: load<LinkedStandard[]>(KEYS.favoriteStandards, []),
        commentBank,
        exportTemplates: load<ExportTemplate[]>(KEYS.exportTemplates, []),
        peerReviews: load<StudentRubric[]>(KEYS.peerReviews, []),
        selfAssessments: load<SelfAssessment[]>(KEYS.selfAssessments, []),
        speakingSessions: load<SpeakingSession[]>(KEYS.speakingSessions, []),
        analysisResults: load<DocumentAnalysisResult[]>(KEYS.analysisResults, []),
        userTemplates: load<UserTemplate[]>(KEYS.userTemplates, []),
        tests: load<Test[]>(KEYS.tests, []),
        studentTests: load<StudentTest[]>(KEYS.studentTests, []),
        essayAssignments: load<EssayAssignment[]>(KEYS.essayAssignments, []),
        essaySubmissions: load<EssaySubmission[]>(KEYS.essaySubmissions, []),
        essayTemplates: load<EssayTemplate[]>(KEYS.essayTemplates, []),
        gradingTasks: load<GradingTask[]>(KEYS.gradingTasks, []),
        messages: load<Message[]>(KEYS.messages, []),
        flashcardDecks: load<FlashcardDeck[]>(KEYS.flashcardDecks, []),
        flashcardAssignments: load<FlashcardAssignment[]>(KEYS.flashcardAssignments, []),
        flashcardReviews: load<FlashcardReview[]>(KEYS.flashcardReviews, []),
        standardMasteryTargets: load<StandardMasteryTarget[]>(KEYS.standardMasteryTargets, []),
        newsFlashes: load<NewsFlash[]>(KEYS.newsFlashes, []),
        newsFlashReads: load<NewsFlashRead[]>(KEYS.newsFlashReads, []),
        questionBank: load<QuestionBankItem[]>(KEYS.questionBank, []),
    };
}

export function saveRubrics(rubrics: Rubric[]) {
    save(KEYS.rubrics, rubrics);
}
export function saveStudents(students: Student[]) {
    save(KEYS.students, students);
}
export function saveClasses(classes: Class[]) {
    save(KEYS.classes, classes);
}
export function saveStudentRubrics(srs: StudentRubric[]) {
    try {
        localStorage.setItem(KEYS.studentRubrics, JSON.stringify(srs));
    } catch (e) {
        if (!isQuotaExceededError(e)) throw e;
        // Embedded voice-feedback audio in older entries is usually what pushes this over —
        // retry without it so grades/comments still persist rather than dropping the whole
        // write. Only the audio itself stays at risk until the next successful sync, same as
        // it already was before this retry (see stripAudioForOfflineCache below).
        try {
            localStorage.setItem(KEYS.studentRubrics, JSON.stringify(stripAudioForOfflineCache(srs)));
            console.warn('[storage] rm_student_rubrics exceeded quota with audio; retried without it');
        } catch (e2) {
            console.error(
                '[storage] write failed even after stripping audio (quota exceeded?):',
                KEYS.studentRubrics,
                e2
            );
            quotaExceededHandler?.();
        }
    }
}

/**
 * Strips embedded base64 voice-feedback audio before writing the post-hydrate offline-readiness
 * cache to localStorage — those recordings already live safely in Supabase at that point, and
 * a handful of them is enough to blow the ~5-10MB localStorage quota (issue #275). Only used for
 * the connected-session cache write; never for the genuinely-offline save path, where the
 * recording has no other copy yet.
 */
export function stripAudioForOfflineCache(srs: StudentRubric[]): StudentRubric[] {
    return srs.map((sr) =>
        sr.entries.some((e) => e.audioDataUrl)
            ? { ...sr, entries: sr.entries.map((e) => (e.audioDataUrl ? { ...e, audioDataUrl: undefined } : e)) }
            : sr
    );
}
export function saveAttachments(atts: Attachment[]) {
    save(KEYS.attachments, atts);
}
export function saveGradeScales(scales: GradeScale[]) {
    save(KEYS.gradeScales, scales);
}
export function saveSettings(settings: AppSettings) {
    save(KEYS.settings, settings);
}
export function saveFavoriteStandards(favs: LinkedStandard[]) {
    save(KEYS.favoriteStandards, favs);
}
export function saveCommentBank(items: CommentBankItem[]) {
    save(KEYS.commentBank, items);
}
export function saveExportTemplates(templates: ExportTemplate[]) {
    save(KEYS.exportTemplates, templates);
}
export function savePeerReviews(reviews: StudentRubric[]) {
    save(KEYS.peerReviews, reviews);
}
export function saveSelfAssessments(sas: SelfAssessment[]) {
    save(KEYS.selfAssessments, sas);
}
export function saveSpeakingSessions(sessions: SpeakingSession[]) {
    save(KEYS.speakingSessions, sessions);
}
export function saveAnalysisResults(results: DocumentAnalysisResult[]) {
    save(KEYS.analysisResults, results);
}
export function saveTests(tests: Test[]) {
    save(KEYS.tests, tests);
}
export function saveStudentTests(studentTests: StudentTest[]) {
    save(KEYS.studentTests, studentTests);
}
export function saveEssayAssignments(assignments: EssayAssignment[]) {
    save(KEYS.essayAssignments, assignments);
}
export function saveEssaySubmissions(submissions: EssaySubmission[]) {
    save(KEYS.essaySubmissions, submissions);
}
export function saveEssayTemplates(templates: EssayTemplate[]) {
    save(KEYS.essayTemplates, templates);
}
export function saveGradingTasks(tasks: GradingTask[]) {
    save(KEYS.gradingTasks, tasks);
}
export function saveFlashcardDecks(decks: FlashcardDeck[]) {
    save(KEYS.flashcardDecks, decks);
}
export function saveFlashcardAssignments(assignments: FlashcardAssignment[]) {
    save(KEYS.flashcardAssignments, assignments);
}
export function saveFlashcardReviews(reviews: FlashcardReview[]) {
    save(KEYS.flashcardReviews, reviews);
}
export function saveStandardMasteryTargets(targets: StandardMasteryTarget[]) {
    save(KEYS.standardMasteryTargets, targets);
}
export function saveMessages(messages: Message[]) {
    save(KEYS.messages, messages);
}
export function saveNewsFlashes(flashes: NewsFlash[]) {
    save(KEYS.newsFlashes, flashes);
}
export function saveNewsFlashReads(reads: NewsFlashRead[]) {
    save(KEYS.newsFlashReads, reads);
}
export function saveQuestionBank(items: QuestionBankItem[]) {
    save(KEYS.questionBank, items);
}

// ─── Local data wipe (user switch / sign-out) ─────────────────────────────────

// Connection settings survive a wipe; everything else under the rm_ prefix
// (entity data, pending queue, migration/tour flags, last-sync marker) goes.
const WIPE_PRESERVED_KEYS = new Set(['rm_supabase_config', 'rm_local_mode']);

export function clearLocalData(): void {
    try {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('rm_') && !WIPE_PRESERVED_KEYS.has(key)) doomed.push(key);
        }
        doomed.forEach((key) => localStorage.removeItem(key));
    } catch {
        // storage unavailable — nothing to wipe
    }
}

// ─── Full Backup / Restore ─────────────────────────────────────────────────────

export function exportStore(state: StoreData): StoreData {
    return state;
}

export function exportFullBackup(): string {
    return JSON.stringify(loadStore(), null, 2);
}

// ─── Backup import validators ──────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Returns true when `v` is an array (including empty) whose every element is a
 * non-null object with a string `id` property. Empty arrays are intentionally
 * accepted — a backup with zero rubrics is a valid partial backup.
 */
function isObjectArray(v: unknown): boolean {
    return (
        Array.isArray(v) &&
        v.every((item) => isPlainObject(item) && typeof (item as Record<string, unknown>).id === 'string')
    );
}

/**
 * Restores app state from a backup JSON string.
 *
 * Each field is validated independently: invalid fields are skipped with a
 * console warning rather than aborting the whole import. The function returns
 * false only when the JSON itself is unparseable or the top-level value is not
 * a plain object.
 */
export function importFullBackup(json: string): boolean {
    try {
        const raw = JSON.parse(json) as unknown;
        if (!isPlainObject(raw)) return false;
        const data = raw as Partial<StoreData>;

        if (data.rubrics !== undefined) {
            // Structural validation: each rubric must have an id and a criteria array.
            // Individual RubricCriterion fields are not validated because backup files
            // are produced by exportFullBackup and are assumed to be structurally sound.
            if (
                isObjectArray(data.rubrics) &&
                (data.rubrics as unknown[]).every((r) => Array.isArray((r as Rubric).criteria))
            )
                saveRubrics(data.rubrics as Rubric[]);
            else console.warn('[importFullBackup] rubrics failed validation — skipped');
        }
        if (data.students !== undefined) {
            if (isObjectArray(data.students)) saveStudents(data.students as Student[]);
            else console.warn('[importFullBackup] students failed validation — skipped');
        }
        if (data.classes !== undefined) {
            if (isObjectArray(data.classes)) saveClasses(data.classes as Class[]);
            else console.warn('[importFullBackup] classes failed validation — skipped');
        }
        if (data.studentRubrics !== undefined) {
            if (isObjectArray(data.studentRubrics)) saveStudentRubrics(data.studentRubrics as StudentRubric[]);
            else console.warn('[importFullBackup] studentRubrics failed validation — skipped');
        }
        if (data.attachments !== undefined) {
            if (isObjectArray(data.attachments)) saveAttachments(data.attachments as Attachment[]);
            else console.warn('[importFullBackup] attachments failed validation — skipped');
        }
        if (data.gradeScales !== undefined) {
            if (isObjectArray(data.gradeScales)) saveGradeScales(data.gradeScales as GradeScale[]);
            else console.warn('[importFullBackup] gradeScales failed validation — skipped');
        }
        if (data.settings !== undefined) {
            if (isPlainObject(data.settings)) saveSettings(data.settings as AppSettings);
            else console.warn('[importFullBackup] settings failed validation — skipped');
        }
        if (data.favoriteStandards !== undefined) {
            if (
                Array.isArray(data.favoriteStandards) &&
                data.favoriteStandards.every(
                    (s) => isPlainObject(s) && typeof (s as Record<string, unknown>).guid === 'string'
                )
            )
                saveFavoriteStandards(data.favoriteStandards as LinkedStandard[]);
            else console.warn('[importFullBackup] favoriteStandards failed validation — skipped');
        }
        if (data.commentBank !== undefined) {
            if (isObjectArray(data.commentBank)) saveCommentBank(data.commentBank as CommentBankItem[]);
            else console.warn('[importFullBackup] commentBank failed validation — skipped');
        }
        // Legacy backups (pre comment-bank consolidation) may still carry a top-level
        // `commentSnippets` array — no longer part of StoreData, so read it off the raw
        // parsed JSON — lift it into whatever commentBank state this import just left on
        // disk (or the existing one, if this backup had no commentBank key).
        const legacyCommentSnippets = (raw as Record<string, unknown>).commentSnippets;
        if (legacyCommentSnippets !== undefined) {
            if (isObjectArray(legacyCommentSnippets)) {
                const currentBank = load<CommentBankItem[]>(KEYS.commentBank, DEFAULT_COMMENT_BANK);
                saveCommentBank(mergeLegacyCommentSnippets(legacyCommentSnippets as CommentSnippet[], currentBank));
            } else console.warn('[importFullBackup] commentSnippets failed validation — skipped');
        }
        if (data.exportTemplates !== undefined) {
            if (isObjectArray(data.exportTemplates)) saveExportTemplates(data.exportTemplates as ExportTemplate[]);
            else console.warn('[importFullBackup] exportTemplates failed validation — skipped');
        }
        if (data.peerReviews !== undefined) {
            if (isObjectArray(data.peerReviews)) savePeerReviews(data.peerReviews as StudentRubric[]);
            else console.warn('[importFullBackup] peerReviews failed validation — skipped');
        }
        if (data.selfAssessments !== undefined) {
            if (isObjectArray(data.selfAssessments)) saveSelfAssessments(data.selfAssessments as SelfAssessment[]);
            else console.warn('[importFullBackup] selfAssessments failed validation — skipped');
        }
        if (data.speakingSessions !== undefined) {
            if (isObjectArray(data.speakingSessions)) saveSpeakingSessions(data.speakingSessions as SpeakingSession[]);
            else console.warn('[importFullBackup] speakingSessions failed validation — skipped');
        }
        if (data.analysisResults !== undefined) {
            if (isObjectArray(data.analysisResults))
                saveAnalysisResults(data.analysisResults as DocumentAnalysisResult[]);
            else console.warn('[importFullBackup] analysisResults failed validation — skipped');
        }
        if (data.tests !== undefined) {
            if (isObjectArray(data.tests)) saveTests(data.tests as Test[]);
            else console.warn('[importFullBackup] tests failed validation — skipped');
        }
        if (data.studentTests !== undefined) {
            if (isObjectArray(data.studentTests)) saveStudentTests(data.studentTests as StudentTest[]);
            else console.warn('[importFullBackup] studentTests failed validation — skipped');
        }
        if (data.essayAssignments !== undefined) {
            if (
                Array.isArray(data.essayAssignments) &&
                data.essayAssignments.every(
                    (a) =>
                        isPlainObject(a) &&
                        typeof (a as Record<string, unknown>).teacherKey === 'string' &&
                        typeof (a as Record<string, unknown>).studentId === 'string'
                )
            )
                saveEssayAssignments(data.essayAssignments as EssayAssignment[]);
            else console.warn('[importFullBackup] essayAssignments failed validation — skipped');
        }
        if (data.essaySubmissions !== undefined) {
            if (isObjectArray(data.essaySubmissions)) saveEssaySubmissions(data.essaySubmissions as EssaySubmission[]);
            else console.warn('[importFullBackup] essaySubmissions failed validation — skipped');
        }
        if (data.essayTemplates !== undefined) {
            if (isObjectArray(data.essayTemplates)) saveEssayTemplates(data.essayTemplates as EssayTemplate[]);
            else console.warn('[importFullBackup] essayTemplates failed validation — skipped');
        }
        if (data.gradingTasks !== undefined) {
            if (
                Array.isArray(data.gradingTasks) &&
                data.gradingTasks.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        typeof (t as Record<string, unknown>).rubricId === 'string' &&
                        typeof (t as Record<string, unknown>).studentId === 'string' &&
                        typeof (t as Record<string, unknown>).assignedToTeacher === 'string' &&
                        typeof (t as Record<string, unknown>).assignedAt === 'string'
                )
            )
                saveGradingTasks(data.gradingTasks as GradingTask[]);
            else console.warn('[importFullBackup] gradingTasks failed validation — skipped');
        }
        if (data.messages !== undefined) {
            if (
                Array.isArray(data.messages) &&
                data.messages.every(
                    (m) =>
                        isPlainObject(m) &&
                        typeof (m as Record<string, unknown>).id === 'string' &&
                        typeof (m as Record<string, unknown>).studentId === 'string' &&
                        typeof (m as Record<string, unknown>).contextType === 'string' &&
                        typeof (m as Record<string, unknown>).sender === 'string' &&
                        typeof (m as Record<string, unknown>).body === 'string'
                )
            )
                saveMessages(data.messages as Message[]);
            else console.warn('[importFullBackup] messages failed validation — skipped');
        }
        if (data.userTemplates !== undefined) {
            if (
                Array.isArray(data.userTemplates) &&
                data.userTemplates.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        Array.isArray((t as UserTemplate).criteria)
                )
            )
                saveUserTemplates(data.userTemplates as UserTemplate[]);
            else console.warn('[importFullBackup] userTemplates failed validation — skipped');
        }
        if (data.flashcardDecks !== undefined) {
            if (
                isObjectArray(data.flashcardDecks) &&
                (data.flashcardDecks as unknown[]).every((d) => Array.isArray((d as FlashcardDeck).cards))
            )
                saveFlashcardDecks(data.flashcardDecks as FlashcardDeck[]);
            else console.warn('[importFullBackup] flashcardDecks failed validation — skipped');
        }
        if (data.flashcardAssignments !== undefined) {
            if (
                Array.isArray(data.flashcardAssignments) &&
                data.flashcardAssignments.every(
                    (a) =>
                        isPlainObject(a) &&
                        typeof (a as Record<string, unknown>).deckId === 'string' &&
                        typeof (a as Record<string, unknown>).studentId === 'string'
                )
            )
                saveFlashcardAssignments(data.flashcardAssignments as FlashcardAssignment[]);
            else console.warn('[importFullBackup] flashcardAssignments failed validation — skipped');
        }
        if (data.flashcardReviews !== undefined) {
            if (
                Array.isArray(data.flashcardReviews) &&
                data.flashcardReviews.every(
                    (r) =>
                        isPlainObject(r) &&
                        typeof (r as Record<string, unknown>).id === 'string' &&
                        isPlainObject((r as Record<string, unknown>).cardStates)
                )
            )
                saveFlashcardReviews(data.flashcardReviews as FlashcardReview[]);
            else console.warn('[importFullBackup] flashcardReviews failed validation — skipped');
        }
        if (data.standardMasteryTargets !== undefined) {
            if (
                Array.isArray(data.standardMasteryTargets) &&
                data.standardMasteryTargets.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        typeof (t as Record<string, unknown>).standardGuid === 'string' &&
                        typeof (t as Record<string, unknown>).year === 'string' &&
                        typeof (t as Record<string, unknown>).targetPercentage === 'number'
                )
            )
                saveStandardMasteryTargets(data.standardMasteryTargets as StandardMasteryTarget[]);
            else console.warn('[importFullBackup] standardMasteryTargets failed validation — skipped');
        }
        if (data.newsFlashes !== undefined) {
            if (
                Array.isArray(data.newsFlashes) &&
                data.newsFlashes.every(
                    (f) =>
                        isPlainObject(f) &&
                        typeof (f as Record<string, unknown>).id === 'string' &&
                        typeof (f as Record<string, unknown>).title === 'string' &&
                        typeof (f as Record<string, unknown>).kind === 'string'
                )
            )
                saveNewsFlashes(data.newsFlashes as NewsFlash[]);
            else console.warn('[importFullBackup] newsFlashes failed validation — skipped');
        }
        if (data.newsFlashReads !== undefined) {
            if (
                Array.isArray(data.newsFlashReads) &&
                data.newsFlashReads.every(
                    (r) =>
                        isPlainObject(r) &&
                        typeof (r as Record<string, unknown>).id === 'string' &&
                        typeof (r as Record<string, unknown>).flashId === 'string' &&
                        typeof (r as Record<string, unknown>).studentId === 'string'
                )
            )
                saveNewsFlashReads(data.newsFlashReads as NewsFlashRead[]);
            else console.warn('[importFullBackup] newsFlashReads failed validation — skipped');
        }
        if (data.questionBank !== undefined) {
            if (
                Array.isArray(data.questionBank) &&
                data.questionBank.every(
                    (q) =>
                        isPlainObject(q) &&
                        typeof (q as Record<string, unknown>).id === 'string' &&
                        isPlainObject((q as Record<string, unknown>).question)
                )
            )
                saveQuestionBank(data.questionBank as QuestionBankItem[]);
            else console.warn('[importFullBackup] questionBank failed validation — skipped');
        }
        return true;
    } catch (e) {
        console.error('Import failed', e);
        return false;
    }
}

export function updateDefaultFormat(f: RubricFormat) {
    const s = load<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
    saveSettings({ ...s, defaultFormat: f });
}

const CLIPBOARD_KEY = 'rubric_criterion_clipboard';

export function saveCriterionClipboard(criterion: RubricCriterion): void {
    save(CLIPBOARD_KEY, criterion);
}

export function loadCriterionClipboard(): RubricCriterion | null {
    return load<RubricCriterion | null>(CLIPBOARD_KEY, null);
}

// ─── Pending Sync Queue ────────────────────────────────────────────────────────

const PENDING_SYNC_KEY = 'rm_pending_sync';

export interface PendingWrite {
    id: string;
    entity: string;
    action: 'upsert' | 'delete';
    payload: unknown;
    entityId?: string;
    queuedAt: string;
}

function pendingKey(op: Pick<PendingWrite, 'entity' | 'action' | 'payload' | 'entityId'>): string {
    // entityId is authoritative when present (every call site passes it, including upserts —
    // required for entities like essayBatchAssignment whose payload has no id/guid field to
    // fall back to). The payload.id fallback only serves callers that predate that change.
    const eid = op.entityId ?? (op.payload as Record<string, unknown> | null)?.id;
    return `${op.entity}:${eid ?? 'singleton'}`;
}

export function loadPendingQueue(): PendingWrite[] {
    try {
        const raw = localStorage.getItem(PENDING_SYNC_KEY);
        return raw ? (JSON.parse(raw) as PendingWrite[]) : [];
    } catch {
        return [];
    }
}

// One entry per entity:id (upserts are deduped), so the cap is only reached after
// ~500 distinct records are touched while pushes keep failing. Drop-oldest at the
// cap; consider a per-entity eviction policy if teachers ever hit it.
const MAX_PENDING_OPS = 500;

export function addToPendingQueue(op: Omit<PendingWrite, 'id' | 'queuedAt'>): void {
    try {
        const queue = loadPendingQueue();
        const key = pendingKey(op);
        const idx = queue.findIndex((q) => pendingKey(q) === key);
        const entry: PendingWrite = {
            ...op,
            id: nanoid(),
            queuedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
            queue[idx] = entry;
        } else {
            if (queue.length >= MAX_PENDING_OPS) {
                console.warn('[storage] pending-sync queue full — dropping oldest entry', queue[0]);
                queue.shift();
                // Same handler as a quota error — the dropped entry is unsynced data loss
                // just like a failed write, and the user has no other way to know.
                quotaExceededHandler?.();
            }
            queue.push(entry);
        }
        localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch (e) {
        // The queued edit now exists only in memory — surface it instead of losing it silently.
        console.error('[storage] pending-sync queue write failed:', e);
        if (isQuotaExceededError(e)) quotaExceededHandler?.();
    }
}

export function removePendingWrites(ids: string[]): void {
    try {
        const idSet = new Set(ids);
        const queue = loadPendingQueue().filter((q) => !idSet.has(q.id));
        localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch {
        // ignore
    }
}

// ─── User templates ────────────────────────────────────────────────────────────

export function loadUserTemplates(): UserTemplate[] {
    return load<UserTemplate[]>(KEYS.userTemplates, []);
}

export function saveUserTemplates(templates: UserTemplate[]): void {
    save(KEYS.userTemplates, templates);
}

// ─── Student test attempt drafts (per-device, not synced) ─────────────────────

export interface TestDraft {
    answers: Record<string, string>;
    savedAt: string;
    /** Sections visited so far, in order — only set while taking a staged (placement) test, so a reload resumes at the right stage */
    sectionPath?: string[];
    /** The adaptive question trace so far — only set while taking a staircase (placement) test, so a reload resumes at the right level */
    levelPath?: StaircaseStep[];
}

export function loadTestDraft(draftKey: string): TestDraft | null {
    return load<TestDraft | null>(draftKey, null);
}

export function saveTestDraft(draftKey: string, data: TestDraft): void {
    save(draftKey, data);
}

export function clearTestDraft(draftKey: string): void {
    try {
        localStorage.removeItem(draftKey);
    } catch {
        // ignore
    }
}

export function loadTestTimer(timerKey: string): number | null {
    try {
        const raw = sessionStorage.getItem(timerKey);
        if (!raw) return null;
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, parsed);
    } catch {
        return null;
    }
}

export function saveTestTimer(timerKey: string, seconds: number): void {
    try {
        sessionStorage.setItem(timerKey, String(seconds));
    } catch {
        // ignore
    }
}

export function clearTestTimer(timerKey: string): void {
    try {
        sessionStorage.removeItem(timerKey);
    } catch {
        // ignore
    }
}
