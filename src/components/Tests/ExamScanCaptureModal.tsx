import { useCallback, useMemo, useRef, useState } from 'react';
import { X, Camera, Upload, ScanLine, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { importScanFiles } from '../../utils/scanImport';
import { fileToDataUrl } from '../../utils/fileToDataUrl';
import { imageSourceToRgbaImage } from '../../utils/rgbaImageCanvas';
import { orderCorners, cropQuadrilateral, type Point } from '../../utils/documentCrop';
import { preprocessScan } from '../../utils/preprocessScan';
import { EXAM_PAGE_MM } from '../../utils/testExamContent';
import { detectScannedAnswers, UnsupportedAnswerSheetError, type ScannedAnswer } from '../../utils/examScanAnswers';
import { calcStudentTestRawPoints } from '../../utils/testCalc';
import { nanoid } from '../../utils/nanoid';
import type { RgbaImage, Student, StudentTest, Test, TestAnswer, TestQuestion } from '../../types';

interface Props {
    test: Test;
    students: Student[];
    studentTests: StudentTest[];
    onSave: (st: StudentTest) => void;
    onClose: () => void;
}

type Phase = 'setup' | 'capture' | 'corners' | 'processing' | 'review' | 'error' | 'done';

/** Output resolution for the perspective-corrected page, in pixels per mm of EXAM_PAGE_MM. */
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
            <select className="input" value={response} onChange={(e) => onChange(e.target.value)}>
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
            <select className="input" value={response} onChange={(e) => onChange(e.target.value)}>
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
 * Teacher-only flow: pick which student a paper answer sheet belongs to, capture/import a photo
 * of it, mark the printed page's four corners for perspective correction, then auto-detect every
 * question's answer (multiple-choice/true-false/multiple-response bubbles by ink coverage,
 * short-answer/numeric/open text by per-region OCR) for review before saving. Matching/ordering/
 * cloze/categorize/hot-text/audio-response questions aren't auto-detected yet — see
 * examScanAnswers.ts — and come back blank for manual entry.
 */
