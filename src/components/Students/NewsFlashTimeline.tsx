import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, BookOpen, Video, ExternalLink, Layers, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NewsFlash, NewsFlashKind } from '../../types';

const KIND_ICONS: Record<NewsFlashKind, React.ReactNode> = {
    article: <FileText size={15} />,
    book: <BookOpen size={15} />,
    video: <Video size={15} />,
};

interface Props {
    studentId: string;
    flashes: NewsFlash[];
    readFlashIds: Set<string>;
    onOpen: (flash: NewsFlash) => void;
    onScrollToSection: (id: string) => void;
}

export default function NewsFlashTimeline({ studentId, flashes, readFlashIds, onOpen, onScrollToSection }: Props) {
    const { t, i18n } = useTranslation();
    const sorted = [...flashes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((flash) => {
                const unread = !readFlashIds.has(flash.id);
                return (
                    <div
                        key={flash.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(flash)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpen(flash);
                            }
                        }}
                        style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: '12px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                        }}
                    >
                        {unread && (
                            <span
                                aria-label={t('newsFlashes.unread_label')}
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: 'var(--danger, #ef4444)',
                                    flexShrink: 0,
                                    marginTop: 6,
                                }}
                            />
                        )}
                        <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>
                            {KIND_ICONS[flash.kind]}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: unread ? 700 : 600, fontSize: '0.9rem' }}>{flash.title}</div>
                            {flash.summary && (
                                <p className="text-muted text-sm" style={{ margin: '4px 0 0' }}>
                                    {flash.summary}
                                </p>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                {flash.cefrLevel && <span className="badge badge-blue">{flash.cefrLevel}</span>}
                                {flash.tags.map((tag) => (
                                    <span key={tag} className="badge">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 10,
                                    alignItems: 'center',
                                    marginTop: 8,
                                }}
                            >
                                <span className="text-muted text-xs">
                                    {new Date(flash.createdAt).toLocaleDateString(i18n.language)}
                                </span>
                                {flash.url && (
                                    <a
                                        href={flash.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs"
                                    >
                                        <ExternalLink size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                                        {t('newsFlashes.open_link')}
                                    </a>
                                )}
                                {flash.linkedResourceType === 'flashcardDeck' && flash.linkedResourceId && (
                                    <Link
                                        to={`/portal/${studentId}/flashcards/${flash.linkedResourceId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs"
                                    >
                                        <Layers size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                                        {t('newsFlashes.linked_flashcardDeck')}
                                    </Link>
                                )}
                                {flash.linkedResourceType === 'test' && (
                                    <button
                                        type="button"
                                        className="btn-link text-xs"
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onScrollToSection('portal-section-work');
                                        }}
                                    >
                                        <ListChecks size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                                        {t('newsFlashes.linked_test')}
                                    </button>
                                )}
                                {flash.linkedResourceType === 'rubric' && (
                                    <button
                                        type="button"
                                        className="btn-link text-xs"
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onScrollToSection('portal-section-feedback');
                                        }}
                                    >
                                        {t('newsFlashes.linked_rubric')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
