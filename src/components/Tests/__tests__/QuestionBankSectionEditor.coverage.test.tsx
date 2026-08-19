import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankSectionEditor from '../QuestionBankSectionEditor';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const makeAppContextMock = () => ({ settings: {}, addQuestionBankItem: vi.fn() });
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));

const section = (overrides: Partial<Record<string, unknown>> = {}) => ({
    title: 'Passage',
    content: '<p>Stimulus</p>',
    questions: [
        { id: 'q1', prompt: 'First question', type: 'open', points: 2 },
        { id: 'q2', prompt: 'Second question', type: 'open', points: 2 },
    ],
    ...overrides,
});

describe('QuestionBankSectionEditor coverage', () => {
    it('updates a question via the nested editor and moves it up', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={section() as never} onChange={onChange} />);

        // edit the second question's prompt through QuestionEditor
        // textareas: passage editor (0), q1 prompt (1), q2 prompt (2)
        const prompts = screen.getAllByLabelText('essay-editor');
        fireEvent.change(prompts[2], { target: { value: 'Rewritten prompt' } });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                questions: [
                    expect.objectContaining({ id: 'q1' }),
                    expect.objectContaining({ id: 'q2', prompt: 'Rewritten prompt' }),
                ],
            })
        );
        onChange.mockClear();

        // move the second question up
        const upButtons = screen.getAllByRole('button', { name: 'questionBank.move_question_up' });
        fireEvent.click(upButtons[1]);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                questions: [expect.objectContaining({ id: 'q2' }), expect.objectContaining({ id: 'q1' })],
            })
        );
    });

    it('clears the audio URL to undefined and shows the empty hint without questions', () => {
        const onChange = vi.fn();
        const r1 = render(
            <QuestionBankSectionEditor
                section={section({ content: undefined, audioUrl: 'https://audio.example/x.mp3' }) as never}
                onChange={onChange}
            />
        );
        // content fallback renders without crashing; clearing the URL hits the `|| undefined` arm
        const audioInput = screen.getByLabelText(/tests.section_audio_label/) as HTMLInputElement;
        expect(audioInput.value).toBe('https://audio.example/x.mp3');
        fireEvent.change(audioInput, { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: undefined, content: undefined }));
        r1.unmount();

        const r2 = render(
            <QuestionBankSectionEditor section={section({ questions: [] }) as never} onChange={vi.fn()} />
        );
        expect(screen.getByText('tests.section_empty_hint')).toBeInTheDocument();
        r2.unmount();
    });
});
