// ─── Core Domain Types for Rubric Maker ───────────────────────────────────────

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
}

export interface CommentBankItem {
    id: string;
    text: string;
    tags: string[];
    createdAt: string;
}
