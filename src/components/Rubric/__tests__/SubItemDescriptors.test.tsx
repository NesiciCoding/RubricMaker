import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubItem } from '../../../types';
import SubItemListEditor from '../SubItemListEditor';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const items: SubItem[] = [
    {
        id: 's1',
        label: 'Uses past simple correctly',
        cefrDescriptors: [
            {
                descriptorId: 'cefr-1',
                level: 'B1',
                skill: 'writing',
                descriptionEn: 'Can write simple past-tense narratives',
                descriptionNl: 'Kan eenvoudige verhalen in de verleden tijd schrijven',
            },
        ],
        frameworkDescriptors: [
            {
                descriptorId: 'fw-1',
                framework: 'grammar',
                categoryId: 'past-simple',
                categoryLabelEn: 'Past Simple',
                categoryLabelNl: 'Verleden tijd',
                categoryColor: '#3b82f6',
                descriptionEn: 'Past Simple — irregular verbs',
                descriptionNl: 'Verleden tijd — onregelmatige werkwoorden',
            },
        ],
    },
];

function setup(list: SubItem[] = items) {
    const cb = {
        onChange: vi.fn(),
        onLinkStandard: vi.fn(),
        onUnlinkStandard: vi.fn(),
        onLinkDescriptor: vi.fn(),
        onUnlinkCefrDescriptor: vi.fn(),
        onUnlinkFrameworkDescriptor: vi.fn(),
        onMove: vi.fn(),
    };
    render(
        <SubItemListEditor
            items={list}
            mode="points"
            levelLabel="Good"
            onChange={cb.onChange}
            onLinkStandard={cb.onLinkStandard}
            onUnlinkStandard={cb.onUnlinkStandard}
            onLinkDescriptor={cb.onLinkDescriptor}
            onUnlinkCefrDescriptor={cb.onUnlinkCefrDescriptor}
            onUnlinkFrameworkDescriptor={cb.onUnlinkFrameworkDescriptor}
            moveTargets={[]}
            onMove={cb.onMove}
        />
    );
    return cb;
}

describe('SubItemListEditor descriptors (#1002)', () => {
    it('renders CEFR and framework descriptor chips for the sub-item', () => {
        setup(items);
        expect(screen.getByText('Can write simple past-tense narratives')).toBeInTheDocument();
        expect(screen.getByText('Past Simple — irregular verbs')).toBeInTheDocument();
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText('Past Simple')).toBeInTheDocument();
    });

    it('opens the shared picker through the descriptor link button', () => {
        const cb = setup(items);
        fireEvent.click(screen.getByRole('button', { name: 'framework.action_link_descriptor' }));
        expect(cb.onLinkDescriptor).toHaveBeenCalledWith('s1');
    });

    it('removes a CEFR descriptor with the sub-item and descriptor id', () => {
        const cb = setup(items);
        const removeButtons = screen.getAllByRole('button', { name: 'rubricBuilder.action_remove_descriptor' });
        expect(removeButtons).toHaveLength(2);
        fireEvent.click(removeButtons[0]);
        expect(cb.onUnlinkCefrDescriptor).toHaveBeenCalledWith('s1', 'cefr-1');
    });

    it('removes a framework descriptor with the sub-item and descriptor id', () => {
        const cb = setup(items);
        const removeButtons = screen.getAllByRole('button', { name: 'rubricBuilder.action_remove_descriptor' });
        fireEvent.click(removeButtons[1]);
        expect(cb.onUnlinkFrameworkDescriptor).toHaveBeenCalledWith('s1', 'fw-1');
    });

    it('renders no chips or picker wiring damage when the sub-item has no descriptors', () => {
        setup([{ id: 's2', label: 'Plain statement' }]);
        expect(
            screen.queryByRole('button', { name: 'rubricBuilder.action_remove_descriptor' })
        ).not.toBeInTheDocument();
        // The link button is still offered so descriptors can be added.
        expect(screen.getByRole('button', { name: 'framework.action_link_descriptor' })).toBeInTheDocument();
    });
});
