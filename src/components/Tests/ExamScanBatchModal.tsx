import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    X,
    Camera,
    Upload,
    ScanLine,
    RotateCcw,
    Check,
    AlertTriangle,
    Trash2,
    Users,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { importScanFiles, type ScanImage } from '../../utils/scanImport';
import { fileToDataUrl } from '../../utils/fileToDataUrl';
import { imageSourceToRgbaImage, rgbaImageToDataUrl } from '../../utils/rgbaImageCanvas';
import { orderCorners, cropQuadrilateral, type Point } from '../../utils/documentCrop';
import { preprocessScan } from '../../utils/preprocessScan';
import { EXAM_PAGE_MM } from '../../utils/testExamContent';
import {
    detectScannedAnswers,
    mergeScannedAnswers,
    UnsupportedAnswerSheetError,
    type ScannedAnswer,
} from '../../utils/examScanAnswers';
import { decodeAnswerSheetQr } from '../../utils/examScanQr';
import { cropAnswerSheetNameRegion, matchStudentByName } from '../../utils/examScanStudentMatch';
import { groupPagesByStudent, pageCountMismatches, unassignedPages } from '../../utils/examScanBatch';
import { OcrUnavailableError } from '../../utils/ocrErrors';
import { recognizeImage } from '../../utils/textExtraction';
import { calcStudentTestRawPoints } from '../../utils/testCalc';
import { nanoid } from '../../utils/nanoid';
import type { RgbaImage, Student, StudentTest, Test, TestAnswer, TestQuestion } from '../../types';

interface Props {
    test: Test;
    students: Student[];
    studentTests: StudentTest[];
    /** Tesseract language(s) for the name-reading fallback, e.g. `'eng'` or `'eng+nld'`. */
    defaultLang: string;
    onSave: (st: StudentTest) => void;
    onClose: () => void;
}

type Phase = 'intake' | 'processing' | 'review' | 'done';

interface CornerFraction {
    fx: number;
    fy: number;
}

interface BatchPage {
    id: string;
    blob: Blob;
    previewUrl: string;
    sourceName: string;
    /** 0-based page index inside the picked PDF, when the source was a PDF. */
    sourcePage?: number;
    /** Empty until the teacher assigns a student. */
    studentId: string;
    /** QR payload fields, when the sheet's optional identification QR was read. */
    qrTestId?: string;
    qrStudentId?: string;
    qrPageCount?: number;
    /** Four page corners as fractions of the image; null = the image is already the page. */
    corners: CornerFraction[] | null;
    /** Detection failure for this page, if any. */
    error?: string;
}

const PX_PER_MM = 4;

