import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { Upload, CheckCircle, X, AlertTriangle, Table } from 'lucide-react';
import { useClasses, useSettings, useStudents } from '../../context/AppContext';
import Modal from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
    autoMapCsvHeaders,
    extractCsvName,
    planCsvImport,
    summarizeImport,
    type SkippedCsvRow,
    type CsvColumnMap,
    type ImportSummary,
    type MatchedImportRow,
} from '../../utils/csvImportMatch';

interface Props {
    file: File;
    onClose: () => void;
    onSuccess: () => void;
}

type ColumnMap = CsvColumnMap;

type DetectedFormat = 'generic' | 'clever' | 'oneroster' | null;

function isValidUtf8(bytes: ArrayBuffer): boolean {
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

function hasReplacementChars(data: Record<string, string>[]): boolean {
    return data.some((row) =>
        Object.entries(row).some(([k, v]) => k.includes('\uFFFD') || (typeof v === 'string' && v.includes('\uFFFD')))
    );
}

export default function CsvImportModal({ file, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const { addStudent, updateStudent, deleteStudent, students } = useStudents();
    const { addClass, classes } = useClasses();

    const { settings } = useSettings();

    const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
    const [skippedAtImport, setSkippedAtImport] = useState<SkippedCsvRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [detectedFormat, setDetectedFormat] = useState<DetectedFormat>(null);
    const [mapping, setMapping] = useState<ColumnMap>({
        fullName: '',
        firstName: '',
        lastName: '',
        email: '',
        className: '',
    });
    const [syncMode, setSyncMode] = useState(false);
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingImport, setPendingImport] = useState<{ rows: MatchedImportRow[]; preview: ImportSummary } | null>(
        null
    );

    useEffect(() => {
        let cancelled = false;
        const parse = (encoding?: string) =>
            Papa.parse<Record<string, string>>(file, {
                header: true,
                // 'greedy' also drops delimiter-only rows (`;;;`) that Excel leaves below the data.
                skipEmptyLines: 'greedy',
                transformHeader: (h) => h.trim(),
                encoding,
                complete: (results) => {
                    const data = results.data;
                    if (encoding || !hasReplacementChars(data)) {
                        if (!cancelled) applyParsed(data);
                        return;
                    }
                    // Excel's "CSV (;)" export on Windows is cp1252, which decodes to U+FFFD as UTF-8 —
                    // but a UTF-8 file can also hold a literal U+FFFD, so only invalid bytes mean cp1252.
                    file.arrayBuffer().then(
                        (bytes) => {
                            if (cancelled) return;
                            if (isValidUtf8(bytes)) applyParsed(data);
                            else parse('windows-1252');
                        },
                        () => {
                            if (!cancelled) parse('windows-1252');
                        }
                    );
                },
                error: (err) => {
                    if (!cancelled) setError(t('csv.err_parse', { message: err.message }));
                },
            });

        const applyParsed = (data: Record<string, string>[]) => {
            if (data.length === 0) {
                setError(t('csv.err_empty'));
                return;
            }
            const detectedHeaders = Object.keys(/* v8 ignore next 1 */ data[0] || {}).map((k) => k.trim());
            if (detectedHeaders.length === 0) {
                setError(t('csv.err_no_columns'));
                return;
            }

            setParsedData(data);
            setHeaders(detectedHeaders);

            // Auto-map common headers
            const autoMap: ColumnMap = { fullName: '', firstName: '', lastName: '', email: '', className: '' };
            // Detect known CSV formats (Clever, OneRoster)
            const hasCleverFormat =
                detectedHeaders.some((h) => h === 'Email') &&
                detectedHeaders.some((h) => h === 'First_Name') &&
                detectedHeaders.some((h) => h === 'Last_Name');

            const hasOneRosterFormat =
                detectedHeaders.some((h) => h === 'givenName') &&
                detectedHeaders.some((h) => h === 'familyName') &&
                detectedHeaders.some((h) => h === 'email');

            // Map Clever format
            if (hasCleverFormat) {
                /* v8 ignore start -- hasCleverFormat guarantees Email/First_Name/Last_Name are present */
                autoMap.email = detectedHeaders.find((h) => h === 'Email') || '';
                autoMap.firstName = detectedHeaders.find((h) => h === 'First_Name') || '';
                autoMap.lastName = detectedHeaders.find((h) => h === 'Last_Name') || '';
                /* v8 ignore stop */
                const schoolIdx = detectedHeaders.findIndex((h) => h === 'Last_Known_School_Name');
                if (schoolIdx !== -1) {
                    autoMap.className = detectedHeaders[schoolIdx];
                }
                setDetectedFormat('clever');
                setMapping(autoMap);
                return;
            }

            // Map OneRoster format
            if (hasOneRosterFormat) {
                /* v8 ignore start -- hasOneRosterFormat guarantees email/givenName/familyName are present */
                autoMap.email = detectedHeaders.find((h) => h === 'email') || '';
                autoMap.firstName = detectedHeaders.find((h) => h === 'givenName') || '';
                autoMap.lastName = detectedHeaders.find((h) => h === 'familyName') || '';
                /* v8 ignore stop */
                const classIdx = detectedHeaders.findIndex((h) => h === 'className' || h === 'classSourcedId');
                if (classIdx !== -1) {
                    autoMap.className = detectedHeaders[classIdx];
                }
                setDetectedFormat('oneroster');
                setMapping(autoMap);
                return;
            }

            // Generic format detection (incl. Dutch Magister headers: voornaam/roepnaam, achternaam, klas)
            setDetectedFormat('generic');
            setMapping(autoMapCsvHeaders(detectedHeaders));
        };

        parse();
        return () => {
            cancelled = true;
        };
    }, [file]);

    const getPreviewRows = () => {
        return parsedData.slice(0, 3).map((row) => {
            return {
                name: extractCsvName(row, mapping),
                email: mapping.email && row[mapping.email] ? row[mapping.email].trim() : '',
                className:
                    mapping.className && row[mapping.className]
                        ? row[mapping.className].trim()
                        : t('csv.active_class_default'),
            };
        });
    };

    const runImport = (rows: MatchedImportRow[]) => {
        const classIdForNewName = new Map<string, string>(); // lowercase new class name -> created class id
        let created = 0;
        let updated = 0;
        let transferred = 0;
        const matchedIds = new Set<string>();
        const touchedClassIds = new Set<string>();

        rows.forEach((row) => {
            let targetClassId: string;
            if (row.newClassName) {
                const key = row.newClassName.toLowerCase();
                if (!classIdForNewName.has(key)) {
                    classIdForNewName.set(key, addClass({ name: row.newClassName }).id);
                }
                targetClassId = classIdForNewName.get(key)!;
            } else {
                targetClassId = row.existingClassId!;
            }
            touchedClassIds.add(targetClassId);

            if (row.matchedStudent) {
                const prev = row.matchedStudent;
                const isTransfer = prev.classId !== targetClassId;
                updateStudent({
                    ...prev,
                    name: row.name,
                    email: row.email || prev.email,
                    classId: targetClassId,
                    pastClassMemberships: isTransfer
                        ? [
                              ...(prev.pastClassMemberships ?? []),
                              {
                                  classId: prev.classId,
                                  enrolledAt: prev.pastClassMemberships?.at(-1)?.leftAt,
                                  leftAt: new Date().toISOString(),
                              },
                          ]
                        : prev.pastClassMemberships,
                    updatedAt: new Date().toISOString(),
                });
                matchedIds.add(prev.id);
                if (isTransfer) transferred++;
                else updated++;
                return;
            }

            addStudent({ name: row.name, email: row.email, classId: targetClassId });
            created++;
        });

        let removed = 0;
        if (syncMode) {
            students
                .filter((s) => touchedClassIds.has(s.classId) && !matchedIds.has(s.id))
                .forEach((s) => {
                    deleteStudent(s.id);
                    removed++;
                });
        }

        setSummary({ created, updated, transferred, removed });
    };

    const defaultClassId = classes.find((c) => c.id === settings.activeClassId)?.id ?? classes[0]?.id ?? '';
    const plan = useMemo(
        () => planCsvImport(parsedData, mapping, classes, students, defaultClassId),
        [parsedData, mapping, classes, students, defaultClassId]
    );

    const startImport = () => {
        const { rows } = plan;
        setSkippedAtImport(plan.skipped);
        if (syncMode) {
            setPendingImport({ rows, preview: summarizeImport(rows, students, syncMode) });
        } else {
            runImport(rows);
        }
    };

    const hasNameMapping = mapping.fullName || (mapping.firstName && mapping.lastName);
    const noImportableRows = !!hasNameMapping && !parsedData.some((row) => extractCsvName(row, mapping) !== '');
    const previewRows = getPreviewRows();
    const skippedRows = summary ? skippedAtImport : hasNameMapping && !noImportableRows ? plan.skipped : [];
    const skipReason = (s: SkippedCsvRow) =>
        s.reason === 'duplicate'
            ? t('csv.skip_reason_duplicate', { row: s.duplicateOf })
            : t(`csv.skip_reason_${s.reason}`);

    return (
        <Modal titleId="csv-import-title" onClose={onClose} maxWidth={640}>
            <div className="modal-header">
                <h3 id="csv-import-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={18} aria-hidden="true" /> {t('csv.map_title')}
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
                    <X size={16} />
                </button>
            </div>

            <div className="modal-body">
                {error ? (
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
                ) : headers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                        {t('csv.parsing')}
                    </div>
                ) : (
                    <>
                        {detectedFormat && detectedFormat !== 'generic' && (
                            <div
                                style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--accent)',
                                    marginBottom: 12,
                                    padding: '8px 12px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                }}
                            >
                                {t(`csv.detected_format_${detectedFormat}`)}
                            </div>
                        )}
                        <div
                            style={{
                                background: 'var(--bg-elevated)',
                                borderRadius: 10,
                                padding: 16,
                                marginBottom: 20,
                                border: '1px solid var(--border)',
                            }}
                        >
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                {t('csv.map_intro')}
                            </div>
                            <div className="grid-2" style={{ gap: 14 }}>
                                <div className="form-group">
                                    <label>{t('csv.full_name')}</label>
                                    <select
                                        value={mapping.fullName}
                                        onChange={(e) =>
                                            setMapping({
                                                ...mapping,
                                                fullName: e.target.value,
                                                firstName: '',
                                                lastName: '',
                                            })
                                        }
                                    >
                                        <option value="">{t('csv.opt_ignore')}</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{t('csv.email_optional')}</label>
                                    <select
                                        value={mapping.email}
                                        onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                                    >
                                        <option value="">{t('csv.opt_ignore')}</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>
                                        {t('csv.first_name')} {mapping.fullName && t('csv.inactive')}
                                    </label>
                                    <select
                                        value={mapping.firstName}
                                        disabled={!!mapping.fullName}
                                        onChange={(e) => setMapping({ ...mapping, firstName: e.target.value })}
                                    >
                                        <option value="">{t('csv.opt_ignore')}</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>
                                        {t('csv.last_name')} {mapping.fullName && t('csv.inactive')}
                                    </label>
                                    <select
                                        value={mapping.lastName}
                                        disabled={!!mapping.fullName}
                                        onChange={(e) => setMapping({ ...mapping, lastName: e.target.value })}
                                    >
                                        <option value="">{t('csv.opt_ignore')}</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>{t('csv.class_name_optional')}</label>
                                    <select
                                        value={mapping.className}
                                        onChange={(e) => setMapping({ ...mapping, className: e.target.value })}
                                    >
                                        <option value="">{t('csv.opt_import_selected')}</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                        {t('csv.class_hint')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {noImportableRows && (
                            <div
                                role="alert"
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    color: 'var(--red, #ef4444)',
                                    background: 'var(--red-soft, #fee2e2)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    fontSize: '0.875rem',
                                    marginBottom: 16,
                                }}
                            >
                                <AlertTriangle size={15} aria-hidden="true" />
                                {t('csv.err_no_importable_rows')}
                            </div>
                        )}
                        {hasNameMapping && (
                            <div>
                                <h4
                                    style={{
                                        fontSize: '0.85rem',
                                        marginBottom: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    <Table size={14} /> {t('csv.preview_title')}
                                </h4>
                                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr>
                                            <th>{t('csv.col_name')}</th>
                                            <th>{t('csv.col_email')}</th>
                                            <th>{t('csv.col_class')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.map((row, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>
                                                    {row.name || <span className="text-muted">{t('csv.empty')}</span>}
                                                </td>
                                                <td>{row.email || '—'}</td>
                                                <td>{row.className}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {summary ? (
                <div className="modal-body">
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {summary.created > 0 && (
                            <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                                <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {summary.created} {t('csv.summary_created')}
                            </span>
                        )}
                        {summary.updated > 0 && (
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                {summary.updated} {t('csv.summary_updated')}
                            </span>
                        )}
                        {summary.transferred > 0 && (
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                {summary.transferred} {t('csv.summary_transferred')}
                            </span>
                        )}
                        {summary.removed > 0 && (
                            <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>
                                {summary.removed} {t('csv.summary_removed')}
                            </span>
                        )}
                        {skippedAtImport.length > 0 && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                {skippedAtImport.length} {t('csv.summary_skipped')}
                            </span>
                        )}
                    </div>
                </div>
            ) : null}

            {skippedRows.length > 0 && (
                <div className="modal-body" style={{ paddingTop: 0 }}>
                    <div
                        role="status"
                        style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            fontSize: '0.82rem',
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                            {t('csv.skipped_title', { count: skippedRows.length })}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 140, overflowY: 'auto' }}>
                            {skippedRows.map((s) => (
                                <li key={s.row}>
                                    {t('csv.skipped_row', {
                                        row: s.row,
                                        label: s.name || s.email || t('csv.empty'),
                                        reason: skipReason(s),
                                    })}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            <div className="modal-footer">
                {summary ? (
                    <button className="btn btn-primary" onClick={onSuccess}>
                        {t('csv.done')}
                    </button>
                ) : (
                    <>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)',
                                marginRight: 'auto',
                            }}
                        >
                            <input type="checkbox" checked={syncMode} onChange={(e) => setSyncMode(e.target.checked)} />
                            {t('csv.sync_label')}
                        </label>
                        <button className="btn btn-secondary" onClick={onClose}>
                            {t('csv.cancel')}
                        </button>
                        {!error && headers.length > 0 && (
                            <button
                                className="btn btn-primary"
                                disabled={!hasNameMapping || plan.rows.length === 0}
                                onClick={startImport}
                            >
                                <CheckCircle size={15} /> {t('csv.import_btn', { count: plan.rows.length })}
                            </button>
                        )}
                    </>
                )}
            </div>

            <ConfirmDialog
                open={pendingImport !== null}
                title={t('csv.sync_confirm_title')}
                message={t('csv.sync_confirm_message', {
                    transferred: pendingImport?.preview.transferred ?? 0,
                    removed: pendingImport?.preview.removed ?? 0,
                })}
                confirmLabel={t('csv.sync_confirm_action')}
                cancelLabel={t('csv.cancel')}
                danger={(pendingImport?.preview.removed ?? 0) > 0}
                onConfirm={() => {
                    /* v8 ignore next -- confirm dialog only opens when pendingImport is set */
                    if (pendingImport) runImport(pendingImport.rows);
                    setPendingImport(null);
                }}
                onCancel={() => setPendingImport(null)}
            />
        </Modal>
    );
}
