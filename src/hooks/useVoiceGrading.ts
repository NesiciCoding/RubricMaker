import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useEffect, useState } from 'react';

interface VoiceCommand {
    command: string | RegExp;
    callback: (...args: string[]) => void;
    isFuzzyMatch?: boolean;
    fuzzyMatchingThreshold?: number;
    bestMatchOnly?: boolean;
}

export const useVoiceGrading = (
    onGrade: (criterionIndex: number, levelIndex: number) => void,
    onComment: (text: string) => void,
    language: string = 'nl-NL'
) => {
    const [isListening, setIsListening] = useState(false);

    const commands: VoiceCommand[] = [
        {
            // Match pattern like "Criterium 1 Niveau 4" or "Criterion 1 Level 4"
            command: /(?:Criterium|Criterion|Goal|Doel)\s*(\d+)\s*(?:Niveau|Level|Level|Score|Grade)\s*(\d+)/i,
            callback: (crit: string, level: string) => {
                const critIndex = parseInt(crit) - 1;
                const levelIndex = parseInt(level) - 1;
                if (!isNaN(critIndex) && !isNaN(levelIndex)) {
                    onGrade(critIndex, levelIndex);
                }
            },
        },
        {
            // Match Dutch specific: "Score [X] voor [Y]"
            command: /Score\s*(\d+)\s*(?:voor|for)\s*(?:Criterium|Criterion|Goal|Doel)\s*(\d+)/i,
            callback: (level: string, crit: string) => {
                const levelIndex = parseInt(level) - 1;
                const critIndex = parseInt(crit) - 1;
                if (!isNaN(critIndex) && !isNaN(levelIndex)) {
                    onGrade(critIndex, levelIndex);
                }
            },
        },
        {
            // Match command for dictating comments: "Commentaar [text]"
            command: /(?:Commentaar|Comment|Feedback)\s*(.*)/i,
            callback: (text: string) => {
                if (text) {
                    onComment(text);
                }
            },
        },
    ];

    const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition({
        commands,
    });

    const toggleListening = () => {
        if (listening) {
            SpeechRecognition.stopListening();
        } else {
            SpeechRecognition.startListening({ continuous: true, language });
        }
    };

    useEffect(() => {
        setIsListening(listening);
    }, [listening]);

    return {
        transcript,
        isListening,
        toggleListening,
        resetTranscript,
        browserSupportsSpeechRecognition,
    };
};
