// ─── Core Domain Types for Rubric Maker ───────────────────────────────────────

import type { PeriodReportEntry } from '../utils/periodReportExport';
import type { LearningGoalAggregate } from '../utils/learningGoalsAggregator';
import type { StandardSetGroup, CefrStudentOverview } from '../utils/cefrStudentAggregator';

// ─── CEFR / ERK Types ─────────────────────────────────────────────────────────

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type CefrSkill = 'reading' | 'writing' | 'speaking_production' | 'speaking_interaction' | 'listening';

export interface CefrDescriptor {
    id: string;
    level: CefrLevel;
    skill: CefrSkill;
    /** The Can-Do statement in English */
    descriptionEn: string;
    /** The Can-Do statement in Dutch */
    descriptionNl: string;
}

/**
 * 4-point confidence scale for CEFR self-assessments.
 * 1 = Not yet, 2 = Sometimes, 3 = Usually, 4 = Confident/Always.
 */
export type ConfidenceLevel = 1 | 2 | 3 | 4;

/** A single descriptor rating in a student self-assessment */
export interface SelfAssessmentRating {
    descriptorId: string;
    level: CefrLevel;
    skill: CefrSkill;
    /** true = student feels confident with this Can-Do statement (legacy field, kept for compat) */
    confident: boolean;
    /** Graduated 4-point confidence scale. When present, overrides the binary confident field. */
    confidenceLevel?: ConfidenceLevel;
}

