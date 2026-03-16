import { Rubric, DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';

export const QUICK_START_TEMPLATES: Partial<Rubric>[] = [
    {
        name: 'Analytical Essay Rubric',
        subject: 'English / Writing',
        description: 'A standard 4-level rubric for evaluating academic essays focused on thesis, evidence, and structure.',
        criteria: [
            {
                id: nanoid(),
                title: 'Thesis Statement',
                description: 'Clarity and strength of the central argument.',
                weight: 25,
                levels: [
                    { id: nanoid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Clear, compelling, and well-positioned thesis.', subItems: [] },
                    { id: nanoid(), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Clear thesis that addresses the prompt.', subItems: [] },
                    { id: nanoid(), label: 'Developing', minPoints: 2, maxPoints: 2, description: 'Thesis is present but vague or broad.', subItems: [] },
                    { id: nanoid(), label: 'Beginning', minPoints: 1, maxPoints: 1, description: 'Thesis is missing or does not address prompt.', subItems: [] }
                ]
            },
            {
                id: nanoid(),
                title: 'Evidence & Analysis',
                description: 'Use of quotes and depth of explanation.',
                weight: 40,
                levels: [
                    { id: nanoid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Superior evidence with insightful analysis.', subItems: [] },
                    { id: nanoid(), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Strong evidence with relevant analysis.', subItems: [] },
                    { id: nanoid(), label: 'Developing', minPoints: 2, maxPoints: 2, description: 'Partial evidence with literal analysis.', subItems: [] },
                    { id: nanoid(), label: 'Beginning', minPoints: 1, maxPoints: 1, description: 'Weak or irrelevant evidence.', subItems: [] }
                ]
            },
            {
                id: nanoid(),
                title: 'Organization',
                description: 'Logical flow and transitions.',
                weight: 20,
                levels: [
                    { id: nanoid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Perfect flow and clear transitions.', subItems: [] },
                    { id: nanoid(), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Logical flow with most transitions.', subItems: [] },
                    { id: nanoid(), label: 'Developing', minPoints: 2, maxPoints: 2, description: 'Some logical gaps in organization.', subItems: [] },
                    { id: nanoid(), label: 'Beginning', minPoints: 1, maxPoints: 1, description: 'Disorganized and difficult to follow.', subItems: [] }
                ]
            },
            {
                id: nanoid(),
                title: 'Conventions',
                description: 'Grammar, spelling, and mechanics.',
                weight: 15,
                levels: [
                    { id: nanoid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Nearly error-free.', subItems: [] },
                    { id: nanoid(), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Few minor errors.', subItems: [] },
                    { id: nanoid(), label: 'Developing', minPoints: 2, maxPoints: 2, description: 'Errors distract the reader.', subItems: [] },
                    { id: nanoid(), label: 'Beginning', minPoints: 1, maxPoints: 1, description: 'Frequent errors impede meaning.', subItems: [] }
                ]
            }
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#1e40af' }
    },
    {
        name: 'Oral Presentation Rubric',
        subject: 'General / Communication',
        description: 'Evaluates public speaking skills, visual aids, and audience engagement.',
        criteria: [
            {
                id: nanoid(),
                title: 'Content Knowledge',
                description: 'Subject mastery and response to questions.',
                weight: 40,
                levels: [
                    { id: nanoid(), label: 'Strong', minPoints: 10, maxPoints: 10, description: 'Demonstrates deep understanding.', subItems: [] },
                    { id: nanoid(), label: 'Proficient', minPoints: 8, maxPoints: 8, description: 'Shows basic understanding.', subItems: [] },
                    { id: nanoid(), label: 'Emerging', minPoints: 6, maxPoints: 6, description: 'Needs more research.', subItems: [] }
                ]
            },
            {
                id: nanoid(),
                title: 'Delivery',
                description: 'Eye contact, volume, and pacing.',
                weight: 30,
                levels: [
                    { id: nanoid(), label: 'Strong', minPoints: 10, maxPoints: 10, description: 'Engaging style and great voice.', subItems: [] },
                    { id: nanoid(), label: 'Proficient', minPoints: 8, maxPoints: 8, description: 'Clear and audible.', subItems: [] },
                    { id: nanoid(), label: 'Emerging', minPoints: 6, maxPoints: 6, description: 'Monotone or too quiet.', subItems: [] }
                ]
            },
            {
                id: nanoid(),
                title: 'Visual Aids',
                description: 'Quality and use of slides or props.',
                weight: 30,
                levels: [
                    { id: nanoid(), label: 'Strong', minPoints: 10, maxPoints: 10, description: 'Enhances presentation perfectly.', subItems: [] },
                    { id: nanoid(), label: 'Proficient', minPoints: 8, maxPoints: 8, description: 'Supportive but basic.', subItems: [] },
                    { id: nanoid(), label: 'Emerging', minPoints: 6, maxPoints: 6, description: 'Distracting or poorly made.', subItems: [] }
                ]
            }
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#047857' }
    }
];
