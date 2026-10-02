export const CHIP_STYLES = `
    .te-chip-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
    .te-chip-list:focus-within { border-color: var(--accent); }
    .te-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px 2px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        color: var(--accent);
        font-weight: 600;
        font-size: 0.85rem;
    }
    .te-chip-plain { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); font-weight: 500; }
    .te-chip button { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; line-height: 1; }
    .te-chip button:hover, .te-chip button:focus-visible { background: color-mix(in srgb, currentColor 20%, transparent); }
    .te-chip-input { flex: 1; min-width: 120px; border: none !important; outline: none; background: transparent !important; padding: 2px 4px !important; box-shadow: none !important; color: var(--text); }
    .te-card { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); }
`;
