export interface IBAttribute {
    id: string;
    labelEn: string;
    labelNl: string;
    color: string;
    descriptors: IBDescriptor[];
}

export interface IBDescriptor {
    id: string;
    attributeId: string;
    descriptionEn: string;
    descriptionNl: string;
}

export const IB_ATTRIBUTES: IBAttribute[] = [
    {
        id: 'inquirers',
        labelEn: 'Inquirers',
        labelNl: 'Onderzoekers',
        color: '#0ea5e9',
        descriptors: [
            {
                id: 'ib-inq-1',
                attributeId: 'inquirers',
                descriptionEn: 'Nurtures curiosity and asks meaningful questions to deepen understanding.',
                descriptionNl: 'Koestert nieuwsgierigheid en stelt betekenisvolle vragen om begrip te verdiepen.',
            },
            {
                id: 'ib-inq-2',
                attributeId: 'inquirers',
                descriptionEn: 'Independently selects and uses appropriate research strategies to investigate topics.',
                descriptionNl:
                    'Selecteert en gebruikt zelfstandig passende onderzoeksstrategieën om onderwerpen te onderzoeken.',
            },
            {
                id: 'ib-inq-3',
                attributeId: 'inquirers',
                descriptionEn: 'Demonstrates a love of learning and pursues knowledge beyond classroom requirements.',
                descriptionNl: 'Toont liefde voor leren en zoekt kennis buiten de vereisten van de klas.',
            },
        ],
    },
    {
        id: 'knowledgeable',
        labelEn: 'Knowledgeable',
        labelNl: 'Deskundig',
        color: '#8b5cf6',
        descriptors: [
            {
                id: 'ib-kno-1',
                attributeId: 'knowledgeable',
                descriptionEn: 'Develops and applies conceptual understanding across a range of disciplines.',
                descriptionNl: 'Ontwikkelt en past conceptueel begrip toe in een breed scala van vakgebieden.',
            },
            {
                id: 'ib-kno-2',
                attributeId: 'knowledgeable',
                descriptionEn: 'Connects local and global issues to disciplinary knowledge.',
                descriptionNl: 'Verbindt lokale en mondiale vraagstukken met vakinhoudelijke kennis.',
            },
            {
                id: 'ib-kno-3',
                attributeId: 'knowledgeable',
                descriptionEn: 'Uses evidence and examples to support claims across multiple subject areas.',
                descriptionNl:
                    'Gebruikt bewijzen en voorbeelden ter onderbouwing van standpunten in meerdere vakgebieden.',
            },
        ],
    },
    {
        id: 'thinkers',
        labelEn: 'Thinkers',
        labelNl: 'Denkers',
        color: '#f59e0b',
        descriptors: [
            {
                id: 'ib-thi-1',
                attributeId: 'thinkers',
                descriptionEn: 'Applies critical thinking skills to identify and analyse complex problems.',
                descriptionNl: 'Past kritisch denken toe om complexe problemen te identificeren en te analyseren.',
            },
            {
                id: 'ib-thi-2',
                attributeId: 'thinkers',
                descriptionEn: 'Generates creative solutions and considers multiple perspectives before deciding.',
                descriptionNl:
                    'Bedenkt creatieve oplossingen en beschouwt meerdere perspectieven voordat een beslissing wordt genomen.',
            },
            {
                id: 'ib-thi-3',
                attributeId: 'thinkers',
                descriptionEn: 'Makes reasoned and ethical decisions, considering consequences for others.',
                descriptionNl:
                    'Neemt weloverwogen en ethische beslissingen, rekening houdend met gevolgen voor anderen.',
            },
        ],
    },
    {
        id: 'communicators',
        labelEn: 'Communicators',
        labelNl: 'Communicatoren',
        color: '#10b981',
        descriptors: [
            {
                id: 'ib-com-1',
                attributeId: 'communicators',
                descriptionEn: 'Expresses ideas confidently and clearly in written, oral, and visual forms.',
                descriptionNl: 'Drukt ideeën zelfverzekerd en helder uit in geschreven, mondelinge en visuele vormen.',
            },
            {
                id: 'ib-com-2',
                attributeId: 'communicators',
                descriptionEn: 'Listens actively and responds thoughtfully to the perspectives of others.',
                descriptionNl: 'Luistert actief en reageert doordacht op de perspectieven van anderen.',
            },
            {
                id: 'ib-com-3',
                attributeId: 'communicators',
                descriptionEn: 'Collaborates effectively in groups, contributing ideas and supporting teammates.',
                descriptionNl: 'Werkt effectief samen in groepen, draagt ideeën bij en ondersteunt teamgenoten.',
            },
        ],
    },
    {
        id: 'principled',
        labelEn: 'Principled',
        labelNl: 'Principieel',
        color: '#ef4444',
        descriptors: [
            {
                id: 'ib-pri-1',
                attributeId: 'principled',
                descriptionEn: 'Acts with honesty and integrity in academic and personal contexts.',
                descriptionNl: 'Handelt eerlijk en integer in academische en persoonlijke contexten.',
            },
            {
                id: 'ib-pri-2',
                attributeId: 'principled',
                descriptionEn: 'Takes responsibility for personal actions and their impact on others.',
                descriptionNl: 'Neemt verantwoordelijkheid voor eigen handelen en de impact daarvan op anderen.',
            },
            {
                id: 'ib-pri-3',
                attributeId: 'principled',
                descriptionEn: 'Respects the rights, beliefs, and dignity of all individuals.',
                descriptionNl: 'Respecteert de rechten, overtuigingen en waardigheid van alle mensen.',
            },
        ],
    },
    {
        id: 'open_minded',
        labelEn: 'Open-minded',
        labelNl: 'Open van geest',
        color: '#f97316',
        descriptors: [
            {
                id: 'ib-opn-1',
                attributeId: 'open_minded',
                descriptionEn: 'Critically appreciates own culture and traditions while remaining open to others.',
                descriptionNl:
                    'Waardeert kritisch de eigen cultuur en tradities terwijl openheid naar anderen behouden blijft.',
            },
            {
                id: 'ib-opn-2',
                attributeId: 'open_minded',
                descriptionEn: 'Seeks out and evaluates diverse perspectives on issues or problems.',
                descriptionNl:
                    'Zoekt actief naar uiteenlopende perspectieven op vraagstukken of problemen en evalueert deze.',
            },
            {
                id: 'ib-opn-3',
                attributeId: 'open_minded',
                descriptionEn: 'Adapts thinking based on new evidence and learning experiences.',
                descriptionNl: 'Past het denken aan op basis van nieuw bewijs en leerervaringen.',
            },
        ],
    },
    {
        id: 'caring',
        labelEn: 'Caring',
        labelNl: 'Zorgzaam',
        color: '#ec4899',
        descriptors: [
            {
                id: 'ib-car-1',
                attributeId: 'caring',
                descriptionEn: 'Shows empathy and compassion towards peers, community, and the wider world.',
                descriptionNl:
                    'Toont empathie en medeleven tegenover klasgenoten, de gemeenschap en de bredere wereld.',
            },
            {
                id: 'ib-car-2',
                attributeId: 'caring',
                descriptionEn: 'Takes action to make a positive contribution to the school or local community.',
                descriptionNl: 'Neemt actie om een positieve bijdrage te leveren aan de school of lokale gemeenschap.',
            },
            {
                id: 'ib-car-3',
                attributeId: 'caring',
                descriptionEn: 'Respects and supports the well-being of others in the learning environment.',
                descriptionNl: 'Respecteert en ondersteunt het welzijn van anderen in de leeromgeving.',
            },
        ],
    },
    {
        id: 'risk_takers',
        labelEn: 'Risk-takers',
        labelNl: 'Durvers',
        color: '#14b8a6',
        descriptors: [
            {
                id: 'ib-ris-1',
                attributeId: 'risk_takers',
                descriptionEn: 'Approaches unfamiliar situations and challenges with courage and determination.',
                descriptionNl: 'Benadert onbekende situaties en uitdagingen met moed en vastberadenheid.',
            },
            {
                id: 'ib-ris-2',
                attributeId: 'risk_takers',
                descriptionEn: 'Experiments with new ideas and strategies, learning constructively from setbacks.',
                descriptionNl: 'Experimenteert met nieuwe ideeën en strategieën en leert constructief van tegenslagen.',
            },
            {
                id: 'ib-ris-3',
                attributeId: 'risk_takers',
                descriptionEn: 'Works independently and resourcefully when facing uncertainty or open-ended tasks.',
                descriptionNl: 'Werkt zelfstandig en vindingrijk bij onzekerheid of open opdrachten.',
            },
        ],
    },
    {
        id: 'balanced',
        labelEn: 'Balanced',
        labelNl: 'Evenwichtig',
        color: '#6366f1',
        descriptors: [
            {
                id: 'ib-bal-1',
                attributeId: 'balanced',
                descriptionEn: 'Manages time and effort across intellectual, physical, and creative pursuits.',
                descriptionNl: 'Beheert tijd en inzet over intellectuele, fysieke en creatieve bezigheden.',
            },
            {
                id: 'ib-bal-2',
                attributeId: 'balanced',
                descriptionEn: 'Recognises the interconnectedness of personal well-being and academic performance.',
                descriptionNl: 'Herkent de samenhang tussen persoonlijk welzijn en academische prestaties.',
            },
            {
                id: 'ib-bal-3',
                attributeId: 'balanced',
                descriptionEn: 'Demonstrates awareness of own needs while supporting the well-being of others.',
                descriptionNl:
                    'Toont bewustzijn van eigen behoeften terwijl het welzijn van anderen ondersteund wordt.',
            },
        ],
    },
    {
        id: 'reflective',
        labelEn: 'Reflective',
        labelNl: 'Reflectief',
        color: '#64748b',
        descriptors: [
            {
                id: 'ib-ref-1',
                attributeId: 'reflective',
                descriptionEn: 'Thoughtfully considers personal strengths and areas for growth in their learning.',
                descriptionNl: 'Denkt doordacht na over persoonlijke sterke punten en groeimogelijkheden in het leren.',
            },
            {
                id: 'ib-ref-2',
                attributeId: 'reflective',
                descriptionEn: 'Seeks and responds constructively to feedback to improve future work.',
                descriptionNl: 'Vraagt feedback en reageert er constructief op om toekomstig werk te verbeteren.',
            },
            {
                id: 'ib-ref-3',
                attributeId: 'reflective',
                descriptionEn: 'Evaluates the effectiveness of own learning strategies and adapts accordingly.',
                descriptionNl: 'Evalueert de effectiviteit van eigen leerstrategieën en past deze aan waar nodig.',
            },
        ],
    },
];

export function getIBDescriptors(attributeId?: string): IBDescriptor[] {
    if (!attributeId) {
        return IB_ATTRIBUTES.flatMap((a) => a.descriptors);
    }
    return IB_ATTRIBUTES.find((a) => a.id === attributeId)?.descriptors ?? [];
}

export function getIBAttribute(id: string): IBAttribute | undefined {
    return IB_ATTRIBUTES.find((a) => a.id === id);
}
