import { useState } from 'react';

interface Props {
    id: string;
    value: string[];
    onChange: (items: string[]) => void;
    placeholder?: string;
    'aria-label'?: string;
}

function parsePipeList(text: string): string[] {
    return text
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
}

function sameList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * Pipe-separated alternatives ("He goes | He is going"). The raw text stays in local state so a typed
 * space or separator survives until the next character is written; re-deriving the text from the
 * trimmed list on every keystroke would swallow it.
 */
export default function PipeListInput({ id, value, onChange, placeholder, 'aria-label': ariaLabel }: Props) {
    const [raw, setRaw] = useState(() => value.join(' | '));
    const [lastValue, setLastValue] = useState(value);
    if (!sameList(value, lastValue)) {
        setLastValue(value);
        if (!sameList(parsePipeList(raw), value)) setRaw(value.join(' | '));
    }
    return (
        <input
            id={id}
            type="text"
            aria-label={ariaLabel}
            value={raw}
            placeholder={placeholder}
            onChange={(e) => {
                setRaw(e.target.value);
                onChange(parsePipeList(e.target.value));
            }}
        />
    );
}
