import 'regenerator-runtime/runtime';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useEffect, useState } from 'react';

interface VoiceCommand {
  command: string | RegExp;
  callback: (match: any) => void;
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
      callback: (match: any) => {
        const critIndex = parseInt(match[1]) - 1;
        const levelIndex = parseInt(match[2]) - 1;
        if (!isNaN(critIndex) && !isNaN(levelIndex)) {
            onGrade(critIndex, levelIndex);
        }
      }
    },
    {
        // Match Dutch specific: "Score [X] voor [Y]"
        command: /Score\s*(\d+)\s*(?:voor|for)\s*(?:Criterium|Criterion|Goal|Doel)\s*(\d+)/i,
        callback: (match: any) => {
          const levelIndex = parseInt(match[1]) - 1;
          const critIndex = parseInt(match[2]) - 1;
          if (!isNaN(critIndex) && !isNaN(levelIndex)) {
              onGrade(critIndex, levelIndex);
          }
        }
    },
    {
      // Match command for dictating comments: "Commentaar [text]"
      command: /(?:Commentaar|Comment|Feedback)\s*(.*)/i,
      callback: (match: any) => {
        if (match[1]) {
          onComment(match[1]);
        }
      }
    }
  ];

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition({ commands });

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
    browserSupportsSpeechRecognition
  };
};
