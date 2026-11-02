import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SharingControl from '../SharingControl';
import SharingModal from '../SharingModal';
import SharingBadge from '../SharingBadge';
import SharedMaterialBanner from '../SharedMaterialBanner';
import type { Folder } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

const folder: Folder = { id: 'f1', name: 'Year 1', kind: 'rubric', createdAt: '2026-01-01' };

describe('SharingControl', () => {
    it('offers the inherited setting and switches to an own one, keeping the access level', () => {
        const onChange = vi.fn();
        render(
            <SharingControl
                value={undefined}
                inherited={{ sharing: { visibility: 'school', access: 'edit' }, source: 'folder', folder }}
                onChange={onChange}
            />
        );
        const inherit = screen.getByLabelText(/sharing.inherit_folder/);
        expect(inherit).toBeChecked();
        expect(inherit.parentElement?.textContent).toContain('Year 1');
        expect(screen.getByLabelText('sharing.access_label')).toBeDisabled();

        fireEvent.click(screen.getByLabelText(/sharing.visibility_coteachers/));
        expect(onChange).toHaveBeenCalledWith({ visibility: 'coteachers', access: 'edit' });
    });

    it('changes access on an own setting and returns to inheriting', () => {
        const onChange = vi.fn();
        render(
            <SharingControl
                value={{ visibility: 'school', access: 'view' }}
                inherited={{ sharing: { visibility: 'private', access: 'view' }, source: 'default' }}
                onChange={onChange}
            />
        );
        expect(screen.getByLabelText(/sharing.inherit_default/)).not.toBeChecked();
        fireEvent.change(screen.getByLabelText('sharing.access_label'), { target: { value: 'edit' } });
        expect(onChange).toHaveBeenLastCalledWith({ visibility: 'school', access: 'edit' });
        fireEvent.click(screen.getByLabelText(/sharing.inherit_default/));
        expect(onChange).toHaveBeenLastCalledWith(undefined);
    });

    it('without an inherited choice defaults to private and disables access for private', () => {
        render(<SharingControl value={undefined} onChange={vi.fn()} />);
        expect(screen.getByLabelText(/sharing.visibility_private/)).toBeChecked();
        expect(screen.queryByLabelText(/sharing.inherit/)).not.toBeInTheDocument();
        expect(screen.getByLabelText('sharing.access_label')).toBeDisabled();
    });
});

describe('SharingModal', () => {
    it('describes a folder, warns when offline and closes on Done', () => {
        const onClose = vi.fn();
        render(
            <SharingModal
                name="Year 1"
                isFolder
                connected={false}
                value={undefined}
                inherited={{ sharing: { visibility: 'private', access: 'view' }, source: 'none' }}
                onChange={vi.fn()}
                onClose={onClose}
            />
        );
        expect(screen.getByText(/sharing.modal_desc_folder/)).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('sharing.offline_note');
        fireEvent.click(screen.getByText('common.done'));
        expect(onClose).toHaveBeenCalled();
    });

    it('describes a single item when connected', () => {
        render(
            <SharingModal
                name="Quiz"
                connected
                value={{ visibility: 'school', access: 'view' }}
                inherited={{ sharing: { visibility: 'private', access: 'view' }, source: 'none' }}
                onChange={vi.fn()}
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText(/sharing.modal_desc:/)).toBeInTheDocument();
        expect(screen.queryByText('sharing.offline_note')).not.toBeInTheDocument();
    });
});

describe('SharingBadge', () => {
    it('renders nothing for private material', () => {
        const { container } = render(<SharingBadge sharing={{ visibility: 'private', access: 'edit' }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('names the audience and whether colleagues can edit', () => {
        render(<SharingBadge sharing={{ visibility: 'school', access: 'edit' }} />);
        expect(screen.getByText(/sharing.badge_school/)).toHaveTextContent('sharing.badge_editable');
        render(<SharingBadge sharing={{ visibility: 'coteachers', access: 'view' }} />);
        expect(screen.getByTitle('sharing.badge_coteachers')).toBeInTheDocument();
    });
});

describe('SharedMaterialBanner', () => {
    it('falls back to a generic owner name and offers duplication', () => {
        const onDuplicate = vi.fn();
        render(<SharedMaterialBanner ownerName="" access="view" onDuplicate={onDuplicate} />);
        expect(screen.getByText(/sharing.banner_owner/)).toHaveTextContent('sharing.unknown_teacher');
        expect(screen.getByText('sharing.banner_view', { exact: false })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /sharing.duplicate/ }));
        expect(onDuplicate).toHaveBeenCalled();
    });
});
