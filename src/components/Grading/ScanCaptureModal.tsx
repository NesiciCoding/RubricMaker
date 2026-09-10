import { useCallback, useRef, useState } from 'react';
import { X, Camera, Upload, ScanLine, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { importScanFiles } from '../../utils/scanImport';
import { fileToDataUrl } from '../../utils/fileToDataUrl';
import { recognizeImage, type OcrResult } from '../../utils/textExtraction';
import { confidenceBand, lowConfidenceWords, type ConfidenceBand } from '../../utils/ocrReview';
import type { CaptureHint } from '../../utils/ocrConfig';
import { newScanId, putScanBlob } from '../../services/scanStore';

interface Props {
    /** Tesseract language(s) for recognition, e.g. `'eng'` or `'eng+nld'`. */
    defaultLang: string;
    /** Keep the source image in local storage after OCR, instead of discarding it. */
    keepImage: boolean;
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
 * Teacher-only scan → OCR → review flow, opened from grading. The teacher captures a photo
 * of handwritten work with the camera or imports a photo/scanned PDF, the image is OCR'd
 * locally (Tesseract, no upload), and the recognised text is shown for correction before it's
 * inserted into the feedback. OCR is a first draft: low-confidence words are highlighted so
 * the teacher can fix them. The image is discarded once its text is confirmed unless the
 * teacher has opted to keep it (privacy-preserving default).
 */
export default function ScanCaptureModal({ defaultLang, keepImage, onInsert, onClose }: Props) {
    const { t } = useTranslation();
    const { videoRef, start, capture, stop } = useCameraCapture();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [phase, setPhase] = useState<Phase>('capture');
    const [captureHint, setCaptureHint] = useState<CaptureHint>('auto');
    const [cameraOn, setCameraOn] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [result, setResult] = useState<OcrResult | null>(null);
    const [editedText, setEditedText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const runOcr = useCallback(
        async (imageBlob: Blob) => {
            setPhase('processing');
            setErrorMsg('');
            try {
                const dataUrl = await fileToDataUrl(imageBlob);
                setImageUrl(dataUrl);
                setBlob(imageBlob);
                const ocr = await recognizeImage(dataUrl, { langs: defaultLang, captureHint });
                setResult(ocr);
                setEditedText(ocr.text);
                setPhase('review');
            } catch (err) {
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
            setErrorMsg(t('scan.camera_error', 'Could not access the camera. Import a photo instead.'));
            setPhase('error');
        }
    }, [start, t]);

    const takePhoto = useCallback(async () => {
        const shot = await capture('image/png');
        stop();
        setCameraOn(false);
        if (shot) await runOcr(shot.blob);
    }, [capture, stop, runOcr]);

    const onFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const { images } = await importScanFiles(files);
            const first = images[0];
            if (!first) {
                setErrorMsg(t('scan.no_image', 'That file had no scannable image.'));
                setPhase('error');
                return;
            }
            await runOcr(first.blob);
        },
        [runOcr, t]
    );

    const confirm = useCallback(async () => {
        if (keepImage && blob) {
            try {
                await putScanBlob(newScanId(), blob, blob.type || 'image/png');
            } catch {
                /* keeping the image is best-effort; never block inserting the text */
            }
        }
        onInsert(editedText);
        onClose();
    }, [keepImage, blob, editedText, onInsert, onClose]);

    const rescan = useCallback(() => {
        stop();
        setCameraOn(false);
        setImageUrl(null);
        setBlob(null);
        setResult(null);
        setEditedText('');
        setErrorMsg('');
        setPhase('capture');
    }, [stop]);

    const close = useCallback(() => {
        stop();
        onClose();
    }, [stop, onClose]);

    const lowWords = result ? lowConfidenceWords(result) : [];
    const band = result ? confidenceBand(result.confidence) : 'low';

    return (
        <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-dialog-title"
            onClick={close}
        >
            <div
                className="modal"
                style={{ maxWidth: 720, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <ScanLine size={20} style={{ color: 'var(--accent)' }} />
                    <h3 id="scan-dialog-title" style={{ margin: 0, flex: 1 }}>
                        {t('scan.title', 'Scan handwritten work')}
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={close} aria-label={t('common.close', 'Close')}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
                        {t(
                            'scan.privacy_note',
                            'Text recognition runs on this device — the image is never uploaded. Recognition is a first draft; check the highlighted words before inserting.'
                        )}
                    </p>

                    {phase === 'capture' && (
                        <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <label htmlFor="scan-hint" className="text-xs text-muted">
                                    {t('scan.hint_label', 'What are you scanning?')}
                                </label>
                                <select
                                    id="scan-hint"
                                    className="input"
                                    style={{ width: 'auto' }}
                                    value={captureHint}
                                    onChange={(e) => setCaptureHint(e.target.value as CaptureHint)}
                                >
                                    <option value="auto">{t('scan.hint_auto', 'Auto (mixed layout)')}</option>
                                    <option value="single-column">
                                        {t('scan.hint_single_column', 'A single column of text')}
                                    </option>
                                    <option value="block">{t('scan.hint_block', 'One block/paragraph')}</option>
                                    <option value="sparse">{t('scan.hint_sparse', 'Scattered notes')}</option>
                                </select>
                            </div>

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
                                        <Camera size={16} /> {t('scan.take_photo', 'Take photo')}
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <button className="btn btn-secondary" onClick={startCamera}>
                                        <Camera size={16} /> {t('scan.use_camera', 'Use camera')}
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                                        <Upload size={16} /> {t('scan.import_file', 'Import photo or PDF')}
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
                                {t('scan.recognising', 'Recognising text…')}
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
                                        alt={t('scan.preview_alt', 'Scanned work')}
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
                                            {t(`scan.confidence_${band}`, band)}
                                        </span>
                                        <span className="text-xs text-muted">
                                            {t('scan.confidence_label', 'Recognition confidence')}
                                        </span>
                                    </div>
                                    <label htmlFor="scan-text" className="text-xs text-muted">
                                        {t('scan.review_label', 'Review & correct the text')}
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
                                        {t('scan.check_words', 'Least confident words — check these:')}
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
                            <RotateCcw size={16} /> {t('scan.rescan', 'Scan again')}
                        </button>
                        {phase === 'review' && (
                            <button
                                className="btn btn-primary"
                                onClick={() => void confirm()}
                                disabled={!editedText.trim()}
                            >
                                <Check size={16} /> {t('scan.insert', 'Insert into feedback')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
