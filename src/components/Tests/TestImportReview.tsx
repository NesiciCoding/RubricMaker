import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TestQuestionType } from '../../types';
import type { DocumentReview } from '../../utils/import/draftImport';
import { questionTypeLabelKey } from '../../utils/questionTypeKey';

/**
 * What the document reader recognised, shown before the import is confirmed.
 *
 * A paper is read by cues rather than by a template, so the teacher has to be able to check the
 * result at a glance: how the assignments were found, what each item was typed as, where the points
 * came from, and what the reader could not settle. Everything here is read-only — the test is edited
 * after it is imported — so it stays honest about what will actually be saved.
 */
export default function TestImportReview({ review }: { review: DocumentReview }) {
    const { t } = useTranslation();
    const types = Object.entries(review.types) as [TestQuestionType, number][];
    const questions = types.reduce((sum, [, count]) => sum + count, 0);
    const section = (count: number, points: number) => t('importTest.review_section_row', { questions: count, points });

    return (
        <div
            className="card"
            style={{ marginTop: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
            data-testid="import-review"
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: '0.9rem' }}>{t('importTest.review_title')}</strong>
                <span
                    className={`badge badge-${review.confidence === 'high' ? 'green' : review.confidence === 'medium' ? 'yellow' : 'red'}`}
                >
                    {t(`importTest.review_confidence_${review.confidence}`)}
                </span>
            </div>

            <div className="text-muted text-xs">
                {[
                    t('importTest.import_meta_questions', { count: questions }),
                    t('importTest.import_meta_sections', { count: review.sections.length }),
                    t('importTest.import_meta_points', { count: review.points }),
                ].join(' · ')}
            </div>

            {review.sections.length > 0 && (
                <div>
                    <div className="text-xs" style={{ fontWeight: 600 }}>
                        {t('importTest.review_sections')}
                    </div>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18 }} className="text-xs">
                        {review.sections.map((entry) => (
                            <li key={entry.title}>
                                {entry.title} — {section(entry.items, entry.points)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {types.length > 0 && (
                <div>
                    <div className="text-xs" style={{ fontWeight: 600 }}>
                        {t('importTest.review_types')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {types.map(([type, count]) => (
                            <span key={type} className="badge text-xs">
                                {t(questionTypeLabelKey(type))} · {count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {review.notes.length > 0 && (
                <div>
                    <div className="text-xs" style={{ fontWeight: 600 }}>
                        {t('importTest.review_notes')}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                        {t('importTest.review_notes_hint')}
                    </div>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18 }} className="text-xs text-muted">
                        {review.notes.map((note) => (
                            <li key={`${note.item}:${note.note}`}>
                                {note.item}: {note.note}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {review.readNotes.length > 0 && (
                <div className="text-xs text-muted">
                    {review.readNotes.map((note) => t(`importTest.read_note_${note.key}`, note.params)).join(' ')}
                </div>
            )}
        </div>
    );
}
