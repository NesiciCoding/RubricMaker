// ─── Core Domain Types for Rubric Maker ───────────────────────────────────────

/** A single checkbox item inside a level — awarded when checked */
export interface SubItem {
    id: string;
    label: string;   // e.g. "Uses correct terminology"
    points: number;  // points earned when this sub-item is checked
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
    linkedStandard?: LinkedStandard;
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
    size: number;      // bytes
    addedAt: string;   // ISO date string
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
    levelOrder: 'best-first' | 'worst-first';
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
    levelOrder: 'best-first',
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
}

export interface Student {
    id: string;
    name: string;
    email?: string;
    classId: string;
}

export interface Class {
    id: string;
    name: string;
    subject?: string;
    year?: string;
}

export interface ScoreEntry {
    criterionId: string;
    levelId: string | null;        // null = not yet graded
    overridePoints?: number;       // full manual override (bypasses level & sub-items)
    /** Points chosen within [minPoints, maxPoints] when no sub-items OR alongside them */
    selectedPoints?: number;
    /** Which SubItem ids are checked for this criterion */
    checkedSubItems: string[];
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
}

export interface CommentSnippet {
    id: string;
    text: string;
    tag: string;
}

export interface AppSettings {
    defaultGradeScaleId: string;
    theme: 'light' | 'dark';
    accentColor: string;
    defaultFormat: RubricFormat;
    activeClassId?: string;
    /** API key for commonstandardsproject.com */
    standardsApiKey?: string;
}

export interface CommentBankItem {
    id: string;
    text: string;
    tags: string[];
    createdAt: string;
}
