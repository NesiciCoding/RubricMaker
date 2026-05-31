import { describe, it, expect, vi } from 'vitest';
import {
    parseJsonToRubric,
    splitCells,
    detectTableFromLines,
    buildParsedRubric,
    extractTableFromHtml,
} from './rubricImport';

// Mock dynamic imports
vi.mock('mammoth', () => ({
    convertToHtml: vi.fn().mockResolvedValue({
        value: '<table><tr><td>Crit</td><td>Good</td></tr><tr><td>C1</td><td>L1</td></tr></table>',
    }),
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
                        { str: '  L2  ', transform: [0, 0, 0, 0, 0, 80] },
                    ],
                }),
            }),
        }),
    }),
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
                        levels: [{ label: 'Good', minPoints: 5, maxPoints: 5, description: '' }],
                    },
                ],
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
                'Design     Pretty     Fine          Ugly',
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
                rows: [
                    ['Crit1', 'Desc1', 'Desc2'],
                    ['Crit2', 'Desc3', 'Desc4'],
                ],
            };
            const result = buildParsedRubric(raw, 'Test');
            expect(result.confidence).toBe('high');
            expect(result.criteria.length).toBe(2);
            expect(result.criteria[0].levels.length).toBe(2);
        });

        it('generates warnings for small tables', () => {
            const raw = {
                headers: ['Crit', 'Level'],
                rows: [['OnlyOne', 'Desc']],
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

// ─── Share Code round-trip ────────────────────────────────────────────────────

describe('encodeRubricShareCode / decodeRubricShareCode', () => {
    it('round-trips a rubric via share code', async () => {
        const { encodeRubricShareCode, decodeRubricShareCode } = await import('./rubricImport');
        const rubric = {
            id: 'r1',
            name: 'My Rubric',
            subject: 'Math',
            description: 'A rubric',
            criteria: [
                {
                    id: 'c1',
                    title: 'C1',
                    description: '',
                    weight: 100,
                    levels: [{ id: 'l1', label: 'A', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
                },
            ],
            gradeScaleId: 'gs1',
            scoringMode: 'weighted-percentage' as const,
            totalMaxPoints: 100,
            format: 'grid' as any,
            attachmentIds: [],
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
        };
        const code = encodeRubricShareCode(rubric);
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(10);

        const decoded = decodeRubricShareCode(code);
        expect(decoded.name).toBe('My Rubric');
        expect(decoded.subject).toBe('Math');
        expect(decoded.criteria.length).toBe(1);
        expect(decoded.criteria[0].title).toBe('C1');
        expect(decoded.gradeScaleId).toBe('gs1');
        expect(decoded.scoringMode).toBe('weighted-percentage');
        expect(decoded.totalMaxPoints).toBe(100);
    });

    it('throws for invalid share code', async () => {
        const { decodeRubricShareCode } = await import('./rubricImport');
        expect(() => decodeRubricShareCode('not-valid-base64!!')).toThrow();
    });

    it('throws when decoded JSON has no criteria array', async () => {
        const { decodeRubricShareCode } = await import('./rubricImport');
        const bad = btoa(encodeURIComponent(JSON.stringify({ name: 'x' })));
        expect(() => decodeRubricShareCode(bad)).toThrow('Invalid share code');
    });
});

// ─── buildParsedRubric with various table shapes ──────────────────────────────

describe('buildParsedRubric edge cases', () => {
    it('returns empty result when no level columns found', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric({ headers: [], rows: [['C1']] }, 'test');
        expect(result.criteria.length).toBe(0);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('skips rows with no criterion name', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric(
            {
                headers: ['criterion', 'Level A', 'Level B'],
                rows: [
                    ['C1', 'desc A', 'desc B'],
                    ['', 'x', 'y'],
                ],
            },
            'test'
        );
        expect(result.criteria.length).toBe(1);
    });

    it('returns "no criteria" error when all rows have empty criterion name', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric(
            {
                headers: ['criterion', 'Level A', 'Level B'],
                rows: [
                    ['', 'x', 'y'],
                    ['', 'a', 'b'],
                ],
            },
            'test'
        );
        expect(result.criteria.length).toBe(0);
        expect(result.warnings).toContain('Table found but no criteria could be extracted.');
    });
});

// ─── parseJsonToRubric — linked standards / subItem edge cases ─────────────────

describe('parseJsonToRubric — linked standards & sub-items', () => {
    it('preserves linkedStandard when present on criterion', async () => {
        const { parseJsonToRubric } = await import('./rubricImport');
        const json = {
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    linkedStandard: {
                        guid: 'std1',
                        statementNotation: 'ELA.1',
                        description: 'English standard',
                        standardSetTitle: 'ELA',
                        jurisdictionTitle: 'US',
                    },
                    levels: [{ label: 'Good', minPoints: 5, maxPoints: 5, description: '' }],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json');
        const result = await parseJsonToRubric(file);
        expect(result.criteria[0].linkedStandard).toBeDefined();
        expect(result.criteria[0].linkedStandard?.statementNotation).toBe('ELA.1');
    });

    it('preserves linkedStandards array when present on criterion', async () => {
        const { parseJsonToRubric } = await import('./rubricImport');
        const json = {
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    linkedStandards: [
                        {
                            guid: 'std1',
                            statementNotation: 'ELA.1',
                            description: 'Standard 1',
                            standardSetTitle: 'ELA',
                            jurisdictionTitle: 'US',
                        },
                        {
                            guid: 'std2',
                            statementNotation: 'ELA.2',
                            description: 'Standard 2',
                            standardSetTitle: 'ELA',
                            jurisdictionTitle: 'US',
                        },
                    ],
                    levels: [{ label: 'Good', minPoints: 5, maxPoints: 5, description: '' }],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json');
        const result = await parseJsonToRubric(file);
        expect(Array.isArray(result.criteria[0].linkedStandards)).toBe(true);
        expect(result.criteria[0].linkedStandards!.length).toBe(2);
    });

    it('preserves subItems with linkedStandards when present', async () => {
        const { parseJsonToRubric } = await import('./rubricImport');
        const json = {
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    levels: [
                        {
                            label: 'Good',
                            minPoints: 5,
                            maxPoints: 5,
                            description: '',
                            subItems: [
                                {
                                    id: 'si1',
                                    label: 'Sub 1',
                                    points: 2,
                                    linkedStandards: [
                                        {
                                            guid: 'std1',
                                            statementNotation: 'ELA.1',
                                            description: 'Sub standard',
                                            standardSetTitle: 'ELA',
                                            jurisdictionTitle: 'US',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json');
        const result = await parseJsonToRubric(file);
        const subItem = result.criteria[0].levels[0].subItems[0];
        expect(subItem.linkedStandards).toBeDefined();
        expect(subItem.linkedStandards![0].statementNotation).toBe('ELA.1');
    });

    it('handles subItems without linkedStandards (undefined)', async () => {
        const { parseJsonToRubric } = await import('./rubricImport');
        const json = {
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    levels: [
                        {
                            label: 'Good',
                            minPoints: 5,
                            maxPoints: 5,
                            description: '',
                            subItems: [{ id: 'si1', label: 'Sub 1', points: 2 }],
                        },
                    ],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json');
        const result = await parseJsonToRubric(file);
        const subItem = result.criteria[0].levels[0].subItems[0];
        expect(subItem.linkedStandards).toBeUndefined();
    });
});

describe('parseJsonToRubric — edge case branches', () => {
    it('uses "Untitled Criterion" when criterion title is missing', async () => {
        const json = {
            criteria: [
                { levels: [{ label: 'Good', minPoints: 0, maxPoints: 5, description: '' }] },
                // no title field
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json', { type: 'application/json' });
        const result = await parseJsonToRubric(file);
        expect(result.criteria[0].title).toBe('Untitled Criterion');
    });

    it('deep-clones linkedStandards array on criterion', async () => {
        const json = {
            name: 'Test',
            criteria: [
                {
                    title: 'Crit 1',
                    weight: 100,
                    linkedStandards: [{ guid: 'std1', description: 'Standard 1', statementNotation: 'S1' }],
                    levels: [{ label: 'Good', minPoints: 0, maxPoints: 10, description: '' }],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json', { type: 'application/json' });
        const result = await parseJsonToRubric(file);
        expect(result.criteria[0].linkedStandards).toHaveLength(1);
        expect(result.criteria[0].linkedStandards![0].guid).toBe('std1');
    });

    it('leaves linkedStandards undefined when not an array', async () => {
        const json = {
            name: 'Test',
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    linkedStandards: null, // not an array
                    levels: [{ label: 'Good', minPoints: 0, maxPoints: 5, description: '' }],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json', { type: 'application/json' });
        const result = await parseJsonToRubric(file);
        expect(result.criteria[0].linkedStandards).toBeUndefined();
    });

    it('deep-clones subItems with linkedStandards inside levels', async () => {
        const json = {
            name: 'Test',
            criteria: [
                {
                    title: 'Crit',
                    weight: 100,
                    levels: [
                        {
                            label: 'Good',
                            minPoints: 0,
                            maxPoints: 10,
                            description: '',
                            subItems: [
                                { label: 'Sub A', points: 3, linkedStandards: [{ guid: 'si-std1' }] },
                                { label: 'Sub B', points: 7 }, // no linkedStandards
                            ],
                        },
                    ],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'rubric.json', { type: 'application/json' });
        const result = await parseJsonToRubric(file);
        const level = result.criteria[0].levels[0];
        expect(level.subItems).toHaveLength(2);
        expect(level.subItems[0].linkedStandards).toHaveLength(1);
        expect(level.subItems[0].linkedStandards![0].guid).toBe('si-std1');
        expect(level.subItems[1].linkedStandards).toBeUndefined();
    });
});
