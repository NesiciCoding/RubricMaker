import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, AlertTriangle, CheckCircle, X, Loader } from 'lucide-react';
import { parseTemplateHeaders } from '../../utils/docxTemplateExport';
import { parseStyleTemplate } from '../../utils/docxStyleTemplate';
import type { ExportTemplate } from '../../types';
import Modal from '../ui/Modal';

interface Props {
    onClose: () => void;
    onSave: (template: Omit<ExportTemplate, 'id' | 'addedAt'>) => void;
}

type ParsedTemplate =
    | {
          kind: 'table';
          levelHeaders: string[];
          headerColor: string;
          dataUrl: string;
          size: number;
          fileName: string;
      }
    | {
          kind: 'style';
          headingFont?: string;
          headingSize?: number;
          headingColor?: string;
          bodyFont?: string;
          dataUrl: string;
          size: number;
          fileName: string;
      };

export default function TemplateUploadModal({ onClose, onSave }: Props) {
    const { t } = useTranslation();
    const [kind, setKind] = useState<'table' | 'style'>('table');
    const [name, setName] = useState('');
    const [dragging, setDragging] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(
        async (file: File) => {
            if (!file.name.endsWith('.docx')) {
                setError('Please upload a .docx (Word) file.');
                return;
            }
            setError(null);
            setParsing(true);

            try {
                // Read as base64 for storage
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                if (kind === 'table') {
                    const { levelHeaders, headerColor } = await parseTemplateHeaders(file);
                    setParsed({
                        kind: 'table',
                        levelHeaders,
                        headerColor,
                        dataUrl,
                        size: file.size,
                        fileName: file.name,
                    });
                } else {
                    const style = await parseStyleTemplate(file);
                    setParsed({ kind: 'style', ...style, dataUrl, size: file.size, fileName: file.name });
                }
                if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(`Failed to parse template: ${message}`);
            } finally {
                setParsing(false);
            }
        },
        [name, kind]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const handleSave = () => {
        if (!parsed) return;
        const baseName = name || parsed.fileName.replace(/\.[^.]+$/, '');
        if (parsed.kind === 'table') {
            onSave({
                name: baseName,
                kind: 'table',
                dataUrl: parsed.dataUrl,
                levelHeaders: parsed.levelHeaders,
                headerColor: parsed.headerColor,
                size: parsed.size,
            });
        } else {
            onSave({
                name: baseName,
                kind: 'style',
                dataUrl: parsed.dataUrl,
                levelHeaders: [],
                headingFont: parsed.headingFont,
                headingSize: parsed.headingSize,
                headingColor: parsed.headingColor,
                bodyFont: parsed.bodyFont,
                size: parsed.size,
            });
        }
    };

    return (
        <Modal titleId="template-upload-title" onClose={onClose} maxWidth={560}>
            <div className="modal-header">
                <h3 id="template-upload-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={18} aria-hidden="true" /> Upload Export Template
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>
            </div>
            <div className="modal-body">
                {!parsed && !parsing && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button
                            className={`btn btn-sm ${kind === 'table' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setKind('table')}
                        >
                            {t('settings.template_kind_table')}
                        </button>
                        <button
                            className={`btn btn-sm ${kind === 'style' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setKind('style')}
                        >
                            {t('settings.template_kind_style')}
                        </button>
                    </div>
                )}

                <div
                    style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 10,
                        padding: '12px 16px',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        marginBottom: 16,
                    }}
                >
                    {kind === 'table' ? (
                        <>
                            Upload a blank <strong>.docx</strong> rubric — the app will read its{' '}
                            <strong>column headers</strong> (level names) and <strong>header colour</strong>, then use
                            those when exporting rubrics to Word.
                        </>
                    ) : (
                        t('settings.template_intro_style')
                    )}
                </div>

                {/* Drop zone */}
                {!parsed && !parsing && (
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
                            padding: '32px 20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: dragging ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                            transition: 'all 0.2s',
                            marginBottom: 16,
                        }}
                    >
                        <Upload size={32} style={{ color: 'var(--text-dim)', marginBottom: 8 }} />
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            Drop .docx template here or click to browse
                        </div>
                        <div className="text-muted text-sm">Only .docx files are supported</div>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".docx"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                                e.target.value = '';
                            }}
                        />
                    </div>
                )}

                {parsing && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            padding: '28px 0',
                        }}
                    >
                        <Loader size={24} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                        <span>
                            {kind === 'table'
                                ? 'Extracting template headers…'
                                : t('settings.template_extracting_style')}
                        </span>
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            color: 'var(--red)',
                            background: 'color-mix(in srgb, var(--red, #ef4444) 12%, transparent)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            marginBottom: 12,
                            fontSize: '0.875rem',
                        }}
                    >
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        {error}
                    </div>
                )}

                {parsed && !parsing && parsed.kind === 'style' && (
                    <>
                        <div
                            style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                background: 'color-mix(in srgb, var(--green, #22c55e) 12%, transparent)',
                                border: '1px solid var(--green, #22c55e)',
                                borderRadius: 8,
                                padding: '10px 14px',
                                marginBottom: 16,
                            }}
                        >
                            <CheckCircle size={15} style={{ color: 'var(--green, #22c55e)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.875rem' }}>
                                <strong>{t('settings.template_style_parsed')}</strong>
                                {' — '}
                                {parsed.headingFont || parsed.bodyFont
                                    ? t('settings.template_style_summary', {
                                          heading: parsed.headingFont ?? t('settings.template_default_font'),
                                          body: parsed.bodyFont ?? t('settings.template_default_font'),
                                      })
                                    : t('settings.template_style_none_detected')}
                            </span>
                        </div>

                        <div className="form-group" style={{ marginBottom: 8 }}>
                            <label>Template Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. School Report Style"
                            />
                        </div>

                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 4 }}
                            onClick={() => {
                                setParsed(null);
                                setName('');
                            }}
                        >
                            ← Use a different file
                        </button>
                    </>
                )}

                {parsed && !parsing && parsed.kind === 'table' && (
                    <>
                        <div
                            style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                background: 'color-mix(in srgb, var(--green, #22c55e) 12%, transparent)',
                                border: '1px solid var(--green, #22c55e)',
                                borderRadius: 8,
                                padding: '10px 14px',
                                marginBottom: 16,
                            }}
                        >
                            <CheckCircle size={15} style={{ color: 'var(--green, #22c55e)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.875rem' }}>
                                <strong>Template parsed</strong> — {parsed.levelHeaders.length} level
                                {parsed.levelHeaders.length !== 1 ? 's' : ''} detected.
                            </span>
                        </div>

                        {parsed.levelHeaders.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                        fontWeight: 600,
                                    }}
                                >
                                    Detected level headers:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {parsed.levelHeaders.map((h, i) => (
                                        <span
                                            key={i}
                                            style={{
                                                background: parsed.headerColor,
                                                color: '#fff',
                                                borderRadius: 6,
                                                padding: '3px 10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {h}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {parsed.levelHeaders.length === 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    color: 'var(--amber, #f59e0b)',
                                    background: 'color-mix(in srgb, var(--amber, #f59e0b) 12%, transparent)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    marginBottom: 14,
                                    fontSize: '0.82rem',
                                }}
                            >
                                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                No level headers detected. The template will still be saved, but level labels from the
                                rubric will be used when exporting.
                            </div>
                        )}

                        <div className="form-group" style={{ marginBottom: 8 }}>
                            <label>Template Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. School Rubric Template"
                            />
                        </div>

                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 4 }}
                            onClick={() => {
                                setParsed(null);
                                setName('');
                            }}
                        >
                            ← Use a different file
                        </button>
                    </>
                )}
            </div>
            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    Cancel
                </button>
                {parsed && (
                    <button className="btn btn-primary" onClick={handleSave}>
                        <CheckCircle size={14} /> Save Template
                    </button>
                )}
            </div>
        </Modal>
    );
}
