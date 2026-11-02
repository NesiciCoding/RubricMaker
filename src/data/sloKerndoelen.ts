// SLO kerndoelen for the subject English (Engels) — primary (PO) and lower-secondary (VO) education.
// The Dutch wording is SLO's own and authoritative; the English is a rendering of it. Only English is
// covered on purpose: SLO publishes goals for every subject, and this file is not a curriculum database.
// Primary and secondary both number a kerndoel 34, so every id and label carries the phase.
import type { LinkedFrameworkDescriptor } from '../types';

export type SloPhase = 'po' | 'vo';

export interface SloGoal {
    id: string;
    /** The goal's code as SLO prints it, e.g. "35D". */
    code: string;
    descriptionEn: string;
    descriptionNl: string;
}

export interface SloKerndoel {
    id: string;
    phase: SloPhase;
    number: string;
    /** Short label for chips and chart sectors, e.g. "VO · Kerndoel 35". */
    labelEn: string;
    labelNl: string;
    /** The kerndoel statement itself. */
    titleEn: string;
    titleNl: string;
    color: string;
    goals: SloGoal[];
}

export const SLO_PHASES: SloPhase[] = ['po', 'vo'];

export const SLO_KERNDOELEN: SloKerndoel[] = [
    {
        id: 'slo-po-33',
        phase: 'po',
        number: '33',
        labelEn: 'Primary · Core goal 33',
        labelNl: 'PO · Kerndoel 33',
        titleEn: 'The pupil communicates in English.',
        titleNl: 'De leerling communiceert in het Engels.',
        color: '#2563eb',
        goals: [
            {
                id: 'slo-po-33a',
                code: '33A',
                descriptionEn:
                    'The pupil shows understanding of English-language texts they have listened to, watched and read.',
                descriptionNl: 'De leerling toont begrip van beluisterde, bekeken en gelezen Engelstalige teksten.',
            },
            {
                id: 'slo-po-33b',
                code: '33B',
                descriptionEn:
                    'The pupil speaks and holds conversations in English, suited to purpose, audience and context.',
                descriptionNl:
                    'De leerling spreekt en voert gesprekken in de Engelse taal, afgestemd op doel, publiek en context.',
            },
            {
                id: 'slo-po-33c',
                code: '33C',
                descriptionEn: 'The pupil writes in English, suited to purpose, audience and context.',
                descriptionNl: 'De leerling schrijft in het Engels, afgestemd op doel, publiek en context.',
            },
        ],
    },
    {
        id: 'slo-po-34',
        phase: 'po',
        number: '34',
        labelEn: 'Primary · Core goal 34',
        labelNl: 'PO · Kerndoel 34',
        titleEn: 'The pupil develops as a language- and culture-aware user of English.',
        titleNl: 'De leerling ontwikkelt zich als taal- en cultuurbewuste gebruiker van de Engelse taal.',
        color: '#7c3aed',
        goals: [
            {
                id: 'slo-po-34a',
                code: '34A',
                descriptionEn: 'The pupil explores suitable approaches to learning English.',
                descriptionNl: 'De leerling verkent passende aanpakken voor het leren van Engels.',
            },
            {
                id: 'slo-po-34b',
                code: '34B',
                descriptionEn:
                    'The pupil explores the cultures of people who speak English and of regions where English is spoken.',
                descriptionNl:
                    'De leerling verkent culturen van mensen die Engels spreken en van gebieden waar Engels wordt gesproken.',
            },
        ],
    },
    {
        id: 'slo-vo-34',
        phase: 'vo',
        number: '34',
        labelEn: 'Secondary · Core goal 34',
        labelNl: 'VO · Kerndoel 34',
        titleEn: 'The pupil uses English in rich and meaningful contexts.',
        titleNl: 'De leerling gebruikt de Engelse taal in rijke en betekenisvolle contexten.',
        color: '#0d9488',
        goals: [
            {
                id: 'slo-vo-34a',
                code: '34A',
                descriptionEn:
                    'The pupil gains experience with a rich range of English-language sources at a suitable proficiency level.',
                descriptionNl:
                    'De leerling doet ervaring op met een rijk aanbod aan bronnen in de Engelse taal op een passend beheersingsniveau.',
            },
            {
                id: 'slo-vo-34b',
                code: '34B',
                descriptionEn: 'The pupil uses English creatively.',
                descriptionNl: 'De leerling gebruikt de Engelse taal op een creatieve manier.',
            },
            {
                id: 'slo-vo-34c',
                code: '34C',
                descriptionEn:
                    'The pupil processes English-language texts orally and in writing to build knowledge and understanding.',
                descriptionNl:
                    'De leerling verwerkt Engelstalige teksten mondeling en schriftelijk om tot kennisopbouw en begrip te komen.',
            },
        ],
    },
    {
        id: 'slo-vo-35',
        phase: 'vo',
        number: '35',
        labelEn: 'Secondary · Core goal 35',
        labelNl: 'VO · Kerndoel 35',
        titleEn: 'The pupil communicates in English.',
        titleNl: 'De leerling communiceert in het Engels.',
        color: '#ea580c',
        goals: [
            {
                id: 'slo-vo-35a',
                code: '35A',
                descriptionEn: 'The pupil shows understanding of spoken and audiovisual English-language texts.',
                descriptionNl: 'De leerling toont begrip van auditieve en audiovisuele Engelstalige teksten.',
            },
            {
                id: 'slo-vo-35b',
                code: '35B',
                descriptionEn: 'The pupil shows understanding of written English-language texts.',
                descriptionNl: 'De leerling toont begrip van schriftelijke Engelstalige teksten.',
            },
            {
                id: 'slo-vo-35c',
                code: '35C',
                descriptionEn:
                    'The pupil speaks and holds conversations in English, suited to purpose, audience and context.',
                descriptionNl:
                    'De leerling spreekt en voert gesprekken in de Engelse taal, afgestemd op doel, publiek en context.',
            },
            {
                id: 'slo-vo-35d',
                code: '35D',
                descriptionEn: 'The pupil writes in English, suited to purpose, audience and context.',
                descriptionNl: 'De leerling schrijft in de Engelse taal, afgestemd op doel, publiek en context.',
            },
        ],
    },
    {
        id: 'slo-vo-36',
        phase: 'vo',
        number: '36',
        labelEn: 'Secondary · Core goal 36',
        labelNl: 'VO · Kerndoel 36',
        titleEn: 'The pupil develops as a language- and culture-aware user of English.',
        titleNl: 'De leerling ontwikkelt zich als taal- en cultuurbewuste gebruiker van de Engelse taal.',
        color: '#db2777',
        goals: [
            {
                id: 'slo-vo-36a',
                code: '36A',
                descriptionEn: 'The pupil chooses suitable approaches to learning English.',
                descriptionNl: 'De leerling kiest passende aanpakken voor het leren van Engels.',
            },
            {
                id: 'slo-vo-36b',
                code: '36B',
                descriptionEn: 'The pupil explores cultural aspects and cultural diversity in fiction and non-fiction.',
                descriptionNl:
                    'De leerling verkent culturele aspecten en culturele diversiteit in fictie en non-fictie.',
            },
            {
                id: 'slo-vo-36c',
                code: '36C',
                descriptionEn: 'The pupil uses cultural knowledge in intercultural communicative situations.',
                descriptionNl: 'De leerling gebruikt culturele kennis in interculturele communicatieve situaties.',
            },
        ],
    },
];

/** The shape a linked SLO goal is stored in on a criterion; the code leads the text so chips stay identifiable. */
export function sloGoalToFrameworkDescriptor(kerndoel: SloKerndoel, goal: SloGoal): LinkedFrameworkDescriptor {
    return {
        descriptorId: goal.id,
        framework: 'slo',
        categoryId: kerndoel.id,
        categoryLabelEn: kerndoel.labelEn,
        categoryLabelNl: kerndoel.labelNl,
        categoryColor: kerndoel.color,
        descriptionEn: `${goal.code} — ${goal.descriptionEn}`,
        descriptionNl: `${goal.code} — ${goal.descriptionNl}`,
    };
}
