import type { CefrDescriptor, CefrLevel, CefrSkill } from '../types';

/**
 * CEFR Can-Do descriptors based on the Common European Framework of Reference
 * for Languages (CEFR) and its 2020 Companion Volume.
 *
 * Organised by skill and level (A1–C2).
 * Used in Dutch secondary education as the ERK (Europees Referentiekader).
 */
export const CEFR_DESCRIPTORS: CefrDescriptor[] = [

    // ─── READING ──────────────────────────────────────────────────────────────

    { id: 'r-a1-1', level: 'A1', skill: 'reading', descriptionEn: 'Can understand very short, simple texts, picking up familiar names, words and basic phrases.', descriptionNl: 'Kan zeer korte, eenvoudige teksten begrijpen door vertrouwde namen, woorden en eenvoudige zinnen te herkennen.' },
    { id: 'r-a1-2', level: 'A1', skill: 'reading', descriptionEn: 'Can understand simple signs and notices in familiar everyday situations.', descriptionNl: 'Kan eenvoudige borden en aankondigingen in vertrouwde alledaagse situaties begrijpen.' },
    { id: 'r-a1-3', level: 'A1', skill: 'reading', descriptionEn: 'Can follow short, simple written directions (e.g. to get from X to Y on foot).', descriptionNl: 'Kan korte, eenvoudige schriftelijke aanwijzingen volgen (bijv. om van X naar Y te lopen).' },

    { id: 'r-a2-1', level: 'A2', skill: 'reading', descriptionEn: 'Can understand short, simple texts about familiar topics using everyday vocabulary.', descriptionNl: 'Kan korte, eenvoudige teksten over vertrouwde onderwerpen begrijpen met alledaags woordgebruik.' },
    { id: 'r-a2-2', level: 'A2', skill: 'reading', descriptionEn: 'Can find specific, predictable information in simple everyday texts such as advertisements, menus and timetables.', descriptionNl: 'Kan specifieke, voorspelbare informatie vinden in eenvoudige alledaagse teksten zoals advertenties, menu\'s en dienstregelingen.' },
    { id: 'r-a2-3', level: 'A2', skill: 'reading', descriptionEn: 'Can understand short personal letters and simple messages.', descriptionNl: 'Kan korte persoonlijke brieven en eenvoudige berichten begrijpen.' },
    { id: 'r-a2-4', level: 'A2', skill: 'reading', descriptionEn: 'Can understand the plot of a clearly structured story about everyday topics.', descriptionNl: 'Kan de inhoud van een duidelijk gestructureerd verhaal over alledaagse onderwerpen begrijpen.' },

    { id: 'r-b1-1', level: 'B1', skill: 'reading', descriptionEn: 'Can understand texts that consist mainly of high-frequency everyday language related to work, school, leisure, etc.', descriptionNl: 'Kan teksten begrijpen die voornamelijk bestaan uit veelgebruikte alledaagse taal met betrekking tot werk, school, vrije tijd enz.' },
    { id: 'r-b1-2', level: 'B1', skill: 'reading', descriptionEn: 'Can understand descriptions of events, feelings and wishes in personal letters.', descriptionNl: 'Kan beschrijvingen van gebeurtenissen, gevoelens en wensen in persoonlijke brieven begrijpen.' },
    { id: 'r-b1-3', level: 'B1', skill: 'reading', descriptionEn: 'Can identify the main conclusions in clearly signalled argumentative texts.', descriptionNl: 'Kan de belangrijkste conclusies identificeren in duidelijk gestructureerde betogerende teksten.' },
    { id: 'r-b1-4', level: 'B1', skill: 'reading', descriptionEn: 'Can scan longer texts to locate desired information, and gather information from different parts of a text to fulfil a specific task.', descriptionNl: 'Kan langere teksten doorscannen om gewenste informatie te vinden en informatie uit verschillende delen van een tekst verzamelen voor een specifieke taak.' },

    { id: 'r-b2-1', level: 'B2', skill: 'reading', descriptionEn: 'Can read with a large degree of independence, using dictionaries and reference material selectively.', descriptionNl: 'Kan grotendeels zelfstandig lezen en selectief gebruik maken van woordenboeken en naslagwerken.' },
    { id: 'r-b2-2', level: 'B2', skill: 'reading', descriptionEn: 'Can understand articles and reports on contemporary problems in which the writers take specific stances or viewpoints.', descriptionNl: 'Kan artikelen en rapporten over actuele problemen begrijpen waarin schrijvers specifieke standpunten innemen.' },
    { id: 'r-b2-3', level: 'B2', skill: 'reading', descriptionEn: 'Can understand in detail a wide range of texts likely to be encountered in social, professional or academic life.', descriptionNl: 'Kan een breed scala aan teksten gedetailleerd begrijpen die voorkomen in sociale, professionele of academische contexten.' },
    { id: 'r-b2-4', level: 'B2', skill: 'reading', descriptionEn: 'Can rapidly skim long and complex texts to identify relevant information.', descriptionNl: 'Kan lange en complexe teksten snel doornemen om relevante informatie te identificeren.' },

    { id: 'r-c1-1', level: 'C1', skill: 'reading', descriptionEn: 'Can understand in detail lengthy, complex texts, whether or not they relate to their field of specialty.', descriptionNl: 'Kan lange, complexe teksten gedetailleerd begrijpen, ongeacht of ze al dan niet betrekking hebben op hun specialisatiegebied.' },
    { id: 'r-c1-2', level: 'C1', skill: 'reading', descriptionEn: 'Can understand implicit meaning and recognise the writer\'s attitude and purpose in a wide range of texts.', descriptionNl: 'Kan impliciete betekenis begrijpen en de houding en het doel van de schrijver herkennen in een breed scala aan teksten.' },

    { id: 'r-c2-1', level: 'C2', skill: 'reading', descriptionEn: 'Can read and interpret virtually all forms of written language including abstract, structurally or linguistically complex texts.', descriptionNl: 'Kan vrijwel alle vormen van geschreven taal lezen en interpreteren, inclusief abstracte, structureel of linguïstisch complexe teksten.' },
    { id: 'r-c2-2', level: 'C2', skill: 'reading', descriptionEn: 'Can understand nuance, implicit attitude and tone in texts, including literary texts.', descriptionNl: 'Kan nuance, impliciete houding en toon in teksten begrijpen, inclusief literaire teksten.' },

    // ─── WRITING ──────────────────────────────────────────────────────────────

    { id: 'w-a1-1', level: 'A1', skill: 'writing', descriptionEn: 'Can write simple isolated phrases and sentences.', descriptionNl: 'Kan eenvoudige losse zinnen en zinsdelen schrijven.' },
    { id: 'w-a1-2', level: 'A1', skill: 'writing', descriptionEn: 'Can fill in forms with personal details such as name, nationality and address.', descriptionNl: 'Kan formulieren invullen met persoonlijke gegevens zoals naam, nationaliteit en adres.' },
    { id: 'w-a1-3', level: 'A1', skill: 'writing', descriptionEn: 'Can write a short, simple postcard or message.', descriptionNl: 'Kan een korte, eenvoudige ansichtkaart of berichtje schrijven.' },

    { id: 'w-a2-1', level: 'A2', skill: 'writing', descriptionEn: 'Can write short, simple notes and messages relating to matters of immediate need.', descriptionNl: 'Kan korte, eenvoudige notities en berichten schrijven over directe behoeften.' },
    { id: 'w-a2-2', level: 'A2', skill: 'writing', descriptionEn: 'Can write a very simple personal letter, for example thanking someone for something.', descriptionNl: 'Kan een zeer eenvoudige persoonlijke brief schrijven, bijvoorbeeld iemand bedanken voor iets.' },
    { id: 'w-a2-3', level: 'A2', skill: 'writing', descriptionEn: 'Can write short, simple descriptions of people, places or objects using simple words and phrases.', descriptionNl: 'Kan korte, eenvoudige beschrijvingen van mensen, plaatsen of objecten schrijven met eenvoudige woorden en zinnen.' },

    { id: 'w-b1-1', level: 'B1', skill: 'writing', descriptionEn: 'Can write straightforward connected texts on a range of familiar topics within their field of interest.', descriptionNl: 'Kan eenvoudige samenhangende teksten schrijven over een reeks vertrouwde onderwerpen binnen hun interessegebied.' },
    { id: 'w-b1-2', level: 'B1', skill: 'writing', descriptionEn: 'Can write personal letters describing experiences and impressions.', descriptionNl: 'Kan persoonlijke brieven schrijven en ervaringen en indrukken beschrijven.' },
    { id: 'w-b1-3', level: 'B1', skill: 'writing', descriptionEn: 'Can write brief reasons and explanations for opinions, plans and actions.', descriptionNl: 'Kan korte redenen en uitleg geven voor meningen, plannen en handelingen.' },
    { id: 'w-b1-4', level: 'B1', skill: 'writing', descriptionEn: 'Can use basic connectives (e.g. because, however, also) to link ideas into a coherent text.', descriptionNl: 'Kan basisverbindingswoorden (bijv. omdat, echter, ook) gebruiken om ideeën samen te voegen tot een samenhangende tekst.' },
    { id: 'w-b1-5', level: 'B1', skill: 'writing', descriptionEn: 'Can write simple formal letters (e.g. complaints, requests) following standard conventions.', descriptionNl: 'Kan eenvoudige formele brieven schrijven (bijv. klachten, verzoeken) volgens standaardconventies.' },

    { id: 'w-b2-1', level: 'B2', skill: 'writing', descriptionEn: 'Can write clear, detailed texts on a variety of subjects related to their field of interest.', descriptionNl: 'Kan duidelijke, gedetailleerde teksten schrijven over verschillende onderwerpen binnen hun interessegebied.' },
    { id: 'w-b2-2', level: 'B2', skill: 'writing', descriptionEn: 'Can write an essay or report presenting arguments for or against a particular point of view.', descriptionNl: 'Kan een opstel of rapport schrijven met argumenten voor of tegen een bepaald standpunt.' },
    { id: 'w-b2-3', level: 'B2', skill: 'writing', descriptionEn: 'Can write summaries and reviews of factual and literary texts.', descriptionNl: 'Kan samenvattingen en recensies van feitelijke en literaire teksten schrijven.' },
    { id: 'w-b2-4', level: 'B2', skill: 'writing', descriptionEn: 'Can express views and opinions with precision and link them to a coherent argument.', descriptionNl: 'Kan standpunten en meningen nauwkeurig uitdrukken en deze koppelen aan een samenhangend betoog.' },
    { id: 'w-b2-5', level: 'B2', skill: 'writing', descriptionEn: 'Can use a range of vocabulary and structures to vary expression and avoid repetition.', descriptionNl: 'Kan een breed scala aan woordenschat en structuren gebruiken om uitdrukkingen te variëren en herhaling te vermijden.' },

    { id: 'w-c1-1', level: 'C1', skill: 'writing', descriptionEn: 'Can write clear, well-structured texts of complex topics, showing controlled use of organisational patterns and connectives.', descriptionNl: 'Kan duidelijke, goed gestructureerde teksten schrijven over complexe onderwerpen, met gecontroleerd gebruik van organisatiepatronen en verbindingswoorden.' },
    { id: 'w-c1-2', level: 'C1', skill: 'writing', descriptionEn: 'Can write formal letters, essays and reports with a consistent and appropriate style and register.', descriptionNl: 'Kan formele brieven, opstellen en rapporten schrijven met een consistent en passend stijl en register.' },
    { id: 'w-c1-3', level: 'C1', skill: 'writing', descriptionEn: 'Can write and edit persuasive, evaluative or creative texts with rhetorical effect.', descriptionNl: 'Kan overtuigende, evaluatieve of creatieve teksten schrijven en bewerken met retorisch effect.' },

    { id: 'w-c2-1', level: 'C2', skill: 'writing', descriptionEn: 'Can write clear, smoothly flowing complex texts in an appropriate and effective style.', descriptionNl: 'Kan duidelijke, soepel lopende complexe teksten schrijven in een passende en effectieve stijl.' },
    { id: 'w-c2-2', level: 'C2', skill: 'writing', descriptionEn: 'Can write complex texts with precise language, nuanced meaning and well-judged organisation.', descriptionNl: 'Kan complexe teksten schrijven met nauwkeurige taal, genuanceerde betekenis en goed doordachte opbouw.' },

    // ─── SPEAKING — PRODUCTION (monologue) ───────────────────────────────────

    { id: 'sp-a1-1', level: 'A1', skill: 'speaking_production', descriptionEn: 'Can produce simple phrases about themselves and familiar people using basic vocabulary.', descriptionNl: 'Kan eenvoudige zinnen produceren over zichzelf en vertrouwde mensen met basiswoordenschat.' },
    { id: 'sp-a1-2', level: 'A1', skill: 'speaking_production', descriptionEn: 'Can describe where they live and people they know.', descriptionNl: 'Kan beschrijven waar ze wonen en mensen die ze kennen.' },

    { id: 'sp-a2-1', level: 'A2', skill: 'speaking_production', descriptionEn: 'Can use a series of phrases and sentences to describe in simple terms their family and other people, living conditions, educational background and present or most recent job.', descriptionNl: 'Kan een reeks zinnen gebruiken om in eenvoudige termen hun familie en andere mensen, leefomstandigheden, opleiding en huidige of meest recente baan te beschrijven.' },
    { id: 'sp-a2-2', level: 'A2', skill: 'speaking_production', descriptionEn: 'Can give a short, rehearsed presentation on a familiar topic.', descriptionNl: 'Kan een korte, ingestudeerde presentatie geven over een vertrouwd onderwerp.' },

    { id: 'sp-b1-1', level: 'B1', skill: 'speaking_production', descriptionEn: 'Can reasonably fluently maintain a straightforward description of topics within their field of interest, briefly giving reasons and explanations for opinions.', descriptionNl: 'Kan redelijk vloeiend een eenvoudige beschrijving geven van onderwerpen binnen hun interessegebied, waarbij ze kort redenen en uitleg geven voor meningen.' },
    { id: 'sp-b1-2', level: 'B1', skill: 'speaking_production', descriptionEn: 'Can give a prepared presentation on a topic, giving reasons for and against different viewpoints.', descriptionNl: 'Kan een voorbereide presentatie geven over een onderwerp, waarbij ze redenen voor en tegen verschillende standpunten geven.' },
    { id: 'sp-b1-3', level: 'B1', skill: 'speaking_production', descriptionEn: 'Can connect phrases in a simple way in order to describe experiences and events.', descriptionNl: 'Kan zinnen op een eenvoudige manier verbinden om ervaringen en gebeurtenissen te beschrijven.' },

    { id: 'sp-b2-1', level: 'B2', skill: 'speaking_production', descriptionEn: 'Can give clear, systematically developed presentations, with appropriate emphasis on significant points and relevant supporting detail.', descriptionNl: 'Kan duidelijke, systematisch uitgewerkte presentaties geven, met passende nadruk op belangrijke punten en relevante ondersteunende details.' },
    { id: 'sp-b2-2', level: 'B2', skill: 'speaking_production', descriptionEn: 'Can develop an argument systematically with appropriate highlighting of significant points.', descriptionNl: 'Kan een argument systematisch ontwikkelen met passende nadruk op significante punten.' },
    { id: 'sp-b2-3', level: 'B2', skill: 'speaking_production', descriptionEn: 'Can speak with a clear, natural pronunciation that is easy for a listener to follow.', descriptionNl: 'Kan spreken met een duidelijke, natuurlijke uitspraak die gemakkelijk te volgen is voor een luisteraar.' },

    { id: 'sp-c1-1', level: 'C1', skill: 'speaking_production', descriptionEn: 'Can give clear, detailed descriptions and presentations on complex topics, integrating sub-themes and developing particular points.', descriptionNl: 'Kan duidelijke, gedetailleerde beschrijvingen en presentaties geven over complexe onderwerpen, waarbij subthema\'s worden geïntegreerd en specifieke punten worden uitgewerkt.' },
    { id: 'sp-c1-2', level: 'C1', skill: 'speaking_production', descriptionEn: 'Can express ideas fluently and spontaneously with minimal effort, with only occasional searching for words.', descriptionNl: 'Kan ideeën vloeiend en spontaan uitdrukken met minimale inspanning, met slechts af en toe zoeken naar woorden.' },

    { id: 'sp-c2-1', level: 'C2', skill: 'speaking_production', descriptionEn: 'Can convey finer shades of meaning precisely by using a wide range of modification devices.', descriptionNl: 'Kan fijnere nuances van betekenis nauwkeurig overbrengen door gebruik te maken van een breed scala aan modificatieapparaten.' },
    { id: 'sp-c2-2', level: 'C2', skill: 'speaking_production', descriptionEn: 'Can speak fluently and spontaneously at length, with a natural, effortless flow.', descriptionNl: 'Kan vloeiend en spontaan uitgebreid spreken, met een natuurlijke, moeiteloze stroom.' },

    // ─── SPEAKING — INTERACTION (conversation) ────────────────────────────────

    { id: 'si-a1-1', level: 'A1', skill: 'speaking_interaction', descriptionEn: 'Can interact in a simple way, provided the other person talks slowly and clearly and is prepared to help.', descriptionNl: 'Kan op een eenvoudige manier communiceren, mits de andere persoon langzaam en duidelijk praat en bereid is te helpen.' },
    { id: 'si-a1-2', level: 'A1', skill: 'speaking_interaction', descriptionEn: 'Can ask and answer simple questions about themselves and familiar people or objects.', descriptionNl: 'Kan eenvoudige vragen stellen en beantwoorden over zichzelf en vertrouwde mensen of objecten.' },

    { id: 'si-a2-1', level: 'A2', skill: 'speaking_interaction', descriptionEn: 'Can communicate in simple, routine tasks requiring a simple and direct exchange of information.', descriptionNl: 'Kan communiceren in eenvoudige, routinematige taken die een eenvoudige en directe uitwisseling van informatie vereisen.' },
    { id: 'si-a2-2', level: 'A2', skill: 'speaking_interaction', descriptionEn: 'Can handle short social exchanges, even though they generally can\'t maintain the conversation themselves.', descriptionNl: 'Kan korte sociale uitwisselingen afhandelen, hoewel ze het gesprek over het algemeen niet zelf kunnen onderhouden.' },

    { id: 'si-b1-1', level: 'B1', skill: 'speaking_interaction', descriptionEn: 'Can deal with most situations likely to arise while travelling in an area where the language is spoken.', descriptionNl: 'Kan omgaan met de meeste situaties die zich voordoen tijdens reizen in een gebied waar de taal wordt gesproken.' },
    { id: 'si-b1-2', level: 'B1', skill: 'speaking_interaction', descriptionEn: 'Can enter unprepared into conversations on topics that are familiar, of personal interest or relevant to everyday life.', descriptionNl: 'Kan onvoorbereid deelnemen aan gesprekken over onderwerpen die vertrouwd, van persoonlijk belang of relevant zijn voor het dagelijks leven.' },
    { id: 'si-b1-3', level: 'B1', skill: 'speaking_interaction', descriptionEn: 'Can sustain a conversation or discussion but may sometimes be difficult to follow when trying to say exactly what they want.', descriptionNl: 'Kan een gesprek of discussie gaande houden, maar kan soms moeilijk te volgen zijn wanneer ze precies proberen te zeggen wat ze willen.' },

    { id: 'si-b2-1', level: 'B2', skill: 'speaking_interaction', descriptionEn: 'Can interact with a degree of fluency and spontaneity that makes regular interaction with native speakers quite possible.', descriptionNl: 'Kan communiceren met een mate van vloeiendheid en spontaniteit die regelmatige interactie met moedertaalsprekers heel goed mogelijk maakt.' },
    { id: 'si-b2-2', level: 'B2', skill: 'speaking_interaction', descriptionEn: 'Can take an active part in discussion in familiar contexts, accounting for and sustaining their views.', descriptionNl: 'Kan actief deelnemen aan discussies in vertrouwde contexten, waarbij ze hun standpunten onderbouwen en volhouden.' },
    { id: 'si-b2-3', level: 'B2', skill: 'speaking_interaction', descriptionEn: 'Can negotiate effectively and use persuasive language to achieve a shared outcome.', descriptionNl: 'Kan effectief onderhandelen en overtuigende taal gebruiken om een gedeeld resultaat te bereiken.' },

    { id: 'si-c1-1', level: 'C1', skill: 'speaking_interaction', descriptionEn: 'Can express themselves fluently and spontaneously in conversation, with only conceptually difficult subjects causing any hindrance.', descriptionNl: 'Kan zich vloeiend en spontaan uitdrukken in gesprekken, waarbij alleen conceptueel moeilijke onderwerpen enige belemmering vormen.' },
    { id: 'si-c1-2', level: 'C1', skill: 'speaking_interaction', descriptionEn: 'Can use language flexibly and effectively for social and professional purposes, including emotional and humorous register.', descriptionNl: 'Kan taal flexibel en effectief gebruiken voor sociale en professionele doeleinden, inclusief emotioneel en humoristisch register.' },

    { id: 'si-c2-1', level: 'C2', skill: 'speaking_interaction', descriptionEn: 'Can take part effortlessly in any conversation or discussion with native speakers, maintaining precise meanings even in complex discussions.', descriptionNl: 'Kan moeiteloos deelnemen aan elk gesprek of discussie met moedertaalsprekers, waarbij precieze betekenissen worden gehandhaafd, zelfs in complexe discussies.' },

    // ─── LISTENING ────────────────────────────────────────────────────────────

    { id: 'l-a1-1', level: 'A1', skill: 'listening', descriptionEn: 'Can understand familiar names, words and very simple sentences, e.g. on notices and posters or in catalogues.', descriptionNl: 'Kan vertrouwde namen, woorden en zeer eenvoudige zinnen begrijpen, bijv. op borden en posters of in catalogi.' },
    { id: 'l-a1-2', level: 'A1', skill: 'listening', descriptionEn: 'Can follow speech that is very slow and carefully articulated with long pauses.', descriptionNl: 'Kan spraak volgen die zeer langzaam en zorgvuldig uitgesproken wordt met lange pauzes.' },

    { id: 'l-a2-1', level: 'A2', skill: 'listening', descriptionEn: 'Can understand phrases and the highest frequency vocabulary related to areas of most immediate personal relevance.', descriptionNl: 'Kan zinsdelen en meest gebruikte woordenschat begrijpen die betrekking hebben op gebieden van direct persoonlijk belang.' },
    { id: 'l-a2-2', level: 'A2', skill: 'listening', descriptionEn: 'Can catch the main point in short, clear, simple messages and announcements.', descriptionNl: 'Kan het hoofdpunt begrijpen in korte, duidelijke, eenvoudige berichten en aankondigingen.' },
    { id: 'l-a2-3', level: 'A2', skill: 'listening', descriptionEn: 'Can understand the general topic of discussions around them when speech is clear and slow.', descriptionNl: 'Kan het algemene onderwerp van gesprekken om hen heen begrijpen wanneer de spraak duidelijk en langzaam is.' },

    { id: 'l-b1-1', level: 'B1', skill: 'listening', descriptionEn: 'Can understand the main points of clear standard speech on familiar matters regularly encountered in work, school, leisure, etc.', descriptionNl: 'Kan de hoofdpunten begrijpen van duidelijke standaardspraak over vertrouwde onderwerpen die regelmatig voorkomen op het werk, op school, in de vrije tijd, enz.' },
    { id: 'l-b1-2', level: 'B1', skill: 'listening', descriptionEn: 'Can understand the main point of many radio or TV programmes on current affairs or topics of personal or professional interest when delivery is relatively slow and clear.', descriptionNl: 'Kan het hoofdpunt begrijpen van veel radio- of tv-programma\'s over actuele zaken of onderwerpen van persoonlijk of professioneel belang wanneer de spreektempo relatief langzaam en duidelijk is.' },
    { id: 'l-b1-3', level: 'B1', skill: 'listening', descriptionEn: 'Can follow a lecture or talk within their field of study, provided the topic is familiar and the presentation straightforward.', descriptionNl: 'Kan een lezing of presentatie volgen binnen hun studiegebied, mits het onderwerp vertrouwd is en de presentatie eenvoudig.' },

    { id: 'l-b2-1', level: 'B2', skill: 'listening', descriptionEn: 'Can understand extended speech and lectures even when not clearly structured.', descriptionNl: 'Kan uitgebreide spraak en lezingen begrijpen, zelfs wanneer deze niet duidelijk gestructureerd zijn.' },
    { id: 'l-b2-2', level: 'B2', skill: 'listening', descriptionEn: 'Can understand most TV news and current affairs programmes, and follow films in standard dialect.', descriptionNl: 'Kan de meeste tv-nieuwsuitzendingen en actualiteitenprogramma\'s begrijpen, en films volgen in standaarddialect.' },
    { id: 'l-b2-3', level: 'B2', skill: 'listening', descriptionEn: 'Can understand the nuances of native speakers talking at natural speed, including implicit attitudes and relationships.', descriptionNl: 'Kan de nuances van moedertaalsprekers begrijpen die in een natuurlijk tempo praten, inclusief impliciete houdingen en relaties.' },

    { id: 'l-c1-1', level: 'C1', skill: 'listening', descriptionEn: 'Can understand enough to follow extended speech on abstract and complex topics even if some details are lost.', descriptionNl: 'Kan genoeg begrijpen om uitgebreide spraak over abstracte en complexe onderwerpen te volgen, zelfs als sommige details verloren gaan.' },
    { id: 'l-c1-2', level: 'C1', skill: 'listening', descriptionEn: 'Can understand a wide range of idiomatic expressions and colloquialisms, appreciating register shifts.', descriptionNl: 'Kan een breed scala aan idiomatische uitdrukkingen en colloquialismen begrijpen, waarbij registerveranderingen worden opgemerkt.' },

    { id: 'l-c2-1', level: 'C2', skill: 'listening', descriptionEn: 'Can follow any kind of spoken language, whether live or broadcast, including fast, natural speech with colloquial language and idiomatic expressions.', descriptionNl: 'Kan elk soort gesproken taal volgen, of het nu live of uitgezonden is, inclusief snel, natuurlijk gesproken taal met informele taal en idiomatische uitdrukkingen.' },
];

