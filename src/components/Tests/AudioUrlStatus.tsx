import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Status = 'idle' | 'checking' | 'ok' | 'error' | 'mixed';

const PROBE_TIMEOUT_MS = 8000;
const DEBOUNCE_MS = 600;

/**
 * Pre-flight check for a teacher-entered audio URL: probes it with a real Audio element — the same
 * path the student's <audio> will take — so mixed-content blocks, CORS/hotlink refusals, and
 * share-page URLs (Drive/Dropbox/OneDrive links that serve HTML, not audio) surface in the editor
 * rather than as silent failure in front of a class.
 */
export default function AudioUrlStatus({ url }: { url: string | undefined }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<Status>('idle');

    useEffect(() => {
        const trimmed = (url ?? '').trim();
        if (!trimmed) {
            setStatus('idle');
            return;
        }

        let parsed: URL;
        try {
            parsed = new URL(trimmed);
        } catch {
            setStatus('error');
            return;
        }
        if (parsed.protocol === 'http:' && typeof window !== 'undefined' && window.location.protocol === 'https:') {
            setStatus('mixed');
            return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            setStatus('error');
            return;
        }

        setStatus('checking');
        let settled = false;
        const audio = new Audio();
        const done = (next: Status) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            audio.removeEventListener('loadedmetadata', onOk);
            audio.removeEventListener('canplay', onOk);
            audio.removeEventListener('error', onErr);
            audio.src = '';
            setStatus(next);
        };
        const onOk = () => done('ok');
        const onErr = () => done('error');
        const timer = setTimeout(() => done('error'), PROBE_TIMEOUT_MS);

        const debounce = setTimeout(() => {
            audio.addEventListener('loadedmetadata', onOk);
            audio.addEventListener('canplay', onOk);
            audio.addEventListener('error', onErr);
            audio.preload = 'metadata';
            audio.src = trimmed;
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(debounce);
            clearTimeout(timer);
            settled = true;
            audio.removeEventListener('loadedmetadata', onOk);
            audio.removeEventListener('canplay', onOk);
            audio.removeEventListener('error', onErr);
            audio.src = '';
        };
    }, [url]);

    if (status === 'idle') return null;

    const config = {
        checking: { Icon: Loader2, color: 'var(--text-muted)', text: t('tests.audio_check_checking'), spin: true },
        ok: { Icon: CheckCircle2, color: 'var(--green)', text: t('tests.audio_check_ok'), spin: false },
        error: { Icon: XCircle, color: 'var(--red)', text: t('tests.audio_check_error'), spin: false },
        mixed: { Icon: AlertTriangle, color: 'var(--yellow)', text: t('tests.audio_check_mixed'), spin: false },
    }[status];

    return (
        <div
            role="status"
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                marginTop: 4,
                fontSize: '0.8rem',
                color: config.color,
            }}
        >
            <config.Icon
                size={14}
                aria-hidden="true"
                className={config.spin ? 'spin' : undefined}
                style={{ flexShrink: 0, marginTop: 1 }}
            />
            <span>{config.text}</span>
        </div>
    );
}
