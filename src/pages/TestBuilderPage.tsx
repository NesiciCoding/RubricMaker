import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Save, ArrowLeft, AlertCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { getTestBuilderTourSteps } from '../data/TutorialSteps';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { nanoid } from '../utils/nanoid';
import QuestionEditor from '../components/Tests/QuestionEditor';
import type { TestQuestion, TestSection } from '../types';

function newQuestion(sectionId?: string): TestQuestion {
    return {
        id: nanoid(),
        prompt: '',
        type: 'multiple-choice',
        points: 1,
        sectionId,
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
    const notFound = !!id && !existing;

    const [name, setName] = useState(existing?.name ?? '');
    const [nameError, setNameError] = useState('');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [questions, setQuestions] = useState<TestQuestion[]>(existing?.questions ?? []);
    const [sections, setSections] = useState<TestSection[]>(existing?.sections ?? []);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(
        existing?.durationMinutes ? String(existing.durationMinutes) : ''
    );
    const [shuffleQuestions, setShuffleQuestions] = useState(existing?.shuffleQuestions ?? false);
    const [requireSEB, setRequireSEB] = useState(existing?.requireSEB ?? false);
    const [gradeScaleId, setGradeScaleId] = useState<string | undefined>(
        existing?.gradeScaleId ?? settings.defaultGradeScaleId
    );
    const [tourRun, setTourRun] = useState(false);
    const testTourSteps = React.useMemo(() => getTestBuilderTourSteps(t), [t]);

    const validSectionIds = React.useMemo(() => new Set(sections.map((s) => s.id)), [sections]);

    // Group questions by section for rendering; normalize stale sectionIds to null
    function questionsFor(sectionId: string | null): TestQuestion[] {
        return questions.filter((q) => {
            const normalized = q.sectionId && validSectionIds.has(q.sectionId) ? q.sectionId : null;
            return normalized === sectionId;
        });
    }

    // Reconstruct flat array from grouped order (uncategorised → section order)
    function flattenGroups(
        uncategorised: TestQuestion[],
        sectionGroups: Record<string, TestQuestion[]>
    ): TestQuestion[] {
        return [...uncategorised, ...sections.flatMap((s) => sectionGroups[s.id] ?? [])];
    }

    function onDragEnd(result: DropResult) {
        if (!result.destination) return;
        const { source, destination } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const sectionGroups: Record<string, TestQuestion[]> = {};
        sections.forEach((s) => {
            sectionGroups[s.id] = questionsFor(s.id);
        });
        const uncategorised = questionsFor(null);

        const srcId = source.droppableId;
        const dstId = destination.droppableId;
        const srcList = srcId === '__none__' ? [...uncategorised] : [...(sectionGroups[srcId] ?? [])];
        const [moved] = srcList.splice(source.index, 1);

        if (srcId === dstId) {
            srcList.splice(destination.index, 0, moved);
            if (srcId === '__none__') {
                setQuestions(flattenGroups(srcList, sectionGroups));
            } else {
                sectionGroups[srcId] = srcList;
                setQuestions(flattenGroups(uncategorised, sectionGroups));
            }
        } else {
            const newSectionId = dstId === '__none__' ? undefined : dstId;
            const updatedMoved = { ...moved, sectionId: newSectionId };
            const dstList = dstId === '__none__' ? [...uncategorised] : [...(sectionGroups[dstId] ?? [])];
            dstList.splice(destination.index, 0, updatedMoved);
            if (srcId === '__none__') {
                sectionGroups[dstId] = dstList;
                setQuestions(flattenGroups(srcList, sectionGroups));
            } else if (dstId === '__none__') {
                sectionGroups[srcId] = srcList;
                setQuestions(flattenGroups(dstList, sectionGroups));
            } else {
                sectionGroups[srcId] = srcList;
                sectionGroups[dstId] = dstList;
                setQuestions(flattenGroups(uncategorised, sectionGroups));
            }
        }
    }

    function addQuestion(sectionId?: string) {
        setQuestions((prev) => [...prev, newQuestion(sectionId)]);
    }

    function updateQuestion(qid: string, question: TestQuestion) {
        setQuestions((prev) => prev.map((q) => (q.id === qid ? question : q)));
    }

    function removeQuestion(qid: string) {
        setQuestions((prev) => prev.filter((q) => q.id !== qid));
    }

    function addSection() {
        const title = newSectionTitle.trim();
        if (!title) return;
        setSections((prev) => [...prev, { id: nanoid(), title }]);
        setNewSectionTitle('');
    }

    function removeSection(sectionId: string) {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
        setQuestions((prev) => prev.map((q) => (q.sectionId === sectionId ? { ...q, sectionId: undefined } : q)));
    }

    function renameSection(sectionId: string, title: string) {
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title } : s)));
    }

    function toggleSection(sectionId: string) {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    }

    function handleSave() {
        if (notFound) return;
        if (!name.trim()) {
            setNameError(t('tests.name_required'));
            return;
        }
        setNameError('');

        const trimmedDuration = durationMinutes.trim();
        const parsedDuration =
            trimmedDuration === ''
                ? undefined
                : Number.isFinite(Number(trimmedDuration)) && Number(trimmedDuration) > 0
                  ? Number(trimmedDuration)
                  : undefined;

        const payload = {
            name: name.trim(),
            description: description.trim() || undefined,
            questions,
            sections: sections.length > 0 ? sections : undefined,
            durationMinutes: parsedDuration,
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
    const uncategorised = questionsFor(null);

    if (notFound) {
        return (
            <>
                <Topbar title={t('tests.edit_test_title')} />
                <div className="page-content fade-in">
                    <p className="text-muted">{t('tests.not_found')}</p>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tests')}>
                        <ArrowLeft size={15} /> {t('tests.back_to_list')}
                    </button>
                </div>
            </>
        );
    }

    return (
        <>
            <Joyride
                steps={testTourSteps}
                run={tourRun}
                continuous
                onEvent={(data: EventData) => {
                    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
                        setTourRun(false);
                    }
                }}
                options={{
                    showProgress: true,
                    primaryColor: 'var(--accent)',
                    backgroundColor: 'var(--bg-elevated)',
                    textColor: 'var(--text)',
                    arrowColor: 'var(--bg-elevated)',
                    overlayColor: 'rgba(0, 0, 0, 0.6)',
                }}
            />
            <Topbar
                title={existing ? t('tests.edit_test_title') : t('tests.new_test_title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                            {t('tutorial.tb_tour_button')}
                        </button>
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
                <div
                    className="card"
                    data-tour="tb-details"
                    style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
                >
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
                <div className="card" data-tour="tb-settings" style={{ marginBottom: 20 }}>
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

                {/* Sections panel */}
                <div className="card" data-tour="tb-sections" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: '0.95rem' }}>{t('tests.sections_title')}</h3>
                    {sections.length === 0 ? (
                        <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                            {t('tests.sections_none_hint')}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                            {sections.map((s) => (
                                <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        value={s.title}
                                        onChange={(e) => renameSection(s.id, e.target.value)}
                                        style={{ flex: 1, fontSize: '0.875rem' }}
                                        aria-label={t('tests.section_name_label')}
                                    />
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('tests.remove_section')}
                                        style={{ color: 'var(--red)', flexShrink: 0 }}
                                        onClick={() => removeSection(s.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            placeholder={t('tests.new_section_placeholder')}
                            onKeyDown={(e) => e.key === 'Enter' && addSection()}
                            style={{ flex: 1, fontSize: '0.875rem' }}
                        />
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={addSection}
                            disabled={!newSectionTitle.trim()}
                        >
                            <Plus size={14} /> {t('tests.add_section')}
                        </button>
                    </div>
                </div>

                {/* Questions */}
                <div
                    data-tour="tb-add-question"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}
                >
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                        {t('tests.questions_title')}{' '}
                        <span className="text-muted text-sm">
                            {t('tests.questions_summary', { count: questions.length, points: totalPoints })}
                        </span>
                    </h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => addQuestion()}>
                        <Plus size={14} /> {t('tests.add_question')}
                    </button>
                </div>

                {questions.length === 0 ? (
                    <div className="empty-state">
                        <h3>{t('tests.no_questions')}</h3>
                        <p className="text-muted text-sm">{t('tests.no_questions_instruction')}</p>
                        <button className="btn btn-primary" onClick={() => addQuestion()}>
                            <Plus size={16} /> {t('tests.add_question')}
                        </button>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={onDragEnd}>
                        {/* Uncategorised questions */}
                        {(uncategorised.length > 0 || sections.length === 0) && (
                            <Droppable droppableId="__none__">
                                {(provided) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 16,
                                            marginBottom: sections.length > 0 ? 20 : 0,
                                        }}
                                    >
                                        {uncategorised.map((question, index) => (
                                            <Draggable key={question.id} draggableId={question.id} index={index}>
                                                {(draggable) => (
                                                    <div ref={draggable.innerRef} {...draggable.draggableProps}>
                                                        <QuestionEditor
                                                            question={question}
                                                            index={questions.indexOf(question)}
                                                            total={questions.length}
                                                            sections={sections}
                                                            dragHandleProps={draggable.dragHandleProps}
                                                            onChange={(q) => updateQuestion(question.id, q)}
                                                            onRemove={() => removeQuestion(question.id)}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={() => addQuestion()}
                                        >
                                            <Plus size={14} /> {t('tests.add_question')}
                                        </button>
                                    </div>
                                )}
                            </Droppable>
                        )}

                        {/* Sections */}
                        {sections.map((section) => {
                            const sectionQs = questionsFor(section.id);
                            const collapsed = collapsedSections.has(section.id);
                            return (
                                <div
                                    key={section.id}
                                    style={{
                                        marginBottom: 20,
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '10px 14px',
                                            background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))',
                                            border: 'none',
                                            borderBottom: collapsed ? 'none' : '1px solid var(--border)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontWeight: 600,
                                            fontSize: '0.9rem',
                                            color: 'var(--text)',
                                        }}
                                    >
                                        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                        {section.title}
                                        <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 4 }}>
                                            ({t('tests.section_question_count', { count: sectionQs.length })})
                                        </span>
                                    </button>

                                    {!collapsed && (
                                        <div style={{ padding: '16px 14px' }}>
                                            <Droppable droppableId={section.id}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 16,
                                                            minHeight: 40,
                                                        }}
                                                    >
                                                        {sectionQs.map((question, index) => (
                                                            <Draggable
                                                                key={question.id}
                                                                draggableId={question.id}
                                                                index={index}
                                                            >
                                                                {(draggable) => (
                                                                    <div
                                                                        ref={draggable.innerRef}
                                                                        {...draggable.draggableProps}
                                                                    >
                                                                        <QuestionEditor
                                                                            question={question}
                                                                            index={questions.indexOf(question)}
                                                                            total={questions.length}
                                                                            sections={sections}
                                                                            dragHandleProps={draggable.dragHandleProps}
                                                                            onChange={(q) =>
                                                                                updateQuestion(question.id, q)
                                                                            }
                                                                            onRemove={() => removeQuestion(question.id)}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                        {sectionQs.length === 0 && (
                                                            <p
                                                                className="text-muted text-sm"
                                                                style={{ margin: '8px 0' }}
                                                            >
                                                                {t('tests.section_empty_hint')}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </Droppable>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ marginTop: 12 }}
                                                onClick={() => addQuestion(section.id)}
                                            >
                                                <Plus size={14} /> {t('tests.add_question')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </DragDropContext>
                )}
            </div>
        </>
    );
}
