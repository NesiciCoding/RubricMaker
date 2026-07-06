import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { Upload, CheckCircle, X, AlertTriangle, Table } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Modal from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { matchCsvRows, summarizeImport, type ImportSummary, type MatchedImportRow } from '../../utils/csvImportMatch';

interface Props {
    file: File;
    onClose: () => void;
    onSuccess: () => void;
}

type ColumnMap = {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    className: string;
};

type DetectedFormat = 'generic' | 'clever' | 'oneroster' | null;

export default function CsvImportModal({ file, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const { addStudent, addClass, updateStudent, deleteStudent, classes, students, settings } = useApp();
    const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
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
        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data;
                if (data.length === 0) {
                    setError('The CSV file is empty.');
                    return;
                }
                const detectedHeaders = Object.keys(data[0] || {}).map((k) => k.trim());
                if (detectedHeaders.length === 0) {
                    setError('Could not detect any columns in the CSV file.');
                    return;
                }

                setParsedData(data);
                setHeaders(detectedHeaders);

                // Auto-map common headers
                const autoMap: ColumnMap = { fullName: '', firstName: '', lastName: '', email: '', className: '' };
                const lowerHeaders = detectedHeaders.map((h) => h.toLowerCase());

                const findIndex = (...keywords: string[]) =>
                    lowerHeaders.findIndex((h) => keywords.some((k) => h.includes(k)));

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
                    autoMap.email = detectedHeaders.find((h) => h === 'Email') || '';
                    autoMap.firstName = detectedHeaders.find((h) => h === 'First_Name') || '';
                    autoMap.lastName = detectedHeaders.find((h) => h === 'Last_Name') || '';
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
                    autoMap.email = detectedHeaders.find((h) => h === 'email') || '';
                    autoMap.firstName = detectedHeaders.find((h) => h === 'givenName') || '';
                    autoMap.lastName = detectedHeaders.find((h) => h === 'familyName') || '';
                    const classIdx = detectedHeaders.findIndex((h) => h === 'className' || h === 'classSourcedId');
                    if (classIdx !== -1) {
                        autoMap.className = detectedHeaders[classIdx];
                    }
                    setDetectedFormat('oneroster');
                    setMapping(autoMap);
                    return;
                }

                // Generic format detection
                const fnIdx = findIndex('full name', 'fullname', 'name');
                // Dutch (Magister): voornaam / roepnaam = first name, achternaam = last name, klas = class
                const firstIdx = findIndex('first name', 'firstname', 'first', 'voornaam', 'roepnaam');
                const lastIdx = findIndex('last name', 'lastname', 'last', 'achternaam');
                const emailIdx = findIndex('email', 'e-mail');
                const classIdx = findIndex('class', 'course', 'group', 'klas');

                if (fnIdx !== -1) autoMap.fullName = detectedHeaders[fnIdx];
                if (firstIdx !== -1) autoMap.firstName = detectedHeaders[firstIdx];
                if (lastIdx !== -1) autoMap.lastName = detectedHeaders[lastIdx];
                if (emailIdx !== -1) autoMap.email = detectedHeaders[emailIdx];
                if (classIdx !== -1) autoMap.className = detectedHeaders[classIdx];

                setDetectedFormat('generic');
                setMapping(autoMap);
            },
            error: (err) => {
                setError(`Failed to parse CSV: ${err.message}`);
            },
        });
    }, [file]);

    const getPreviewRows = () => {
        return parsedData.slice(0, 3).map((row) => {
            let name: string;
            if (mapping.fullName && row[mapping.fullName]) {
                name = row[mapping.fullName];
            } else {
                const f = mapping.firstName && row[mapping.firstName] ? row[mapping.firstName] : '';
                const l = mapping.lastName && row[mapping.lastName] ? row[mapping.lastName] : '';
                name = [f, l].filter(Boolean).join(' ');
            }
            return {
                name: name.trim(),
                email: mapping.email && row[mapping.email] ? row[mapping.email].trim() : '',
                className:
                    mapping.className && row[mapping.className]
                        ? row[mapping.className].trim()
                        : 'Active Class (Default)',
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

    const startImport = () => {
        const defaultClassId = classes.find((c) => c.id === settings.activeClassId)?.id ?? classes[0]?.id ?? '';
        const rows = matchCsvRows(parsedData, mapping, classes, students, defaultClassId);
        if (syncMode) {
            setPendingImport({ rows, preview: summarizeImport(rows, students, syncMode) });
        } else {
            runImport(rows);
        }
    };

    const hasNameMapping = mapping.fullName || (mapping.firstName && mapping.lastName);
    const previewRows = getPreviewRows();

    return (
        <Modal titleId="csv-import-title" onClose={onClose} maxWidth={640}>
            <div className="modal-header">
                <h3 id="csv-import-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={18} aria-hidden="true" /> Map CSV Columns
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
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
                        Parsing file...
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
                                Match your CSV columns to the student fields. You must map <strong>Full Name</strong> OR
                                both <strong>First Name</strong> and <strong>Last Name</strong>.
                            </div>
                            <div className="grid-2" style={{ gap: 14 }}>
                                <div className="form-group">
                                    <label>Full Name</label>
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
                                        <option value="">-- Ignore --</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Email (optional)</label>
                                    <select
                                        value={mapping.email}
                                        onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                                    >
                                        <option value="">-- Ignore --</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>First Name {mapping.fullName && '(inactive)'}</label>
                                    <select
                                        value={mapping.firstName}
                                        disabled={!!mapping.fullName}
                                        onChange={(e) => setMapping({ ...mapping, firstName: e.target.value })}
                                    >
                                        <option value="">-- Ignore --</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Last Name {mapping.fullName && '(inactive)'}</label>
                                    <select
                                        value={mapping.lastName}
                                        disabled={!!mapping.fullName}
                                        onChange={(e) => setMapping({ ...mapping, lastName: e.target.value })}
                                    >
                                        <option value="">-- Ignore --</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Class Name (optional)</label>
                                    <select
                                        value={mapping.className}
                                        onChange={(e) => setMapping({ ...mapping, className: e.target.value })}
                                    >
                                        <option value="">-- Import to currently selected class --</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                        If mapped, students will be sorted into these classes. New classes will be
                                        created automatically.
                                    </div>
                                </div>
                            </div>
                        </div>

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
                                    <Table size={14} /> Data Preview (First 3 rows)
                                </h4>
                                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Class</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.map((row, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>
                                                    {row.name || <span className="text-muted">Empty</span>}
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
                    </div>
                </div>
            ) : null}

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
                            <button className="btn btn-primary" disabled={!hasNameMapping} onClick={startImport}>
                                <CheckCircle size={15} /> {t('csv.import_btn', { count: parsedData.length })}
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
                    if (pendingImport) runImport(pendingImport.rows);
                    setPendingImport(null);
                }}
                onCancel={() => setPendingImport(null)}
            />
        </Modal>
    );
}
