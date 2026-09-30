import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import Modal from '../ui/Modal';
import { WORDNET_PACK_APPROX_MB, downloadWordnetPack } from '../../services/wordnetPack';

interface Props {
    onClose: () => void;
    onInstalled: () => void;
}

export default function WordnetDownloadModal({ onClose, onInstalled }: Props) {
    const { t } = useTranslation();
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [failed, setFailed] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    async function handleDownload() {
        const controller = new AbortController();
        abortRef.current = controller;
        setFailed(false);
        setDownloading(true);
        try {
            await downloadWordnetPack(setProgress, controller.signal);
            onInstalled();
        } catch {
            if (!controller.signal.aborted) setFailed(true);
            setDownloading(false);
        }
    }

    return (
        <Modal titleId="wordnet-download-title" onClose={onClose} maxWidth={480}>
            <div style={{ padding: 20 }}>
                <h3 id="wordnet-download-title" style={{ marginTop: 0 }}>
                    {t('vocabProfile.wordnet_title')}
                </h3>
                <p className="text-sm">{t('vocabProfile.wordnet_body', { size: WORDNET_PACK_APPROX_MB })}</p>
                <p className="text-xs text-muted">{t('vocabProfile.wordnet_license')}</p>

                {downloading && (
                    <div
                        role="progressbar"
                        aria-label={t('vocabProfile.wordnet_progress')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress * 100)}
                        style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', margin: '12px 0' }}
                    >
                        <div
                            style={{
                                width: `${Math.round(progress * 100)}%`,
                                height: '100%',
                                borderRadius: 4,
                                background: 'var(--accent)',
                            }}
                        />
                    </div>
                )}
                {failed && (
                    <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>
                        {t('vocabProfile.wordnet_failed')}
                    </p>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>
                        {t('vocabProfile.wordnet_cancel')}
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={downloading}
                        onClick={() => void handleDownload()}
                    >
                        <Download size={14} />{' '}
                        {failed ? t('vocabProfile.wordnet_retry') : t('vocabProfile.wordnet_download')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
