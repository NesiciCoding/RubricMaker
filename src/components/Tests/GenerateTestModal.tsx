import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { nanoid } from '../../utils/nanoid';
import { seededShuffle } from '../../utils/seededShuffle';
import { cloneBankItemIntoTest } from '../../utils/testQuestionClone';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import type { CefrLevel, TestQuestion, TestSection } from '../../types';

interface GenerateTestModalProps {
    onClose: () => void;
}

interface CriterionRow {
    id: string;
    kind: 'question' | 'section';
    tag: string;
    cefrLevel: CefrLevel | '';
    count: number;
}

function newRow(): CriterionRow {
    return { id: nanoid(), kind: 'question', tag: '', cefrLevel: '', count: 5 };
}

export default function GenerateTestModal({ onClose }: GenerateTestModalProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { questionBank } = useApp();

    const [name, setName] = useState('');
    const [mode, setMode] = useState<'assessment' | 'practice' | 'placement'>('assessment');
    const [organizeByLevel, setOrganizeByLevel] = useState(false);
    const [rows, setRows] = useState<CriterionRow[]>([newRow()]);

    function updateRow(id: string, patch: Partial<CriterionRow>) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }

    function removeRow(id: string) {
        setRows((prev) => prev.filter((r) => r.id !== id));
    }

    function handleGenerate() {
        const questions: TestQuestion[] = [];
        const sections: TestSection[] = [];
        const sectionByLevel = new Map<CefrLevel, TestSection>();
        const shortfalls: string[] = [];
        const usedItemIds = new Set<string>();

        rows.forEach((row, index) => {
            const tag = row.tag.trim().toLowerCase();
            const pool = questionBank.filter((item) => {
                if (usedItemIds.has(item.id)) return false;
                const itemKind = item.kind ?? 'question';
                if (itemKind !== row.kind) return false;
                if (row.cefrLevel && item.cefrLevel !== row.cefrLevel) return false;
                if (tag && !item.tags.some((t2) => t2.toLowerCase().includes(tag))) return false;
                return true;
            });
            const shuffled = seededShuffle(pool, nanoid());
            const picked = shuffled.slice(0, row.count);
            if (picked.length < row.count) {
                shortfalls.push(
                    t('generateTest.shortfall_row', { row: index + 1, got: picked.length, want: row.count })
                );
            }

            picked.forEach((item) => {
                usedItemIds.add(item.id);
                const { questions: cloned, section } = cloneBankItemIntoTest(item);
                if (section) {
                    sections.push(section);
                    questions.push(...cloned);
                    return;
                }
                if (organizeByLevel && item.cefrLevel) {
                    let levelSection = sectionByLevel.get(item.cefrLevel);
                    if (!levelSection) {
                        levelSection = { id: nanoid(), title: item.cefrLevel, cefrLevel: item.cefrLevel };
                        sectionByLevel.set(item.cefrLevel, levelSection);
                        sections.push(levelSection);
                    }
                    questions.push(...cloned.map((q) => ({ ...q, sectionId: levelSection!.id })));
                } else {
                    questions.push(...cloned);
                }
            });
        });

        navigate('/tests/new', {
            state: {
                generated: {
                    name: name.trim() || t('generateTest.default_name'),
                    mode,
                    questions,
                    sections,
                },
                generatedShortfalls: shortfalls,
            },
        });
        onClose();
    }

    const canGenerate = name.trim().length > 0 && rows.length > 0 && rows.every((r) => r.count > 0);

    return (
        <Modal
            titleId="generate-test-title"
            onClose={onClose}
            maxWidth={640}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            <div className="modal-header">
                <h3 id="generate-test-title">{t('generateTest.title')}</h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={onClose}
                    aria-label={t('common.close')}
                >
                    <X size={18} />
                </button>
            </div>

            <div
                className="modal-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
            >
                <div className="form-group">
                    <label htmlFor="generate-test-name">{t('tests.name_label')}</label>
                    <input
                        id="generate-test-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('generateTest.name_placeholder')}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="generate-test-mode">{t('tests.mode_label')}</label>
                    <select
                        id="generate-test-mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as 'assessment' | 'practice' | 'placement')}
                    >
                        <option value="assessment">{t('tests.mode_assessment')}</option>
                        <option value="practice">{t('tests.mode_practice')}</option>
                        <option value="placement">{t('tests.mode_placement')}</option>
                    </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <input
                        type="checkbox"
                        checked={organizeByLevel}
                        onChange={(e) => setOrganizeByLevel(e.target.checked)}
                    />
                    {t('generateTest.organize_by_level_label')}
                </label>

                <div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        <strong style={{ fontSize: '0.9rem' }}>{t('generateTest.criteria_title')}</strong>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setRows((prev) => [...prev, newRow()])}
                        >
                            <Plus size={14} /> {t('generateTest.add_criterion')}
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {rows.map((row) => (
                            <div
                                key={row.id}
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    padding: 8,
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                }}
                            >
                                <select
                                    aria-label={t('generateTest.criterion_kind_label')}
                                    value={row.kind}
                                    onChange={(e) =>
                                        updateRow(row.id, { kind: e.target.value as 'question' | 'section' })
                                    }
                                >
                                    <option value="question">{t('generateTest.criterion_kind_question')}</option>
                                    <option value="section">{t('generateTest.criterion_kind_section')}</option>
                                </select>
                                <select
                                    aria-label={t('questionBank.cefr_level_label')}
                                    value={row.cefrLevel}
                                    onChange={(e) => updateRow(row.id, { cefrLevel: e.target.value as CefrLevel | '' })}
                                >
                                    <option value="">{t('tests.section_cefr_level_none')}</option>
                                    {CEFR_LEVELS.map((lvl) => (
                                        <option key={lvl} value={lvl}>
                                            {lvl}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={row.tag}
                                    onChange={(e) => updateRow(row.id, { tag: e.target.value })}
                                    placeholder={t('generateTest.criterion_tag_placeholder')}
                                    style={{ flex: 1, minWidth: 100 }}
                                />
                                <input
                                    type="number"
                                    min={1}
                                    value={row.count}
                                    onChange={(e) =>
                                        updateRow(row.id, { count: Math.max(1, Number(e.target.value) || 1) })
                                    }
                                    style={{ width: 64 }}
                                    aria-label={t('generateTest.criterion_count_label')}
                                />
                                {rows.length > 1 && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('common.delete')}
                                        style={{ color: 'var(--red)' }}
                                        onClick={() => removeRow(row.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
                    {t('generateTest.generate_button')}
                </button>
            </div>
        </Modal>
    );
}
