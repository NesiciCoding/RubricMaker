// ─── Core Domain Types for Rubric Maker ───────────────────────────────────────

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

/** A single descriptor rating in a student self-assessment */
export interface SelfAssessmentRating {
    descriptorId: string;
    level: CefrLevel;
    skill: CefrSkill;
    /** true = student feels confident with this Can-Do statement */
    confident: boolean;
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
}

/** A CEFR Can-Do statement linked to a rubric criterion */
export interface LinkedCefrDescriptor {
    descriptorId: string;
    level: CefrLevel;
    skill: CefrSkill;
    descriptionEn: string;
    descriptionNl: string;
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
    label: string;        // e.g. "Excellent", "4"
    minPoints: number;    // minimum points for this level (can equal maxPoints)
    maxPoints: number;    // maximum points for this level
    description: string;  // descriptor text in the cell
    subItems: SubItem[];  // optional fine-grain checklist (alongside range)
}

export interface LinkedStandard {
    guid: string;
    statementNotation?: string;   // e.g. "CCSS.ELA-LITERACY.RH.6-8.1"
    description: string;
    standardSetTitle: string;
    jurisdictionTitle: string;
    ancestorIds?: string[];
    depth?: number;
}

export interface RubricCriterion {
    id: string;
    title: string;
    description: string;    // optional sub-description shown under title
    weight: number;         // 0–100, relative weight for weighted scoring
    levels: RubricLevel[];  // ordered left (best) to right (worst), or vice-versa
    /** @deprecated Use linkedStandards instead */
    linkedStandard?: LinkedStandard;
    linkedStandards?: LinkedStandard[];
    /** CEFR Can-Do statements linked to this criterion */
    cefrDescriptors?: LinkedCefrDescriptor[];
}

export type GradeScaleType = 'letter' | 'percentage' | 'points' | 'pass-fail' | 'custom';

export interface GradeRange {
    min: number;   // inclusive %
    max: number;   // inclusive %
    label: string; // "A", "Pass", "Excellent" etc.
    color: string; // hex
}

export interface GradeScale {
    id: string;
    name: string;
    type: GradeScaleType;
    ranges: GradeRange[];
}

export type ModifierType = 'percentage' | 'points' | 'level';

export interface Modifier {
    type: ModifierType;
    value: number;   // negative = worse, positive = better
    reason: string;
}

export interface Attachment {
    id: string;
    name: string;
    mimeType: string;
    dataUrl: string;   // base64 encoded file content
    rubricId?: string; // if attached to a rubric globally
    studentId?: string; // if attached to a specific student
    size: number;      // bytes
    addedAt: string;   // ISO date string
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

// ─── Vocabulary & Document Analysis Types ─────────────────────────────────────

export type VocabularyCategory = 'vocabulary' | 'grammar' | 'discourse' | 'other';

export interface VocabularyItem {
    id: string;
    phrase: string;
    category: VocabularyCategory;
    linkedCriterionId?: string;
    linkedSubItemId?: string;
    notes?: string;
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

export interface Student {
    id: string;
    name: string;
    email?: string;
    classId: string;
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
}

export interface ScoreEntry {
    criterionId: string;
    levelId: string | null;        // null = not yet graded
    overridePoints?: number;       // full manual override (bypasses level & sub-items)
    /** Points chosen within [minPoints, maxPoints] when no sub-items OR alongside them */
    selectedPoints?: number;
    /** Which SubItem ids are checked for this criterion */
    checkedSubItems: string[];
    /** Granular scores chosen for specific sub-items */
    subItemScores?: Record<string, number>;
    comment: string;
    attachmentId?: string;         // evidence file linked to this criterion
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
    isPeerReview: boolean;
    /** When true the student did not hand in the work */
    notHandedIn?: boolean;
    /** When true only written feedback is visible to the student; the grade is hidden until explicitly published */
    feedbackOnly?: boolean;
    /** When true this submission is used as an anchor/exemplar for calibration during grading */
    isAnchor?: boolean;
    /** Peer review round number (1-based); undefined means single/legacy round */
    round?: number;
    /** Snapshot of the rubric at the time of grading to ensure historical grades do not break */
    rubricSnapshot?: Rubric;
}

export interface CommentSnippet {
    id: string;
    text: string;
    tag: string;
}

/** Role controlling which settings a user can access */
export type UserRole = 'admin' | 'user' | 'student';

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
    /**
     * Password required to switch back to admin from a lower-privilege role.
     * Stored as plain text; this is UI access control, not cryptographic security.
     * If undefined, no password is required.
     */
    adminPin?: string;
}

export interface CommentBankItem {
    id: string;
    text: string;
    tags: string[];
    createdAt: string;
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

/** A student's completed essay, encoded into a submission code for the teacher to import */
export interface EssaySubmission {
    id: string;
    assignmentRubricId: string;
    assignmentStudentId: string;
    teacherKey: string;
    contentHtml: string;
    wordCount: number;
    submittedAt: string;
}
