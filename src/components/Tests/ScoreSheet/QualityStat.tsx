import HelpPopover from '../HelpPopover';

/** One metric tile in a quality summary row, shared by the test and rubric panels. */
export default function QualityStat({ label, value, help }: { label: string; value: string; help?: string }) {
    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                minWidth: 110,
            }}
        >
            <div className="text-xs text-muted">
                {label}
                {help && <HelpPopover title={label}>{help}</HelpPopover>}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{value}</div>
        </div>
    );
}
