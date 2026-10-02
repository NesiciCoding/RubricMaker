import { useState } from 'react';

interface Props {
    id: string;
    value: string[];
    onChange: (lines: string[]) => void;
    rows?: number;
    placeholder?: string;
}

/**
 * One list item per line. The raw text stays in local state so a trailing newline survives while the
 * author types the next item; only non-blank lines are reported through onChange.
 */
export default function LineListTextarea({ id, value, onChange, rows = 3, placeholder }: Props) {
    const [raw, setRaw] = useState(() => value.join('\n'));
    return (
        <textarea
            id={id}
            rows={rows}
            value={raw}
            placeholder={placeholder}
            onChange={(e) => {
                setRaw(e.target.value);
                onChange(e.target.value.split('\n').filter((line) => line.trim()));
            }}
        />
    );
}
