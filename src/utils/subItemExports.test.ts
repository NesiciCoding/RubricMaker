import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric, RubricCriterion, Student, StudentRubric } from '../types';
import { buildRubricHTML } from './pdfExport';
import { exportRubricToDocx } from './docxExport';
import { exportRubricWithTemplate } from './docxTemplateExport';

const savedBlobs = vi.hoisted(() => [] as Blob[]);
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => savedBlobs.push(blob) }));
vi.mock('i18next', () => ({
    default: {
        language: 'en',
        t: (key: string, opts?: Record<string, unknown>) => (opts?.points !== undefined ? `pts(${opts.points})` : key),
    },
}));

const checklistCriterion: RubricCriterion = {
    id: 'c1',
    title: 'Spelling',
    description: '',
    weight: 50,
    subItemMode: 'checklist',
    levels: [
        {
            id: 'b',
            label: 'B',
            minPoints: 1,
            maxPoints: 1,
            description: '',
            subItems: [
                { id: 'k1', label: 'Ticked statement' },
                { id: 'k2', label: 'Open statement' },
            ],
        },
    ],
};

const pointsCriterion: RubricCriterion = {
    id: 'c2',
    title: 'Content',
    description: '',
    weight: 50,
    levels: [
        {
            id: 'p',
            label: 'Good',
            minPoints: 2,
            maxPoints: 4,
            description: '',
            subItems: [{ id: 'p1', label: 'Thesis', minPoints: 0, maxPoints: 2 }],
        },
    ],
};

const rubric = {
    id: 'r1',
    name: 'ID card',
    subject: '',
    description: '',
    criteria: [checklistCriterion, pointsCriterion],
    gradeScaleId: 'gs',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
} as Rubric;

const sr = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'b', comment: '', checkedSubItems: ['k1'] },
        { criterionId: 'c2', levelId: 'p', comment: '', checkedSubItems: [], subItemScores: { p1: 1 } },
    ],
    overallComment: '',
    isPeerReview: false,
} as StudentRubric;

const student = { id: 's1', name: 'Alice', classId: 'k1' } as Student;

async function documentXml(): Promise<string> {
    const zip = await JSZip.loadAsync(savedBlobs.at(-1)!);
    return zip.file('word/document.xml')!.async('string');
}

describe('sub-items in exports', () => {
    it('prints checklist statements as ticked or open boxes, and points items with their score', () => {
        const html = buildRubricHTML(sr, rubric, student, null);
        expect(html).toContain('☑ Ticked statement');
        expect(html).toContain('☐ Open statement');
        expect(html).toMatch(/• Thesis <span[^>]*>\[pts\(1\/2\)\]<\/span>/);
        // A checklist statement never gets a points label.
        expect(html).not.toMatch(/statement <span/);
    });

    it('writes checklist statements without points to the rubric DOCX', async () => {
        await exportRubricToDocx(rubric);
        const xml = await documentXml();
        expect(xml).toContain('>Ticked statement<');
        expect(xml).toContain('>☐ <');
        // Only the points item carries a points range.
        expect(xml.match(/pts\(0-2\)/g)).toHaveLength(1);
        expect(xml).not.toMatch(/statement<\/w:t><\/w:r><w:r>(?:(?!<\/w:p>).)*pts\(/);
    });

    it('writes checklist statements without points to the template-styled DOCX', async () => {
        await exportRubricWithTemplate(rubric, {
            id: 't',
            name: 'T',
            dataUrl: '',
            size: 0,
            addedAt: '',
            levelHeaders: ['Level'],
            headerColor: '#123456',
        });
        const xml = await documentXml();
        expect(xml).toContain('>Open statement<');
        expect(xml.match(/pts\(0-2\)/g)).toHaveLength(1);
    });
});
