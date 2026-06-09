import { Rubric, DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';

export const QUICK_START_TEMPLATES: Partial<Rubric>[] = [
    {
        name: 'Analytical Essay Rubric',
        subject: 'English / Writing',
        description:
            'A standard 4-level rubric for evaluating academic essays focused on thesis, evidence, and structure.',
        criteria: [
            {
                id: nanoid(),
                title: 'Thesis Statement',
                description: 'Clarity and strength of the central argument.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Excellent',
                        minPoints: 4,
                        maxPoints: 4,
                        description: 'Clear, compelling, and well-positioned thesis.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Good',
                        minPoints: 3,
                        maxPoints: 3,
                        description: 'Clear thesis that addresses the prompt.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Developing',
                        minPoints: 2,
                        maxPoints: 2,
                        description: 'Thesis is present but vague or broad.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Beginning',
                        minPoints: 1,
                        maxPoints: 1,
                        description: 'Thesis is missing or does not address prompt.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Evidence & Analysis',
                description: 'Use of quotes and depth of explanation.',
                weight: 40,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Excellent',
                        minPoints: 4,
                        maxPoints: 4,
                        description: 'Superior evidence with insightful analysis.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Good',
                        minPoints: 3,
                        maxPoints: 3,
                        description: 'Strong evidence with relevant analysis.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Developing',
                        minPoints: 2,
                        maxPoints: 2,
                        description: 'Partial evidence with literal analysis.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Beginning',
                        minPoints: 1,
                        maxPoints: 1,
                        description: 'Weak or irrelevant evidence.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Organization',
                description: 'Logical flow and transitions.',
                weight: 20,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Excellent',
                        minPoints: 4,
                        maxPoints: 4,
                        description: 'Perfect flow and clear transitions.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Good',
                        minPoints: 3,
                        maxPoints: 3,
                        description: 'Logical flow with most transitions.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Developing',
                        minPoints: 2,
                        maxPoints: 2,
                        description: 'Some logical gaps in organization.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Beginning',
                        minPoints: 1,
                        maxPoints: 1,
                        description: 'Disorganized and difficult to follow.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Conventions',
                description: 'Grammar, spelling, and mechanics.',
                weight: 15,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Excellent',
                        minPoints: 4,
                        maxPoints: 4,
                        description: 'Nearly error-free.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Good',
                        minPoints: 3,
                        maxPoints: 3,
                        description: 'Few minor errors.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Developing',
                        minPoints: 2,
                        maxPoints: 2,
                        description: 'Errors distract the reader.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Beginning',
                        minPoints: 1,
                        maxPoints: 1,
                        description: 'Frequent errors impede meaning.',
                        subItems: [],
                    },
                ],
            },
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#1e40af' },
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
                    {
                        id: nanoid(),
                        label: 'Strong',
                        minPoints: 10,
                        maxPoints: 10,
                        description: 'Demonstrates deep understanding.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Proficient',
                        minPoints: 8,
                        maxPoints: 8,
                        description: 'Shows basic understanding.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Emerging',
                        minPoints: 6,
                        maxPoints: 6,
                        description: 'Needs more research.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Delivery',
                description: 'Eye contact, volume, and pacing.',
                weight: 30,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Strong',
                        minPoints: 10,
                        maxPoints: 10,
                        description: 'Engaging style and great voice.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Proficient',
                        minPoints: 8,
                        maxPoints: 8,
                        description: 'Clear and audible.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Emerging',
                        minPoints: 6,
                        maxPoints: 6,
                        description: 'Monotone or too quiet.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Visual Aids',
                description: 'Quality and use of slides or props.',
                weight: 30,
                levels: [
                    {
                        id: nanoid(),
                        label: 'Strong',
                        minPoints: 10,
                        maxPoints: 10,
                        description: 'Enhances presentation perfectly.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Proficient',
                        minPoints: 8,
                        maxPoints: 8,
                        description: 'Supportive but basic.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: 'Emerging',
                        minPoints: 6,
                        maxPoints: 6,
                        description: 'Distracting or poorly made.',
                        subItems: [],
                    },
                ],
            },
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#047857' },
    },

    // ── IB MYP Language Acquisition ─────────────────────────────────────────
    {
        name: 'IB MYP Language Acquisition',
        subject: 'IB / Language',
        description:
            'MYP Language Acquisition rubric: four criteria (A–D), each scored 0–8. Used across MYP Years 1–5.',
        criteria: [
            {
                id: nanoid(),
                title: 'Criterion A: Listening',
                description:
                    'Understanding of spoken language: identifying main ideas, details, purpose, attitude and opinion.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '7–8',
                        minPoints: 7,
                        maxPoints: 8,
                        description:
                            'Identifies the main ideas and supporting details. Deduces meaning of unfamiliar language. Identifies attitude and opinion.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '5–6',
                        minPoints: 5,
                        maxPoints: 6,
                        description:
                            'Generally identifies main ideas and relevant details. Usually deduces meaning from context.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3–4',
                        minPoints: 3,
                        maxPoints: 4,
                        description:
                            'Identifies some main ideas and key details with some assistance. Limited deduction of unfamiliar language.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–2',
                        minPoints: 1,
                        maxPoints: 2,
                        description:
                            'Identifies a few isolated words or phrases. Requires significant support.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '0',
                        minPoints: 0,
                        maxPoints: 0,
                        description: 'Does not reach a standard described by any of the descriptors below.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion B: Reading',
                description:
                    'Understanding of written language: main ideas, details, purpose, implicit meaning and features of text types.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '7–8',
                        minPoints: 7,
                        maxPoints: 8,
                        description:
                            'Identifies main ideas, supporting details and implicit meaning. Understands features of text types. Deduces meaning of unfamiliar language.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '5–6',
                        minPoints: 5,
                        maxPoints: 6,
                        description:
                            'Generally identifies main ideas and explicit details. Usually recognises features of text types.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3–4',
                        minPoints: 3,
                        maxPoints: 4,
                        description:
                            'Identifies some main ideas; has limited awareness of text features.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–2',
                        minPoints: 1,
                        maxPoints: 2,
                        description:
                            'Identifies isolated words or simple phrases with significant support.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '0',
                        minPoints: 0,
                        maxPoints: 0,
                        description: 'Does not reach a standard described by any of the descriptors below.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion C: Speaking',
                description:
                    'Spoken communication: range and accuracy of language, fluency, and interaction.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '7–8',
                        minPoints: 7,
                        maxPoints: 8,
                        description:
                            'Communicates clearly and effectively. Uses a wide range of vocabulary and structures with high accuracy. Maintains interaction with ease.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '5–6',
                        minPoints: 5,
                        maxPoints: 6,
                        description:
                            'Communicates with reasonable clarity. Generally uses appropriate vocabulary and structures. Sustains interaction with some hesitation.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3–4',
                        minPoints: 3,
                        maxPoints: 4,
                        description:
                            'Communicates basic ideas with limited vocabulary. Errors may impede communication. Requires prompting.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–2',
                        minPoints: 1,
                        maxPoints: 2,
                        description:
                            'Communicates isolated words or memorised phrases. Errors frequently impede communication.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '0',
                        minPoints: 0,
                        maxPoints: 0,
                        description: 'Does not reach a standard described by any of the descriptors below.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion D: Writing',
                description:
                    'Written communication: range and accuracy of language, organisation, and text type conventions.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '7–8',
                        minPoints: 7,
                        maxPoints: 8,
                        description:
                            'Communicates with clarity and detail. Wide range of vocabulary and structures used accurately. Text type conventions consistently applied.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '5–6',
                        minPoints: 5,
                        maxPoints: 6,
                        description:
                            'Communicates with reasonable clarity. Generally accurate vocabulary and structures. Text type conventions mostly observed.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3–4',
                        minPoints: 3,
                        maxPoints: 4,
                        description:
                            'Communicates basic information with limited vocabulary. Errors are present but meaning is generally clear.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–2',
                        minPoints: 1,
                        maxPoints: 2,
                        description:
                            'Produces isolated words or simple memorised phrases. Meaning is often unclear.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '0',
                        minPoints: 0,
                        maxPoints: 0,
                        description: 'Does not reach a standard described by any of the descriptors below.',
                        subItems: [],
                    },
                ],
            },
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#1d4ed8' },
    },

    // ── IB DP Language A: Literature ────────────────────────────────────────
    {
        name: 'IB DP Language A: Literature',
        subject: 'IB / Literature',
        description:
            'IB Diploma Language A: Literature rubric for written tasks and literary analysis. Four criteria, each 0–5.',
        criteria: [
            {
                id: nanoid(),
                title: 'Criterion A: Knowledge and Understanding',
                description: 'Knowledge and understanding of the work studied and the tasks set.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '5',
                        minPoints: 5,
                        maxPoints: 5,
                        description:
                            'Excellent knowledge and understanding. Thorough engagement with the text and precise understanding of the task.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '4',
                        minPoints: 4,
                        maxPoints: 4,
                        description:
                            'Good knowledge and understanding. Mostly thorough engagement with the text.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3',
                        minPoints: 3,
                        maxPoints: 3,
                        description:
                            'Adequate knowledge and understanding. Some engagement with the text but understanding is partial.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '2',
                        minPoints: 2,
                        maxPoints: 2,
                        description:
                            'Limited knowledge and understanding. Superficial engagement with the text.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1',
                        minPoints: 1,
                        maxPoints: 1,
                        description:
                            'Minimal knowledge and understanding. Little or no engagement with the text.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion B: Understanding of the Use and Effects of Stylistic Features',
                description: 'Recognition and analysis of literary techniques and their effects.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '5',
                        minPoints: 5,
                        maxPoints: 5,
                        description:
                            'Excellent understanding of stylistic features and their effects on meaning. Insightful analysis.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '4',
                        minPoints: 4,
                        maxPoints: 4,
                        description:
                            'Good understanding of stylistic features. Mostly accurate analysis of effects.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3',
                        minPoints: 3,
                        maxPoints: 3,
                        description:
                            'Adequate identification of stylistic features with some analysis of effects.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '2',
                        minPoints: 2,
                        maxPoints: 2,
                        description:
                            'Limited identification of stylistic features. Analysis is superficial.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1',
                        minPoints: 1,
                        maxPoints: 1,
                        description:
                            'Minimal or no identification of stylistic features.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion C: Organisation and Development',
                description: 'Structure, development of ideas, and coherence of the written task.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '5',
                        minPoints: 5,
                        maxPoints: 5,
                        description:
                            'Ideas are clearly organised and effectively developed. Argument is logical, coherent and convincing throughout.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '4',
                        minPoints: 4,
                        maxPoints: 4,
                        description:
                            'Ideas are mostly well organised. Argument is generally coherent and developed.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3',
                        minPoints: 3,
                        maxPoints: 3,
                        description:
                            'Some organisation evident. Ideas are partially developed; argument lacks full coherence.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '2',
                        minPoints: 2,
                        maxPoints: 2,
                        description:
                            'Limited organisation. Ideas are underdeveloped or poorly connected.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1',
                        minPoints: 1,
                        maxPoints: 1,
                        description:
                            'Minimal organisation. Ideas are disjointed or absent.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion D: Language',
                description: 'Accuracy, range and register of written language.',
                weight: 25,
                levels: [
                    {
                        id: nanoid(),
                        label: '5',
                        minPoints: 5,
                        maxPoints: 5,
                        description:
                            'Language is accurate, varied and effective. Register and style are consistently appropriate to the task.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '4',
                        minPoints: 4,
                        maxPoints: 4,
                        description:
                            'Language is mostly accurate with a good range of vocabulary and structures. Register is generally appropriate.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3',
                        minPoints: 3,
                        maxPoints: 3,
                        description:
                            'Language is adequate with some errors. Vocabulary and structures are limited but mostly appropriate.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '2',
                        minPoints: 2,
                        maxPoints: 2,
                        description:
                            'Frequent errors impede communication. Limited vocabulary and range of structures.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1',
                        minPoints: 1,
                        maxPoints: 1,
                        description:
                            'Pervasive errors. Very limited vocabulary; meaning is frequently unclear.',
                        subItems: [],
                    },
                ],
            },
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#7c3aed' },
    },

    // ── IB DP Language B ────────────────────────────────────────────────────
    {
        name: 'IB DP Language B',
        subject: 'IB / Language B',
        description:
            'IB Diploma Language B rubric for written tasks. Three criteria covering language, message, and format.',
        criteria: [
            {
                id: nanoid(),
                title: 'Criterion A: Language',
                description:
                    'Range and accuracy of vocabulary, grammatical structures, and language in context.',
                weight: 40,
                levels: [
                    {
                        id: nanoid(),
                        label: '16–20',
                        minPoints: 16,
                        maxPoints: 20,
                        description:
                            'Varied and accurate language throughout. Occasional errors do not impede communication. Register consistently appropriate.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '11–15',
                        minPoints: 11,
                        maxPoints: 15,
                        description:
                            'Mostly accurate language. Some errors that rarely impede communication. Register generally appropriate.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '6–10',
                        minPoints: 6,
                        maxPoints: 10,
                        description:
                            'Adequate language with frequent errors. Meaning is generally clear but register may be inconsistent.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–5',
                        minPoints: 1,
                        maxPoints: 5,
                        description:
                            'Limited language with many errors that often impede communication.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion B: Message',
                description:
                    'Development and support of ideas relevant to the task; relevance to the purpose.',
                weight: 40,
                levels: [
                    {
                        id: nanoid(),
                        label: '16–20',
                        minPoints: 16,
                        maxPoints: 20,
                        description:
                            'Ideas are relevant, well developed, and supported. Clear engagement with the task and audience.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '11–15',
                        minPoints: 11,
                        maxPoints: 15,
                        description:
                            'Ideas are relevant and generally developed. Mostly addresses the task and audience.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '6–10',
                        minPoints: 6,
                        maxPoints: 10,
                        description:
                            'Ideas are partially developed. Task requirements are partially addressed.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–5',
                        minPoints: 1,
                        maxPoints: 5,
                        description:
                            'Ideas are underdeveloped or irrelevant. Task requirements are minimally addressed.',
                        subItems: [],
                    },
                ],
            },
            {
                id: nanoid(),
                title: 'Criterion C: Conceptual Understanding (Format)',
                description:
                    'Awareness and application of the text type conventions and structure of the chosen format.',
                weight: 20,
                levels: [
                    {
                        id: nanoid(),
                        label: '5',
                        minPoints: 5,
                        maxPoints: 5,
                        description:
                            'Clear understanding and consistent application of the conventions of the chosen text type.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '4',
                        minPoints: 4,
                        maxPoints: 4,
                        description:
                            'Good understanding of text type conventions; mostly applied correctly.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '3',
                        minPoints: 3,
                        maxPoints: 3,
                        description:
                            'Adequate awareness of text type conventions; partially applied.',
                        subItems: [],
                    },
                    {
                        id: nanoid(),
                        label: '1–2',
                        minPoints: 1,
                        maxPoints: 2,
                        description:
                            'Limited awareness of text type conventions; rarely applied.',
                        subItems: [],
                    },
                ],
            },
        ],
        format: { ...DEFAULT_FORMAT, headerColor: '#0369a1' },
    },
];
