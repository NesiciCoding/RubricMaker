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

export type ScoringMode = 'weighted-percentage' | 'total-points';

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
    /** Snapshot of the rubric at the time of grading to ensure historical grades do not break */
    rubricSnapshot?: Rubric;
}

export interface CommentSnippet {
    id: string;
    text: string;
    tag: string;
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
    /** Whether the user has seen the guided UI tutorial */
    hasSeenTutorial?: boolean;
    /** Microsoft 365 / OneDrive sync settings */
    microsoftClientId?: string;
    microsoftTenantId?: string;
    microsoftLastSyncAt?: string;
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
