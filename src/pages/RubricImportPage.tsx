import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
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

/**
 * Adopts a shared rubric into the signed-in workspace and opens it in the builder. It lives
 * inside the app shell rather than on the public /preview page because adding a rubric needs
 * the store, and that page deliberately runs without AppProvider.
 */
export default function RubricImportPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { gradeScales, addRubric } = useAuthoring();
    const { settings } = useSettings();
    const [failed, setFailed] = useState(false);
    const consumed = useRef(false);

    useEffect(() => {
        if (consumed.current) return;
        consumed.current = true;

        let parsed: ParsedRubric;
        try {
            parsed = decodeRubricShareCode(code ?? '');
        } catch {
            setFailed(true);
            return;
        }

        const created = addRubric(
            rubricInputFromParsed(parsed, {
                gradeScaleIds: gradeScales.map((scale) => scale.id),
                defaultGradeScaleId: settings.defaultGradeScaleId,
                fallbackName: t('rubricList.imported_rubric_name'),
            })
        );
        navigate(`/rubrics/${created.id}`, { replace: true });
    }, [addRubric, code, gradeScales, navigate, settings.defaultGradeScaleId, t]);

    if (failed) {
        return (
            <main style={shellStyle}>
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
            </main>
        );
    }

    return (
        <main style={shellStyle} aria-busy="true">
            <p className="text-muted" role="status">
                {t('importRubric.importing')}
            </p>
        </main>
    );
}
