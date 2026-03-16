declare module 'react-speech-recognition' {
  export interface SpeechRecognitionOptions {
    continuous?: boolean;
    language?: string;
    interimResults?: boolean;
  }

  export interface Command {
    command: string | RegExp;
    callback: (...args: any[]) => void;
    isFuzzyMatch?: boolean;
    fuzzyMatchingThreshold?: number;
    bestMatchOnly?: boolean;
  }

  export interface useSpeechRecognitionOptions {
    commands?: Command[];
  }

  export interface SpeechRecognition {
    startListening(options?: SpeechRecognitionOptions): Promise<void>;
    stopListening(): Promise<void>;
    abortListening(): Promise<void>;
    browserSupportsSpeechRecognition(): boolean;
  }

  export function useSpeechRecognition(options?: useSpeechRecognitionOptions): {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable: boolean;
  };

  const SpeechRecognition: SpeechRecognition;
  export default SpeechRecognition;
}
