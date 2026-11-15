import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useAuthoring, useSettings } from '../context/AppContext';
import { decodeRubricShareCode, type ParsedRubric } from '../utils/rubricImport';
import { rubricInputFromParsed } from '../utils/rubricShareImport';
import EmptyState from '../components/ui/EmptyState';

const shellStyle: React.CSSProperties = {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    padding: 24,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
};

function decode(code: string): ParsedRubric | null {
    try {
        return decodeRubricShareCode(code);
    } catch {
        return null;
    }
}

/**
 * Adopts a shared rubric into the signed-in workspace and opens it in the builder. It lives
 * inside the app shell rather than on the public /preview page because adding a rubric needs
 * the store, and that page deliberately runs without AppProvider. Nothing is added until the
 * teacher confirms: the link can come from anyone, and opening it twice must not duplicate it.
 */
export default function RubricImportPage() {
    const { code = '' } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { gradeScales, addRubric } = useAuthoring();
    const { settings } = useSettings();
    const [adding, setAdding] = useState(false);
    const addedRef = useRef(false);
    const parsed = useMemo(() => decode(code), [code]);

    const handleAdd = () => {
        if (!parsed || addedRef.current) return;
        addedRef.current = true;
        setAdding(true);
        const created = addRubric(
            rubricInputFromParsed(parsed, {
                gradeScaleIds: gradeScales.map((scale) => scale.id),
                defaultGradeScaleId: settings.defaultGradeScaleId,
                fallbackName: t('rubricList.imported_rubric_name'),
            })
        );
        navigate(`/rubrics/${created.id}`, { replace: true });
    };

    if (!parsed) {
        return (
            <>
                <Topbar title={t('importRubric.page_title')} />
                <div style={shellStyle}>
                    <EmptyState
                        icon={AlertTriangle}
                        titleLevel={2}
                        title={t('importRubric.failed_title')}
                        description={t('importRubric.failed_body')}
                    >
                        <Link to="/rubrics" className="btn btn-secondary">
                            {t('importRubric.back_to_rubrics')}
                        </Link>
                    </EmptyState>
                </div>
            </>
        );
    }

    const name = parsed.name || t('rubricList.imported_rubric_name');

    return (
        <>
            <Topbar title={t('importRubric.page_title')} />
            <div style={shellStyle}>
                <section aria-labelledby="rubric-import-confirm-title" style={cardStyle}>
                    <h2 id="rubric-import-confirm-title" style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>
                        {t('importRubric.confirm_title')}
                    </h2>
                    <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {t('importRubric.confirm_body')}
                    </p>
                    <dl
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr',
                            gap: '6px 16px',
                            margin: '0 0 20px',
                            fontSize: '0.9rem',
                        }}
                    >
                        <dt style={{ color: 'var(--text-muted)' }}>{t('importRubric.confirm_name')}</dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{name}</dd>
                        {parsed.subject && (
                            <>
                                <dt style={{ color: 'var(--text-muted)' }}>{t('importRubric.confirm_subject')}</dt>
                                <dd style={{ margin: 0 }}>{parsed.subject}</dd>
                            </>
                        )}
                        <dt style={{ color: 'var(--text-muted)' }}>{t('importRubric.confirm_criteria_label')}</dt>
                        <dd style={{ margin: 0 }}>
                            {t('importRubric.confirm_criteria', { count: parsed.criteria.length })}
                        </dd>
                    </dl>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={adding}>
                            <Plus size={16} aria-hidden="true" /> {t('importRubric.confirm_add')}
                        </button>
                        <Link to="/rubrics" className="btn btn-secondary">
                            {t('common.cancel')}
                        </Link>
                        <Link
                            to={`/preview/${code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost"
                        >
                            {t('importRubric.confirm_view_preview')}
                        </Link>
                    </div>
                </section>
            </div>
        </>
    );
}