export default function ExamScanCaptureModal({ test, students, studentTests, onSave, onClose }: Props) {
    const { t } = useTranslation();
    const { videoRef, start, capture, stop } = useCameraCapture();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelledRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('setup');
    const [studentId, setStudentId] = useState('');
    const [cameraOn, setCameraOn] = useState(false);
    const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
    const [rawImage, setRawImage] = useState<RgbaImage | null>(null);
    const [corners, setCorners] = useState<{ fx: number; fy: number }[]>([]);
    const [detected, setDetected] = useState<ScannedAnswer[]>([]);
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [errorMsg, setErrorMsg] = useState('');

    const questionsById = useMemo(() => new Map(test.questions.map((q) => [q.id, q])), [test.questions]);

    const runDetection = useCallback(
        async (image: RgbaImage, cornerFractions: { fx: number; fy: number }[]) => {
            setPhase('processing');
            setErrorMsg('');
            try {
                const points: Point[] = cornerFractions.map((c) => ({ x: c.fx * image.width, y: c.fy * image.height }));
                const outputWidth = Math.round(EXAM_PAGE_MM.width * PX_PER_MM);
                const outputHeight = Math.round(EXAM_PAGE_MM.height * PX_PER_MM);
                const cropped = cropQuadrilateral(image, orderCorners(points), {
                    width: outputWidth,
                    height: outputHeight,
                });
                const pageImage = preprocessScan(cropped, { deskew: false });
                const results = await detectScannedAnswers(pageImage, test);
                if (cancelledRef.current) return;
                setDetected(results);
                setResponses(Object.fromEntries(results.map((r) => [r.questionId, r.response])));
                setPhase('review');
            } catch (err) {
                if (cancelledRef.current) return;
                setErrorMsg(
                    err instanceof UnsupportedAnswerSheetError
                        ? t('tests.scan.unsupported_sheet')
                        : err instanceof Error
                          ? err.message
                          : String(err)
                );
                setPhase('error');
            }
        },
        [test, t]
    );

    const loadImage = useCallback(async (blob: Blob) => {
        cancelledRef.current = false;
        setPhase('processing');
        setErrorMsg('');
        try {
            const [url, image] = await Promise.all([fileToDataUrl(blob), imageSourceToRgbaImage(blob)]);
            if (cancelledRef.current) return;
            setRawImageUrl(url);
            setRawImage(image);
            setCorners([]);
            setPhase('corners');
        } catch (err) {
            if (cancelledRef.current) return;
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setPhase('error');
        }
    }, []);

    const startCamera = useCallback(async () => {
        const ok = await start({ facingMode: 'environment' });
        setCameraOn(ok);
        if (!ok) {
            setErrorMsg(t('scan.camera_error'));
            setPhase('error');
        }
    }, [start, t]);

    const takePhoto = useCallback(async () => {
        const shot = await capture('image/png');
        stop();
        setCameraOn(false);
        if (shot) await loadImage(shot.blob);
    }, [capture, stop, loadImage]);

    const onFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const { images } = await importScanFiles(files);
            if (images.length === 0) {
                setErrorMsg(t('scan.no_image'));
                setPhase('error');
                return;
            }
            await loadImage(images[0].blob);
        },
        [loadImage, t]
    );

    const handleCornerClick = useCallback(
        (e: React.MouseEvent<HTMLImageElement>) => {
            if (corners.length >= 4 || !rawImage) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const next = [
                ...corners,
                { fx: (e.clientX - rect.left) / rect.width, fy: (e.clientY - rect.top) / rect.height },
            ];
            setCorners(next);
            if (next.length === 4) void runDetection(rawImage, next);
        },
        [corners, rawImage, runDetection]
    );

    const retryCorners = useCallback(() => setCorners([]), []);

    const handleSave = useCallback(async () => {
        if (!studentId) return;
        const existing = studentTests.find((st) => st.testId === test.id && st.studentId === studentId);
        if (existing?.status === 'graded') {
            const proceed = await confirm({
                title: t('tests.scan.overwrite_graded_title'),
                message: t('tests.scan.overwrite_graded_message'),
                danger: true,
            });
            if (!proceed) return;
        }
        const answers: TestAnswer[] = test.questions.map((q) => ({
            questionId: q.id,
            response: responses[q.id] ?? '',
        }));
        const rawTotalPoints = calcStudentTestRawPoints(test, answers);
        const now = new Date().toISOString();
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
            rawTotalPoints,
            updatedAt: now,
            // The scan replaces every answer, so any prior grading (points, adjustments, per-answer
            // feedback) no longer corresponds to what's actually being saved — clear it rather than
            // silently carrying stale grading metadata forward on top of new responses.
            gradedAt: undefined,
            adjustmentPoints: undefined,
            adjustment: undefined,
        });
        setPhase('done');
    }, [studentId, test, responses, studentTests, onSave, confirm, t]);

    const close = useCallback(() => {
        cancelledRef.current = true;
        stop();
        onClose();
    }, [stop, onClose]);

    return (
        <>
            <Modal
                titleId="exam-scan-dialog-title"
                onClose={close}
                maxWidth={760}
                style={{ width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <ScanLine size={20} style={{ color: 'var(--accent)' }} />
                    <h3 id="exam-scan-dialog-title" style={{ margin: 0, flex: 1 }}>
                        {t('tests.scan.title')}
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={close} aria-label={t('common.close')}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {phase === 'setup' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="exam-scan-student">{t('tests.scan.pick_student_label')}</label>
                            <select
                                id="exam-scan-student"
                                className="input"
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                            >
                                <option value="">{t('tests.results.student_label')}</option>
                                {students.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="btn btn-primary"
                                style={{ marginTop: 12 }}
                                disabled={!studentId}
                                onClick={() => setPhase('capture')}
                            >
                                {t('tests.scan.step_capture_hint')}
                            </button>
                        </div>
                    )}

                    {phase === 'capture' && (
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
                                            maxHeight: '50vh',
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
                                        <Upload size={16} /> {t('scan.import_file')}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        hidden
                                        onChange={(e) => {
                                            const files = e.target.files;
                                            void onFilesPicked(files);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {phase === 'corners' && rawImageUrl && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                {t('tests.scan.step_corners_hint')}
                            </p>
                            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                                <img
                                    src={rawImageUrl}
                                    alt={t('scan.preview_alt')}
                                    onClick={handleCornerClick}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '60vh',
                                        display: 'block',
                                        cursor: 'crosshair',
                                    }}
                                />
                                {corners.map((c, i) => (
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
                            {corners.length > 0 && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={retryCorners}
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    <RotateCcw size={14} /> {t('tests.scan.retry_corners')}
                                </button>
                            )}
                        </div>
                    )}

                    {phase === 'processing' && (
                        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                            <p style={{ margin: 0, fontWeight: 600 }} aria-live="polite">
                                {t('tests.scan.processing')}
                            </p>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div
                            style={{
                                padding: '12px 16px',
                                background: 'rgba(239,68,68,0.08)',
                                borderRadius: 8,
                                border: '1px solid rgba(239,68,68,0.3)',
                                display: 'flex',
                                gap: 8,
                                alignItems: 'flex-start',
                            }}
                        >
                            <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.9rem' }}>{errorMsg}</p>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ marginTop: 8 }}
                                    onClick={() => {
                                        setErrorMsg('');
                                        setPhase('capture');
                                    }}
                                >
                                    <RotateCcw size={14} /> {t('scan.rescan')}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'review' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                {t('tests.scan.review_title')}
                            </p>
                            {detected.map((d) => {
                                const question = questionsById.get(d.questionId);
                                if (!question) return null;
                                const unscanned = d.source === 'unscanned';
                                return (
                                    <div
                                        key={d.questionId}
                                        className="card"
                                        style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                                        >
                                            <strong style={{ fontSize: '0.85rem' }}>#{d.number}</strong>
                                            <span
                                                style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '1px 8px',
                                                    borderRadius: 4,
                                                    color: unscanned ? 'var(--text-muted)' : 'var(--accent)',
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
                                        {unscanned ? (
                                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                                {t('tests.scan.unscanned_note')}
                                            </p>
                                        ) : (
                                            <AnswerEditor
                                                question={question}
                                                response={responses[d.questionId] ?? ''}
                                                onChange={(r) =>
                                                    setResponses((prev) => ({ ...prev, [d.questionId]: r }))
                                                }
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {phase === 'done' && (
                        <div
                            className="card"
                            style={{
                                padding: 16,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                alignItems: 'center',
                            }}
                        >
                            <Check size={32} style={{ color: 'var(--green)' }} />
                            <p style={{ margin: 0, fontWeight: 600 }}>{t('tests.scan.save_success')}</p>
                        </div>
                    )}
                </div>

                {phase === 'review' && (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button className="btn btn-ghost" onClick={close}>
                            {t('common.cancel')}
                        </button>
                        <button className="btn btn-primary" onClick={() => void handleSave()}>
                            <Check size={16} /> {t('tests.scan.save_button')}
                        </button>
                    </div>
                )}
                {phase === 'done' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button className="btn btn-primary" onClick={close}>
                            {t('common.close')}
                        </button>
                    </div>
                )}
            </Modal>
            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
