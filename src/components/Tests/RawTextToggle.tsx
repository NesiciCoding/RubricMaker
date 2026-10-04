import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
    visual: React.ReactNode;
    raw: React.ReactNode;
}

/** Visual editor by default; the raw-syntax editor is one click away for pasting and bulk typing. */
export default function RawTextToggle({ visual, raw }: Props) {
    const { t } = useTranslation();
    const [showRaw, setShowRaw] = useState(false);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRaw((v) => !v)}>
                    {showRaw ? t('tests.edit_visually') : t('tests.edit_as_text')}
                </button>
            </div>
            {showRaw ? raw : visual}
        </div>
    );
}
