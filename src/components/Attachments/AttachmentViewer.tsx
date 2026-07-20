import React, { useEffect, useMemo, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Download, FileText, ImageIcon, Loader } from 'lucide-react';
import { Attachment } from '../../types';
import { convertDocxToHtml } from '../../utils/textExtraction';
import EssayEditor from '../Editor/EssayEditor';
import CommentableDocumentView from '../Editor/CommentableDocumentView';

interface Props {
    attachment: Attachment;
    /** Enables inline anchored comments (26.3) on the formatted essay/docx view — grading views only. */
    commentable?: boolean;
}

const noop = () => {};

export default function AttachmentViewer({ attachment, commentable = false }: Props) {
    const { t } = useTranslation();
    const docxRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [docxHtml, setDocxHtml] = useState<string | null>(null);
    const [docxHtmlFailed, setDocxHtmlFailed] = useState(false);
    const [viewMode, setViewMode] = useState<'formatted' | 'original'>('formatted');
    const originalRendered = useRef(false);

    const isImage = attachment.mimeType.startsWith('image/');
    const isPdf = attachment.mimeType === 'application/pdf';
    const isDocx =
        attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        attachment.name.endsWith('.docx');
    const isHtml = attachment.mimeType === 'text/html' || attachment.name.endsWith('.html');

    const essayHtml = useMemo(() => {
        if (!isHtml || !attachment.dataUrl) return '';
        try {
            const base64 = attachment.dataUrl.split(',')[1];
            const decoded = decodeURIComponent(escape(atob(base64)));
            return DOMPurify.sanitize(decoded);
        } catch {
            return '';
        }
    }, [isHtml, attachment.dataUrl]);

    // Mammoth's semantic HTML conversion feeds the shared read-only page view (default).
    useEffect(() => {
        if (!isDocx || !attachment.dataUrl) return;
        let cancelled = false;
        convertDocxToHtml(attachment.dataUrl)
            .then((html) => {
                if (!cancelled) setDocxHtml(html);
            })
            .catch((err) => {
                console.error('Error converting docx to html:', err);
                if (!cancelled) {
                    setDocxHtmlFailed(true);
                    setViewMode('original');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [isDocx, attachment.dataUrl]);

    // docx-preview's own render — the "view as sent" fallback, only rendered once actually viewed.
    useEffect(() => {
        if (!isDocx || viewMode !== 'original' || originalRendered.current || !attachment.dataUrl || !docxRef.current)
            return;

        const loadDocx = async () => {
            originalRendered.current = true;
            setLoading(true);
            try {
                // Convert base64 dataUrl back to Blob for docx-preview
                const res = await fetch(attachment.dataUrl);
                const blob = await res.blob();

                // Clear any existing content
                if (docxRef.current) docxRef.current.innerHTML = '';

                await renderAsync(blob, docxRef.current as HTMLElement, undefined, {
                    className: 'docx-preview-wrapper',
                    inWrapper: true,
                    ignoreWidth: true,
                    ignoreHeight: false,
                    ignoreFonts: false,
                    breakPages: true,
                    useBase64URL: true,
                });
            } catch (err) {
                console.error('Error rendering docx:', err);
                setError('Failed to preview Word document. Please download to view.');
            } finally {
                setLoading(false);
            }
        };

        loadDocx();
    }, [isDocx, viewMode, attachment.dataUrl]);

    return (
        <div
            style={{
                marginBottom: 12,
                padding: 12,
                background: 'var(--bg-body)',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isImage ? (
                    <ImageIcon size={16} className="text-blue" />
                ) : (
                    <FileText size={16} className="text-purple" />
                )}
                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                    }}
                    title={attachment.name}
                >
                    {attachment.name}
                </div>
                <a
                    href={attachment.dataUrl}
                    download={attachment.name}
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Download"
                >
                    <Download size={14} />
                </a>
            </div>

            {isImage && attachment.dataUrl && (
                <div style={{ width: '100%', marginTop: 8 }}>
                    <img
                        src={attachment.dataUrl}
                        style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }}
                        alt={attachment.name}
                    />
                </div>
            )}

            {isPdf && attachment.dataUrl && (
                <div style={{ width: '100%', height: '400px', marginTop: 8 }}>
                    <iframe
                        src={attachment.dataUrl}
                        style={{ width: '100%', height: '100%', borderRadius: 4, border: '1px solid var(--border)' }}
                        title={attachment.name}
                    />
                </div>
            )}

            {isDocx && (
                <div style={{ width: '100%', marginTop: 8 }}>
                    {!docxHtmlFailed && (docxHtml !== null || viewMode === 'original') && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                            <button
                                type="button"
                                className={`btn btn-sm ${viewMode === 'formatted' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('formatted')}
                            >
                                {t('attachments.view_formatted')}
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${viewMode === 'original' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('original')}
                            >
                                {t('attachments.view_original')}
                            </button>
                        </div>
                    )}

                    {viewMode === 'formatted' && !docxHtmlFailed && (
                        <div
                            style={{
                                maxHeight: 500,
                                overflowY: 'auto',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                            }}
                        >
                            {docxHtml !== null ? (
                                commentable ? (
                                    <CommentableDocumentView content={docxHtml} attachmentId={attachment.id} />
                                ) : (
                                    <EssayEditor
                                        content={docxHtml}
                                        onChange={noop}
                                        editable={false}
                                        defaultPageMode
                                        allowPageMode={false}
                                    />
                                )
                            ) : (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Loader size={20} className="spin" style={{ marginBottom: 8 }} />
                                    <div>Loading preview...</div>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'original' && (
                        <div
                            style={{
                                background: '#fff',
                                color: '#000',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                            }}
                        >
                            {loading && (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Loader size={20} className="spin" style={{ marginBottom: 8 }} />
                                    <div>Loading preview...</div>
                                </div>
                            )}
                            {error && (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--red)' }}>{error}</div>
                            )}
                            <div
                                ref={docxRef}
                                style={{
                                    width: '100%',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    backgroundColor: '#f2f2f2', // Classic word viewer background
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {isHtml && attachment.dataUrl && essayHtml && (
                <div
                    style={{
                        width: '100%',
                        marginTop: 8,
                        maxHeight: 500,
                        overflowY: 'auto',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                    }}
                >
                    {commentable ? (
                        <CommentableDocumentView content={essayHtml} attachmentId={attachment.id} />
                    ) : (
                        <EssayEditor
                            content={essayHtml}
                            onChange={noop}
                            editable={false}
                            defaultPageMode
                            allowPageMode={false}
                        />
                    )}
                </div>
            )}

            {((!isImage && !isPdf && !isDocx && !isHtml) || (isHtml && attachment.dataUrl && !essayHtml)) && (
                <div
                    className="text-xs text-muted"
                    style={{
                        padding: 8,
                        background: 'var(--bg-elevated)',
                        borderRadius: 4,
                        textAlign: 'center',
                        marginTop: 8,
                    }}
                >
                    Preview not available. Please download to view.
                </div>
            )}
        </div>
    );
}
