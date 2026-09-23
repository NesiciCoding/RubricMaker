export {
    isStagedTest,
    entrySectionId,
    sectionQuestions,
    sectionMaxPoints,
    scoreSectionPct,
    resolveNextSection,
    recomputeSectionPath,
    maxPointsForPath,
    hasRoutingCycle,
} from '../../supabase/functions/_shared/placementRouting.ts';
export { isAutoScorable } from '../../supabase/functions/_shared/testScoring.ts';
