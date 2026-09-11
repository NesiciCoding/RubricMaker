import { useCallback, useRef, useState } from 'react';
import { X, Camera, Upload, ScanLine, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { importScanFiles } from '../../utils/scanImport';
import { fileToDataUrl } from '../../utils/fileToDataUrl';
import { recognizeImage, type OcrResult, type OcrWord } from '../../utils/textExtraction';
import { confidenceBand, lowConfidenceWords, type ConfidenceBand } from '../../utils/ocrReview';
import type { CaptureHint } from '../../utils/ocrConfig';

interface Props {
    /** Tesseract language(s) for recognition, e.g. `'eng'` or `'eng+nld'`. */
    defaultLang: string;
    /** Insert the confirmed, teacher-corrected text into the grade. */
    onInsert: (text: string) => void;
    onClose: () => void;
}

type Phase = 'capture' | 'processing' | 'review' | 'error';

const BAND_COLOR: Record<ConfidenceBand, string> = {
    high: 'var(--green)',
    medium: 'var(--yellow)',
    low: 'var(--red)',
};

/**
 * Teacher-only scan → OCR → review flow, opened from grading. The teacher captures a photo of
 * handwritten work with the camera or imports a photo / scanned PDF; the image is OCR'd locally
 * (Tesseract, nothing uploaded) and the recognised text is shown for correction before it's
 * inserted into the feedback. OCR is a first draft: low-confidence words are highlighted. The
 * image is used only for recognition and is not stored — cloud archival/retention is a separate,
 * not-yet-enabled step.
 */
export default function ScanCaptureModal({ defaultLang, onInsert, onClose }: Props) {
    const { t } = useTranslation();
    const { videoRef, start, capture, stop } = useCameraCapture();
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Set on close so an in-flight OCR promise doesn't setState after the modal unmounts.
    const cancelledRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('capture');
    const [captureHint, setCaptureHint] = useState<CaptureHint>('auto');
    const [cameraOn, setCameraOn] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [result, setResult] = useState<OcrResult | null>(null);
    const [editedText, setEditedText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const runOcr = useCallback(
        async (blobs: Blob[]) => {
            cancelledRef.current = false;
            setPhase('processing');
            setErrorMsg('');
            try {
                const firstUrl = await fileToDataUrl(blobs[0]);
                // OCR every page of a multi-page import and combine, so a multi-page answer
                // isn't silently reduced to its first page.
                const pages: OcrResult[] = [];
                for (const b of blobs) {
                    const dataUrl = b === blobs[0] ? firstUrl : await fileToDataUrl(b);
                    pages.push(await recognizeImage(dataUrl, { langs: defaultLang, captureHint }));
                }
                if (cancelledRef.current) return;
                const words: OcrWord[] = pages.flatMap((p) => p.words);
                const combined: OcrResult = {
                    text: pages.map((p) => p.text).join('\n\n'),
                    confidence: pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length,
                    words,
                };
                setImageUrl(firstUrl);
                setResult(combined);
                setEditedText(combined.text);
                setPhase('review');
            } catch (err) {
                if (cancelledRef.current) return;
                setErrorMsg(err instanceof Error ? err.message : String(err));
                setPhase('error');
            }
        },
        [defaultLang, captureHint]
    );

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
        if (shot) await runOcr([shot.blob]);
    }, [capture, stop, runOcr]);

    const onFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const { images } = await importScanFiles(files);
            if (images.length === 0) {
                setErrorMsg(t('scan.no_image'));
                setPhase('error');
                return;
            }
            await runOcr(images.map((img) => img.blob));
        },
        [runOcr, t]
    );

    const confirm = useCallback(() => {
        onInsert(editedText);
        onClose();
    }, [editedText, onInsert, onClose]);

    const rescan = useCallback(() => {
        stop();
        setCameraOn(false);
        setImageUrl(null);
        setResult(null);
        setEditedText('');
        setErrorMsg('');
        setPhase('capture');
    }, [stop]);

    const close = useCallback(() => {
        cancelledRef.current = true;
        stop();
        onClose();
    }, [stop, onClose]);

    const lowWords = result ? lowConfidenceWords(result) : [];
    const band = result ? confidenceBand(result.confidence) : 'low';

    return (
        <Modal
            titleId="scan-dialog-title"
            onClose={close}
            maxWidth={720}
            style={{ width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <ScanLine size={20} style={{ color: 'var(--accent)' }} />
                <h3 id="scan-dialog-title" style={{ margin: 0, flex: 1 }}>
                    {t('scan.title')}
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={close} aria-label={t('common.close')}>
                    <X size={18} />
                </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
                    {t('scan.privacy_note')}
                </p>

                {phase === 'capture' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label htmlFor="scan-hint" className="text-xs text-muted">
                                {t('scan.hint_label')}
                            </label>
                            <select
                                id="scan-hint"
                                className="input"
                                style={{ width: 'auto' }}
                                value={captureHint}
                                onChange={(e) => setCaptureHint(e.target.value as CaptureHint)}
                            >
                                <option value="auto">{t('scan.hint_auto')}</option>
                                <option value="single-column">{t('scan.hint_single_column')}</option>
                                <option value="block">{t('scan.hint_block')}</option>
                                <option value="sparse">{t('scan.hint_sparse')}</option>
                            </select>
                        </div>

                        {cameraOn ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '50vh' }}
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
                                    multiple
                                    hidden
                                    onChange={(e) => void onFilesPicked(e.target.files)}
                                />
                            </div>
                        )}
                    </>
                )}

                {phase === 'processing' && (
                    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 600 }} aria-live="polite">
                            {t('scan.recognising')}
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
                        <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.9rem' }}>{errorMsg}</p>
                    </div>
                )}

                {phase === 'review' && result && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {imageUrl && (
                                <img
                                    src={imageUrl}
                                    alt={t('scan.preview_alt')}
                                    style={{
                                        flex: '1 1 240px',
                                        maxWidth: '100%',
                                        maxHeight: '40vh',
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg)',
                                    }}
                                />
                            )}
                            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            padding: '1px 8px',
                                            borderRadius: 4,
                                            color: BAND_COLOR[band],
                                            background: 'var(--bg)',
                                            border: `1px solid ${BAND_COLOR[band]}`,
                                        }}
                                    >
                                        {t(`scan.confidence_${band}`)}
                                    </span>
                                    <span className="text-xs text-muted">{t('scan.confidence_label')}</span>
                                </div>
                                <label htmlFor="scan-text" className="text-xs text-muted">
                                    {t('scan.review_label')}
                                </label>
                                <textarea
                                    id="scan-text"
                                    className="input"
                                    style={{ minHeight: 160, resize: 'vertical', fontFamily: 'inherit' }}
                                    value={editedText}
                                    onChange={(e) => setEditedText(e.target.value)}
                                />
                            </div>
                        </div>

                        {lowWords.length > 0 && (
                            <div>
                                <p className="text-xs text-muted" style={{ margin: '0 0 6px' }}>
                                    {t('scan.check_words')}
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {lowWords.map((w) => (
                                        <span
                                            key={w.index}
                                            style={{
                                                fontSize: '0.78rem',
                                                padding: '2px 7px',
                                                borderRadius: 4,
                                                background: 'rgba(239,68,68,0.1)',
                                                border: '1px solid rgba(239,68,68,0.35)',
                                                color: 'var(--text)',
                                            }}
                                        >
                                            {w.text || '—'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {(phase === 'review' || phase === 'error') && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn btn-ghost" onClick={rescan}>
                        <RotateCcw size={16} /> {t('scan.rescan')}
                    </button>
                    {phase === 'review' && (
                        <button className="btn btn-primary" onClick={confirm} disabled={!editedText.trim()}>
                            <Check size={16} /> {t('scan.insert')}
                        </button>
                    )}
                </div>
            )}
        </Modal>
    );
}
