import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2 } from 'lucide-react';
import { storageSync } from '../../services/database';
import { useDbStatus } from '../../hooks/useDbStatus';
import { useToast } from '../../hooks/useToast';
import { authErrorKey } from '../../utils/authErrors';

const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

/** Lets a signed-in user add a password to their Supabase account, so they can sign in without an OTP email. */
export default function AccountPasswordCard() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { isConnected } = useDbStatus();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (!isConnected || storageSync.adapter.isAnonymousSession()) return null;

    async function handleSave() {
        if (password.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
            setError(t('settings.account_password_too_short', { count: MIN_ACCOUNT_PASSWORD_LENGTH }));
            return;
        }
        if (password !== confirm) {
            setError(t('settings.account_password_mismatch'));
            return;
        }
        setError('');
        setBusy(true);
        try {
            const result = await storageSync.adapter.updateMyPassword(password);
            if (result.error) {
                const key = authErrorKey(result.code);
                setError(key ? t(key) : result.error);
            } else {
                setPassword('');
                setConfirm('');
                showToast(t('settings.account_password_saved'), 'success');
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <KeyRound size={20} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
                <h2 className="card-heading" style={{ margin: 0 }}>
                    {t('settings.account_password_heading')}
                </h2>
            </div>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                {t('settings.account_password_description')}
            </p>
            <div className="grid-2" style={{ gap: 16 }}>
                <div className="form-group">
                    <label htmlFor="account-new-password">{t('settings.account_password_new')}</label>
                    <input
                        id="account-new-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setError('');
                        }}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="account-confirm-password">{t('settings.account_password_confirm')}</label>
                    <input
                        id="account-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => {
                            setConfirm(e.target.value);
                            setError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                </div>
            </div>
            {error && (
                <p role="alert" style={{ margin: '0 0 12px', color: 'var(--red-text)', fontSize: '0.85rem' }}>
                    {error}
                </p>
            )}
            <button
                className="btn btn-primary btn-sm"
                disabled={busy || !password || !confirm}
                onClick={handleSave}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
                {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />}
                {t('settings.account_password_save')}
            </button>
        </div>
    );
}
