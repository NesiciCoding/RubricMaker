import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, AlertTriangle, CheckCircle, X, Loader, ChevronRight } from 'lucide-react';
import type { ParsedRubric } from '../../utils/rubricImport';
import Modal from '../ui/Modal';
import { parseDocxToRubric, parsePdfToRubric, parseJsonToRubric } from '../../utils/rubricImport';
import type { RubricCriterion, RubricLevel } from '../../types';

interface Props {
    onClose: () => void;
    onImport: (rubric: ParsedRubric & { name: string; subject: string }) => void;
}

type Stage = 'upload' | 'parsing' | 'preview';

export default function ImportRubricModal({ onClose, onImport }: Props) {
    const { t } = useTranslation();
    const [stage, setStage] = useState<Stage>('upload');
    const [parsed, setParsed] = useState<ParsedRubric | null>(null);
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'docx' && ext !== 'pdf' && ext !== 'json') {
            setError(t('importRubric.err_filetype'));
            return;
        }
        setError(null);
        setStage('parsing');

        try {
            let result: ParsedRubric;
            if (ext === 'docx') {
                result = await parseDocxToRubric(file);
            } else if (ext === 'pdf') {
                result = await parsePdfToRubric(file);
            } else {
                result = await parseJsonToRubric(file);
            }

            setParsed(result);
            setName(result.name || file.name.replace(/\.[^.]+$/, ''));
            setSubject(result.subject || '');
            setStage('preview');
        } catch (err) {
            const message = err instanceof Error ? err.message : t('importRubric.err_unknown');
            setError(t('importRubric.err_parse', { message }));
            setStage('upload');
        }
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    };

    const handleImport = () => {
        /* v8 ignore next -- the Create Rubric button only renders when parsed has criteria */
        if (!parsed || parsed.criteria.length === 0) return;
        onImport({ ...parsed, name: name || 'Imported Rubric', subject });
    };

    const confidenceColor: Record<ParsedRubric['confidence'], string> = {
        high: 'var(--green, #22c55e)',
        medium: 'var(--amber, #f59e0b)',
        low: 'var(--red, #ef4444)',
    };
    const confidenceIcon: Record<ParsedRubric['confidence'], React.ReactNode> = {
        high: <CheckCircle size={15} />,
        medium: <AlertTriangle size={15} />,
        low: <AlertTriangle size={15} />,
    };

    return (
        <Modal titleId="import-rubric-title" onClose={onClose} maxWidth={680} style={{ width: '95vw' }}>
            <div className="modal-header">
                <h3 id="import-rubric-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={18} aria-hidden="true" /> {t('importRubric.title')}
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
                    <X size={16} />
                </button>
            </div>

            <div className="modal-body">
                {/* Stage indicator */}
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 20,
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                    }}
                >
                    {(['upload', 'parsing', 'preview'] as Stage[]).map((s, i) => (
                        <React.Fragment key={s}>
                            <span
                                style={{
                                    color:
                                        stage === s
                                            ? 'var(--accent)'
                                            : stage === 'preview' && s !== 'preview'
                                              ? 'var(--green, #22c55e)'
                                              : undefined,
                                    fontWeight: stage === s ? 600 : 400,
                                }}
                            >
                                {t(`importRubric.stage_${s}`)}
                            </span>
                            {i < 2 && <ChevronRight size={12} />}
                        </React.Fragment>
                    ))}
                </div>

                {/* ── Stage: Upload ── */}
                {stage === 'upload' && (
                    <>
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => inputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: 12,
                                padding: '36px 20px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: dragging ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                                transition: 'all 0.2s',
                                marginBottom: 16,
                            }}
                        >
                            <FileText size={36} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('importRubric.dropzone')}</div>
                            <div className="text-muted text-sm">{t('importRubric.accepts')}</div>
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".docx,.pdf,.json"
                                style={{ display: 'none' }}
                                onChange={onInputChange}
                            />
                        </div>

                        {error && (
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    color: 'var(--red, #ef4444)',
                                    background: 'var(--red-soft, #fee2e2)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    fontSize: '0.875rem',
                                }}
                            >
                                <AlertTriangle size={15} />
                                {error}
                            </div>
                        )}

                        <div
                            style={{
                                background: 'var(--bg-elevated)',
                                borderRadius: 10,
                                padding: '12px 16px',
                                fontSize: '0.82rem',
                                color: 'var(--text-muted)',
                                marginTop: 8,
                            }}
                        >
                            <strong style={{ color: 'var(--text)' }}>{t('importRubric.tips_title')}</strong>
                            <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.8 }}>
                                <li>{t('importRubric.tip_table')}</li>
                                <li>{t('importRubric.tip_levels')}</li>
                                <li>{t('importRubric.tip_criteria')}</li>
                            </ul>
                        </div>
                    </>
                )}

                {/* ── Stage: Parsing ── */}
                {stage === 'parsing' && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '48px 0',
                            gap: 16,
                        }}
                    >
                        <Loader size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                        <div style={{ fontWeight: 500 }}>{t('importRubric.parsing')}</div>
                        <div className="text-muted text-sm">{t('importRubric.parsing_sub')}</div>
                    </div>
                )}

                {/* ── Stage: Preview ── */}
                {stage === 'preview' && parsed && (
                    <>
                        {/* Confidence banner */}
                        <div
                            style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                background: `color-mix(in srgb, ${confidenceColor[parsed.confidence]} 12%, transparent)`,
                                border: `1px solid ${confidenceColor[parsed.confidence]}`,
                                borderRadius: 8,
                                padding: '10px 14px',
                                marginBottom: 16,
                                color: confidenceColor[parsed.confidence],
                                fontSize: '0.875rem',
                            }}
                        >
                            {confidenceIcon[parsed.confidence]}
                            <span>
                                <strong>
                                    {t('importRubric.detection_quality', {
                                        confidence: t(`importRubric.confidence_${parsed.confidence}`),
                                    })}
                                </strong>
                                {' — '}
                                {t('importRubric.detection_counts', {
                                    count: parsed.criteria.length,
                                    unit: t(
                                        parsed.criteria.length === 1
                                            ? 'importRubric.criterion'
                                            : 'importRubric.criteria'
                                    ),
                                    levels: parsed.criteria[0]?.levels.length ?? 0,
                                })}
                                {parsed.confidence !== 'high' && ` ${t('importRubric.can_edit')}`}
                            </span>
                        </div>

                        {/* Warnings */}
                        {parsed.warnings.map((w: string, i: number) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'flex-start',
                                    color: 'var(--amber, #f59e0b)',
                                    background: 'var(--amber-soft, #fef3c7)',
                                    borderRadius: 8,
                                    padding: '8px 14px',
                                    marginBottom: 10,
                                    fontSize: '0.82rem',
                                }}
                            >
                                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                                {w}
                            </div>
                        ))}

                        {/* Name / subject */}
                        <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
                            <div className="form-group">
                                <label>{t('importRubric.name_label')}</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('importRubric.name_placeholder')}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('importRubric.subject_label')}</label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder={t('importRubric.subject_placeholder')}
                                />
                            </div>
                        </div>

                        {/* Table preview */}
                        {parsed.criteria.length > 0 ? (
                            <div
                                style={{
                                    overflowX: 'auto',
                                    maxHeight: 300,
                                    overflowY: 'auto',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                }}
                            >
                                <table className="rubric-grid" style={{ tableLayout: 'auto', minWidth: '100%' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-nav)' }}>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.8rem' }}>
                                                {t('importRubric.col_criterion')}
                                            </th>
                                            {parsed.criteria[0]?.levels.map((l: RubricLevel) => (
                                                <th key={l.id} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
                                                    {l.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsed.criteria.map((c: RubricCriterion) => (
                                            <tr key={c.id}>
                                                <td
                                                    style={{
                                                        fontWeight: 600,
                                                        padding: '8px 12px',
                                                        fontSize: '0.82rem',
                                                        minWidth: 140,
                                                    }}
                                                >
                                                    {c.title}
                                                </td>
                                                {c.levels.map((l: RubricLevel) => (
                                                    <td
                                                        key={l.id}
                                                        style={{
                                                            padding: '8px 12px',
                                                            fontSize: '0.78rem',
                                                            color: 'var(--text-muted)',
                                                            minWidth: 120,
                                                        }}
                                                    >
                                                        {l.description || (
                                                            <span style={{ color: 'var(--text-dim)' }}>—</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: '24px 0' }}>
                                <AlertTriangle size={28} />
                                <p>{t('importRubric.none_detected')}</p>
                                <button className="btn btn-secondary btn-sm" onClick={() => setStage('upload')}>
                                    {t('importRubric.try_another')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="modal-footer">
                {stage === 'preview' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setStage('upload')}>
                        ← {t('importRubric.try_another')}
                    </button>
                )}
                <button className="btn btn-secondary" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                {stage === 'preview' && parsed && parsed.criteria.length > 0 && (
                    <button className="btn btn-primary" onClick={handleImport}>
                        <CheckCircle size={15} /> {t('importRubric.create')}
                    </button>
                )}
            </div>
        </Modal>
    );
}
