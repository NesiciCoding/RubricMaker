import type { Test, TestQuestion, CefrLevel } from '../types';

/**
 * A generator-engine (roadmap 27.1) placement test: unlike 'mst' and 'staircase', it has no
 * pre-authored sections/questions — every question is pulled live from the question bank at
 * runtime by the server-authoritative `next-placement-question` edge function.
 */
export function isGeneratorTest(test: Pick<Test, 'mode' | 'placementEngine'>): boolean {
    return test.mode === 'placement' && test.placementEngine === 'generator';
}

/** A reading/listening passage bundle served alongside one of its nested questions. */
export interface GeneratorPassage {
    bankItemId: string;
    title: string;
    content?: string;
    audioUrl?: string;
    /** 0-based index of `question` within the bundle's questions. */
    questionIndex: number;
    questionCount: number;
}

/** Response contract for the `next-placement-question` edge function. */
export type NextPlacementQuestionResult =
    | {
          done: false;
          question: TestQuestion;
          passage?: GeneratorPassage;
          cefrLevel: CefrLevel;
          eloAnchor: number;
          questionsAsked: number;
      }
    | {
          done: true;
          finalLevel: CefrLevel;
          questionsAsked: number;
      };