/** A student's self-assessment of CEFR Can-Do descriptors for a rubric */
export interface SelfAssessment {
    id: string;
    rubricId: string;
    studentId: string;
    ratings: SelfAssessmentRating[];
    /** Free-text student reflection */
    reflection?: string;
    submittedAt: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

/** A CEFR Can-Do statement linked to a rubric criterion */
export interface LinkedCefrDescriptor {
    descriptorId: string;
    level: CefrLevel;
    skill: CefrSkill;
    descriptionEn: string;
    descriptionNl: string;
}

/** Framework type for non-CEFR assessment frameworks */
export type AssessmentFramework = 'ib' | 'blooms' | 'grammar';

/** A descriptor from IB Learner Profile, Bloom's Taxonomy, or the grammar linker, linked to a rubric criterion */
export interface LinkedFrameworkDescriptor {
    descriptorId: string;
    framework: AssessmentFramework;
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    descriptionEn: string;
    descriptionNl: string;
    /** CEFR level — set for grammar descriptors so chips can show their level */
    level?: CefrLevel;
}

/** A single English grammar standard (e.g. "Past Simple — irregular verbs"). */
export interface GrammarItem {
    id: string;
    level: CefrLevel;
    labelEn: string;
    labelNl: string;
    examplesEn?: string[];
    /** Links to a GRAMMAR_PATTERNS rule in grammarChecker.ts. Absent = not auto-detectable. */
    detectShorthand?: string;
}

/** A grammar topic header grouping its individually-linkable distinctions. */
export interface GrammarCategory {
    id: string;
    labelEn: string;
    labelNl: string;
    color: string;
    items: GrammarItem[];
}

/** A single item inside a level — awarded via checkbox or scored via points */
export interface SubItem {
    id: string;
    label: string;
    points?: number; // legacy/default points
    minPoints?: number;
    maxPoints?: number;
    linkedStandards?: LinkedStandard[];
}

export interface RubricLevel {
    id: string;
    label: string; // e.g. "Excellent", "4"
    minPoints: number; // minimum points for this level (can equal maxPoints)
    maxPoints: number; // maximum points for this level
    description: string; // descriptor text in the cell
    subItems: SubItem[]; // optional fine-grain checklist (alongside range)
    /** CEFR level this performance level maps to. Used for per-criterion CEFR aggregation. */
    cefrLevel?: CefrLevel;
}

export interface LinkedStandard {
    guid: string;
    statementNotation?: string; // e.g. "CCSS.ELA-LITERACY.RH.6-8.1"
    description: string;
    standardSetTitle: string;
    jurisdictionTitle: string;
    ancestorIds?: string[];
    depth?: number;
}

export interface RubricCriterion {
    id: string;
    title: string;
    description: string; // optional sub-description shown under title
    weight: number; // 0–100, relative weight for weighted scoring
    levels: RubricLevel[]; // ordered left (best) to right (worst), or vice-versa
    /** @deprecated Use linkedStandards instead */
    linkedStandard?: LinkedStandard;
    linkedStandards?: LinkedStandard[];
    /** CEFR Can-Do statements linked to this criterion */
    cefrDescriptors?: LinkedCefrDescriptor[];
    /** IB Learner Profile or Bloom's Taxonomy descriptors linked to this criterion */
    frameworkDescriptors?: LinkedFrameworkDescriptor[];
    /** Which CEFR skill this criterion assesses. Overrides the rubric-level cefrSkill for per-level CEFR aggregation. */
    cefrSkill?: CefrSkill;
}

export type GradeScaleType = 'letter' | 'percentage' | 'points' | 'pass-fail' | 'custom';

export interface GradeRange {
    min: number; // inclusive %
    max: number; // inclusive %
    label: string; // "A", "Pass", "Excellent" etc.
    color: string; // hex
}

export interface GradeScale {
    id: string;
    name: string;
    type: GradeScaleType;
    ranges: GradeRange[];
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export type ModifierType = 'percentage' | 'points' | 'level';

export interface Modifier {
    type: ModifierType;
    value: number; // negative = worse, positive = better
    reason: string;
}

export interface Attachment {
    id: string;
    name: string;
    mimeType: string;
    dataUrl: string; // base64 encoded file content
    rubricId?: string; // if attached to a rubric globally
    studentId?: string; // if attached to a specific student
    size: number; // bytes
    addedAt: string; // ISO date string
}

/** A blank DOCX rubric template whose column headers & styling are used for export */
export interface ExportTemplate {
    id: string;
    name: string;
    /** base64-encoded .docx file content */
    dataUrl: string;
    /** Column headers (level names) extracted from the template */
    levelHeaders: string[];
    /** Header background colour extracted from template (hex, e.g. '#1e3a5f') */
    headerColor?: string;
    size: number;
    addedAt: string;
}

export interface RubricFormat {
    criterionColWidth: number;
    levelColWidth: number;
    fontSize: number;
    headerColor: string;
    headerTextColor: string;
    accentColor: string;
    fontFamily: string;
    showWeights: boolean;
    showPoints: boolean;
    showCalculatedGrade: boolean;
    levelOrder: 'best-first' | 'worst-first';
    headerTextAlign: 'left' | 'center' | 'right';
    showBorders: boolean;
    rowStriping: boolean;
    orientation: 'portrait' | 'landscape';
}

export const DEFAULT_FORMAT: RubricFormat = {
    criterionColWidth: 200,
    levelColWidth: 160,
    fontSize: 14,
    headerColor: '#1e3a5f',
    headerTextColor: '#ffffff',
    accentColor: '#3b82f6',
    fontFamily: 'Inter, system-ui, sans-serif',
    showWeights: true,
    showPoints: true,
    showCalculatedGrade: true,
    levelOrder: 'best-first',
    headerTextAlign: 'center',
    showBorders: true,
    rowStriping: false,
    orientation: 'portrait',
};

export type ScoringMode = 'weighted-percentage' | 'total-points' | 'single-point';
export type SinglePointOutcome = 'exceeds' | 'meets' | 'not-yet';

export interface RubricVersion {
    savedAt: string;
    label?: string;
    snapshot: Omit<Rubric, 'versions'>;
}

// ─── CEFR-J Grammar Data Types ────────────────────────────────────────────────

export interface CefrjGrammarItem {
    label: string;
    level: CefrLevel;
    shorthand: string;
}

// ─── CEFR Text Profiling Types ────────────────────────────────────────────────

export interface CefrWordHit {
    word: string;
    level: CefrLevel;
}

export interface CefrVocabProfile {
    /** Word count bucketed by CEFR level */
    levelCounts: Record<CefrLevel, number>;
    /** Notable words whose level is at or above the estimated level */
    highlightWords: CefrWordHit[];
    /** Highest level with ≥5% of content-word share */
    estimatedLevel: CefrLevel;
}

export interface CefrGrammarHit {
    label: string;
    level: CefrLevel;
    count: number;
    shorthand: string;
}

export interface CefrGrammarProfile {
    detectedStructures: CefrGrammarHit[];
    /** Highest level with at least one detected structure */
    estimatedLevel: CefrLevel;
}

export interface CefrTextProfile {
    vocabulary: CefrVocabProfile;
    grammar: CefrGrammarProfile;
    /** Combined estimate: higher of vocab and grammar estimated levels */
    overallEstimatedLevel: CefrLevel;
}

// ─── Vocabulary Profile Aggregation Types ─────────────────────────────────────

export interface VocabLevelStat {
    level: CefrLevel;
    count: number;
    percentage: number;
}

export interface StudentVocabProfile {
    studentId: string;
    studentName: string;
    levelCounts: Record<CefrLevel, number>;
    levelStats: VocabLevelStat[];
    totalWords: number;
    estimatedLevel: CefrLevel;
    analysisCount: number;
}

export interface ClassVocabProfile {
    classId: string;
    className: string;
    levelCounts: Record<CefrLevel, number>;
    levelStats: VocabLevelStat[];
    totalWords: number;
    estimatedLevel: CefrLevel;
    studentProfiles: StudentVocabProfile[];
}

export interface VocabExportRow {
    word: string;
    level: CefrLevel;
    definition: string;
    source: 'rubric' | 'analysis';
}

// ─── Vocabulary & Document Analysis Types ─────────────────────────────────────

export type VocabularyCategory = 'vocabulary' | 'grammar' | 'discourse' | 'other';

export interface VocabularyItem {
    id: string;
    phrase: string;
    category: VocabularyCategory;
    linkedCriterionId?: string;
    linkedSubItemId?: string;
    notes?: string;
    /** CEFR level, optionally filled via Cambridge Dictionary lookup */
    cefrLevel?: CefrLevel;
    /** Plain-text definition, optionally filled via Cambridge Dictionary lookup */
    definition?: string;
}

export interface DetectedItem {
    vocabularyItemId: string;
    found: boolean;
    occurrences: number;
    contexts: string[];
    correctUsage?: 'correct' | 'incorrect' | 'unclear';
}

export interface GrammarError {
    message: string;
    offset: number;
    length: number;
    suggestions: string[];
    ruleId?: string;
}

export interface DocumentAnalysisResult {
    id: string;
    studentId: string;
    rubricId: string;
    attachmentId: string;
    extractedText: string;
    analyzedAt: string;
    detectedItems: DetectedItem[];
    grammarErrors: GrammarError[];
    grammarCheckerUsed: 'languagetool' | 'compromise' | 'none';
    grammarTextTruncated?: boolean;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export interface Rubric {
    id: string;
    name: string;
    subject: string;
    description: string;
    criteria: RubricCriterion[];
    gradeScaleId: string;
    format: RubricFormat;
    attachmentIds: string[];
    createdAt: string;
    updatedAt: string;
    /** Deterministic point ceiling (used when scoringMode === 'total-points') */
    totalMaxPoints: number;
    /** 'weighted-percentage' (default) or 'total-points' */
    scoringMode: ScoringMode;
    /** Target CEFR level for this rubric (e.g. 'B1' for a HAVO writing task) */
    cefrTargetLevel?: CefrLevel;
    /** Which language skill this rubric primarily assesses */
    cefrSkill?: CefrSkill;
    /** Minimum score percentage to count as 'Achieved' on student profile (default: 70) */
    cefrAchieveThreshold?: number;
    /** Saved version snapshots for history/restore */
    versions?: RubricVersion[];
    /** Vocabulary and grammar items to detect when analysing student documents */
    vocabularyItems?: VocabularyItem[];
}

/** A user-saved rubric template stored locally. */
export interface UserTemplate {
    id: string;
    name: string;
    subject: string;
    description?: string;
    criteria: RubricCriterion[];
    savedAt: string;
}

export interface PastClassMembership {
    classId: string;
    /** When known (chained from a prior transfer); omitted rather than guessed when the actual enrollment date isn't tracked. */
    enrolledAt?: string;
    leftAt: string;
}

export interface Student {
    id: string;
    name: string;
    email?: string;
    studentNumber?: string;
    classId: string;
    /** Prior class memberships, oldest first. Pushed automatically when classId changes (manual move or CSV transfer). */
    pastClassMemberships?: PastClassMembership[];
    /** ISO timestamp set when PII was anonymized; presence means the record is anonymized. */
    anonymizedAt?: string;
    /** ISO timestamp set when the student was soft-deleted; presence means archived (pending anonymization). */
    archivedAt?: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export type VoTrack = 'vmbo-bb' | 'vmbo-kb' | 'vmbo-tl' | 'havo' | 'vwo';

export interface Class {
    id: string;
    name: string;
    subject?: string;
    year?: string;
    /** IDs of rubrics linked to this class. If undefined/empty, all rubrics are shown. */
    rubricIds?: string[];
    /** Dutch VO track (VMBO-BB/KB/TL, HAVO, VWO) */
    voTrack?: VoTrack;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export interface ScoreEntry {
    criterionId: string;
    levelId: string | null; // null = not yet graded
    overridePoints?: number; // full manual override (bypasses level & sub-items)
    /** Points chosen within [minPoints, maxPoints] when no sub-items OR alongside them */
    selectedPoints?: number;
    /** Which SubItem ids are checked for this criterion */
    checkedSubItems: string[];
    /** Granular scores chosen for specific sub-items */
    subItemScores?: Record<string, number>;
    comment: string;
    attachmentId?: string; // evidence file linked to this criterion
    /** Single-point rubric outcome — set instead of levelId when scoringMode is 'single-point' */
    singlePointOutcome?: SinglePointOutcome;
    /** Base64 audio recording for this criterion (data:audio/webm;base64,...) */
    audioDataUrl?: string;
}

export interface StudentRubric {
    id: string;
    rubricId: string;
    studentId: string;
    entries: ScoreEntry[];
    globalModifier?: Modifier;
    overallComment: string;
    submittedAt?: string;
    gradedAt?: string;
    gradedBy?: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
    isPeerReview: boolean;
    /** When true the student did not hand in the work */
    notHandedIn?: boolean;
    /** When true only written feedback is visible to the student; the grade is hidden until explicitly published */
    feedbackOnly?: boolean;
    /** When true this submission is used as an anchor/exemplar for calibration during grading */
    isAnchor?: boolean;
    /** Peer review round number (1-based); undefined means single/legacy round */
    round?: number;
    /** Student's own level selection per criterion (rubric-level self-assessment) */
    selfAssessmentLevels?: Record<string, string | null>;
    /** Free text student self-reflection for this rubric grade */
    selfAssessmentReflection?: string;
    /** ISO timestamp when student last submitted their self-assessment */
    selfAssessedAt?: string;
    /** Snapshot of the rubric at the time of grading to ensure historical grades do not break */
    rubricSnapshot?: Rubric;
}

export interface CommentSnippet {
    id: string;
    text: string;
    tag: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

/** Role controlling which settings a user can access */
export type UserRole = 'admin' | 'teacher' | 'student';

export interface School {
    id: string;
    name: string;
    createdBy?: string;
    retentionYears: number;
    createdAt: string;
}

export interface SchoolMember {
    id: string;
    schoolId: string;
    profileId: string;
    createdAt: string;
}

/** A rubric published to a school's marketplace. rubricSnapshot is frozen at publish time. */
export interface MarketplaceListing {
    id: string;
    schoolId: string;
    publishedBy: string;
    rubricSnapshot: Rubric;
    name: string;
    subject?: string;
    description?: string;
    attribution?: string;
    upvoteCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface AppSettings {
    defaultGradeScaleId: string;
    theme: 'light' | 'dark';
    language: string;
    accentColor: string;
    defaultFormat: RubricFormat;
    activeClassId?: string;
    /** API key for commonstandardsproject.com */
    standardsApiKey?: string;
    /** ID of the default export template */
    exportTemplateId?: string;
    /** How many comparative matchups to show an anchor student before picking a new anchor */
    comparativeMatchupLimit?: number;
    /** Whether "Save & Next" in the grading view stays within the current class or spans all rubric-linked classes */
    gradeNavigationScope?: 'current-class' | 'rubric-classes';
    /** Whether the user has seen the guided UI tutorial */
    hasSeenTutorial?: boolean;
    /** Chart type for the per-criterion statistics panel (on-screen toggle) */
    statisticsCriterionChartType?: 'bar' | 'radar';
    /** Whether "Not handed in" students are excluded from class statistics */
    statisticsExcludeNotHandedIn?: boolean;
    /**
     * Active role — determines which settings sections are visible/editable.
     * Defaults to 'admin' so existing installs are unaffected.
     */
    userRole?: UserRole;
    /** Email of the currently authenticated user (populated from Supabase profile on login). */
    userEmail?: string;
    /** Days since last grading before a student is considered overdue (default 7). */
    overdueReminderThreshold?: number;
    /**
     * Password required to switch back to admin from a lower-privilege role.
     * Stored as plain text; this is UI access control, not cryptographic security.
     * If undefined, no password is required.
     */
    adminPin?: string;
    /** Set by StorageSync when a Supabase-authenticated user has no school assigned yet. */
    needsOnboarding?: boolean;
    /** Supabase school ID of the user's school (populated on login). */
    schoolId?: string;
    /** Optional Cambridge Dictionary API key for online CEFR word-level enrichment */
    cambridgeApiKey?: string;
    /** Show Cambridge English exam labels (e.g. "B2 First") alongside CEFR level badges */
    showCambridgeLabels?: boolean;
    /** Display name of the user's school (populated on login). */
    schoolName?: string;
    /** UI font family for the app chrome. */
    uiFontFamily?: UiFontFamily;
    /** Active named theme bundle id (e.g. 'academy', 'nature'). Set alongside accentColor. */
    colorPreset?: string;
    /** Whether to send an email notification to the student when a grade is saved (Supabase mode only). */
    notifyStudentsOnGrade?: boolean;
}

export type UiFontFamily = 'Inter' | 'Nunito' | 'Source Sans 3' | 'Lato' | 'Roboto';

export interface RubricShare {
    userId: string;
    email?: string;
    displayName?: string;
    mode: 'read' | 'edit';
}

export interface SharedFeedback {
    sr: StudentRubric;
    rubric: Rubric;
    student: Student;
    scale: GradeScale | null;
}

export interface ClassMember {
    userId: string;
    email?: string;
    displayName?: string;
    role: 'viewer' | 'editor';
}

export interface CommentBankItem {
    id: string;
    text: string;
    tags: string[];
    createdAt: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

// ─── Speaking / Oral Assessment Types ────────────────────────────────────────

export type PronunciationErrorType =
    | 'word_stress'
    | 'sentence_stress'
    | 'th_sound'
    | 'connected_speech'
    | 'vowel_sound'
    | 'final_consonant';

export interface PronunciationMark {
    errorType: PronunciationErrorType;
    note?: string;
}

/** Metadata for an audio/video recording attached to a SpeakingSession. The blob itself lives only in IndexedDB (mediaStore). */
export interface SessionRecording {
    id: string;
    mediaType: 'audio' | 'video';
    mimeType: string;
    durationSec: number;
    sizeBytes: number;
    createdAt: string;
    storagePath?: string;
    synced?: boolean;
}

/** Payload returned by the get-essay-assignment edge function. */
export interface EssayAssignmentContent {
    rubricId: string;
    studentId: string;
    title: string;
    prompt: string | null;
    minWords: number | null;
    maxWords: number | null;
    timeLimitMinutes: number | null;
    requireSEB: boolean;
    expiresAt: string | null;
    readOnlyAfterSubmit: boolean;
}

export interface SpeakingSession {
    id: string;
    rubricId: string;
    studentId: string;
    /** Teacher-configured speaking time limit in seconds */
    durationSeconds: number;
    /** Actual elapsed time when the session was stopped */
    elapsedSeconds: number;
    pronunciationMarks: PronunciationMark[];
    entries: ScoreEntry[];
    overallComment: string;
    gradedAt: string;
    rubricSnapshot?: Rubric;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
    recordings?: SessionRecording[];
}

// ─── Essay Assignment / Submission ───────────────────────────────────────────

/** Configuration for a teacher-created essay assignment, encoded into the student's URL */
export interface EssayAssignment {
    rubricId: string;
    studentId: string;
    /** Opaque teacher identifier written into submissions so the teacher can filter their own rows */
    teacherKey: string;
    title: string;
    prompt?: string;
    minWords?: number;
    maxWords?: number;
    timeLimitMinutes?: number;
    requireSEB?: boolean;
    readOnlyAfterSubmit: boolean;
    createdAt: string;
    /** ISO-8601 datetime after which students can no longer submit */
    expiresAt?: string;
    // ── Supabase integration (optional) ────────────────────────────────────────
    /** Teacher's Supabase project URL — when present the student page uses DB submission */
    supabaseUrl?: string;
    /** Teacher's Supabase anon key — embedded so the student's browser can connect */
    supabaseAnonKey?: string;
}

/** Saved essay configuration not yet assigned to any student — used to prepare assignments in advance */
export interface EssayTemplate {
    id: string;
    rubricId: string;
    title: string;
    prompt?: string;
    minWords?: number;
    maxWords?: number;
    timeLimitMinutes?: number;
    requireSEB: boolean;
    readOnlyAfterSubmit: boolean;
    expiresAt?: string;
    createdAt: string;
}

export interface StudentEssayAssignmentSummary {
    teacherKey: string;
    rubricId: string;
    studentId: string;
    title: string;
    prompt: string | null;
    minWords: number | null;
    maxWords: number | null;
    timeLimitMinutes: number | null;
    requireSEB: boolean;
    readOnlyAfterSubmit: boolean;
    createdAt: string;
    expiresAt: string | null;
    submission: { submittedAt: string; wordCount: number } | null;
}

// ─── Testing Environment ──────────────────────────────────────────────────────

export type TestQuestionType =
    | 'multiple-choice'
    | 'multiple-response'
    | 'true-false'
    | 'short-answer'
    | 'open'
    | 'cloze'
    | 'cloze-dropdown'
    | 'matching'
    | 'ordering'
    | 'categorize'
    | 'hot-text';

export interface TestOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

/** A left/right pair for matching questions; correct match is left.id === right pair's id */
export interface MatchingPair {
    id: string;
    left: string;
    right: string;
}

/** An item for ordering questions; array order in TestQuestion.orderItems defines the correct order */
export interface OrderItem {
    id: string;
    text: string;
}

export type TestOrderItem = OrderItem;

/** A bucket for categorize questions */
export interface TestCategory {
    id: string;
    label: string;
}

/** An item for categorize questions; categoryId is the correct bucket */
export interface CategorizeItem {
    id: string;
    text: string;
    categoryId: string;
}

export interface TestSection {
    id: string;
    title: string;
}

export interface TestQuestion {
    id: string;
    prompt: string;
    type: TestQuestionType;
    points: number;
    /** Answer options — for multiple-choice (single correct) and multiple-response (one or more correct) questions */
    options?: TestOption[];
    /** Model answer used for exact-match auto-scoring of short-answer questions */
    expectedAnswer?: string;
    /** Correct answer for true-false questions */
    correctBoolean?: boolean;
    /** Pairs for matching questions */
    matchingPairs?: MatchingPair[];
    /** Items in correct order for ordering questions */
    orderItems?: OrderItem[];
    /** Buckets for categorize questions */
    categories?: TestCategory[];
    /** Items to sort into categories for categorize questions */
    categorizeItems?: CategorizeItem[];
    /** Raw passage text with [[...]] marking selectable fragments, for hot-text questions */
    hotTextPassage?: string;
    /** Indices (into the parsed fragment list) of fragments that are correct to select, for hot-text questions */
    hotTextCorrectIndices?: number[];
    /**
     * Whether multi-part question types award proportional credit for
     * partially-correct answers (true, default) or only full points when
     * every part is correct (false).
     */
    partialCredit?: boolean;
    linkedStandards?: LinkedStandard[];
    /** CEFR Can-Do statements linked to this question */
    linkedCefrDescriptors?: LinkedCefrDescriptor[];
    /** Section this question belongs to */
    sectionId?: string;
    /** Image shown above the answer area — either a public URL or a data URI */
    imageUrl?: string;
    /** Optional hint shown on student request */
    hint?: string;
}

export interface Test {
    id: string;
    name: string;
    description?: string;
    questions: TestQuestion[];
    sections?: TestSection[];
    /** Time limit for students taking the test */
    durationMinutes?: number;
    /** When true the test can only be taken inside Safe Exam Browser */
    requireSEB: boolean;
    shuffleQuestions: boolean;
    gradeScaleId?: string;
    createdAt: string;
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export type ProctorEventType = 'tab_switch' | 'copy' | 'paste' | 'cut' | 'battery' | 'heartbeat' | 'seb_status';

export interface ProctorEvent {
    type: ProctorEventType;
    /** ISO timestamp of when the event occurred */
    at: string;
    value?: string | number | boolean;
}

export interface TestAnswer {
    questionId: string;
    /** Selected option id (multiple-choice) or free text (short-answer / open) */
    response: string;
    /** Manually awarded points; overrides auto-scoring when present */
    pointsEarned?: number;
    feedback?: string;
}

export interface StudentTest {
    id: string;
    testId: string;
    studentId: string;
    answers: TestAnswer[];
    status: 'in_progress' | 'submitted' | 'graded';
    startedAt: string;
    submittedAt?: string;
    gradedAt?: string;
    /** Total points before any class-wide adjustment */
    rawTotalPoints?: number;
    /** Uniform class-wide point adjustment applied on top of rawTotalPoints */
    adjustmentPoints?: number;
    /** Audit record of the class-average adjustment applied to this submission; clearing it reverts to raw points */
    adjustment?: {
        points: number;
        appliedAt: string;
        note?: string;
    };
    /** Proctoring events captured while the student took the test */
    events?: ProctorEvent[];
    /** ISO timestamp of the last local edit; used for last-write-wins sync conflict resolution */
    updatedAt?: string;
}

export type TestStrengthBucket = 'strong' | 'developing' | 'weak';

/** Accuracy breakdown for a single test question, aggregated across one or more StudentTest submissions */
export interface TestQuestionBreakdown {
    questionId: string;
    /** Fraction of relevant answers that were fully correct, 0-100 */
    accuracyPct: number;
    bucket: TestStrengthBucket;
    /** Number of StudentTest answers included in the accuracy calculation */
    sampleSize: number;
}

/** Accuracy breakdown for a group of questions sharing a linked standard or CEFR descriptor */
export interface TestSkillBreakdown {
    /** Linked standard guid, CEFR descriptorId, or 'ungrouped' for questions with no link */
    groupId: string;
    /** Human-readable label — standard notation/description or CEFR descriptor text */
    label: string;
    questionIds: string[];
    accuracyPct: number;
    bucket: TestStrengthBucket;
    sampleSize: number;
}

/** Strong/weak-point summary for a test, either for a single student or aggregated across the cohort */
export interface TestStrongWeakSummary {
    studentId: string | null;
    questions: TestQuestionBreakdown[];
    skills: TestSkillBreakdown[];
}

/** Configuration for a teacher-created test assignment, encoded into the student's share code */
export interface TestAssignmentPayload {
    testId: string;
    studentId: string;
    /** Opaque teacher identifier written into submissions so the teacher can filter their own rows */
    teacherKey: string;
    requireSEB: boolean;
    durationMinutes?: number;
    createdAt: string;
    /** ISO-8601 datetime after which students can no longer submit */
    expiresAt?: string;
    // ── Supabase integration (optional) ────────────────────────────────────────
    /** Teacher's Supabase project URL — when present the student page uses DB submission */
    supabaseUrl?: string;
    /** Teacher's Supabase anon key — embedded so the student's browser can connect */
    supabaseAnonKey?: string;
    /** Full test content embedded for offline use (no Supabase) — without this, an offline link cannot load its questions */
    test?: Test;
}

/** A student's completed test, encoded into a submission code for the teacher to import */
export interface TestSubmissionPayload {
    testId: string;
    studentId: string;
    teacherKey: string;
    answers: TestAnswer[];
    startedAt: string;
    submittedAt: string;
    events?: ProctorEvent[];
}

/** A student's completed essay, encoded into a submission code for the teacher to import */
export interface EssaySubmission {
    id: string;
    assignmentRubricId: string;
    assignmentStudentId: string;
    teacherKey: string;
    contentHtml: string;
    wordCount: number;
    submittedAt: string;
    /** Present when the assignment defined word limits; null/absent means no limits were set */
    wordLimitStatus?: 'ok' | 'under' | 'over' | null;
    /** Proctoring events captured while the student wrote this essay */
    events?: ProctorEvent[];
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export type AuditCategory = 'admin' | 'grade' | 'export' | 'auth';

export interface AuditRow {
    id: string;
    actor_id: string | null;
    category: AuditCategory;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
}

export type ActivityKind = 'rubric' | 'test' | 'essay';

export interface ActivityRow {
    kind: ActivityKind;
    id: string;
    name: string;
}

export interface CellData {
    submittedCount: number;
    totalStudents: number;
    isLinked: boolean;
}

// ─── Student Learning Paths (rule-based, no AI) ───────────────────────────────

/** A single rule-based suggestion to address a below-cohort-average skill gap */
export interface LearningPathRecommendation {
    studentId: string;
    skill: CefrSkill;
    level: CefrLevel;
    studentScore: number;
    cohortAverage: number;
    /** studentScore - cohortAverage, always negative for a recommendation to exist */
    gap: number;
    /** Rubric ids tagged with this skill/level that the student has not yet achieved */
    suggestedRubricIds: string[];
}

/** A streak of N+ consecutive low scores on the same criterion or CEFR skill */
export interface InterventionFlag {
    studentId: string;
    /** 'criterion' when tracked per RubricCriterion, 'cefrSkill' when tracked per CefrSkill */
    kind: 'criterion' | 'cefrSkill';
    /** criterionId for 'criterion' kind, CefrSkill value for 'cefrSkill' kind */
    targetId: string;
    streakLength: number;
    /** Most recent scores in the streak, oldest first */
    scores: number[];
    triggeredAt: string;
}

export interface LearningPathConfig {
    /** Number of consecutive low scores required to trigger an intervention flag (default 3) */
    consecutiveLowThreshold: number;
    /** Score percentage at/below which an entry counts as "low" (default 60) */
    lowScoreThreshold: number;
    /** Minimum percentage-point gap below cohort average to trigger a recommendation (default 15) */
    cohortGapThreshold: number;
}

// ─── Report cards ──────────────────────────────────────────────────────────────

export interface ReportCardConfig {
    includeRubrics: boolean;
    includeStandards: boolean;
    includeLearningGoals: boolean;
    includeCefr: boolean;
    includeTestSummary: boolean;
}

export interface ReportCardRubricsSection {
    type: 'rubrics';
    entries: PeriodReportEntry[];
}

export interface ReportCardStandardsSection {
    type: 'standards';
    standardSets: StandardSetGroup[];
}

export interface ReportCardLearningGoalsSection {
    type: 'learningGoals';
    goals: LearningGoalAggregate[];
}

export interface ReportCardCefrSection {
    type: 'cefr';
    overview: CefrStudentOverview;
}

export interface ReportCardTestSummarySection {
    type: 'testSummary';
    overview: TestStrongWeakSummary;
}

export type ReportCardSection =
    | ReportCardRubricsSection
    | ReportCardStandardsSection
    | ReportCardLearningGoalsSection
    | ReportCardCefrSection
    | ReportCardTestSummarySection;

export interface ReportCardData {
    studentId: string;
    studentName: string;
    className: string;
    periodLabel?: string;
    sections: ReportCardSection[];
}
