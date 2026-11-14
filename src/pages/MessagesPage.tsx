import React, { useCallback, useMemo, useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useTranslation } from 'react-i18next';
import { Mail, Plus, Search, Send, X } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useEssays, useSettings, useStudents } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import { groupMessageThreads, MessageThread } from '../utils/messageThreads';
import type { Message, MessageContextType } from '../types';
import { EmptyState } from '../components/ui/EmptyState';

const CONTEXT_BADGE_KEY: Record<MessageContextType, string> = {
    rubric: 'messages.context_rubric',
    test: 'messages.context_test',
    essay: 'messages.context_essay',
    general: 'messages.context_general',
};

type ContextFilter = MessageContextType | 'all';

export default function MessagesPage() {
    const { t, i18n } = useTranslation();
    const tour = usePageTourState('messages');
    const { students, archivedStudents = [] } = useStudents();

    const { messages, sendMessage, markMessageReadByTeacher, notifyStudentMessage } = useEssays();
    const { settings } = useSettings();

    const [searchTerm, setSearchTerm] = useState('');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [newThreadOpen, setNewThreadOpen] = useState(false);
    const [newThreadStudentId, setNewThreadStudentId] = useState('');
    const [newThreadText, setNewThreadText] = useState('');

    const threads = useMemo(() => groupMessageThreads(messages), [messages]);

    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
        [i18n.language]
    );

    const studentLabelFor = useCallback(
        (studentId: string): string => {
            const student = students.find((s) => s.id === studentId);
            if (student) return student.name;
            const archived = archivedStudents.find((s) => s.id === studentId);
            return archived ? t('messages.archived_student', { name: archived.name }) : t('messages.unknown_student');
        },
        [students, archivedStudents, t]
    );

    const visibleThreads = useMemo(() => {
        const needle = searchTerm.trim().toLowerCase();
        return threads.filter((thread) => {
            if (unreadOnly && thread.unreadByTeacher === 0) return false;
            if (contextFilter !== 'all' && thread.contextType !== contextFilter) return false;
            if (!needle) return true;
            const label = studentLabelFor(thread.studentId);
            const context = thread.contextLabel ?? t(CONTEXT_BADGE_KEY[thread.contextType]);
            return (
                label.toLowerCase().includes(needle) ||
                context.toLowerCase().includes(needle) ||
                thread.messages.some((m) => m.body.toLowerCase().includes(needle))
            );
        });
    }, [threads, searchTerm, unreadOnly, contextFilter, studentLabelFor, t]);

    function threadKey(thread: Pick<MessageThread, 'studentId' | 'contextType' | 'contextId'>): string {
        return `${thread.studentId}__${thread.contextType}__${thread.contextId ?? ''}`;
    }

    function toggleThread(thread: MessageThread) {
        const key = threadKey(thread);
        if (expandedKey === key) {
            setExpandedKey(null);
            return;
        }
        setExpandedKey(key);
        setReplyText('');
        for (const m of thread.messages) {
            if (m.sender === 'student' && !m.readByTeacher) markMessageReadByTeacher(m.id);
        }
    }

    function sendReply(thread: MessageThread) {
        const body = replyText.trim();
        /* v8 ignore next -- the reply button is disabled while the input is blank */
        if (!body) return;
        const message: Message = {
            id: nanoid(),
            studentId: thread.studentId,
            contextType: thread.contextType,
            contextId: thread.contextId,
            contextLabel: thread.contextLabel,
            sender: 'teacher',
            body,
            createdAt: new Date().toISOString(),
            readByTeacher: true,
            readByStudent: false,
        };
        sendMessage(message);
        setReplyText('');
        if (settings.notifyStudentsOnMessage) {
            notifyStudentMessage(thread.studentId, thread.contextLabel, body);
        }
    }

    function sendNewThread() {
        const body = newThreadText.trim();
        /* v8 ignore next -- the send button is disabled until both are set */
        if (!body || !newThreadStudentId) return;
        const message: Message = {
            id: nanoid(),
            studentId: newThreadStudentId,
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'teacher',
            body,
            createdAt: new Date().toISOString(),
            readByTeacher: true,
            readByStudent: false,
        };
        sendMessage(message);
        if (settings.notifyStudentsOnMessage) {
            notifyStudentMessage(newThreadStudentId, null, body);
        }
        setNewThreadOpen(false);
        setNewThreadStudentId('');
        setNewThreadText('');
    }

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('messages.page_title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                        {t('tutorial.page_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in" data-tour="msg-content">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="input-group" style={{ flex: '1 1 220px' }}>
                        <Search size={16} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
                        <input
                            type="text"
                            placeholder={t('messages.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', width: '100%' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                        {t('messages.filter_unread_only')}
                    </label>
                    <select
                        aria-label={t('messages.filter_context_label')}
                        value={contextFilter}
                        onChange={(e) => setContextFilter(e.target.value as ContextFilter)}
                        style={{ fontSize: '0.85rem' }}
                    >
                        <option value="all">{t('messages.filter_context_all')}</option>
                        {(Object.keys(CONTEXT_BADGE_KEY) as MessageContextType[]).map((kind) => (
                            <option key={kind} value={kind}>
                                {t(CONTEXT_BADGE_KEY[kind])}
                            </option>
                        ))}
                    </select>
                    <button
                        data-tour="msg-new"
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setNewThreadOpen((v) => !v)}
                    >
                        <Plus size={14} /> {t('messages.new_thread_button')}
                    </button>
                </div>

                {newThreadOpen && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h2 style={{ marginTop: 0 }}>{t('messages.new_thread_title')}</h2>
                        <div className="form-group">
                            <label htmlFor="new-thread-student">{t('messages.select_student')}</label>
                            <select
                                id="new-thread-student"
                                value={newThreadStudentId}
                                onChange={(e) => setNewThreadStudentId(e.target.value)}
                            >
                                <option value="">{t('messages.select_student')}</option>
                                {students.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <textarea
                                rows={3}
                                value={newThreadText}
                                placeholder={t('messages.compose_placeholder')}
                                onChange={(e) => setNewThreadText(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={!newThreadStudentId || !newThreadText.trim()}
                                onClick={sendNewThread}
                            >
                                <Send size={14} /> {t('messages.send_button')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setNewThreadOpen(false)}
                            >
                                <X size={14} /> {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {threads.length === 0 ? (
                    <EmptyState
                        icon={Mail}
                        title={t('messages.inbox_empty')}
                        titleLevel={2}
                        description={t('messages.inbox_empty_desc')}
                    />
                ) : visibleThreads.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title={t('messages.no_matches')}
                        titleLevel={2}
                        description={t('messages.no_matches_desc')}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {visibleThreads.map((thread) => {
                            const key = threadKey(thread);
                            const studentLabel = studentLabelFor(thread.studentId);
                            const expanded = expandedKey === key;
                            return (
                                <div key={key} className="card">
                                    <button
                                        type="button"
                                        onClick={() => toggleThread(thread)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 10,
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            padding: 0,
                                        }}
                                    >
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {thread.unreadByTeacher > 0 && (
                                                    <span
                                                        style={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: '50%',
                                                            background: 'var(--danger, #ef4444)',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                )}
                                                <h2 className="item-heading" style={{ margin: 0 }}>
                                                    {studentLabel}
                                                </h2>
                                                <span className="badge badge-secondary">
                                                    {thread.contextLabel ?? t(CONTEXT_BADGE_KEY[thread.contextType])}
                                                </span>
                                            </div>
                                            <div
                                                className="text-muted text-xs"
                                                style={{
                                                    marginTop: 4,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {thread.lastMessage.body}
                                            </div>
                                        </div>
                                        <span className="text-muted text-xs" style={{ flexShrink: 0 }}>
                                            {dateFormat.format(new Date(thread.lastMessage.createdAt))}
                                        </span>
                                    </button>

                                    {expanded && (
                                        <div
                                            style={{
                                                marginTop: 14,
                                                borderTop: '1px solid var(--border)',
                                                paddingTop: 14,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 8,
                                                    marginBottom: 12,
                                                    maxHeight: 260,
                                                    overflowY: 'auto',
                                                }}
                                            >
                                                {thread.messages.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        style={{
                                                            alignSelf:
                                                                m.sender === 'teacher' ? 'flex-end' : 'flex-start',
                                                            maxWidth: '80%',
                                                            background:
                                                                m.sender === 'teacher'
                                                                    ? 'var(--accent)'
                                                                    : 'var(--bg-elevated)',
                                                            color: m.sender === 'teacher' ? '#fff' : 'var(--text)',
                                                            borderRadius: 10,
                                                            padding: '8px 12px',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    >
                                                        {m.body}
                                                        <div
                                                            style={{
                                                                fontSize: '0.7rem',
                                                                opacity: 0.7,
                                                                marginTop: 4,
                                                            }}
                                                        >
                                                            {dateFormat.format(new Date(m.createdAt))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <textarea
                                                    rows={2}
                                                    style={{ flex: 1 }}
                                                    value={replyText}
                                                    placeholder={t('messages.compose_placeholder')}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    disabled={!replyText.trim()}
                                                    onClick={() => sendReply(thread)}
                                                >
                                                    <Send size={14} /> {t('messages.send_button')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
