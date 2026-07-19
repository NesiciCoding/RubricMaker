import React from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import type { QuestionBankItem, TestQuestion } from '../../types';
import EssayEditor from '../Editor/EssayEditor';
import QuestionEditor from './QuestionEditor';
import { newQuestion } from '../../utils/testQuestionClone';

type BankSection = NonNullable<QuestionBankItem['section']>;

interface Props {
    section: BankSection;
    onChange: (section: BankSection) => void;
}

export default function QuestionBankSectionEditor({ section, onChange }: Props) {
    const { t } = useTranslation();

    function patch(partial: Partial<BankSection>) {
        onChange({ ...section, ...partial });
    }

    function updateQuestion(index: number, question: TestQuestion) {
        const questions = section.questions.slice();
        questions[index] = question;
        patch({ questions });
    }

    function removeQuestion(index: number) {
        patch({ questions: section.questions.filter((_, i) => i !== index) });
    }

    function addQuestion() {
        const { sectionId: _sectionId, ...bare } = newQuestion();
        patch({ questions: [...section.questions, bare] });
    }

    function moveQuestion(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= section.questions.length) return;
        const questions = section.questions.slice();
        [questions[index], questions[target]] = [questions[target], questions[index]];
        patch({ questions });
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bank-section-title">{t('tests.section_name_label')}</label>
                <input
                    id="bank-section-title"
                    value={section.title}
                    onChange={(e) => patch({ title: e.target.value })}
                />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
                <label id="bank-section-passage-label">{t('tests.section_passage_label')}</label>
                <EssayEditor
                    content={section.content ?? ''}
                    onChange={(html) => patch({ content: html })}
                    placeholder={t('tests.section_passage_placeholder')}
                    minHeight={160}
                    allowPageMode={false}
                    ariaLabelledBy="bank-section-passage-label"
                />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bank-section-audio" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Music size={14} /> {t('tests.section_audio_label')}{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        ({t('essay_assignment.optional')})
                    </span>
                </label>
                <input
                    id="bank-section-audio"
                    type="url"
                    value={section.audioUrl ?? ''}
                    onChange={(e) => patch({ audioUrl: e.target.value || undefined })}
                    placeholder={t('tests.question_audio_placeholder')}
                />
                {section.audioUrl && (
                    <audio
                        controls
                        src={section.audioUrl}
                        aria-label={t('tests.question_audio_preview_alt')}
                        style={{ marginTop: 8, width: '100%' }}
                    />
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {section.questions.map((question, index) => (
                    <div key={question.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 8 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-xs"
                                aria-label={t('questionBank.move_question_up')}
                                disabled={index === 0}
                                onClick={() => moveQuestion(index, -1)}
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-xs"
                                aria-label={t('questionBank.move_question_down')}
                                disabled={index === section.questions.length - 1}
                                onClick={() => moveQuestion(index, 1)}
                            >
                                <ChevronDown size={14} />
                            </button>
                        </div>
                        <div style={{ flex: 1 }}>
                            <QuestionEditor
                                question={question}
                                index={index}
                                total={section.questions.length}
                                sections={[]}
                                showSaveToBank={false}
                                onChange={(q) => updateQuestion(index, q)}
                                onRemove={() => removeQuestion(index)}
                            />
                        </div>
                    </div>
                ))}
                {section.questions.length === 0 && (
                    <p className="text-muted text-sm" style={{ margin: '8px 0' }}>
                        {t('tests.section_empty_hint')}
                    </p>
                )}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={addQuestion}>
                <Plus size={14} /> {t('tests.add_question')}
            </button>
        </div>
    );
}