function parseIdArray(response: string): string[] {
    try {
        const parsed: unknown = JSON.parse(response);
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

function AnswerEditor({
    question,
    response,
    onChange,
}: {
    question: TestQuestion;
    response: string;
    onChange: (response: string) => void;
}) {
    const { t } = useTranslation();

    if (question.type === 'multiple-choice') {
        return (
            <select
                className="input"
                aria-label={t('tests.scan.answer_for_label', { prompt: question.prompt })}
                value={response}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">{t('tests.scan.no_answer_option')}</option>
                {(question.options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.text}
                    </option>
                ))}
            </select>
        );
    }

    if (question.type === 'true-false') {
        return (
            <select
                className="input"
                aria-label={t('tests.scan.answer_for_label', { prompt: question.prompt })}
                value={response}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">{t('tests.scan.no_answer_option')}</option>
                <option value="true">{t('tests.true_false_true')}</option>
                <option value="false">{t('tests.true_false_false')}</option>
            </select>
        );
    }

    if (question.type === 'multiple-response') {
        const selected = new Set(parseIdArray(response));
        const toggle = (id: string) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            onChange(JSON.stringify([...next]));
        };
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(question.options ?? []).map((o) => (
                    <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                        {o.text}
                    </label>
                ))}
            </div>
        );
    }

    return (
        <textarea
            className="input"
            style={{ minHeight: 40, resize: 'vertical', fontFamily: 'inherit' }}
            rows={2}
            value={response}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

/**
 * Batch answer-sheet ingestion. The old flow scanned one student's one page per modal; this one
 * accepts every photo/PDF page at once, assigns pages (or whole page ranges) to students, and reads
 * each student's pages in order. A multi-page sheet is handled by detecting only the questions
 * printed on each page (see answerSheetPages()) and merging them per student.
 *
 * Pages are matched to students by, in order: the QR code printed in the scan-marker band (when the
 * export included markers), the teacher's manual assignment, or OCR of the printed candidate name.
 * Every automatic match is a suggestion the teacher can override before anything is saved, and the
 * page layout is identical with or without markers, so the teacher never states which was printed.
 */
export default function ExamScanBatchModal({ test, students, studentTests, defaultLang, onSave, onClose }: Props) {
    const { t } = useTranslation();
    const { videoRef, start, capture, stop } = useCameraCapture();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelledRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('intake');
    const [pages, setPages] = useState<BatchPage[]>([]);
    const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
    const [assignTarget, setAssignTarget] = useState('');
    const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [cameraOn, setCameraOn] = useState(false);
    const [responsesByStudent, setResponsesByStudent] = useState<Record<string, Record<string, string>>>({});
    const [detectedByStudent, setDetectedByStudent] = useState<Record<string, ScannedAnswer[]>>({});
    const [savedCount, setSavedCount] = useState(0);
    const [cornerEdit, setCornerEdit] = useState<{
        pageId: string;
        clicks: CornerFraction[];
        applyToAll: boolean;
    } | null>(null);

    const questionsById = useMemo(() => new Map(test.questions.map((q) => [q.id, q])), [test.questions]);

    const rosterOptions = useMemo(() => {
        const withResult = new Set(studentTests.filter((st) => st.testId === test.id).map((st) => st.studentId));
        return students
            .map((s) => ({ ...s, hasResult: withResult.has(s.id) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [students, studentTests, test.id]);

    const studentNames = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

    const groups = useMemo(() => groupPagesByStudent(pages), [pages]);
    const unassigned = useMemo(() => unassignedPages(pages), [pages]);
    const mismatches = useMemo(() => pageCountMismatches(groups), [groups]);

    const updatePage = useCallback((id: string, patch: Partial<BatchPage>) => {
        setPages((prev) => prev.map((page) => (page.id === id ? { ...page, ...patch } : page)));
    }, []);

    const identifyPage = useCallback(
        async (id: string, blob: Blob) => {
            try {
                const image = await imageSourceToRgbaImage(blob);
                const identity = await decodeAnswerSheetQr(image);
                if (!identity) return;
                const matchesTest = identity.testId === test.id;
                const studentId =
                    matchesTest && identity.studentId && students.some((s) => s.id === identity.studentId)
                        ? identity.studentId
                        : '';
                updatePage(id, {
                    qrTestId: identity.testId,
                    qrStudentId: identity.studentId,
                    qrPageCount: identity.pages,
                    studentId,
                });
            } catch {
                // QR identification is a convenience; an unreadable page stays assignable by hand.
            }
        },
        [students, test.id, updatePage]
    );

    const addImages = useCallback(
        async (images: ScanImage[]) => {
            const added = await Promise.all(
                images.map(async (image) => {
                    const page: BatchPage = {
                        id: nanoid(),
                        blob: image.blob,
                        previewUrl: await fileToDataUrl(image.blob),
                        sourceName: image.sourceName,
                        sourcePage: image.pageIndex,
                        studentId: '',
                        corners: null,
                    };
                    return page;
                })
            );
            if (cancelledRef.current) return;
            setPages((prev) => [...prev, ...added]);
            for (const page of added) void identifyPage(page.id, page.blob);
        },
        [identifyPage]
    );

    const onFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            setErrorMsg('');
            setBusy({ label: t('tests.scan.batch_reading_files'), done: 0, total: files.length });
            try {
                const { images } = await importScanFiles(files);
                if (images.length === 0) {
                    setErrorMsg(t('scan.no_image'));
                    return;
                }
                await addImages(images);
            } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : String(err));
            } finally {
                setBusy(null);
            }
        },
        [addImages, t]
    );

    const startCamera = useCallback(async () => {
        const ok = await start({ facingMode: 'environment' });
        setCameraOn(ok);
        if (!ok) setErrorMsg(t('scan.camera_error'));
    }, [start, t]);

    const takePhoto = useCallback(async () => {
        const shot = await capture('image/png');
        stop();
        setCameraOn(false);
        if (shot)
            await addImages([
                { blob: shot.blob, mimeType: shot.mimeType, sourceName: t('tests.scan.batch_camera_source') },
            ]);
    }, [addImages, capture, stop, t]);

    const toggleSelected = useCallback((id: string) => {
        setSelectedPageIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    }, []);

    const allSelected = pages.length > 0 && selectedPageIds.length === pages.length;
    const toggleSelectAll = useCallback(() => {
        setSelectedPageIds(allSelected ? [] : pages.map((p) => p.id));
    }, [allSelected, pages]);

    const assignSelected = useCallback(() => {
        if (!assignTarget || selectedPageIds.length === 0) return;
        setPages((prev) =>
            prev.map((page) =>
                selectedPageIds.includes(page.id) && page.qrTestId !== test.id
                    ? { ...page, studentId: assignTarget, error: undefined }
                    : page
            )
        );
        setSelectedPageIds([]);
    }, [assignTarget, selectedPageIds, test.id]);

    const removePage = useCallback((id: string) => {
        setPages((prev) => prev.filter((page) => page.id !== id));
        setSelectedPageIds((prev) => prev.filter((p) => p !== id));
    }, []);

    /** Page order is each student's printed page order, so reordering changes which answers merge where. */
    const movePage = useCallback((id: string, direction: -1 | 1) => {
        setPages((prev) => {
            const index = prev.findIndex((page) => page.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }, []);

    const pageImage = useCallback(async (page: BatchPage): Promise<RgbaImage> => {
        const image = await imageSourceToRgbaImage(page.blob);
        if (!page.corners || page.corners.length !== 4) return image;
        const points: Point[] = page.corners.map((c) => ({ x: c.fx * image.width, y: c.fy * image.height }));
        return cropQuadrilateral(image, orderCorners(points), {
            width: Math.round(EXAM_PAGE_MM.width * PX_PER_MM),
            height: Math.round(EXAM_PAGE_MM.height * PX_PER_MM),
        });
    }, []);

    const readNames = useCallback(async () => {
        const targets = pages.filter((page) => !page.studentId && !page.qrTestId);
        if (targets.length === 0) return;
        setErrorMsg('');
        setBusy({ label: t('tests.scan.batch_reading_names'), done: 0, total: targets.length });
        try {
            let done = 0;
            for (const page of targets) {
                if (cancelledRef.current) return;
                try {
                    const corrected = await pageImage(page);
                    const header = cropAnswerSheetNameRegion(corrected);
                    const dataUrl = rgbaImageToDataUrl(header);
                    const ocr = await recognizeImage(dataUrl, { langs: defaultLang, captureHint: 'block' });
                    const studentId = matchStudentByName(ocr.text, students);
                    if (studentId) updatePage(page.id, { studentId });
                } catch (err) {
                    if (err instanceof OcrUnavailableError) throw err;
                    // A single unreadable header must not stop the rest of the batch.
                }
                done += 1;
                setBusy({ label: t('tests.scan.batch_reading_names'), done, total: targets.length });
            }
        } catch (err) {
            setErrorMsg(
                err instanceof OcrUnavailableError
                    ? t('scan.error_engine_unavailable')
                    : err instanceof Error
                      ? err.message
                      : String(err)
            );
        } finally {
            setBusy(null);
        }
    }, [defaultLang, pageImage, pages, students, t, updatePage]);

    const startCornerEdit = useCallback(
        (pageId: string) => {
            const page = pages.find((p) => p.id === pageId);
            if (!page) return;
            setCornerEdit({ pageId, clicks: page.corners ?? [], applyToAll: pages.length > 1 });
        },
        [pages]
    );

    const handleCornerClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const click = {
            fx: (e.clientX - rect.left) / rect.width,
            fy: (e.clientY - rect.top) / rect.height,
        };
        setCornerEdit((prev) => (prev && prev.clicks.length < 4 ? { ...prev, clicks: [...prev.clicks, click] } : prev));
    }, []);

    const saveCorners = useCallback(() => {
        setCornerEdit((prev) => {
            if (!prev || prev.clicks.length !== 4) return prev;
            setPages((current) =>
                current.map((page) =>
                    page.id === prev.pageId || prev.applyToAll
                        ? { ...page, corners: prev.clicks, error: undefined }
                        : page
                )
            );
            return null;
        });
    }, []);

    const detectAll = useCallback(async () => {
        if (groups.length === 0) {
            setErrorMsg(t('tests.scan.batch_no_assigned'));
            return;
        }
        setErrorMsg('');
        setCornerEdit(null);
        setPhase('processing');
        const total = groups.reduce((sum, group) => sum + group.pages.length, 0);
        let done = 0;
        setBusy({ label: t('tests.scan.batch_detecting'), done, total });

        const results: Record<string, ScannedAnswer[]> = {};
        for (const group of groups) {
            const pageResults: ScannedAnswer[][] = [];
            for (let i = 0; i < group.pages.length; i += 1) {
                const page = group.pages[i];
                try {
                    const corrected = await pageImage(page);
                    const prepared = preprocessScan(corrected, { deskew: false });
                    pageResults.push(await detectScannedAnswers(prepared, test, i + 1));
                    updatePage(page.id, { error: undefined });
                } catch (err) {
                    const message =
                        err instanceof UnsupportedAnswerSheetError
                            ? t('tests.scan.batch_page_not_printed', { number: i + 1 })
                            : err instanceof OcrUnavailableError
                              ? t('scan.error_engine_unavailable')
                              : err instanceof Error
                                ? err.message
                                : String(err);
                    updatePage(page.id, { error: message });
                }
                done += 1;
                setBusy({ label: t('tests.scan.batch_detecting'), done, total });
                if (cancelledRef.current) return;
            }
            results[group.studentId] = mergeScannedAnswers(test, pageResults);
        }

        setDetectedByStudent(results);
        setResponsesByStudent(
            Object.fromEntries(
                Object.entries(results).map(([studentId, answers]) => [
                    studentId,
                    Object.fromEntries(answers.map((a) => [a.questionId, a.response])),
                ])
            )
        );
        setBusy(null);
        setPhase('review');
    }, [groups, pageImage, t, test, updatePage]);

    const setResponse = useCallback((studentId: string, questionId: string, response: string) => {
        setResponsesByStudent((prev) => ({
            ...prev,
            [studentId]: { ...(prev[studentId] ?? {}), [questionId]: response },
        }));
    }, []);

    const saveAll = useCallback(async () => {
        const graded = studentTests.filter(
            (st) => st.testId === test.id && st.status === 'graded' && responsesByStudent[st.studentId]
        );
        if (graded.length > 0) {
            const proceed = await confirm({
                title: t('tests.scan.batch_overwrite_title'),
                message: t('tests.scan.batch_overwrite_message', { count: graded.length }),
                danger: true,
            });
            if (!proceed) return;
        }

        const now = new Date().toISOString();
        for (const group of groups) {
            const studentId = group.studentId;
            const answers: TestAnswer[] = test.questions.map((q) => ({
                questionId: q.id,
                response: responsesByStudent[studentId]?.[q.id] ?? '',
            }));
            const existing = studentTests.find((st) => st.testId === test.id && st.studentId === studentId);
            const base: StudentTest = existing ?? {
                id: nanoid(),
                testId: test.id,
                studentId,
                answers: [],
                status: 'submitted',
                startedAt: now,
            };
            onSave({
                ...base,
                testId: test.id,
                studentId,
                answers,
                status: 'submitted',
                submittedAt: base.submittedAt ?? now,
                rawTotalPoints: calcStudentTestRawPoints(test, answers),
                updatedAt: now,
                // A scan replaces every answer, so prior grading metadata no longer matches.
                gradedAt: undefined,
                adjustmentPoints: undefined,
                adjustment: undefined,
            });
        }
        setSavedCount(groups.length);
        setPhase('done');
    }, [confirm, groups, onSave, responsesByStudent, studentTests, t, test]);

    const close = useCallback(() => {
        cancelledRef.current = true;
        stop();
        onClose();
    }, [stop, onClose]);

    const resetToIntake = useCallback(() => {
        setPhase('intake');
        setResponsesByStudent({});
        setDetectedByStudent({});
        setErrorMsg('');
    }, []);

    const orderedStudents = useMemo(
        () => groups.filter((group) => responsesByStudent[group.studentId]),
        [groups, responsesByStudent]
    );

    const cornerPage = cornerEdit ? pages.find((page) => page.id === cornerEdit.pageId) : undefined;

    return (
        <>
            <Modal
                titleId="exam-scan-batch-title"
                onClose={close}
                maxWidth={860}
                style={{ width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px' }}>
                    <ScanLine size={20} style={{ color: 'var(--accent)' }} />
                    <h3 id="exam-scan-batch-title" style={{ margin: 0, flex: 1 }}>
                        {t('tests.scan.batch_title')}
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={close} aria-label={t('common.close')}>
                        <X size={18} />
                    </button>
                </div>

                <div
                    style={{
                        overflowY: 'auto',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        padding: '0 20px 20px',
                    }}
                >
                    {errorMsg && (
                        <div
                            style={{
                                padding: '10px 14px',
                                background: 'rgba(239,68,68,0.08)',
                                borderRadius: 8,
                                border: '1px solid rgba(239,68,68,0.3)',
                                display: 'flex',
                                gap: 8,
                                alignItems: 'flex-start',
                            }}
                        >
                            <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.9rem' }}>{errorMsg}</p>
                        </div>
                    )}

                    {phase === 'intake' && cornerPage && cornerEdit && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                {t('tests.scan.batch_edges_hint')}
                            </p>
                            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                                <img
                                    src={cornerPage.previewUrl}
                                    alt={t('scan.preview_alt')}
                                    onClick={handleCornerClick}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '55vh',
                                        display: 'block',
                                        cursor: 'crosshair',
                                    }}
                                />
                                {cornerEdit.clicks.map((c, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            position: 'absolute',
                                            left: `${c.fx * 100}%`,
                                            top: `${c.fy * 100}%`,
                                            width: 14,
                                            height: 14,
                                            marginLeft: -7,
                                            marginTop: -7,
                                            borderRadius: '50%',
                                            background: 'var(--accent)',
                                            border: '2px solid #fff',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                ))}
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={cornerEdit.applyToAll}
                                    onChange={(e) =>
                                        setCornerEdit((prev) =>
                                            prev ? { ...prev, applyToAll: e.target.checked } : prev
                                        )
                                    }
                                />
                                {t('tests.scan.batch_edges_apply_all', { count: pages.length })}
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setCornerEdit((prev) => (prev ? { ...prev, clicks: [] } : prev))}
                                >
                                    <RotateCcw size={14} /> {t('tests.scan.retry_corners')}
                                </button>
                                <button
                                    className="btn btn-primary btn-sm"
                                    disabled={cornerEdit.clicks.length !== 4}
                                    onClick={saveCorners}
                                >
                                    <Check size={14} /> {t('tests.scan.batch_edges_save')}
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setCornerEdit(null)}>
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'intake' && !cornerEdit && (
                        <>
                            {cameraOn ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        style={{
                                            width: '100%',
                                            borderRadius: 8,
                                            background: '#000',
                                            maxHeight: '45vh',
                                        }}
                                    />
                                    <button className="btn btn-primary" onClick={takePhoto}>
                                        <Camera size={16} /> {t('scan.take_photo')}
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <button className="btn btn-secondary" onClick={startCamera}>
                                        <Camera size={16} /> {t('scan.use_camera')}
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                                        <Upload size={16} /> {t('tests.scan.batch_add_files')}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        multiple
                                        hidden
                                        onChange={(e) => {
                                            const files = e.target.files;
                                            void onFilesPicked(files);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            )}

                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                {t('tests.scan.batch_description')}
                            </p>

                            {pages.length === 0 ? (
                                <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                                    <Users size={28} style={{ color: 'var(--text-muted)' }} />
                                    <p className="text-sm text-muted" style={{ margin: '8px 0 0' }}>
                                        {t('tests.scan.batch_empty')}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            padding: '10px 12px',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                        }}
                                    >
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontSize: '0.82rem',
                                            }}
                                        >
                                            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                                            {t('tests.scan.batch_select_all')}
                                        </label>
                                        <span className="text-xs text-muted">
                                            {t('tests.scan.batch_selected', { count: selectedPageIds.length })}
                                        </span>
                                        <select
                                            className="input"
                                            aria-label={t('tests.scan.batch_assign_label')}
                                            style={{ width: 'auto', minWidth: 160 }}
                                            value={assignTarget}
                                            onChange={(e) => setAssignTarget(e.target.value)}
                                        >
                                            <option value="">{t('tests.scan.batch_assign_placeholder')}</option>
                                            {rosterOptions.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.hasResult
                                                        ? `${s.name} — ${t('tests.scan.student_has_result')}`
                                                        : s.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={!assignTarget || selectedPageIds.length === 0}
                                            onClick={assignSelected}
                                        >
                                            {t('tests.scan.batch_assign_button')}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={busy !== null || pages.every((p) => p.studentId || p.qrTestId)}
                                            onClick={() => void readNames()}
                                        >
                                            {t('tests.scan.batch_read_names')}
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {pages.map((page, index) => {
                                            const wrongTest = !!page.qrTestId && page.qrTestId !== test.id;
                                            return (
                                                <div
                                                    key={page.id}
                                                    className="card"
                                                    style={{
                                                        padding: 10,
                                                        display: 'flex',
                                                        gap: 12,
                                                        alignItems: 'center',
                                                        border: wrongTest ? '1px solid var(--red)' : undefined,
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        aria-label={t('tests.scan.batch_select_page', {
                                                            number: index + 1,
                                                        })}
                                                        checked={selectedPageIds.includes(page.id)}
                                                        onChange={() => toggleSelected(page.id)}
                                                    />
                                                    <img
                                                        src={page.previewUrl}
                                                        alt={t('scan.preview_alt')}
                                                        style={{
                                                            width: 54,
                                                            height: 72,
                                                            objectFit: 'cover',
                                                            borderRadius: 4,
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--bg)',
                                                        }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                                                            {t('tests.scan.batch_page', { number: index + 1 })}
                                                        </div>
                                                        <div
                                                            className="text-xs text-muted"
                                                            style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                        >
                                                            {page.sourcePage !== undefined
                                                                ? t('tests.scan.batch_source_page', {
                                                                      name: page.sourceName,
                                                                      number: page.sourcePage + 1,
                                                                  })
                                                                : page.sourceName}
                                                        </div>
                                                        {wrongTest && (
                                                            <div className="text-xs" style={{ color: 'var(--red)' }}>
                                                                {t('tests.scan.batch_wrong_test')}
                                                            </div>
                                                        )}
                                                        {page.error && (
                                                            <div className="text-xs" style={{ color: 'var(--red)' }}>
                                                                {page.error}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <select
                                                        className="input"
                                                        aria-label={t('tests.scan.batch_page_student', {
                                                            number: index + 1,
                                                        })}
                                                        style={{ width: 'auto', maxWidth: 210 }}
                                                        value={page.studentId}
                                                        disabled={wrongTest}
                                                        onChange={(e) =>
                                                            updatePage(page.id, {
                                                                studentId: e.target.value,
                                                                error: undefined,
                                                            })
                                                        }
                                                    >
                                                        <option value="">{t('tests.scan.batch_unassigned')}</option>
                                                        {rosterOptions.map((s) => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        title={t('tests.scan.batch_move_up')}
                                                        aria-label={t('tests.scan.batch_move_up')}
                                                        disabled={index === 0}
                                                        onClick={() => movePage(page.id, -1)}
                                                    >
                                                        <ChevronUp size={15} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        title={t('tests.scan.batch_move_down')}
                                                        aria-label={t('tests.scan.batch_move_down')}
                                                        disabled={index === pages.length - 1}
                                                        onClick={() => movePage(page.id, 1)}
                                                    >
                                                        <ChevronDown size={15} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        title={t('tests.scan.batch_edges')}
                                                        aria-label={t('tests.scan.batch_edges')}
                                                        onClick={() => startCornerEdit(page.id)}
                                                    >
                                                        <ScanLine size={15} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        title={t('tests.scan.batch_remove')}
                                                        aria-label={t('tests.scan.batch_remove')}
                                                        onClick={() => removePage(page.id)}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {unassigned.length > 0 && (
                                        <p className="text-xs" style={{ margin: 0, color: 'var(--yellow)' }}>
                                            {t('tests.scan.batch_unassigned_warning', { count: unassigned.length })}
                                        </p>
                                    )}
                                    {mismatches.length > 0 && (
                                        <p className="text-xs" style={{ margin: 0, color: 'var(--yellow)' }}>
                                            {mismatches
                                                .map((m) =>
                                                    t('tests.scan.batch_page_mismatch', {
                                                        name: studentNames.get(m.studentId) ?? m.studentId,
                                                        expected: m.expected,
                                                        actual: m.actual,
                                                    })
                                                )
                                                .join(' ')}
                                        </p>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {phase === 'processing' && (
                        <div className="card" style={{ padding: 16, textAlign: 'center' }} aria-live="polite">
                            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                                {busy ? busy.label : t('tests.scan.batch_detecting')}
                            </p>
                            {busy && (
                                <p className="text-xs text-muted" style={{ margin: 0 }}>
                                    {t('tests.scan.batch_progress', { done: busy.done, total: busy.total })}
                                </p>
                            )}
                        </div>
                    )}

                    {phase === 'review' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                {t('tests.scan.batch_review_hint')}
                            </p>
                            {orderedStudents.length === 0 && (
                                <p className="text-sm text-muted" style={{ margin: 0 }}>
                                    {t('tests.scan.batch_no_answers')}
                                </p>
                            )}
                            {orderedStudents.map((group) => {
                                const name = studentNames.get(group.studentId) ?? group.studentId;
                                const detected = detectedByStudent[group.studentId] ?? [];
                                const mismatch = mismatches.find((m) => m.studentId === group.studentId);
                                return (
                                    <div key={group.studentId} className="card" style={{ padding: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <strong style={{ flex: 1 }}>{name}</strong>
                                            <span className="text-xs text-muted">
                                                {t('tests.scan.batch_pages_count', { count: group.pages.length })}
                                            </span>
                                        </div>{' '}
                                        {mismatch && (
                                            <p
                                                className="text-xs"
                                                style={{ margin: '0 0 8px', color: 'var(--yellow)' }}
                                            >
                                                {t('tests.scan.batch_page_mismatch', {
                                                    name,
                                                    expected: mismatch.expected,
                                                    actual: mismatch.actual,
                                                })}
                                            </p>
                                        )}
                                        {group.pages.map((page, pageIndex) =>
                                            page.error ? (
                                                <p
                                                    key={page.id}
                                                    className="text-xs"
                                                    style={{ margin: '0 0 6px', color: 'var(--red)' }}
                                                >
                                                    {t('tests.scan.batch_page_error', {
                                                        number: pageIndex + 1,
                                                        message: page.error,
                                                    })}
                                                </p>
                                            ) : null
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {detected.map((d) => {
                                                const question = questionsById.get(d.questionId);
                                                if (!question) return null;
                                                return (
                                                    <div
                                                        key={d.questionId}
                                                        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <strong style={{ fontSize: '0.82rem' }}>#{d.number}</strong>
                                                            <span
                                                                style={{
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    padding: '1px 7px',
                                                                    borderRadius: 4,
                                                                    color:
                                                                        d.source === 'unscanned'
                                                                            ? 'var(--text-muted)'
                                                                            : 'var(--accent)',
                                                                    background: 'var(--bg)',
                                                                    border: '1px solid var(--border)',
                                                                }}
                                                            >
                                                                {t(`tests.scan.source_${d.source}`)}
                                                            </span>
                                                            {d.source === 'ocr' && d.confidence !== undefined && (
                                                                <span className="text-xs text-muted">
                                                                    {Math.round(d.confidence * 100)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        {d.source === 'unscanned' ? (
                                                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                                                {t('tests.scan.unscanned_note')}
                                                            </p>
                                                        ) : (
                                                            <AnswerEditor
                                                                question={question}
                                                                response={
                                                                    responsesByStudent[group.studentId]?.[
                                                                        d.questionId
                                                                    ] ?? ''
                                                                }
                                                                onChange={(response) =>
                                                                    setResponse(group.studentId, d.questionId, response)
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {phase === 'done' && (
                        <div
                            className="card"
                            style={{
                                padding: 20,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <Check size={32} style={{ color: 'var(--green)' }} />
                            <p style={{ margin: 0, fontWeight: 600 }}>
                                {t('tests.scan.batch_saved', { count: savedCount })}
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 20px 20px' }}>
                    {phase === 'intake' && (
                        <button
                            className="btn btn-primary"
                            disabled={groups.length === 0 || busy !== null}
                            onClick={() => void detectAll()}
                        >
                            {t('tests.scan.batch_detect_button', { count: groups.length })}
                        </button>
                    )}
                    {phase === 'review' && (
                        <>
                            <button className="btn btn-ghost" onClick={resetToIntake}>
                                {t('tests.scan.batch_back')}
                            </button>
                            <button className="btn btn-primary" onClick={() => void saveAll()}>
                                <Check size={16} /> {t('tests.scan.batch_save_all', { count: orderedStudents.length })}
                            </button>
                        </>
                    )}
                    {phase === 'done' && (
                        <button className="btn btn-primary" onClick={close}>
                            {t('common.close')}
                        </button>
                    )}
                </div>
            </Modal>
            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
