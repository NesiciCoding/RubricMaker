import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { diffRubricVersions, type FieldChange } from '../../utils/rubricVersionDiff';
import type { Rubric } from '../../types';

interface Props {
    from: Omit<Rubric, 'versions'>;
    to: Omit<Rubric, 'versions'>;
    onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
    added: 'var(--success, #2e7d32)',
    removed: 'var(--danger, #c62828)',
    changed: 'var(--accent)',
};

function FieldChangeLine({ change }: { change: FieldChange }) {
    const { t } = useTranslation();
    if (change.field === 'description') {
        return <div style={{ fontSize: '0.8rem', marginTop: 4 }}>{t('rubricBuilder.diff_description_changed')}</div>;
    }
    return (
        <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {t(`rubricBuilder.diff_field_${change.field}`)}: {change.from} → {change.to}
        </div>
    );
}

export default function RubricVersionDiffModal({ from, to, onClose }: Props) {
    const { t } = useTranslation();
    const diffs = diffRubricVersions(from, to);

    return (
        <Modal titleId="version-diff-title" onClose={onClose} maxWidth={560}>
            <div className="modal-header">
                <h3 id="version-diff-title">{t('rubricBuilder.version_diff')}</h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={t('common.close')}
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <div className="modal-body">
                {diffs.length === 0 ? (
                    <p className="text-muted text-sm">{t('rubricBuilder.no_diff_changes')}</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {diffs.map((d) => (
                            <div
                                key={d.id}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    border: `1px solid ${STATUS_COLOR[d.status]}`,
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '0.87rem', color: STATUS_COLOR[d.status] }}>
                                    {t(`rubricBuilder.diff_${d.status}`)}: {d.title}
                                </div>
                                {d.fieldChanges.map((fc, i) => (
                                    <FieldChangeLine key={i} change={fc} />
                                ))}
                                {d.levelDiffs.map((ld) => (
                                    <div key={ld.id} style={{ fontSize: '0.8rem', marginTop: 4, paddingLeft: 10 }}>
                                        <span style={{ color: STATUS_COLOR[ld.status] }}>
                                            {t(`rubricBuilder.diff_${ld.status}`)}
                                        </span>{' '}
                                        {ld.label}
                                        {ld.fieldChanges.map((fc, i) => (
                                            <div key={i} style={{ paddingLeft: 10, color: 'var(--text-muted)' }}>
                                                <FieldChangeLine change={fc} />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
