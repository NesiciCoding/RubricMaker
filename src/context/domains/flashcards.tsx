// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, useContextOrThrow } from '../storeCore';
import type { FlashcardAssignment, FlashcardDeck, FlashcardReview, StandardMasteryTarget } from '../../types';
import { StoreData } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { loadDb } from '../../services/database/lazyDb';

export type FlashcardsValue = Pick<
    AppContextValue,
    | 'flashcardDecks'
    | 'flashcardAssignments'
    | 'flashcardReviews'
    | 'standardMasteryTargets'
    | 'addFlashcardDeck'
    | 'updateFlashcardDeck'
    | 'deleteFlashcardDeck'
    | 'addStandardMasteryTarget'
    | 'updateStandardMasteryTarget'
    | 'deleteStandardMasteryTarget'
    | 'addFlashcardAssignments'
    | 'saveFlashcardReview'
    | 'fetchMyFlashcardAssignments'
    | 'fetchAssignedFlashcardDeck'
    | 'fetchMyFlashcardReview'
    | 'saveFlashcardReviewAsStudent'
    | 'fetchMyStudentFlashcardDecks'
    | 'saveFlashcardDeckAsStudent'
    | 'deleteFlashcardDeckAsStudent'
>;

const FlashcardsContext = createContext<FlashcardsValue | null>(null);

export type FlashcardsActions = Pick<
    FlashcardsValue,
    | 'addFlashcardDeck'
    | 'updateFlashcardDeck'
    | 'deleteFlashcardDeck'
    | 'addStandardMasteryTarget'
    | 'updateStandardMasteryTarget'
    | 'deleteStandardMasteryTarget'
    | 'addFlashcardAssignments'
    | 'saveFlashcardReview'
    | 'fetchMyFlashcardAssignments'
    | 'fetchAssignedFlashcardDeck'
    | 'fetchMyFlashcardReview'
    | 'fetchMyStudentFlashcardDecks'
    | 'saveFlashcardDeckAsStudent'
    | 'deleteFlashcardDeckAsStudent'
    | 'saveFlashcardReviewAsStudent'
>;

export function createFlashcardsActions(ctx: StoreActionsCtx): FlashcardsActions {
    const { dispatch } = ctx;
    const addFlashcardDeck = (d: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>): FlashcardDeck => {
        const now = new Date().toISOString();
        const deck: FlashcardDeck = { ...d, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_FLASHCARD_DECK', payload: deck });
        return deck;
    };
    const updateFlashcardDeck = (d: FlashcardDeck) => {
        dispatch({ type: 'UPDATE_FLASHCARD_DECK', payload: d });
    };
    const deleteFlashcardDeck = (id: string) => {
        dispatch({ type: 'DELETE_FLASHCARD_DECK', id });
    };
    const addStandardMasteryTarget = (t: Omit<StandardMasteryTarget, 'id' | 'updatedAt'>): StandardMasteryTarget => {
        const target: StandardMasteryTarget = { ...t, id: nanoid(), updatedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_STANDARD_MASTERY_TARGET', payload: target });
        return target;
    };
    const updateStandardMasteryTarget = (t: StandardMasteryTarget) => {
        dispatch({ type: 'UPDATE_STANDARD_MASTERY_TARGET', payload: t });
    };
    const deleteStandardMasteryTarget = (id: string) => {
        dispatch({ type: 'DELETE_STANDARD_MASTERY_TARGET', id });
    };
    const addFlashcardAssignments = (assignments: FlashcardAssignment[]) => {
        dispatch({ type: 'ADD_FLASHCARD_ASSIGNMENTS', payload: assignments });
    };
    const saveFlashcardReview = (r: FlashcardReview) => {
        dispatch({ type: 'SAVE_FLASHCARD_REVIEW', payload: r });
    };
    const fetchMyFlashcardAssignments = async () => (await loadDb()).storageSync.fetchMyFlashcardAssignments();
    const fetchAssignedFlashcardDeck = async (deckId: string) =>
        (await loadDb()).storageSync.fetchAssignedFlashcardDeck(deckId);
    const fetchMyFlashcardReview = async (deckId: string, studentId: string) =>
        (await loadDb()).storageSync.fetchMyFlashcardReview(deckId, studentId);
    const fetchMyStudentFlashcardDecks = async (studentId: string) =>
        (await loadDb()).storageSync.fetchMyStudentFlashcardDecks(studentId);
    const saveFlashcardDeckAsStudent = async (d: FlashcardDeck) =>
        (await loadDb()).storageSync.saveFlashcardDeckAsStudent(d);
    const deleteFlashcardDeckAsStudent = async (id: string) =>
        (await loadDb()).storageSync.deleteFlashcardDeckAsStudent(id);
    const saveFlashcardReviewAsStudent = async (r: FlashcardReview) =>
        (await loadDb()).storageSync.saveFlashcardReviewAsStudent(r);
    return {
        addFlashcardDeck,
        updateFlashcardDeck,
        deleteFlashcardDeck,
        addStandardMasteryTarget,
        updateStandardMasteryTarget,
        deleteStandardMasteryTarget,
        addFlashcardAssignments,
        saveFlashcardReview,
        fetchMyFlashcardAssignments,
        fetchAssignedFlashcardDeck,
        fetchMyFlashcardReview,
        fetchMyStudentFlashcardDecks,
        saveFlashcardDeckAsStudent,
        deleteFlashcardDeckAsStudent,
        saveFlashcardReviewAsStudent,
    };
}

export function useFlashcardsValue(state: StoreData, actions: FlashcardsActions): FlashcardsValue {
    return useMemo(
        () => ({
            flashcardDecks: state.flashcardDecks,
            flashcardAssignments: state.flashcardAssignments,
            flashcardReviews: state.flashcardReviews,
            standardMasteryTargets: state.standardMasteryTargets,
            ...actions,
        }),
        [
            actions,
            state.flashcardDecks,
            state.flashcardAssignments,
            state.flashcardReviews,
            state.standardMasteryTargets,
        ]
    );
}

export function FlashcardsProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createFlashcardsActions(ctx), [ctx]);
    const value = useFlashcardsValue(state, actions);
    return <FlashcardsContext.Provider value={value}>{children}</FlashcardsContext.Provider>;
}

export function useFlashcards(): FlashcardsValue {
    return useContextOrThrow(FlashcardsContext, 'useFlashcards');
}