/** All unique CEFR levels in order */
export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** All CEFR skills */
export const CEFR_SKILLS: CefrSkill[] = [
    'reading',
    'writing',
    'speaking_production',
    'speaking_interaction',
    'listening',
];

/** Map for display labels per skill */
export const CEFR_SKILL_LABELS: Record<CefrSkill, { en: string; nl: string }> = {
    reading:              { en: 'Reading',              nl: 'Lezen' },
    writing:              { en: 'Writing',              nl: 'Schrijven' },
    speaking_production:  { en: 'Speaking (Production)', nl: 'Spreken (productie)' },
    speaking_interaction: { en: 'Speaking (Interaction)', nl: 'Spreken (gesprekken)' },
    listening:            { en: 'Listening',            nl: 'Luisteren' },
};

/** Short global descriptor per CEFR level */
export const CEFR_LEVEL_DESCRIPTORS: Record<CefrLevel, { en: string; nl: string }> = {
    A1: { en: 'Breakthrough – Can understand and use very basic familiar expressions.', nl: 'Doorbraak – Kan elementaire vertrouwde uitdrukkingen begrijpen en gebruiken.' },
    A2: { en: 'Waystage – Can communicate in simple, routine tasks on familiar topics.', nl: 'Elementair – Kan communiceren in eenvoudige routinetaken over vertrouwde onderwerpen.' },
    B1: { en: 'Threshold – Can deal with most situations likely to arise while travelling and can express personal opinions.', nl: 'Drempel – Kan omgaan met de meeste situaties op reis en persoonlijke meningen uitdrukken.' },
    B2: { en: 'Vantage – Can interact with fluency and spontaneity with native speakers on a wide range of topics.', nl: 'Gevorderd – Kan vloeiend en spontaan communiceren met moedertaalsprekers over een breed scala aan onderwerpen.' },
    C1: { en: 'Effective Proficiency – Can use language flexibly and effectively for academic and professional purposes.', nl: 'Effectieve beheersing – Kan taal flexibel en effectief gebruiken voor academische en professionele doeleinden.' },
    C2: { en: 'Mastery – Has effectively no limitations in their use of language.', nl: 'Beheersing – Heeft effectief geen beperkingen in het gebruik van taal.' },
};

/** Colour associated with each CEFR level for badges/charts */
export const CEFR_LEVEL_COLORS: Record<CefrLevel, string> = {
    A1: '#94a3b8',  // slate-400
    A2: '#64748b',  // slate-500
    B1: '#3b82f6',  // blue-500
    B2: '#2563eb',  // blue-600
    C1: '#7c3aed',  // violet-600
    C2: '#6d28d9',  // violet-700
};

/** Get descriptors filtered by skill and/or level */
export function getCefrDescriptors(filters: { skill?: CefrSkill; level?: CefrLevel }): CefrDescriptor[] {
    return CEFR_DESCRIPTORS.filter(d => {
        if (filters.skill && d.skill !== filters.skill) return false;
        if (filters.level && d.level !== filters.level) return false;
        return true;
    });
}
