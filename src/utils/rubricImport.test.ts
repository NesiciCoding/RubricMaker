import { describe, it, expect, vi } from 'vitest';
import { 
    parseJsonToRubric, 
    splitCells, 
    detectTableFromLines, 
    buildParsedRubric, 
    extractTableFromHtml 
} from './rubricImport';

// Mock dynamic imports
vi.mock('mammoth', () => ({
    convertToHtml: vi.fn().mockResolvedValue({ value: '<table><tr><td>Crit</td><td>Good</td></tr><tr><td>C1</td><td>L1</td></tr></table>' })
}));

vi.mock('pdfjs-dist', () => ({
    version: '1.0',
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve({
            numPages: 1,
            getPage: vi.fn().mockResolvedValue({
                getTextContent: vi.fn().mockResolvedValue({
                    items: [
                        { str: 'Criterion', transform: [0, 0, 0, 0, 0, 100] },
                        { str: '  Excellent  ', transform: [0, 0, 0, 0, 0, 100] },
                        { str: '  Satisfactory  ', transform: [0, 0, 0, 0, 0, 100] },
                        { str: 'C1', transform: [0, 0, 0, 0, 0, 80] },
                        { str: '  L1  ', transform: [0, 0, 0, 0, 0, 80] },
                        { str: '  L2  ', transform: [0, 0, 0, 0, 0, 80] }
                    ]
                })
            })
        })
    })
}));

describe('rubricImport', () => {
    describe('parseJsonToRubric', () => {
        it('successfully parses valid JSON into a rubric', async () => {
            const validJson = {
                name: 'Test Rubric',
                subject: 'Science',
                description: 'A test rubric',
                criteria: [
                    {
                        title: 'Criterion 1',
                        weight: 100,
                        levels: [
                            { label: 'Good', minPoints: 5, maxPoints: 5, description: '' }
                        ]
                    }
                ]
            };
            const file = new File([JSON.stringify(validJson)], 'test-rubric.json', { type: 'application/json' });

            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('high');
            expect(result.name).toBe('Test Rubric');
            expect(result.subject).toBe('Science');
            expect(result.description).toBe('A test rubric');
            expect(result.criteria.length).toBe(1);
            expect(result.criteria[0].title).toBe('Criterion 1');
            expect(result.criteria[0].id).toBeDefined(); // IDs are regenerated
            expect(result.warnings.length).toBe(0);
        });

        it('returns an empty generic result with low confidence if JSON is invalid', async () => {
            const file = new File(['{ invalid_json '], 'bad.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('low');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.criteria.length).toBe(0);
        });

        it('returns empty result if criteria array is missing', async () => {
            const noCriteriaJson = { name: 'Empty Rubric' };
            const file = new File([JSON.stringify(noCriteriaJson)], 'empty.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('low');
            expect(result.warnings).toContain('Invalid JSON format: missing criteria array.');
        });

        it('uses filename as fallback name if name is missing in JSON', async () => {
            const json = { criteria: [] }; // valid format but no name
            const file = new File([JSON.stringify(json)], 'my-fallback.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.name).toBe('my-fallback');
        });
    });

    describe('splitCells', () => {
        it('splits by multiple spaces', () => {
            expect(splitCells('Col1  Col2   Col3')).toEqual(['Col1', 'Col2', 'Col3']);
        });

        it('splits by tabs', () => {
            expect(splitCells('Col1\tCol2\tCol3')).toEqual(['Col1', 'Col2', 'Col3']);
        });

        it('splits by pipes', () => {
            expect(splitCells('Col1|Col2||Col3')).toEqual(['Col1', 'Col2', 'Col3']);
        });
    });

    describe('detectTableFromLines', () => {
        it('detects table with headers based on keywords', () => {
            const lines = [
                'Rubric Title',
                'Criterion  Excellent  Satisfactory  Poor',
                'Content    Great      Ok            Bad',
                'Design     Pretty     Fine          Ugly'
            ];
            const result = detectTableFromLines(lines);
            expect(result.headers).toEqual(['Criterion', 'Excellent', 'Satisfactory', 'Poor']);
            expect(result.rows.length).toBe(2);
            expect(result.rows[0]).toEqual(['Content', 'Great', 'Ok', 'Bad']);
        });

        it('falls back to single column if no headers found', () => {
            const lines = ['Line 1', 'Line 2'];
            const result = detectTableFromLines(lines);
            expect(result.headers).toEqual([]);
            expect(result.rows).toEqual([['Line 1'], ['Line 2']]);
        });
    });

    describe('buildParsedRubric', () => {
        it('returns high confidence for standard structure', () => {
            const raw = {
                headers: ['Criterion', 'High', 'Low'],
                rows: [['Crit1', 'Desc1', 'Desc2'], ['Crit2', 'Desc3', 'Desc4']]
            };
            const result = buildParsedRubric(raw, 'Test');
            expect(result.confidence).toBe('high');
            expect(result.criteria.length).toBe(2);
            expect(result.criteria[0].levels.length).toBe(2);
        });

        it('generates warnings for small tables', () => {
            const raw = {
                headers: ['Crit', 'Level'],
                rows: [['OnlyOne', 'Desc']]
            };
            const result = buildParsedRubric(raw, 'Test');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.confidence).toBe('medium');
        });
    });

    describe('extractTableFromHtml', () => {
        it('extracts table rows and headers from HTML element', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <table>
                    <tr><th>H1</th><th>H2</th></tr>
                    <tr><td>R1C1</td><td>R1C2</td></tr>
                </table>
            `;
            const table = container.querySelector('table')!;
            const result = extractTableFromHtml(table);
            expect(result.headers).toEqual(['H1', 'H2']);
            expect(result.rows).toEqual([['R1C1', 'R1C2']]);
        });
    });

    describe('parseDocxToRubric', () => {
        it('successfully parses docx', async () => {
            const { parseDocxToRubric } = await import('./rubricImport');
            const file = new File([''], 'test.docx');
            const result = await parseDocxToRubric(file);

            expect(result.criteria.length).toBe(1);
            expect(result.criteria[0].title).toBe('C1');
        });
    });

    describe('parsePdfToRubric', () => {
        it('successfully parses pdf', async () => {
            const { parsePdfToRubric } = await import('./rubricImport');
            const file = new File([''], 'test.pdf');
            const result = await parsePdfToRubric(file);

            expect(result.criteria.length).toBe(1);
            expect(result.criteria[0].title).toBe('C1');
        });
    });
});
