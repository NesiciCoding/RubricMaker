import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mutable so per-test PDF fixtures can vary (empty pages, non-string items, etc.).
const pdfTextItems = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }));

vi.mock('pdfjs-dist', () => ({
    version: '1.0',
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve({
            numPages: 1,
            getPage: vi.fn().mockResolvedValue({
                getTextContent: vi.fn().mockImplementation(() => Promise.resolve({ items: pdfTextItems.items })),
            }),
        }),
    }),
}));

const DEFAULT_PDF_ITEMS = [
    { str: 'Criterion', transform: [0, 0, 0, 0, 0, 100] },
    { str: '  Excellent  ', transform: [0, 0, 0, 0, 0, 100] },
    { str: '  Satisfactory  ', transform: [0, 0, 0, 0, 0, 100] },
    { str: 'C1', transform: [0, 0, 0, 0, 0, 80] },
    { str: '  L1  ', transform: [0, 0, 0, 0, 0, 80] },
    { str: '  L2  ', transform: [0, 0, 0, 0, 0, 80] },
];

beforeEach(() => {
    pdfTextItems.items = [...DEFAULT_PDF_ITEMS];
});

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

        it('appends short continuation lines to the previous row', () => {
            const lines = [
                'Criterion  Excellent  Satisfactory  Poor',
                'Content    Great      Ok            Bad',
                'a continued description of the content criterion',
                'Design     Pretty     Fine          Ugly',
            ];
            const result = detectTableFromLines(lines);
            expect(result.headers).toEqual(['Criterion', 'Excellent', 'Satisfactory', 'Poor']);
            expect(result.rows).toHaveLength(2);
            // The short line is appended to the previous row's last cell.
            expect(result.rows[0][3]).toContain('a continued description');
            expect(result.rows[1]).toEqual(['Design', 'Pretty', 'Fine', 'Ugly']);
        });

        it('ignores short lines that appear before any row has started', () => {
            const lines = [
                'Criterion  Excellent  Satisfactory  Poor',
                'just a stray short line with no tabular structure',
            ];
            const result = detectTableFromLines(lines);
            expect(result.headers).toEqual(['Criterion', 'Excellent', 'Satisfactory', 'Poor']);
            expect(result.rows).toHaveLength(0);
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

        it('returns empty headers and rows when the table has a single row', () => {
            const container = document.createElement('div');
            container.innerHTML = `<table><tr><td>OnlyRow</td></tr></table>`;
            const table = container.querySelector('table')!;
            const result = extractTableFromHtml(table);
            expect(result.headers).toEqual([]);
            expect(result.rows).toEqual([]);
        });

        it('skips rows whose cells are all empty', () => {
            const container = document.createElement('div');
            container.innerHTML = `<table><tr><td></td><td></td></tr><tr><td>R1</td><td>R2</td></tr></table>`;
            const table = container.querySelector('table')!;
            const result = extractTableFromHtml(table);
            // The all-empty first row is dropped, leaving a single row → no header/body split.
            expect(result.headers).toEqual([]);
            expect(result.rows).toEqual([]);
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

        it('picks the largest table when the document contains several', async () => {
            const { parseDocxToRubric } = await import('./rubricImport');
            const mammoth = await import('mammoth');
            vi.mocked(mammoth.convertToHtml).mockResolvedValueOnce({
                value: `
                    <table><tr><td>Crit</td><td>Good</td><td>Poor</td></tr><tr><td>C1</td><td>L1</td><td>L2</td></tr></table>
                    <table><tr><td>Small</td><td>Table</td></tr><tr><td>A</td><td>B</td></tr></table>
                `,
                messages: [],
            });
            const file = new File([''], 'multi.docx');
            const result = await parseDocxToRubric(file);
            // The first table (6 cells) wins; the second (4 cells) loses the largest-table contest.
            expect(result.criteria).toHaveLength(1);
            expect(result.criteria[0].levels).toHaveLength(2);
        });

        it('returns an empty result when the document contains no table', async () => {
            const { parseDocxToRubric } = await import('./rubricImport');
            const mammoth = await import('mammoth');
            vi.mocked(mammoth.convertToHtml).mockResolvedValueOnce({ value: '<p>No tables here</p>', messages: [] });
            const file = new File([''], 'notes.docx');
            const result = await parseDocxToRubric(file);

            expect(result.criteria).toHaveLength(0);
            expect(result.confidence).toBe('low');
            expect(result.warnings[0]).toContain('No table found');
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

        it('skips PDF text items that carry no string payload', async () => {
            const { parsePdfToRubric } = await import('./rubricImport');
            pdfTextItems.items = [
                { transform: [0, 0, 0, 0, 0, 100] }, // no 'str' key
                ...DEFAULT_PDF_ITEMS,
            ];
            const file = new File([''], 'test.pdf');
            const result = await parsePdfToRubric(file);

            expect(result.criteria.length).toBe(1);
            expect(result.criteria[0].title).toBe('C1');
        });

        it('returns an empty result when no text can be extracted from the PDF', async () => {
            const { parsePdfToRubric } = await import('./rubricImport');
            pdfTextItems.items = [];
            const file = new File([''], 'scanned.pdf');
            const result = await parsePdfToRubric(file);

            expect(result.criteria).toHaveLength(0);
            expect(result.warnings[0]).toContain('Could not extract any text');
        });

        it('skips blank lines assembled from whitespace-only text items', async () => {
            const { parsePdfToRubric } = await import('./rubricImport');
            pdfTextItems.items = [
                ...DEFAULT_PDF_ITEMS,
                { str: '   ', transform: [0, 0, 0, 0, 0, 90] }, // own line (y=90), trims to empty
            ];
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

    it('defaults missing name/subject/description fields when decoding a share code', async () => {
        const { encodeRubricShareCode, decodeRubricShareCode } = await import('./rubricImport');
        const code = encodeRubricShareCode({
            id: 'r1',
            name: 'x',
            subject: 'x',
            description: 'x',
            criteria: [],
            gradeScaleId: 'gs1',
            scoringMode: 'weighted-percentage',
            totalMaxPoints: 100,
            format: 'grid' as any,
            attachmentIds: [],
            createdAt: '',
            updatedAt: '',
        });
        // Strip the optional fields from the encoded JSON before decoding.
        const stripped = JSON.parse(decodeURIComponent(atob(code)));
        delete stripped.name;
        delete stripped.subject;
        delete stripped.description;
        const decoded = decodeRubricShareCode(btoa(encodeURIComponent(JSON.stringify(stripped))));
        expect(decoded.name).toBe('');
        expect(decoded.subject).toBe('');
        expect(decoded.description).toBe('');
        expect(decoded.criteria).toEqual([]);
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

    it('treats a single-column header row as having no level columns', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric({ headers: ['Criterion'], rows: [['C1']] }, 'test');
        expect(result.criteria).toHaveLength(0);
        expect(result.warnings).toContain('Found a table but could not detect level columns.');
    });

    it('skips rows with no cells at all', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric(
            {
                headers: ['criterion', 'Level A', 'Level B'],
                rows: [[], ['C1', 'desc A', 'desc B']],
            },
            'test'
        );
        expect(result.criteria).toHaveLength(1);
        expect(result.criteria[0].title).toBe('C1');
    });

    it('treats a long first header without a criterion keyword as a level column', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric(
            {
                headers: ['Performance descriptors for this assessment are listed below', 'Good', 'Poor'],
                rows: [['C1', 'Well done', 'Needs work']],
            },
            'test'
        );
        expect(result.criteria).toHaveLength(1);
        // criterionColIdx === -1 → every header is a level, and descriptions start at column 0
        expect(result.criteria[0].levels).toHaveLength(3);
        expect(result.criteria[0].levels[0].label).toBe('Performance descriptors for this assessment are listed below');
        expect(result.criteria[0].levels[0].description).toBe('C1');
    });

    it('falls back to an empty description when a row is shorter than the level columns', async () => {
        const { buildParsedRubric } = await import('./rubricImport');
        const result = buildParsedRubric(
            {
                headers: ['criterion', 'Level A', 'Level B'],
                rows: [['C1', 'only one description']],
            },
            'test'
        );
        expect(result.criteria[0].levels[1].description).toBe('');
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

    it('applies defaults for missing or non-numeric JSON fields', async () => {
        const json = {
            name: 'Defaults',
            criteria: [
                {
                    // no title, no description, no weight, no linkedStandard, no linkedStandards
                    levels: [
                        {
                            // no label
                            minPoints: 'five', // non-numeric
                            maxPoints: null, // non-numeric
                        },
                    ],
                },
                {
                    title: 'No levels at all',
                    weight: 'heavy', // non-numeric
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'defaults.json');
        const result = await parseJsonToRubric(file);
        const first = result.criteria[0];
        expect(first.title).toBe('Untitled Criterion');
        expect(first.description).toBe('');
        expect(first.weight).toBe(0);
        expect(first.linkedStandard).toBeUndefined();
        expect(first.linkedStandards).toBeUndefined();
        expect(first.levels).toHaveLength(1);
        expect(first.levels[0].label).toBe('Level');
        expect(first.levels[0].minPoints).toBe(0);
        expect(first.levels[0].maxPoints).toBe(0);
        expect(first.levels[0].subItems).toHaveLength(0);
        const second = result.criteria[1];
        expect(second.weight).toBe(0);
        expect(second.levels).toHaveLength(0);
    });

    it('applies defaults for sub-items with no label and non-numeric points', async () => {
        const json = {
            criteria: [
                {
                    title: 'Crit',
                    levels: [{ subItems: [{ points: 'three' }] }],
                },
            ],
        };
        const file = new File([JSON.stringify(json)], 'sub.json');
        const result = await parseJsonToRubric(file);
        const subItem = result.criteria[0].levels[0].subItems[0];
        expect(subItem.label).toBe('');
        expect(subItem.points).toBe(0);
        expect(subItem.linkedStandards).toBeUndefined();
    });

    it('reports a non-Error rejection with String(err)', async () => {
        const file = {
            name: 'boom.json',
            text: async () => {
                throw 'plain string failure';
            },
        } as unknown as File;
        const result = await parseJsonToRubric(file);
        expect(result.criteria).toHaveLength(0);
        expect(result.warnings[0]).toContain('plain string failure');
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
