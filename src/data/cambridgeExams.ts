import type { CefrLevel } from '../types';

export interface CambridgeExamEntry {
    id: string;
    cefrLevel: CefrLevel;
    label: string;
    shortLabel: string;
    description?: string;
}

/**
 * Cambridge English Qualifications main-suite exams mapped to the CEFR level they target.
 * A1 has no main-suite exam (Cambridge offers "Pre A1 Starters" only as part of Young Learners),
 * so it is intentionally absent here.
 */
export const CAMBRIDGE_EXAMS: CambridgeExamEntry[] = [
    {
        id: 'ket',
        cefrLevel: 'A2',
        label: 'A2 Key (KET)',
        shortLabel: 'KET',
        description: 'Cambridge English Qualification for basic everyday English.',
    },
    {
        id: 'pet',
        cefrLevel: 'B1',
        label: 'B1 Preliminary (PET)',
        shortLabel: 'PET',
        description: 'Cambridge English Qualification for independent users of English.',
    },
    {
        id: 'fce',
        cefrLevel: 'B2',
        label: 'B2 First (FCE)',
        shortLabel: 'FCE',
        description: 'Cambridge English Qualification for upper-intermediate English.',
    },
    {
        id: 'cae',
        cefrLevel: 'C1',
        label: 'C1 Advanced (CAE)',
        shortLabel: 'CAE',
        description: 'Cambridge English Qualification for advanced English.',
    },
    {
        id: 'cpe',
        cefrLevel: 'C2',
        label: 'C2 Proficiency (CPE)',
        shortLabel: 'CPE',
        description: 'Cambridge English Qualification for proficient, near-native English.',
    },
];

export function cambridgeExamForLevel(level: CefrLevel): CambridgeExamEntry | null {
    return CAMBRIDGE_EXAMS.find((exam) => exam.cefrLevel === level) ?? null;
}
