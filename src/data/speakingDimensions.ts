import type { RubricCriterion, VoTrack } from '../types';
import { nanoid } from '../utils/nanoid';

/**
 * Pre-built speaking assessment criteria aligned to Dutch VO CEFR targets.
 * 6 dimensions, each scored 0–4, following CEFR B1/B1+/B2 descriptor conventions.
 * Track-specific phrasing is applied for VMBO vs. HAVO/VWO.
 */

type Lang = 'en' | 'nl';

interface LevelDef {
    label_en: string;
    label_nl: string;
    desc_en: string;
    desc_nl: string;
    min: number;
    max: number;
}

interface DimensionDef {
    id_base: string;
    title_en: string;
    title_nl: string;
    levels_lower: LevelDef[];   // VMBO-BB/KB
    levels_mid: LevelDef[];     // VMBO-TL / HAVO
    levels_upper: LevelDef[];   // VWO
}

const DIMENSIONS: DimensionDef[] = [
    {
        id_base: 'task_achievement',
        title_en: 'Task Achievement',
        title_nl: 'Taakvervulling',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Does not complete the task. Very little relevant content.', desc_nl: 'Voert de taak niet uit. Nauwelijks relevante inhoud.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Completes the task partially. Some relevant content but limited.', desc_nl: 'Voert de taak gedeeltelijk uit. Enige relevante inhoud, maar beperkt.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Completes the task adequately with mostly relevant content.', desc_nl: 'Voert de taak voldoende uit met voornamelijk relevante inhoud.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Completes the task fully. Content is relevant, clear and well-developed.', desc_nl: 'Voert de taak volledig uit. Inhoud is relevant, duidelijk en goed uitgewerkt.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Task not completed. Little or no relevant content. Misses the communicative goal.', desc_nl: 'Taak niet volbracht. Weinig of geen relevante inhoud. Communicatief doel niet bereikt.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Completes the basic task. Communicative goal partly achieved; some gaps in content.', desc_nl: 'Basisopdracht volbracht. Communicatief doel gedeeltelijk bereikt; inhoudelijke lacunes aanwezig.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Task completed clearly. Communicative goal achieved with adequate elaboration.', desc_nl: 'Taak duidelijk volbracht. Communicatief doel bereikt met voldoende uitwerking.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Task completed fully and effectively. Communicative goal achieved with rich and precise content.', desc_nl: 'Taak volledig en effectief volbracht. Communicatief doel bereikt met rijke en precieze inhoud.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Task barely completed. Communicative goal not achieved; content is irrelevant or highly inadequate.', desc_nl: 'Taak nauwelijks volbracht. Communicatief doel niet bereikt; inhoud is irrelevant of sterk ontoereikend.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Task partly completed. Communicative goal partly achieved with limited elaboration.', desc_nl: 'Taak gedeeltelijk volbracht. Communicatief doel gedeeltelijk bereikt met beperkte uitwerking.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Task clearly completed. Communicative goal achieved; content is relevant and well-structured.', desc_nl: 'Taak duidelijk volbracht. Communicatief doel bereikt; inhoud is relevant en goed gestructureerd.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Task fully and effectively completed. Communicative goal achieved with nuanced, well-elaborated content.', desc_nl: 'Taak volledig en effectief volbracht. Communicatief doel bereikt met genuanceerde, goed uitgewerkte inhoud.' },
        ],
    },
    {
        id_base: 'fluency',
        title_en: 'Fluency & Coherence',
        title_nl: 'Vloeiendheid & Samenhang',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Speech is very hesitant and broken. Hard to follow.', desc_nl: 'Spreekt zeer aarzelend en gebroken. Moeilijk te volgen.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Speech flows reasonably but with noticeable pauses and repetition.', desc_nl: 'Spreekt redelijk vloeiend maar met merkbare pauzes en herhaling.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Speech is mostly fluent with some hesitation. Ideas are connected.', desc_nl: 'Spreekt meestal vloeiend met enige aarzeling. Ideeën zijn verbonden.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Speech is fluent and well-paced. Ideas connect naturally.', desc_nl: 'Spreekt vloeiend en in een goed tempo. Ideeën verbinden vanzelfsprekend.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Very hesitant, fragmented speech. Frequent long pauses break communication.', desc_nl: 'Zeer aarzelende, gefragmenteerde spraak. Frequente lange pauzes onderbreken de communicatie.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Keeps going despite hesitations and false starts. Basic connectors used.', desc_nl: 'Spreekt door ondanks aarzeling en herstarts. Basisverbindingswoorden gebruikt.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Reasonably fluent with a variety of connectors. Pauses are short and natural.', desc_nl: 'Redelijk vloeiend met een verscheidenheid aan verbindingswoorden. Pauzes zijn kort en natuurlijk.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Fluid and confident delivery. Uses a range of discourse markers effectively.', desc_nl: 'Vloeiende en zelfverzekerde presentatie. Gebruikt effectief een scala aan discoursmarkers.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Highly hesitant and fragmented. Communication regularly breaks down.', desc_nl: 'Sterk aarzelend en gefragmenteerd. Communicatie valt regelmatig stil.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Maintains speech despite some breakdowns. Limited range of connectors.', desc_nl: 'Handhaaft de spraak ondanks enkele onderbrekingen. Beperkt gebruik van verbindingswoorden.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Fluent with natural pauses. Uses cohesive devices to structure speech.', desc_nl: 'Vloeiend met natuurlijke pauzes. Gebruikt cohesieve middelen om de spraak te structureren.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Highly fluent and coherent. Sophisticated use of discourse markers and cohesive devices.', desc_nl: 'Zeer vloeiend en coherent. Verfijnd gebruik van discoursmarkers en cohesieve middelen.' },
        ],
    },
    {
        id_base: 'vocabulary_range',
        title_en: 'Vocabulary Range',
        title_nl: 'Woordenschat',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Very limited vocabulary. Frequent errors prevent understanding.', desc_nl: 'Zeer beperkte woordenschat. Frequente fouten belemmeren begrip.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Basic vocabulary on familiar topics. Repetition and simple words.', desc_nl: 'Basiswoordenschat over vertrouwde onderwerpen. Herhaling en eenvoudige woorden.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Good range of vocabulary. Uses some topic-specific words.', desc_nl: 'Goede woordenschat. Gebruikt enkele vakspecifieke woorden.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Wide vocabulary used accurately. Effective use of topic-specific and idiomatic language.', desc_nl: 'Brede woordenschat nauwkeurig gebruikt. Effectief gebruik van vakspecifieke en idiomatische taal.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Vocabulary too limited for the task. Errors cause repeated misunderstandings.', desc_nl: 'Woordenschat te beperkt voor de taak. Fouten leiden tot herhaaldelijke misverstanden.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Sufficient vocabulary for familiar topics. Some inaccuracies and repetition.', desc_nl: 'Voldoende woordenschat voor vertrouwde onderwerpen. Enkele onnauwkeurigheden en herhalingen.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Varied vocabulary used mostly accurately. Can express nuance on most topics.', desc_nl: 'Gevarieerde woordenschat meestal nauwkeurig gebruikt. Kan nuance uitdrukken over de meeste onderwerpen.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Rich, precise vocabulary. Uses topic-specific, idiomatic and nuanced language appropriately.', desc_nl: 'Rijke, precieze woordenschat. Gebruikt vakspecifieke, idiomatische en genuanceerde taal op gepaste wijze.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Highly limited vocabulary. Pervasive errors obscure meaning.', desc_nl: 'Sterk beperkte woordenschat. Alomtegenwoordige fouten vertroebelen de betekenis.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Adequate vocabulary for most topics but limited in precision and range.', desc_nl: 'Voldoende woordenschat voor de meeste onderwerpen, maar beperkt in precisie en omvang.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Good range and accuracy. Uses collocations and topic-specific vocabulary effectively.', desc_nl: 'Goede omvang en nauwkeurigheid. Gebruikt collocaties en vakspecifieke woordenschat effectief.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Sophisticated vocabulary. Uses idiomatic, nuanced and context-appropriate language with high accuracy.', desc_nl: 'Verfijnde woordenschat. Gebruikt idiomatische, genuanceerde en contextgepaste taal met hoge nauwkeurigheid.' },
        ],
    },
    {
        id_base: 'grammar_accuracy',
        title_en: 'Grammar Accuracy',
        title_nl: 'Grammaticale Nauwkeurigheid',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Very frequent grammatical errors. Communication regularly breaks down.', desc_nl: 'Zeer frequente grammaticale fouten. Communicatie valt regelmatig stil.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Basic structures mostly correct. Errors with complex structures are common.', desc_nl: 'Basisstructuren meestal correct. Fouten in complexe structuren komen vaak voor.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Mostly accurate grammar. Some errors with complex structures but communication is clear.', desc_nl: 'Grammatica grotendeels correct. Enkele fouten in complexe structuren, maar communicatie is duidelijk.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'High accuracy across a range of structures. Errors are rare and minor.', desc_nl: 'Hoge nauwkeurigheid over een reeks structuren. Fouten zijn zeldzaam en gering.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Frequent systematic errors in basic and complex structures. Meaning often obscured.', desc_nl: 'Frequente systematische fouten in basis- en complexe structuren. Betekenis vaak onduidelijk.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Basic grammar mostly correct. Noticeable errors in complex structures; meaning usually clear.', desc_nl: 'Basisgrammatica grotendeels correct. Merkbare fouten in complexe structuren; betekenis doorgaans duidelijk.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Good grammatical control. Occasional errors in complex structures but self-correction evident.', desc_nl: 'Goede grammaticale beheersing. Incidentele fouten in complexe structuren, maar zelfcorrectie zichtbaar.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Consistently high accuracy. Errors are rare; control of complex structures is evident.', desc_nl: 'Consequent hoge nauwkeurigheid. Fouten zijn zeldzaam; beheersing van complexe structuren is zichtbaar.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Pervasive grammatical errors impede communication significantly.', desc_nl: 'Alomtegenwoordige grammaticale fouten belemmeren de communicatie aanzienlijk.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Generally accurate in simple structures; errors in complex structures limit precision.', desc_nl: 'Over het algemeen nauwkeurig in eenvoudige structuren; fouten in complexe structuren beperken de precisie.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Good grammatical accuracy with a range of structures. Self-correction used effectively.', desc_nl: 'Goede grammaticale nauwkeurigheid met een reeks structuren. Zelfcorrectie effectief ingezet.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Near-native accuracy. Full control of complex structures; errors are negligible.', desc_nl: 'Bijna moedertaalniveau. Volledige beheersing van complexe structuren; fouten zijn verwaarloosbaar.' },
        ],
    },
    {
        id_base: 'pronunciation',
        title_en: 'Pronunciation',
        title_nl: 'Uitspraak',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Pronunciation is very difficult to understand. Communication frequently breaks down.', desc_nl: 'Uitspraak is zeer moeilijk te begrijpen. Communicatie valt vaak stil.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Pronunciation sometimes causes misunderstanding but message is mostly clear.', desc_nl: 'Uitspraak veroorzaakt soms misverstanden maar boodschap is meestal duidelijk.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Pronunciation is clear and understandable. Accent may be noticeable but does not impede.', desc_nl: 'Uitspraak is duidelijk en verstaanbaar. Accent kan merkbaar zijn maar belemmert niet.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Clear and natural pronunciation. Good control of stress and intonation.', desc_nl: 'Duidelijke en natuurlijke uitspraak. Goede beheersing van klemtoon en intonatie.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Very unclear pronunciation. Requires significant effort from listener; communication often breaks down.', desc_nl: 'Zeer onduidelijke uitspraak. Vereist aanzienlijke inspanning van de luisteraar; communicatie valt vaak stil.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Pronunciation sometimes unclear. Accent and errors occasionally cause misunderstanding.', desc_nl: 'Uitspraak soms onduidelijk. Accent en fouten veroorzaken incidenteel misverstanden.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Generally clear pronunciation. Stress and intonation mostly appropriate. Accent does not impede.', desc_nl: 'Uitspraak doorgaans duidelijk. Klemtoon en intonatie grotendeels passend. Accent belemmert niet.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Very clear pronunciation with natural stress and intonation. Accent, if present, is minimal and does not distract.', desc_nl: 'Zeer duidelijke uitspraak met natuurlijke klemtoon en intonatie. Accent, indien aanwezig, is minimaal en leidt niet af.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Pronunciation frequently impedes communication. Significant difficulties with stress, intonation and individual sounds.', desc_nl: 'Uitspraak belemmert communicatie regelmatig. Significante problemen met klemtoon, intonatie en individuele klanken.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Generally intelligible but with noticeable errors in stress or intonation that occasionally cause misunderstanding.', desc_nl: 'Doorgaans verstaanbaar maar met merkbare fouten in klemtoon of intonatie die incidenteel misverstanden veroorzaken.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Clear and natural-sounding. Good control of stress and intonation; occasional errors do not impede.', desc_nl: 'Duidelijk en natuurlijk klinkend. Goede beheersing van klemtoon en intonatie; incidentele fouten belemmeren niet.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Near-native clarity. Highly accurate stress, rhythm and intonation; individual sound production is consistently correct.', desc_nl: 'Bijna moedertaalheldere uitspraak. Zeer nauwkeurige klemtoon, ritme en intonatie; individuele klanken worden consequent correct geproduceerd.' },
        ],
    },
    {
        id_base: 'interaction',
        title_en: 'Interaction & Communication Strategies',
        title_nl: 'Interactie & Communicatiestrategieën',
        levels_lower: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Cannot maintain interaction. Does not respond to the interlocutor.', desc_nl: 'Kan interactie niet onderhouden. Reageert niet op de gesprekspartner.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Can interact in simple, predictable exchanges. Uses basic strategies to keep conversation going.', desc_nl: 'Kan eenvoudige, voorspelbare uitwisselingen onderhouden. Gebruikt basisstrategieën om het gesprek gaande te houden.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Participates actively. Uses repair strategies and can clarify meaning when needed.', desc_nl: 'Neemt actief deel. Gebruikt herstelstrategieën en kan betekenis verduidelijken wanneer nodig.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Engages actively and flexibly. Initiates and maintains interaction; uses a range of communication strategies.', desc_nl: 'Neemt actief en flexibel deel. Initieert en onderhoudt interactie; gebruikt een reeks communicatiestrategieën.' },
        ],
        levels_mid: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Fails to maintain interaction. Unable to respond to or initiate exchanges.', desc_nl: 'Slaagt er niet in interactie te onderhouden. Niet in staat te reageren op of uitwisselingen te initiëren.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Can handle simple exchanges. Some use of turn-taking and basic repair strategies.', desc_nl: 'Kan eenvoudige uitwisselingen aangaan. Enig gebruik van beurtwisseling en basisreparatiestrategieën.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Actively participates. Uses paraphrasing and clarification. Turn-taking is natural.', desc_nl: 'Neemt actief deel. Gebruikt parafrasering en verduidelijking. Beurtwisseling is natuurlijk.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Highly effective interaction. Initiates, maintains and closes exchanges naturally. Skilled use of communication strategies.', desc_nl: 'Zeer effectieve interactie. Initieert, onderhoudt en sluit uitwisselingen op natuurlijke wijze. Bekwaam gebruik van communicatiestrategieën.' },
        ],
        levels_upper: [
            { label_en: 'Insufficient', label_nl: 'Onvoldoende', min: 0, max: 1, desc_en: 'Cannot sustain interaction. Communication strategies are absent or ineffective.', desc_nl: 'Kan interactie niet volhouden. Communicatiestrategieën ontbreken of zijn ineffectief.' },
            { label_en: 'Adequate', label_nl: 'Voldoende', min: 1, max: 2, desc_en: 'Maintains basic interaction. Uses limited range of strategies; turn-taking can be awkward.', desc_nl: 'Onderhoudt basisinteractie. Gebruikt een beperkt scala aan strategieën; beurtwisseling kan ongemakkelijk zijn.' },
            { label_en: 'Good', label_nl: 'Goed', min: 2, max: 3, desc_en: 'Participates effectively. Uses a range of communication strategies; repairs breakdowns confidently.', desc_nl: 'Neemt effectief deel. Gebruikt een reeks communicatiestrategieën; herstelt onderbrekingen zelfverzekerd.' },
            { label_en: 'Excellent', label_nl: 'Uitstekend', min: 3, max: 4, desc_en: 'Expert interaction. Initiates, steers and closes communication smoothly; sophisticated use of strategies.', desc_nl: 'Deskundige interactie. Initieert, stuurt en sluit communicatie soepel; verfijnd gebruik van strategieën.' },
        ],
    },
];

function getLevels(dim: DimensionDef, track: VoTrack | ''): LevelDef[] {
    if (track === 'vmbo-bb' || track === 'vmbo-kb') return dim.levels_lower;
    if (track === 'vwo') return dim.levels_upper;
    return dim.levels_mid;
}

export function getSpeakingDimensions(track: VoTrack | '' = ''): RubricCriterion[] {
    return DIMENSIONS.map(dim => {
        const levels = getLevels(dim, track);
        return {
            id: nanoid(),
            title: dim.title_en,
            description: '',
            weight: Math.round(100 / DIMENSIONS.length),
            levels: levels.map(l => ({
                id: nanoid(),
                label: l.label_en,
                minPoints: l.min,
                maxPoints: l.max,
                description: l.desc_en,
                subItems: [],
            })),
            linkedStandards: [],
            cefrDescriptors: [],
        } satisfies RubricCriterion;
    });
}
