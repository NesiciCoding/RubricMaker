import { DEFAULT_FORMAT } from '../types';
import type { RubricInput } from './rubricClone';
import type { ParsedRubric } from './rubricImport';

interface WorkspaceContext {
    gradeScaleIds: readonly string[];
    defaultGradeScaleId: string;
    fallbackName: string;
}

/** Turns a decoded share code or file import into a rubric the store can accept. */
export function rubricInputFromParsed(parsed: ParsedRubric, workspace: WorkspaceContext): RubricInput {
    const importedScale = parsed.gradeScaleId;
    const gradeScaleId =
        importedScale && workspace.gradeScaleIds.includes(importedScale)
            ? importedScale
            : workspace.defaultGradeScaleId;

    return {
        name: parsed.name || workspace.fallbackName,
        subject: parsed.subject || '',
        description: parsed.description || '',
        criteria: parsed.criteria,
        gradeScaleId,
        format: parsed.format ?? DEFAULT_FORMAT,
        scoringMode: parsed.scoringMode ?? 'weighted-percentage',
        totalMaxPoints: parsed.totalMaxPoints ?? 100,
        attachmentIds: [],
        cefrTargetLevel: parsed.cefrTargetLevel,
        cefrSkill: parsed.cefrSkill,
        cefrAchieveThreshold: parsed.cefrAchieveThreshold,
        ...(parsed.vocabularyItems && { vocabularyItems: parsed.vocabularyItems }),
        ...(parsed.tiered && { tiered: parsed.tiered }),
    };
}
