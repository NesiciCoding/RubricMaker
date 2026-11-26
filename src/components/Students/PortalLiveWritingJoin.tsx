import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Radio } from 'lucide-react';
import { LiveWritingAdapter } from '../../services/database/LiveWritingAdapter';
import {
    isCompleteJoinCode,
    liveWritingJoinErrorKey,
    normalizeJoinCode,
    writeStoredLiveWritingJoin,
} from '../../utils/liveWriting';

/**
 * Portal entry for a live-writing session that has `portalJoin` enabled. The student is
 * already signed in, so the RPC resolves their roster row from their verified email and we
 * hand the returned token to the join page; that page then skips the name picker.
 */
export default function PortalLiveWritingJoin() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const normalized = normalizeJoinCode(code);
        if (!isCompleteJoinCode(normalized)) {
            setError('liveWriting.invalid_code');
            return;
        }
        const adapter = LiveWritingAdapter.forPortal();
        if (!adapter) {
            setError('liveWriting.join_unavailable');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const join = await adapter.joinViaPortal(normalized);
            writeStoredLiveWritingJoin(normalized, join);
            navigate(`/join/${encodeURIComponent(normalized)}`);
        } catch (err) {
            setError(liveWritingJoinErrorKey(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Radio size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('liveWriting.portal_join_title')}</h3>
            </div>
            <p className="text-muted" style={{ margin: '0 0 14px', fontSize: '0.88rem' }}>
                {t('liveWriting.portal_join_subtitle')}
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label htmlFor="portal-live-code" className="sr-only">
                    {t('liveWriting.code_label')}
                </label>
                <input
                    id="portal-live-code"
                    className="input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t('liveWriting.code_placeholder')}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={12}
                    style={{ flex: '1 1 200px', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                />
                <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
                    {busy ? t('liveWriting.portal_join_joining') : t('liveWriting.portal_join_button')}
                    {!busy && <ArrowRight size={15} aria-hidden="true" />}
                </button>
            </form>
            {error && (
                <p role="alert" style={{ margin: '10px 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>
                    {t(error)}
                </p>
            )}
        </div>
    );
}
