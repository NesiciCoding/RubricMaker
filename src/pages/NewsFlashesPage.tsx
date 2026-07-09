import React, { useState } from 'react';
import {
    Plus,
    Newspaper,
    FileText,
    BookOpen,
    Video,
    Trash2,
    Edit2,
    ExternalLink,
    Layers,
    ListChecks,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import Modal from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import { useApp } from '../context/AppContext';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import TiptapEditor from '../components/Editor/TiptapEditor';
import type { CefrLevel, NewsFlash, NewsFlashKind, NewsFlashLinkedResourceType } from '../types';

const EMPTY_CONTENT_HTML = '<p></p>';

const KIND_ICONS: Record<NewsFlashKind, React.ReactNode> = {
    article: <FileText size={14} />,
    book: <BookOpen size={14} />,
    video: <Video size={14} />,
};

interface DraftState {
    id: string | null;
    title: string;
    summary: string;
    content: string;
    url: string;
    kind: NewsFlashKind;
    tags: string;
    cefrLevel: CefrLevel | '';
    linkedResourceType: NewsFlashLinkedResourceType | '';
    linkedResourceId: string;
}

function emptyDraft(): DraftState {
    return {
        id: null,
        title: '',
        summary: '',
        content: EMPTY_CONTENT_HTML,
        url: '',
        kind: 'article',
        tags: '',
        cefrLevel: '',
        linkedResourceType: '',
        linkedResourceId: '',
    };
}

export default function NewsFlashesPage() {
    const { t, i18n } = useTranslation();
    const { newsFlashes, flashcardDecks, tests, rubrics, addNewsFlash, updateNewsFlash, deleteNewsFlash } = useApp();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const [draft, setDraft] = useState<DraftState | null>(null);

    const sorted = [...newsFlashes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    function openCreate() {
        setDraft(emptyDraft());
    }

    function openEdit(flash: NewsFlash) {
        setDraft({
            id: flash.id,
            title: flash.title,
            summary: flash.summary,
            content: flash.content ?? EMPTY_CONTENT_HTML,
            url: flash.url ?? '',
            kind: flash.kind,
            tags: flash.tags.join(', '),
            cefrLevel: flash.cefrLevel ?? '',
            linkedResourceType: flash.linkedResourceType ?? '',
            linkedResourceId: flash.linkedResourceId ?? '',
        });
    }

    function handleSave() {
        if (!draft || !draft.title.trim()) return;
        const isContentEmpty = draft.content.replace(/<[^>]*>/g, '').trim().length === 0;
        const payload = {
            title: draft.title.trim(),
            summary: draft.summary.trim(),
            content: isContentEmpty ? undefined : draft.content,
            url: draft.url.trim() || undefined,
            kind: draft.kind,
            tags: draft.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            cefrLevel: draft.cefrLevel || undefined,
            linkedResourceType: draft.linkedResourceType || undefined,
            linkedResourceId: draft.linkedResourceType ? draft.linkedResourceId || undefined : undefined,
        };
        if (draft.id) {
            const existing = newsFlashes.find((f) => f.id === draft.id);
            if (existing) updateNewsFlash({ ...existing, ...payload });
        } else {
            addNewsFlash(payload);
        }
        setDraft(null);
    }

    async function handleDelete(flash: NewsFlash) {
        const ok = await confirm({
            title: t('newsFlashes.delete_title'),
            message: t('newsFlashes.delete_warning', { title: flash.title }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteNewsFlash(flash.id);
    }

    const linkedOptions: { value: string; label: string }[] =
        draft?.linkedResourceType === 'flashcardDeck'
            ? flashcardDecks.map((d) => ({ value: d.id, label: d.name }))
            : draft?.linkedResourceType === 'test'
              ? tests.map((tst) => ({ value: tst.id, label: tst.name }))
              : draft?.linkedResourceType === 'rubric'
                ? rubrics.map((r) => ({ value: r.id, label: r.name }))
                : [];

    return (
        <>
            <Topbar
                title={t('newsFlashes.page_title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={openCreate}>
                        <Plus size={15} /> {t('newsFlashes.new_flash')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                {sorted.length === 0 ? (
                    <div className="empty-state">
                        <Newspaper size={40} />
                        <h3>{t('newsFlashes.no_flashes')}</h3>
                        <p className="text-muted text-sm">{t('newsFlashes.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={openCreate}>
                            <Plus size={16} /> {t('newsFlashes.new_flash')}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {sorted.map((flash) => (
                            <div key={flash.id} className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color: 'var(--accent)' }}>{KIND_ICONS[flash.kind]}</span>
                                            <h3 style={{ margin: 0 }}>{flash.title}</h3>
                                        </div>
                                        {flash.summary && (
                                            <p className="text-muted text-sm" style={{ marginTop: 6 }}>
                                                {flash.summary}
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                            {flash.cefrLevel && (
                                                <span className="badge badge-blue">{flash.cefrLevel}</span>
                                            )}
                                            {flash.tags.map((tag) => (
                                                <span key={tag} className="badge">
                                                    {tag}
                                                </span>
                                            ))}
                                            {flash.linkedResourceType === 'flashcardDeck' && (
                                                <span className="badge badge-green">
                                                    <Layers size={11} style={{ verticalAlign: 'middle' }} />{' '}
                                                    {t('newsFlashes.linked_flashcardDeck')}
                                                </span>
                                            )}
                                            {flash.linkedResourceType === 'test' && (
                                                <span className="badge badge-green">
                                                    <ListChecks size={11} style={{ verticalAlign: 'middle' }} />{' '}
                                                    {t('newsFlashes.linked_test')}
                                                </span>
                                            )}
                                            {flash.linkedResourceType === 'rubric' && (
                                                <span className="badge badge-green">
                                                    {t('newsFlashes.linked_rubric')}
                                                </span>
                                            )}
                                            {flash.content && (
                                                <span className="badge">{t('newsFlashes.has_full_article')}</span>
                                            )}
                                        </div>
                                        <div className="text-muted text-xs" style={{ marginTop: 8 }}>
                                            {new Date(flash.createdAt).toLocaleDateString(i18n.language)}
                                            {flash.url && (
                                                <>
                                                    {' · '}
                                                    <a href={flash.url} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink
                                                            size={11}
                                                            style={{ verticalAlign: 'middle', marginRight: 3 }}
                                                        />
                                                        {t('newsFlashes.open_link')}
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            title={t('newsFlashes.action_edit')}
                                            aria-label={t('newsFlashes.action_edit')}
                                            onClick={() => openEdit(flash)}
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            title={t('newsFlashes.action_delete')}
                                            aria-label={t('newsFlashes.action_delete')}
                                            style={{ color: 'var(--red)' }}
                                            onClick={() => handleDelete(flash)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {draft && (
                <Modal
                    titleId="news-flash-modal-title"
                    onClose={() => setDraft(null)}
                    maxWidth={640}
                    style={{ maxHeight: '88vh', overflowY: 'auto' }}
                >
                    <h2 id="news-flash-modal-title" style={{ marginTop: 0 }}>
                        {draft.id ? t('newsFlashes.edit_title') : t('newsFlashes.new_flash')}
                    </h2>
                    <div className="form-group">
                        <label htmlFor="nf-title">{t('newsFlashes.field_title')}</label>
                        <input
                            id="nf-title"
                            type="text"
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="nf-summary">{t('newsFlashes.field_summary')}</label>
                        <textarea
                            id="nf-summary"
                            rows={2}
                            value={draft.summary}
                            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                        />
                        <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                            {t('newsFlashes.field_summary_hint')}
                        </p>
                    </div>
                    <div className="form-group">
                        <label htmlFor="nf-content">{t('newsFlashes.field_content')}</label>
                        <TiptapEditor
                            content={draft.content}
                            onChange={(content) => setDraft({ ...draft, content })}
                            placeholder={t('newsFlashes.field_content_placeholder')}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="nf-url">{t('newsFlashes.field_url')}</label>
                        <input
                            id="nf-url"
                            type="url"
                            placeholder="https://…"
                            value={draft.url}
                            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                        />
                    </div>
                    <div className="grid-2" style={{ gap: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="nf-kind">{t('newsFlashes.field_kind')}</label>
                            <select
                                id="nf-kind"
                                value={draft.kind}
                                onChange={(e) => setDraft({ ...draft, kind: e.target.value as NewsFlashKind })}
                            >
                                <option value="article">{t('newsFlashes.kind_article')}</option>
                                <option value="book">{t('newsFlashes.kind_book')}</option>
                                <option value="video">{t('newsFlashes.kind_video')}</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="nf-cefr">{t('cefr.target_level_label')}</label>
                            <select
                                id="nf-cefr"
                                value={draft.cefrLevel}
                                onChange={(e) => setDraft({ ...draft, cefrLevel: e.target.value as CefrLevel | '' })}
                            >
                                <option value="">{t('cefr.no_level')}</option>
                                {CEFR_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                        {lvl}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="nf-tags">{t('newsFlashes.field_tags')}</label>
                        <input
                            id="nf-tags"
                            type="text"
                            placeholder={t('newsFlashes.field_tags_placeholder')}
                            value={draft.tags}
                            onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                        />
                    </div>
                    <div className="grid-2" style={{ gap: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="nf-linked-type">{t('newsFlashes.field_linked_resource')}</label>
                            <select
                                id="nf-linked-type"
                                value={draft.linkedResourceType}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        linkedResourceType: e.target.value as NewsFlashLinkedResourceType | '',
                                        linkedResourceId: '',
                                    })
                                }
                            >
                                <option value="">{t('newsFlashes.linked_none')}</option>
                                <option value="flashcardDeck">{t('newsFlashes.linked_flashcardDeck')}</option>
                                <option value="test">{t('newsFlashes.linked_test')}</option>
                                <option value="rubric">{t('newsFlashes.linked_rubric')}</option>
                            </select>
                        </div>
                        {draft.linkedResourceType && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label htmlFor="nf-linked-id">{t('newsFlashes.field_linked_item')}</label>
                                <select
                                    id="nf-linked-id"
                                    value={draft.linkedResourceId}
                                    onChange={(e) => setDraft({ ...draft, linkedResourceId: e.target.value })}
                                >
                                    <option value="">{t('newsFlashes.linked_item_placeholder')}</option>
                                    {linkedOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                        <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!draft.title.trim()}
                            onClick={handleSave}
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </Modal>
            )}
            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
