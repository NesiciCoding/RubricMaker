import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExamScanBatchModal from '../ExamScanBatchModal';
import type { Student, Test } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && typeof opts.number === 'number' ? `${key}:${opts.number}` : key,
    }),
}));

const { start, capture, stop, videoRef } = vi.hoisted(() => ({
    start: vi.fn(async () => true),
    capture: vi.fn(async () => ({ blob: new Blob(['cam'], { type: 'image/png' }), mimeType: 'image/png' })),
    stop: vi.fn(),
    videoRef: { current: null },
}));
vi.mock('../../../hooks/useCameraCapture', () => ({
    useCameraCapture: () => ({ status: 'idle', error: null, videoRef, start, capture, stop }),
}));

const { importScanFiles } = vi.hoisted(() => ({ importScanFiles: vi.fn() }));
vi.mock('../../../utils/scanImport', () => ({ importScanFiles }));

vi.mock('../../../utils/fileToDataUrl', () => ({
    fileToDataUrl: vi.fn(async () => 'data:image/png;base64,raw'),
}));

const { imageSourceToRgbaImage, rgbaImageToDataUrl } = vi.hoisted(() => ({
    imageSourceToRgbaImage: vi.fn(async () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
    rgbaImageToDataUrl: vi.fn(() => 'data:image/png;base64,region'),
}));
vi.mock('../../../utils/rgbaImageCanvas', () => ({ imageSourceToRgbaImage, rgbaImageToDataUrl }));

vi.mock('../../../utils/documentCrop', () => ({
    orderCorners: (points: unknown) => points,
    cropQuadrilateral: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
}));

vi.mock('../../../utils/preprocessScan', () => ({ preprocessScan: (img: unknown) => img }));

const { detectScannedAnswers } = vi.hoisted(() => ({ detectScannedAnswers: vi.fn() }));
vi.mock('../../../utils/examScanAnswers', async () => {
    const actual = await vi.importActual<typeof import('../../../utils/examScanAnswers')>(
        '../../../utils/examScanAnswers'
    );
    return { ...actual, detectScannedAnswers };
});

const { decodeAnswerSheetQr } = vi.hoisted(() => ({ decodeAnswerSheetQr: vi.fn() }));
vi.mock('../../../utils/examScanQr', () => ({ decodeAnswerSheetQr }));

const students: Student[] = [
    { id: 's1', name: 'Ada Lovelace', classId: 'c1' },
    { id: 's2', name: 'Grace Hopper', classId: 'c1' },
];

const test: Test = {
    id: 't1',
    name: 'Quiz',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: new Date().toISOString(),
    questions: [
        {
            id: 'q1',
            type: 'multiple-choice',
            points: 1,
            prompt: 'Capital of France?',
            partialCredit: true,
            options: [
                { id: 'o1', text: 'Paris', isCorrect: true },
                { id: 'o2', text: 'Berlin', isCorrect: false },
            ],
        },
        {
            id: 'q2',
            type: 'true-false',
            points: 1,
            prompt: 'The sky is blue.',
            partialCredit: true,
            expectedAnswer: 'true',
        },
    ],
};

function pickTwoPages() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
        new File(['a'], 'stack.pdf', { type: 'application/pdf' }),
        new File(['b'], 'more.pdf', { type: 'application/pdf' }),
    ];
    fireEvent.change(input, { target: { files } });
}

function renderModal(onSave = vi.fn()) {
    render(
        <ExamScanBatchModal
            test={test}
            students={students}
            studentTests={[]}
            defaultLang="eng"
            onSave={onSave}
            onClose={vi.fn()}
        />
    );
    return onSave;
}

beforeEach(() => {
    vi.clearAllMocks();
    start.mockResolvedValue(true);
    importScanFiles.mockResolvedValue({
        images: [
            {
                blob: new Blob(['a'], { type: 'image/png' }),
                mimeType: 'image/png',
                sourceName: 'stack.pdf',
                pageIndex: 0,
            },
            {
                blob: new Blob(['b'], { type: 'image/png' }),
                mimeType: 'image/png',
                sourceName: 'stack.pdf',
                pageIndex: 1,
            },
        ],
        skipped: [],
    });
    // Each student's scan starts at page 1; the page content differs, so vary by call order.
    let detectCall = 0;
    detectScannedAnswers.mockImplementation(async () => {
        detectCall += 1;
        return detectCall === 1
            ? [{ questionId: 'q1', number: 1, response: 'o1', source: 'bubble' }]
            : [{ questionId: 'q2', number: 2, response: 'false', source: 'bubble' }];
    });
});

describe('ExamScanBatchModal', () => {
    it('assigns pages from their QR codes, reads every page, and saves all students in one action', async () => {
        decodeAnswerSheetQr
            .mockReturnValueOnce({ testId: 't1', studentId: 's1', pages: 1 })
            .mockReturnValueOnce({ testId: 't1', studentId: 's2', pages: 1 });
        const onSave = renderModal();

        pickTwoPages();

        const firstPage = await screen.findByLabelText('tests.scan.batch_page_student:1');
        const secondPage = screen.getByLabelText('tests.scan.batch_page_student:2');
        await waitFor(() => expect((firstPage as HTMLSelectElement).value).toBe('s1'));
        expect((secondPage as HTMLSelectElement).value).toBe('s2');

        fireEvent.click(await screen.findByText('tests.scan.batch_detect_button'));

        await screen.findByText('tests.scan.batch_save_all');
        expect(detectScannedAnswers).toHaveBeenCalledTimes(2);
        expect((detectScannedAnswers.mock.calls[0] as unknown[])[2]).toBe(1);
        expect((detectScannedAnswers.mock.calls[1] as unknown[])[2]).toBe(1);

        fireEvent.click(screen.getByText('tests.scan.batch_save_all'));

        expect(onSave).toHaveBeenCalledTimes(2);
        const saved = onSave.mock.calls.map(
            (call) => call[0] as { studentId: string; answers: { questionId: string; response: string }[] }
        );
        const ada = saved.find((st) => st.studentId === 's1');
        const grace = saved.find((st) => st.studentId === 's2');
        expect(ada?.answers).toEqual([
            { questionId: 'q1', response: 'o1' },
            { questionId: 'q2', response: '' },
        ]);
        expect(grace?.answers).toEqual([
            { questionId: 'q1', response: '' },
            { questionId: 'q2', response: 'false' },
        ]);
    });

    it('waits for a manual assignment when no QR is readable', async () => {
        decodeAnswerSheetQr.mockReturnValue(null);
        renderModal();

        pickTwoPages();
        await screen.findByLabelText('tests.scan.batch_page_student:1');
        expect(screen.getByText('tests.scan.batch_detect_button').closest('button')).toBeDisabled();
        expect(screen.getByText('tests.scan.batch_unassigned_warning')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('tests.scan.batch_page_student:1'), { target: { value: 's1' } });

        await waitFor(() =>
            expect(screen.getByText('tests.scan.batch_detect_button').closest('button')).not.toBeDisabled()
        );
    });
});
