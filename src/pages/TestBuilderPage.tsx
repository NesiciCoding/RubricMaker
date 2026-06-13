import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Save, ArrowLeft, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { nanoid } from '../utils/nanoid';
import QuestionEditor from '../components/Tests/QuestionEditor';
import type { TestQuestion } from '../types';

function newQuestion(): TestQuestion {
    return {
        id: nanoid(),
        prompt: '',
        type: 'multiple-choice',
        points: 1,
        options: [
            { id: nanoid(), text: '', isCorrect: true },
            { id: nanoid(), text: '', isCorrect: false },
        ],
    };
}

export default function TestBuilderPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { tests, addTest, updateTest, gradeScales, settings } = useApp();

    const existing = id ? tests.find((tst) => tst.id === id) : undefined;

    const [name, setName] = useState(existing?.name ?? '');
    const [nameError, setNameError] = useState('');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [questions, setQuestions] = useState<TestQuestion[]>(existing?.questions ?? []);
    const [durationMinutes, setDurationMinutes] = useState(
        existing?.durationMinutes ? String(existing.durationMinutes) : ''
    );
    const [shuffleQuestions, setShuffleQuestions] = useState(existing?.shuffleQuestions ?? false);
    const [requireSEB, setRequireSEB] = useState(existing?.requireSEB ?? false);
    const [gradeScaleId, setGradeScaleId] = useState<string | undefined>(
        existing?.gradeScaleId ?? settings.defaultGradeScaleId
    );

    function addQuestion() {
        setQuestions((prev) => [...prev, newQuestion()]);
    }

    function updateQuestion(qid: string, question: TestQuestion) {
        setQuestions((prev) => prev.map((q) => (q.id === qid ? question : q)));
    }

    function removeQuestion(qid: string) {
        setQuestions((prev) => prev.filter((q) => q.id !== qid));
    }

    function moveQuestion(index: number, direction: -1 | 1) {
        setQuestions((prev) => {
            const next = [...prev];
            const target = index + direction;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    function handleSave() {
        if (!name.trim()) {
            setNameError(t('tests.name_required'));
            return;
        }
        setNameError('');

        const payload = {
            name: name.trim(),
            description: description.trim() || undefined,
            questions,
            durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
            shuffleQuestions,
            requireSEB,
            gradeScaleId,
        };

        if (existing) {
            updateTest({ ...existing, ...payload, updatedAt: new Date().toISOString() });
            showToast(t('tests.save_success'), 'success');
        } else {
            const created = addTest(payload);
            showToast(t('tests.save_success'), 'success');
            navigate(`/tests/${created.id}`, { replace: true });
        }
    }

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);

    return (
        <>
            <Topbar
                title={existing ? t('tests.edit_test_title') : t('tests.new_test_title')}
                actions={
                    <>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tests')}>
                            <ArrowLeft size={15} /> {t('tests.back_to_list')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {t('common.save')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="test-name">{t('tests.name_label')}</label>
                        <input
                            id="test-name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (nameError) setNameError('');
                            }}
                            placeholder={t('tests.name_placeholder')}
                        />
                        {nameError && (
                            <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 4 }}>
                                <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {nameError}
                            </p>
                        )}
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="test-description">
                            {t('tests.description_label')}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({t('essay_assignment.optional')})
                            </span>
                        </label>
                        <textarea
                            id="test-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder={t('tests.description_placeholder')}
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* Settings panel */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: '0.95rem' }}>{t('tests.settings_title')}</h3>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
                            <label htmlFor="test-duration">{t('tests.duration_label')}</label>
                            <input
                                id="test-duration"
                                type="number"
                                min={1}
                                value={durationMinutes}
                                onChange={(e) => setDurationMinutes(e.target.value)}
                                placeholder={t('tests.duration_placeholder')}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
                            <label htmlFor="test-grade-scale">{t('tests.grade_scale_label')}</label>
                            <select
                                id="test-grade-scale"
                                value={gradeScaleId ?? ''}
                                onChange={(e) => setGradeScaleId(e.target.value || undefined)}
                            >
                                <option value="">{t('tests.grade_scale_none')}</option>
                                {gradeScales.map((gs) => (
                                    <option key={gs.id} value={gs.id}>
                                        {gs.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={shuffleQuestions}
                                onChange={(e) => setShuffleQuestions(e.target.checked)}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            {t('tests.shuffle_questions_label')}
                        </label>
                        <div>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={requireSEB}
                                    onChange={(e) => setRequireSEB(e.target.checked)}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                {t('tests.require_seb_label')}
                            </label>
                            <p className="text-muted text-xs" style={{ marginTop: 4, marginBottom: 0 }}>
                                {t('tests.require_seb_help')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Questions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                        {t('tests.questions_title')}{' '}
                        <span className="text-muted text-sm">
                            {t('tests.questions_summary', { count: questions.length, points: totalPoints })}
                        </span>
                    </h3>
                    <button className="btn btn-secondary btn-sm" onClick={addQuestion}>
                        <Plus size={14} /> {t('tests.add_question')}
                    </button>
                </div>

                {questions.length === 0 ? (
                    <div className="empty-state">
                        <h3>{t('tests.no_questions')}</h3>
                        <p className="text-muted text-sm">{t('tests.no_questions_instruction')}</p>
                        <button className="btn btn-primary" onClick={addQuestion}>
                            <Plus size={16} /> {t('tests.add_question')}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {questions.map((question, index) => (
                            <QuestionEditor
                                key={question.id}
                                question={question}
                                index={index}
                                total={questions.length}
                                onChange={(q) => updateQuestion(question.id, q)}
                                onRemove={() => removeQuestion(question.id)}
                                onMoveUp={() => moveQuestion(index, -1)}
                                onMoveDown={() => moveQuestion(index, 1)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
