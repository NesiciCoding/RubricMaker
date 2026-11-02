import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialAccess, MaterialSharing, MaterialVisibility } from '../../types';
import { MATERIAL_VISIBILITIES, type ResolvedSharing } from '../../utils/materialSharing';

interface Props {
    /** The item's own setting; undefined means it inherits. */
    value: MaterialSharing | undefined;
    /** What applies when there is no own setting, offered as the "inherit" choice. Omit to hide it. */
    inherited?: ResolvedSharing;
    onChange: (next: MaterialSharing | undefined) => void;
    disabled?: boolean;
}

const INHERIT = 'inherit';

function inheritedLabel(
    t: (key: string, opts?: Record<string, unknown>) => string,
    inherited: ResolvedSharing
): string {
    const visibility = t(`sharing.visibility_${inherited.sharing.visibility}`);
    if (inherited.source === 'folder' && inherited.folder)
        return t('sharing.inherit_folder', { folder: inherited.folder.name, visibility });
    return t('sharing.inherit_default', { visibility });
}

/** Who can open a rubric, test or folder, and whether they may edit it. */
export default function SharingControl({ value, inherited, onChange, disabled = false }: Props) {
    const { t } = useTranslation();
    const id = useId();
    const effective = value ?? inherited?.sharing ?? { visibility: 'private', access: 'view' };
    const selected = value ? value.visibility : inherited ? INHERIT : 'private';

    function pickVisibility(next: string) {
        if (next === INHERIT) onChange(undefined);
        else onChange({ visibility: next as MaterialVisibility, access: effective.access });
    }

    function pickAccess(next: MaterialAccess) {
        onChange({ visibility: effective.visibility, access: next });
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <fieldset style={{ border: 'none', margin: 0, padding: 0 }} disabled={disabled}>
                <legend style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>
                    {t('sharing.who_label')}
                </legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {inherited && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                            <input
                                type="radio"
                                name={`${id}-visibility`}
                                value={INHERIT}
                                checked={selected === INHERIT}
                                onChange={() => pickVisibility(INHERIT)}
                            />
                            {inheritedLabel(t, inherited)}
                        </label>
                    )}
                    {MATERIAL_VISIBILITIES.map((v) => (
                        <label
                            key={v}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem' }}
                        >
                            <input
                                type="radio"
                                name={`${id}-visibility`}
                                value={v}
                                checked={selected === v}
                                onChange={() => pickVisibility(v)}
                                style={{ marginTop: 3 }}
                            />
                            <span>
                                {t(`sharing.visibility_${v}`)}
                                <span className="text-muted text-xs" style={{ display: 'block' }}>
                                    {t(`sharing.visibility_${v}_hint`)}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor={`${id}-access`}>{t('sharing.access_label')}</label>
                <select
                    id={`${id}-access`}
                    value={effective.access}
                    disabled={disabled || effective.visibility === 'private' || selected === INHERIT}
                    onChange={(e) => pickAccess(e.target.value as MaterialAccess)}
                >
                    <option value="view">{t('sharing.access_view')}</option>
                    <option value="edit">{t('sharing.access_edit')}</option>
                </select>
            </div>
            <p className="text-muted text-xs" style={{ margin: 0 }}>
                {t('sharing.admin_note')}
            </p>
        </div>
    );
}
