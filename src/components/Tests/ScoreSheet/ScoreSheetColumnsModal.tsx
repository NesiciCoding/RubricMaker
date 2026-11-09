import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, BookOpen, GraduationCap, Plus, Trash2, X } from 'lucide-react';
import Modal from '../../ui/Modal';
import StandardsPickerModal from '../../Standards/StandardsPickerModal';
import CefrPickerModal from '../../CEFR/CefrPickerModal';
import type { CefrLevel, CefrSkill, Test, TestQuestion } from '../../../types';
import { CEFR_LEVELS, CEFR_SKILLS, CEFR_SKILL_LABELS } from '../../../data/cefrDescriptors';
import { newScoreOnlyQuestion, parsePoints } from '../../../utils/scoreSheet';
import { withGrammarIds } from '../../../utils/grammarLinks';

interface Props {
    test: Test;
    standardsApiKey?: string;
    onSave: (patch: Pick<Test, 'name' | 'questions' | 'cefrTargetLevel' | 'cefrSkill'>) => void;
    onClose: () => void;
}

export default function ScoreSheetColumnsModal({ test, standardsApiKey, onSave, onClose }: Props) {
    const { t, i18n } = useTranslation();
    const [name, setName] = useState(test.name);
    const [questions, setQuestions] = useState<TestQuestion[]>(test.questions);
    const [cefrTargetLevel, setCefrTargetLevel] = useState<CefrLevel | ''>(test.cefrTargetLevel ?? '');
    const [cefrSkill, setCefrSkill] = useState<CefrSkill | ''>(test.cefrSkill ?? '');
    const [linking, setLinking] = useState<{ id: string; kind: 'standard' | 'cefr' } | null>(null);
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    function patch(id: string, change: Partial<TestQuestion> | ((q: TestQuestion) => TestQuestion)) {
        setQuestions((qs) =>
            qs.map((q) => (q.id === id ? (typeof change === 'function' ? change(q) : { ...q, ...change }) : q))
        );
    }

    function move(index: number, delta: number) {
        setQuestions((qs) => {
            const next = [...qs];
            const [item] = next.splice(index, 1);
            next.splice(index + delta, 0, item);
            return next;
        });
    }

    const linkingQuestion = linking ? questions.find((q) => q.id === linking.id) : undefined;

    return (
        <Modal titleId="score-columns-title" onClose={onClose} maxWidth={760}>
            <div className="modal-header">
                <h3 id="score-columns-title">{t('tests.scoreSheet.columns_title')}</h3>
                <button className="btn btn-ghost btn-icon" aria-label={t('common.close')} onClick={onClose}>
                    <X size={16} />
                </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="score-test-name">{t('tests.scoreSheet.test_name_label')}</label>
                    <input id="score-test-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="score-cefr-level">{t('cefr.target_level_label')}</label>
                        <select
                            id="score-cefr-level"
                            value={cefrTargetLevel}
                            onChange={(e) => setCefrTargetLevel(e.target.value as CefrLevel | '')}
                        >
                            <option value="">{t('cefr.no_level')}</option>
                            {CEFR_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                    {lvl} – {t(`cefr.level_${lvl}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="score-cefr-skill">{t('cefr.skill_label')}</label>
                        <select
                            id="score-cefr-skill"
                            value={cefrSkill}
                            onChange={(e) => setCefrSkill(e.target.value as CefrSkill | '')}
                        >
                            <option value="">{t('cefr.no_skill')}</option>
                            {CEFR_SKILLS.map((skill) => (
                                <option key={skill} value={skill}>
                                    {CEFR_SKILL_LABELS[skill][lang]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t('tests.scoreSheet.columns_help')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {questions.map((q, index) => {
                        const links = [
                            ...(q.linkedStandards ?? []).map((s, i) => ({
                                key: `s${i}`,
                                label: s.statementNotation ?? s.description,
                                remove: () =>
                                    patch(q.id, {
                                        linkedStandards: (q.linkedStandards ?? []).filter((_, k) => k !== i),
                                    }),
                            })),
                            ...(q.linkedCefrDescriptors ?? []).map((d) => ({
                                key: d.descriptorId,
                                label: `${d.level} · ${lang === 'nl' ? d.descriptionNl : d.descriptionEn}`,
                                remove: () =>
                                    patch(q.id, {
                                        linkedCefrDescriptors: (q.linkedCefrDescriptors ?? []).filter(
                                            (x) => x.descriptorId !== d.descriptorId
                                        ),
                                    }),
                            })),
                            ...(q.frameworkDescriptors ?? []).map((d) => ({
                                key: d.descriptorId,
                                label: lang === 'nl' ? d.descriptionNl : d.descriptionEn,
                                remove: () =>
                                    patch(q.id, (cur) =>
                                        withGrammarIds(
                                            cur,
                                            (cur.frameworkDescriptors ?? []).filter(
                                                (x) => x.descriptorId !== d.descriptorId
                                            )
                                        )
                                    ),
                            })),
                        ];
                        return (
                            <div
                                key={q.id}
                                style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    padding: 8,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        aria-label={t('tests.scoreSheet.column_label', { n: index + 1 })}
                                        value={q.prompt}
                                        onChange={(e) => patch(q.id, { prompt: e.target.value })}
                                        style={{ width: 110 }}
                                    />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                                        <span className="text-xs text-muted">{t('tests.scoreSheet.max_points')}</span>
                                        <input
                                            aria-label={t('tests.scoreSheet.column_max', { n: index + 1 })}
                                            inputMode="decimal"
                                            defaultValue={q.points}
                                            onBlur={(e) => {
                                                const v = parsePoints(e.target.value);
                                                if (v !== null && !Number.isNaN(v) && v > 0) patch(q.id, { points: v });
                                                else e.target.value = String(q.points);
                                            }}
                                            style={{ width: 70 }}
                                        />
                                    </label>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setLinking({ id: q.id, kind: 'standard' })}
                                        >
                                            <BookOpen size={13} /> {t('tests.scoreSheet.link_standard')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setLinking({ id: q.id, kind: 'cefr' })}
                                        >
                                            <GraduationCap size={13} /> {t('tests.scoreSheet.link_descriptor')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('tests.scoreSheet.move_up', { n: index + 1 })}
                                            disabled={index === 0}
                                            onClick={() => move(index, -1)}
                                        >
                                            <ArrowUp size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('tests.scoreSheet.move_down', { n: index + 1 })}
                                            disabled={index === questions.length - 1}
                                            onClick={() => move(index, 1)}
                                        >
                                            <ArrowDown size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('tests.scoreSheet.remove_column', { n: index + 1 })}
                                            disabled={questions.length === 1}
                                            style={{ color: 'var(--red-text)' }}
                                            onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                                {links.length > 0 && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {links.map((link) => (
                                            <span
                                                key={link.key}
                                                className="badge badge-blue"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                            >
                                                <span
                                                    style={{
                                                        maxWidth: 260,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {link.label}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-icon"
                                                    style={{ padding: 0, minHeight: 0, height: 16, width: 16 }}
                                                    aria-label={t('tests.scoreSheet.unlink', { label: link.label })}
                                                    onClick={link.remove}
                                                >
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setQuestions((qs) => [...qs, newScoreOnlyQuestion(String(qs.length + 1))])}
                    >
                        <Plus size={13} /> {t('tests.scoreSheet.add_column')}
                    </button>
                </div>
            </div>
            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() =>
                        onSave({
                            name: name.trim() || test.name,
                            questions,
                            cefrTargetLevel: cefrTargetLevel || undefined,
                            cefrSkill: cefrSkill || undefined,
                        })
                    }
                >
                    {t('common.save')}
                </button>
            </div>

            {linking?.kind === 'standard' && linkingQuestion && standardsApiKey && (
                <StandardsPickerModal
                    apiKey={standardsApiKey}
                    onSelect={(std) => {
                        patch(linkingQuestion.id, {
                            linkedStandards: [...(linkingQuestion.linkedStandards ?? []), std],
                        });
                        setLinking(null);
                    }}
                    onClose={() => setLinking(null)}
                />
            )}
            {linking?.kind === 'standard' && !standardsApiKey && (
                <Modal titleId="score-standards-key-title" onClose={() => setLinking(null)} maxWidth={460}>
                    <div className="modal-header">
                        <h3 id="score-standards-key-title">{t('rubricBuilder.standards_modal_title')}</h3>
                    </div>
                    <div className="modal-body">
                        <p>{t('tests.standards_api_key_required')}</p>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setLinking(null)}>
                            {t('rubricBuilder.action_close')}
                        </button>
                    </div>
                </Modal>
            )}
            {linking?.kind === 'cefr' && linkingQuestion && (
                <CefrPickerModal
                    linkedDescriptors={linkingQuestion.linkedCefrDescriptors ?? []}
                    onAdd={(d) =>
                        patch(linkingQuestion.id, (cur) => ({
                            ...cur,
                            linkedCefrDescriptors: [...(cur.linkedCefrDescriptors ?? []), d],
                        }))
                    }
                    onRemove={(id) =>
                        patch(linkingQuestion.id, (cur) => ({
                            ...cur,
                            linkedCefrDescriptors: (cur.linkedCefrDescriptors ?? []).filter(
                                (x) => x.descriptorId !== id
                            ),
                        }))
                    }
                    linkedFrameworkDescriptors={linkingQuestion.frameworkDescriptors ?? []}
                    onAddFramework={(d) =>
                        patch(linkingQuestion.id, (cur) => {
                            const existing = cur.frameworkDescriptors ?? [];
                            if (existing.some((x) => x.descriptorId === d.descriptorId)) return cur;
                            return withGrammarIds(cur, [...existing, d]);
                        })
                    }
                    onRemoveFramework={(id) =>
                        patch(linkingQuestion.id, (cur) =>
                            withGrammarIds(
                                cur,
                                (cur.frameworkDescriptors ?? []).filter((x) => x.descriptorId !== id)
                            )
                        )
                    }
                    onClose={() => setLinking(null)}
                />
            )}
        </Modal>
    );
}
