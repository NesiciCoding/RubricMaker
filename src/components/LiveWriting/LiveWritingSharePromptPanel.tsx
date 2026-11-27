import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS } from '../../data/schoolYears';
import { useToast } from '../../hooks/useToast';
import { storageSync } from '../../services/database';
import type { CefrLevel, LiveWritingFocus, LiveWritingSession, SchoolYear } from '../../types';
import { LIVE_PROMPT_LANGUAGES, LIVE_WRITING_FOCUS, liveWritingFocusKey } from '../../utils/liveWriting';

interface Props {
    session: LiveWritingSession;
    schoolId?: string;
}

/**
 * Publishes only the prompt payload to the school marketplace. Tags are required so the
 * shared prompt bank is filterable; no class, participant, response, vote or result leaves
 * the session.
 */
export default function LiveWritingSharePromptPanel({ session, schoolId }: Props) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [language, setLanguage] = useState('');
    const [cefrLevels, setCefrLevels] = useState<CefrLevel[]>([]);
    const [writingFocus, setWritingFocus] = useState<LiveWritingFocus[]>([]);
    const [schoolYear, setSchoolYear] = useState<SchoolYear | ''>('');
    const [publishing, setPublishing] = useState(false);

    const canPublish =
        !!schoolId &&
        subject.trim() !== '' &&
        language !== '' &&
        cefrLevels.length > 0 &&
        writingFocus.length > 0 &&
        session.prompt.trim() !== '' &&
        !publishing;

    function toggleFocus(focus: LiveWritingFocus) {
        setWritingFocus((prev) => (prev.includes(focus) ? prev.filter((f) => f !== focus) : [...prev, focus]));
    }

    function toggleLevel(level: CefrLevel) {
        setCefrLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
    }

    async function publish() {
        if (!schoolId || !canPublish) return;
        setPublishing(true);
        const result = await storageSync.adapter.publishToMarketplace(
            schoolId,
            'live_prompt',
            {
                title: session.title,
                prompt: session.prompt,
                imagePath: session.imagePath,
                minutesPerRound: session.minutesPerRound,
                minWords: session.minWords,
                maxWords: session.maxWords,
                scaffoldPrompts: session.scaffoldPrompts,
            },
            undefined,
            {
                name: session.title,
                subject: subject.trim(),
                language,
                cefrLevels,
                writingFocus,
                schoolYear: schoolYear || undefined,
            }
        );
        setPublishing(false);
        if (!result) {
            showToast(t('liveWriting.share_failed'), 'error');
            return;
        }
        setOpen(false);
        showToast(t('liveWriting.share_published'), 'success');
    }

    if (!schoolId) {
        return <p className="text-muted text-xs">{t('liveWriting.share_requires_school')}</p>;
    }

    return (
        <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h2 className="item-heading" style={{ margin: 0 }}>
                    <Share2 size={15} /> {t('liveWriting.share_title')}
                </h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((value) => !value)}>
                    {open ? t('common.cancel') : t('liveWriting.share_open')}
                </button>
            </div>
            <p className="text-muted text-xs" style={{ margin: '6px 0 0' }}>
                {t('liveWriting.share_intro')}
            </p>

            {open && (
                <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                    <div>
                        <label htmlFor="live-share-subject" style={{ display: 'block', marginBottom: 4 }}>
                            {t('liveWriting.share_subject')}
                        </label>
                        <input
                            id="live-share-subject"
                            className="input"
                            value={subject}
                            maxLength={60}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="live-share-language" style={{ display: 'block', marginBottom: 4 }}>
                            {t('liveWriting.share_language')}
                        </label>
                        <select
                            id="live-share-language"
                            className="input"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                        >
                            <option value="">{t('liveWriting.share_select')}</option>
                            {LIVE_PROMPT_LANGUAGES.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                            {t('liveWriting.share_levels')}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {CEFR_LEVELS.map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    className={`btn btn-sm ${cefrLevels.includes(level) ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => toggleLevel(level)}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                            {t('liveWriting.share_focus')}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {LIVE_WRITING_FOCUS.map((focus) => (
                                <button
                                    key={focus}
                                    type="button"
                                    className={`btn btn-sm ${writingFocus.includes(focus) ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => toggleFocus(focus)}
                                >
                                    {t(liveWritingFocusKey(focus))}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="live-share-year" style={{ display: 'block', marginBottom: 4 }}>
                            {t('liveWriting.share_year')}
                        </label>
                        <select
                            id="live-share-year"
                            className="input"
                            value={schoolYear}
                            onChange={(e) => setSchoolYear(e.target.value as SchoolYear | '')}
                        >
                            <option value="">{t('liveWriting.share_year_any')}</option>
                            {SCHOOL_YEARS.map((year) => (
                                <option key={year} value={year}>
                                    {SCHOOL_YEAR_LABELS[year]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!canPublish}
                        onClick={() => void publish()}
                    >
                        {publishing ? t('liveWriting.saving') : t('liveWriting.share_publish')}
                    </button>
                </div>
            )}
        </div>
    );
}
