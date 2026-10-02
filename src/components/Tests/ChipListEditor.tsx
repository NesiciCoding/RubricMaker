import { useState } from 'react';
import { X } from 'lucide-react';
import { CHIP_STYLES } from './testEditorStyles';

interface Props {
    id?: string;
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    ariaLabel: string;
    removeLabel: (value: string) => string;
    plain?: boolean;
    /** Characters besides Enter that commit the typed text as a chip. */
    separators?: string[];
}

export default function ChipListEditor({
    id,
    values,
    onChange,
    placeholder,
    ariaLabel,
    removeLabel,
    plain,
    separators = [','],
}: Props) {
    const [draft, setDraft] = useState('');

    const commit = (text: string) => {
        const next = text.trim();
        setDraft('');
        if (next) onChange([...values, next]);
    };

    return (
        <div className="te-chip-list">
            <style>{CHIP_STYLES}</style>
            {values.map((value, i) => (
                <span key={`${value}-${i}`} className={plain ? 'te-chip te-chip-plain' : 'te-chip'}>
                    {value}
                    <button
                        type="button"
                        aria-label={removeLabel(value)}
                        onClick={() => onChange(values.filter((_, j) => j !== i))}
                    >
                        <X size={12} />
                    </button>
                </span>
            ))}
            <input
                id={id}
                type="text"
                className="te-chip-input"
                aria-label={ariaLabel}
                value={draft}
                placeholder={placeholder}
                onChange={(e) => {
                    const text = e.target.value;
                    const sep = separators.find((s) => text.includes(s));
                    if (sep) {
                        const parts = text.split(sep);
                        const tail = parts.pop() ?? '';
                        const added = parts.map((p) => p.trim()).filter(Boolean);
                        if (added.length) onChange([...values, ...added]);
                        setDraft(tail);
                    } else {
                        setDraft(text);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit(draft);
                    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
                        onChange(values.slice(0, -1));
                    }
                }}
                onBlur={() => commit(draft)}
            />
        </div>
    );
}
