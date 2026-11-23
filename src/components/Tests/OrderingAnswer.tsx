import InlineScript from './InlineScript';
import ItemImage from './ItemImage';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { seededShuffle } from '../../utils/seededShuffle';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Reorder items with the up/down buttons; the starting order is a seeded shuffle. */
export default function OrderingAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const items = question.orderItems ?? [];
    const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const shuffledIds = useMemo(
        () =>
            seededShuffle(
                items.map((item) => item.id),
                `${code}-${question.id}`
            ),
        [items, code, question.id]
    );
    const order = useMemo<string[]>(() => {
        try {
            const parsed = value ? (JSON.parse(value) as string[]) : [];
            if (parsed.length === items.length && parsed.every((id) => itemsById.has(id))) return parsed;
        } catch {
            /* fall through to shuffled default */
        }
        return shuffledIds;
    }, [value, shuffledIds, items, itemsById]);

    function move(from: number, to: number) {
        /* v8 ignore next -- the up/down buttons are disabled at the bounds */
        if (to < 0 || to >= order.length) return;
        const next = [...order];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(JSON.stringify(next));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {order.map((id, idx) => (
                <div
                    key={id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                    }}
                >
                    <ItemImage url={itemsById.get(id)?.imageUrl} alt={itemsById.get(id)?.text} />
                    <span lang={lang ?? 'en'} style={{ flex: 1, color: 'var(--text)' }}>
                        <InlineScript text={itemsById.get(id)?.text ?? ''} />
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.taking.move_item_up')}
                        disabled={idx === 0}
                        onClick={() => move(idx, idx - 1)}
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.taking.move_item_down')}
                        disabled={idx === order.length - 1}
                        onClick={() => move(idx, idx + 1)}
                    >
                        <ChevronDown size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
