import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExamScanCaptureModal from '../ExamScanCaptureModal';
import type { Student, StudentTest, Test } from '../../../types';
import { UnsupportedAnswerSheetError, type ScannedAnswer } from '../../../utils/examScanAnswers';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
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

const { imageSourceToRgbaImage } = vi.hoisted(() => ({
    imageSourceToRgbaImage: vi.fn(async () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
}));
vi.mock('../../../utils/rgbaImageCanvas', () => ({ imageSourceToRgbaImage }));

vi.mock('../../../utils/documentCrop', () => ({
    orderCorners: (points: unknown) => points,
    cropQuadrilateral: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
}));

vi.mock('../../../utils/preprocessScan', () => ({
    preprocessScan: (img: unknown) => img,
}));

const { detectScannedAnswers } = vi.hoisted(() => ({ detectScannedAnswers: vi.fn() }));
vi.mock('../../../utils/examScanAnswers', async () => {
    const actual = await vi.importActual<typeof import('../../../utils/examScanAnswers')>(
        '../../../utils/examScanAnswers'
    );
    return { ...actual, detectScannedAnswers };
});

const student: Student = { id: 's1', name: 'Ada Lovelace', classId: 'c1' };

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
    ],
};

const scannedAnswer: ScannedAnswer = { questionId: 'q1', number: 1, response: 'o1', source: 'bubble' };

function pickStudentAndOpenCapture() {
    fireEvent.change(screen.getByLabelText('tests.scan.pick_student_label'), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('tests.scan.step_capture_hint'));
}

function pickFile() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'sheet.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
}

function clickAllCorners(img: HTMLElement) {
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
    } as DOMRect);
    for (const [x, y] of [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
    ]) {
        fireEvent.click(img, { clientX: x, clientY: y });
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    start.mockResolvedValue(true);
    importScanFiles.mockResolvedValue({
        images: [{ blob: new Blob(['x'], { type: 'image/png' }), mimeType: 'image/png', sourceName: 'sheet.png' }],
    });
    detectScannedAnswers.mockResolvedValue([scannedAnswer]);
});

describe('ExamScanCaptureModal', () => {
    it('walks student pick → import → corners → review → save', async () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[]}
                onSave={onSave}
                onClose={onClose}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();

        const img = await screen.findByAltText('scan.preview_alt');
        clickAllCorners(img);

        await screen.findByText('tests.scan.source_bubble');
        expect(detectScannedAnswers).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('tests.scan.save_button'));

        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0] as StudentTest;
        expect(saved.studentId).toBe('s1');
        expect(saved.testId).toBe('t1');
        expect(saved.answers).toEqual([{ questionId: 'q1', response: 'o1' }]);
        expect(saved.rawTotalPoints).toBe(1);
        expect(await screen.findByText('tests.scan.save_success')).toBeInTheDocument();
    });

    it('shows the localized unsupported-sheet message when the answer sheet spans multiple pages', async () => {
        detectScannedAnswers.mockRejectedValueOnce(new UnsupportedAnswerSheetError());
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[]}
                onSave={vi.fn()}
                onClose={vi.fn()}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();
        const img = await screen.findByAltText('scan.preview_alt');
        clickAllCorners(img);

        expect(await screen.findByText('tests.scan.unsupported_sheet')).toBeInTheDocument();
    });

    it('reuses an existing StudentTest for the student when one exists', async () => {
        const existing: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [],
            status: 'in_progress',
            startedAt: '2026-01-01T00:00:00.000Z',
        };
        const onSave = vi.fn();
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[existing]}
                onSave={onSave}
                onClose={vi.fn()}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();
        const img = await screen.findByAltText('scan.preview_alt');
        clickAllCorners(img);
        await screen.findByText('tests.scan.source_bubble');
        fireEvent.click(screen.getByText('tests.scan.save_button'));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect((onSave.mock.calls[0][0] as StudentTest).id).toBe('st1');
    });

    it('asks for confirmation before overwriting an already-graded StudentTest, and clears its grading metadata on confirm', async () => {
        const graded: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o2', pointsEarned: 0, feedback: 'Wrong' }],
            status: 'graded',
            startedAt: '2026-01-01T00:00:00.000Z',
            gradedAt: '2026-01-02T00:00:00.000Z',
            adjustmentPoints: 1,
            adjustment: { points: 1, appliedAt: '2026-01-02T00:00:00.000Z' },
        };
        const onSave = vi.fn();
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[graded]}
                onSave={onSave}
                onClose={vi.fn()}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();
        const img = await screen.findByAltText('scan.preview_alt');
        clickAllCorners(img);
        await screen.findByText('tests.scan.source_bubble');
        fireEvent.click(screen.getByText('tests.scan.save_button'));

        const dialogTitle = await screen.findByText('tests.scan.overwrite_graded_title');
        expect(onSave).not.toHaveBeenCalled();

        fireEvent.click(within(dialogTitle.closest('[role="dialog"]')!).getByText('common.confirm'));

        await screen.findByText('tests.scan.save_success');
        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0] as StudentTest;
        expect(saved.id).toBe('st1');
        expect(saved.status).toBe('submitted');
        expect(saved.gradedAt).toBeUndefined();
        expect(saved.adjustmentPoints).toBeUndefined();
        expect(saved.adjustment).toBeUndefined();
    });

    it('cancelling the overwrite confirmation does not save', async () => {
        const graded: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [],
            status: 'graded',
            startedAt: '2026-01-01T00:00:00.000Z',
        };
        const onSave = vi.fn();
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[graded]}
                onSave={onSave}
                onClose={vi.fn()}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();
        const img = await screen.findByAltText('scan.preview_alt');
        clickAllCorners(img);
        await screen.findByText('tests.scan.source_bubble');
        fireEvent.click(screen.getByText('tests.scan.save_button'));

        const dialogTitle = await screen.findByText('tests.scan.overwrite_graded_title');
        fireEvent.click(within(dialogTitle.closest('[role="dialog"]')!).getByText('common.cancel'));

        expect(onSave).not.toHaveBeenCalled();
    });

    it('lets the teacher retry after an import error without closing the modal', async () => {
        importScanFiles.mockResolvedValueOnce({ images: [], skipped: [{ name: 'x.txt', reason: 'unsupported-type' }] });
        render(
            <ExamScanCaptureModal
                test={test}
                students={[student]}
                studentTests={[]}
                onSave={vi.fn()}
                onClose={vi.fn()}
            />
        );

        pickStudentAndOpenCapture();
        pickFile();
        await screen.findByText('scan.no_image');

        fireEvent.click(screen.getByText('scan.rescan'));

        expect(screen.getByText('scan.use_camera')).toBeInTheDocument();
    });
});
