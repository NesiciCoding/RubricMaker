import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { Upload, CheckCircle, X, AlertTriangle, Table } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Modal from '../ui/Modal';

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

export default function CsvImportModal({ file, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const { addStudent, addClass, updateStudent, deleteStudent, classes, students } = useApp();
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<ColumnMap>({
        fullName: '',
        firstName: '',
        lastName: '',
        email: '',
        className: '',
    });
    const [syncMode, setSyncMode] = useState(false);
    const [summary, setSummary] = useState<{
        created: number;
        updated: number;
        transferred: number;
        removed: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as any[];
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

    const handleImport = () => {
        const classMap = new Map<string, string>(); // name (lowercase) -> id
        classes.forEach((c) => classMap.set(c.name.toLowerCase().trim(), c.id));
        const defaultClassId = classes[0]?.id || '';

        let created = 0;
        let updated = 0;
        let transferred = 0;
        const matchedIds = new Set<string>();
        const processedIds = new Set<string>(); // guard against duplicate CSV rows
        const csvClassIds = new Set<string>();

        parsedData.forEach((row) => {
            let name: string;
            if (mapping.fullName && row[mapping.fullName]) {
                name = String(row[mapping.fullName]).trim();
            } else {
                const f = mapping.firstName && row[mapping.firstName] ? String(row[mapping.firstName]).trim() : '';
                const l = mapping.lastName && row[mapping.lastName] ? String(row[mapping.lastName]).trim() : '';
                name = [f, l].filter(Boolean).join(' ');
            }
            if (!name) return;

            const email = mapping.email && row[mapping.email] ? String(row[mapping.email]).trim() : '';
            const classNameToMap =
                mapping.className && row[mapping.className] ? String(row[mapping.className]).trim() : '';

            let targetClassId: string = defaultClassId;
            if (classNameToMap) {
                const lowerName = classNameToMap.toLowerCase();
                if (classMap.has(lowerName)) {
                    targetClassId = classMap.get(lowerName) || '';
                } else {
                    const newClass = addClass({ name: classNameToMap });
                    classMap.set(lowerName, newClass.id);
                    targetClassId = newClass.id;
                }
            }
            if (!targetClassId) return;
            csvClassIds.add(targetClassId);

            // Upsert: match by name+class first, then by email across all classes (enables class transfer)
            const nameLower = name.toLowerCase();
            const existing =
                students.find(
                    (s) =>
                        !processedIds.has(s.id) &&
                        s.classId === targetClassId &&
                        s.name.toLowerCase().trim() === nameLower
                ) ??
                (email
                    ? students.find(
                          (s) => !processedIds.has(s.id) && s.email?.toLowerCase().trim() === email.toLowerCase()
                      )
                    : undefined);

            if (existing) {
                const isTransfer = existing.classId !== targetClassId;
                updateStudent({
                    ...existing,
                    name,
                    email: email || existing.email,
                    classId: targetClassId,
                    updatedAt: new Date().toISOString(),
                });
                processedIds.add(existing.id);
                matchedIds.add(existing.id);
                if (isTransfer) transferred++;
                else updated++;
                return;
            }

            addStudent({ name, email, classId: targetClassId });
            created++;
        });

        let removed = 0;
        if (syncMode) {
            students
                .filter((s) => csvClassIds.has(s.classId) && !matchedIds.has(s.id))
                .forEach((s) => {
                    deleteStudent(s.id);
                    removed++;
                });
        }

        setSummary({ created, updated, transferred, removed });
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
                            <button className="btn btn-primary" disabled={!hasNameMapping} onClick={handleImport}>
                                <CheckCircle size={15} /> {t('csv.import_btn', { count: parsedData.length })}
                            </button>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
