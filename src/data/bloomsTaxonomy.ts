export interface BloomLevel {
    id: string;
    order: number;
    labelEn: string;
    labelNl: string;
    color: string;
    verbsEn: string[];
    verbsNl: string[];
    descriptors: BloomDescriptor[];
}

export interface BloomDescriptor {
    id: string;
    levelId: string;
    descriptionEn: string;
    descriptionNl: string;
}

export const BLOOM_LEVELS: BloomLevel[] = [
    {
        id: 'remember',
        order: 1,
        labelEn: 'Remember',
        labelNl: 'Onthouden',
        color: '#ef4444',
        verbsEn: ['define', 'list', 'recall', 'recognise', 'repeat', 'name', 'identify'],
        verbsNl: ['definiëren', 'opsommen', 'herinneren', 'herkennen', 'herhalen', 'benoemen', 'identificeren'],
        descriptors: [
            {
                id: 'bl-rem-1',
                levelId: 'remember',
                descriptionEn: 'Can recall key terms, facts, and definitions from memory.',
                descriptionNl: 'Kan sleutelbegrippen, feiten en definities uit het geheugen reproduceren.',
            },
            {
                id: 'bl-rem-2',
                levelId: 'remember',
                descriptionEn: 'Can recognise and identify specific elements, steps, or features when presented.',
                descriptionNl:
                    'Kan specifieke elementen, stappen of kenmerken herkennen en benoemen wanneer deze worden aangeboden.',
            },
            {
                id: 'bl-rem-3',
                levelId: 'remember',
                descriptionEn: 'Can list or reproduce previously learned information in the correct order.',
                descriptionNl: 'Kan eerder geleerde informatie in de juiste volgorde opsommen of reproduceren.',
            },
        ],
    },
    {
        id: 'understand',
        order: 2,
        labelEn: 'Understand',
        labelNl: 'Begrijpen',
        color: '#f97316',
        verbsEn: ['explain', 'summarise', 'classify', 'describe', 'interpret', 'compare', 'paraphrase'],
        verbsNl: [
            'uitleggen',
            'samenvatten',
            'classificeren',
            'beschrijven',
            'interpreteren',
            'vergelijken',
            'parafraseren',
        ],
        descriptors: [
            {
                id: 'bl-und-1',
                levelId: 'understand',
                descriptionEn: 'Can explain ideas or concepts in own words, demonstrating genuine understanding.',
                descriptionNl: 'Kan ideeën of concepten in eigen woorden uitleggen, wat oprecht begrip aantoont.',
            },
            {
                id: 'bl-und-2',
                levelId: 'understand',
                descriptionEn: 'Can summarise the main points of a text, lecture, or visual source.',
                descriptionNl: 'Kan de hoofdpunten van een tekst, les of visuele bron samenvatten.',
            },
            {
                id: 'bl-und-3',
                levelId: 'understand',
                descriptionEn: 'Can classify objects, events, or phenomena based on shared characteristics.',
                descriptionNl:
                    'Kan objecten, gebeurtenissen of verschijnselen indelen op basis van gedeelde kenmerken.',
            },
        ],
    },
    {
        id: 'apply',
        order: 3,
        labelEn: 'Apply',
        labelNl: 'Toepassen',
        color: '#eab308',
        verbsEn: ['demonstrate', 'solve', 'use', 'implement', 'execute', 'carry out', 'show'],
        verbsNl: ['demonstreren', 'oplossen', 'gebruiken', 'implementeren', 'uitvoeren', 'toepassen', 'aantonen'],
        descriptors: [
            {
                id: 'bl-app-1',
                levelId: 'apply',
                descriptionEn: 'Can apply a learned procedure or rule to solve a familiar type of problem.',
                descriptionNl:
                    'Kan een aangeleerde procedure of regel toepassen om een bekend type probleem op te lossen.',
            },
            {
                id: 'bl-app-2',
                levelId: 'apply',
                descriptionEn: 'Can demonstrate a skill or technique in a context not previously practised.',
                descriptionNl: 'Kan een vaardigheid of techniek toepassen in een niet eerder geoefende context.',
            },
            {
                id: 'bl-app-3',
                levelId: 'apply',
                descriptionEn: 'Can use acquired knowledge to complete a real-world task or project.',
                descriptionNl: 'Kan verworven kennis gebruiken om een realistische taak of project te voltooien.',
            },
        ],
    },
    {
        id: 'analyse',
        order: 4,
        labelEn: 'Analyse',
        labelNl: 'Analyseren',
        color: '#22c55e',
        verbsEn: ['differentiate', 'organise', 'attribute', 'examine', 'compare', 'deconstruct', 'distinguish'],
        verbsNl: [
            'onderscheiden',
            'ordenen',
            'toeschrijven',
            'onderzoeken',
            'vergelijken',
            'deconstrueren',
            'differentiëren',
        ],
        descriptors: [
            {
                id: 'bl-ana-1',
                levelId: 'analyse',
                descriptionEn:
                    'Can break complex information into its component parts and examine each systematically.',
                descriptionNl:
                    'Kan complexe informatie opsplitsen in componenten en elk onderdeel systematisch onderzoeken.',
            },
            {
                id: 'bl-ana-2',
                levelId: 'analyse',
                descriptionEn: 'Can identify relationships, patterns, and connections between ideas or data.',
                descriptionNl: 'Kan relaties, patronen en verbanden tussen ideeën of gegevens identificeren.',
            },
            {
                id: 'bl-ana-3',
                levelId: 'analyse',
                descriptionEn: 'Can distinguish relevant from irrelevant information and explain the difference.',
                descriptionNl: 'Kan relevante van irrelevante informatie onderscheiden en het verschil toelichten.',
            },
        ],
    },
    {
        id: 'evaluate',
        order: 5,
        labelEn: 'Evaluate',
        labelNl: 'Evalueren',
        color: '#3b82f6',
        verbsEn: ['judge', 'argue', 'defend', 'assess', 'critique', 'justify', 'appraise'],
        verbsNl: ['beoordelen', 'argumenteren', 'verdedigen', 'evalueren', 'bekritiseren', 'rechtvaardigen', 'taxeren'],
        descriptors: [
            {
                id: 'bl-eva-1',
                levelId: 'evaluate',
                descriptionEn: 'Can assess the quality, credibility, or relevance of information using clear criteria.',
                descriptionNl:
                    'Kan de kwaliteit, geloofwaardigheid of relevantie van informatie beoordelen aan de hand van duidelijke criteria.',
            },
            {
                id: 'bl-eva-2',
                levelId: 'evaluate',
                descriptionEn: 'Can construct and defend a reasoned argument supported by evidence.',
                descriptionNl: 'Kan een onderbouwd betoog opbouwen en verdedigen met bewijzen.',
            },
            {
                id: 'bl-eva-3',
                levelId: 'evaluate',
                descriptionEn:
                    'Can critique a work, approach, or solution by identifying both strengths and limitations.',
                descriptionNl:
                    'Kan een werk, aanpak of oplossing beoordelen door zowel sterke punten als beperkingen te identificeren.',
            },
        ],
    },
    {
        id: 'create',
        order: 6,
        labelEn: 'Create',
        labelNl: 'Creëren',
        color: '#8b5cf6',
        verbsEn: ['design', 'construct', 'plan', 'produce', 'invent', 'compose', 'generate'],
        verbsNl: ['ontwerpen', 'construeren', 'plannen', 'produceren', 'uitvinden', 'componeren', 'genereren'],
        descriptors: [
            {
                id: 'bl-cre-1',
                levelId: 'create',
                descriptionEn: 'Can design and produce an original product, plan, or composition.',
                descriptionNl: 'Kan een origineel product, plan of compositie ontwerpen en produceren.',
            },
            {
                id: 'bl-cre-2',
                levelId: 'create',
                descriptionEn: 'Can combine ideas or elements in a novel way to generate a new, coherent whole.',
                descriptionNl:
                    'Kan ideeën of elementen op een vernieuwende manier combineren om een nieuw, samenhangend geheel te creëren.',
            },
            {
                id: 'bl-cre-3',
                levelId: 'create',
                descriptionEn: 'Can formulate hypotheses and propose creative solutions to novel problems.',
                descriptionNl: 'Kan hypothesen formuleren en creatieve oplossingen voorstellen voor nieuwe problemen.',
            },
        ],
    },
];

export function getBloomDescriptors(levelId?: string): BloomDescriptor[] {
    if (!levelId) {
        return BLOOM_LEVELS.flatMap((l) => l.descriptors);
    }
    return BLOOM_LEVELS.find((l) => l.id === levelId)?.descriptors ?? [];
}

export function getBloomLevel(id: string): BloomLevel | undefined {
    return BLOOM_LEVELS.find((l) => l.id === id);
}
