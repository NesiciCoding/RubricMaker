import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Plus, Send, X } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import { groupMessageThreads, MessageThread } from '../utils/messageThreads';
import type { Message, MessageContextType } from '../types';

const CONTEXT_BADGE_KEY: Record<MessageContextType, string> = {
    rubric: 'messages.context_rubric',
    test: 'messages.context_test',
    essay: 'messages.context_essay',
    general: 'messages.context_general',
};

export default function MessagesPage() {
    const { t } = useTranslation();
    const { messages, students, settings, sendMessage, markMessageReadByTeacher, notifyStudentMessage } = useApp();
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [newThreadOpen, setNewThreadOpen] = useState(false);
    const [newThreadStudentId, setNewThreadStudentId] = useState('');
    const [newThreadText, setNewThreadText] = useState('');

    const threads = useMemo(() => groupMessageThreads(messages), [messages]);

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
            <Topbar title={t('messages.page_title')} />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setNewThreadOpen((v) => !v)}
                    >
                        <Plus size={14} /> {t('messages.new_thread_button')}
                    </button>
                </div>

                {newThreadOpen && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 style={{ marginTop: 0 }}>{t('messages.new_thread_title')}</h3>
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
                    <div className="empty-state">
                        <Mail size={40} />
                        <h3>{t('messages.inbox_empty')}</h3>
                        <p className="text-muted text-sm">{t('messages.inbox_empty_desc')}</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {threads.map((thread) => {
                            const key = threadKey(thread);
                            const student = students.find((s) => s.id === thread.studentId);
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
                                                <h3 style={{ margin: 0 }}>{student?.name ?? thread.studentId}</h3>
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
                                            {new Date(thread.lastMessage.createdAt).toLocaleString()}
                                        </span>
                                    </button>

                                    {expanded && (
                                        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
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
                                                            alignSelf: m.sender === 'teacher' ? 'flex-end' : 'flex-start',
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
                                                            {new Date(m.createdAt).toLocaleString()}
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
