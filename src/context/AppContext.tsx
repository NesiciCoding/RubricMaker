import React, {
    createContext, useContext, useReducer, useCallback, useEffect, ReactNode
} from 'react';
import type {
    Rubric, Student, Class, StudentRubric, Attachment,
    GradeScale, CommentSnippet, AppSettings, ScoreEntry, Modifier, LinkedStandard, CommentBankItem, ExportTemplate
} from '../types';
import {
    loadStore, StoreData,
    saveRubrics, saveStudents, saveClasses, saveStudentRubrics,
    saveAttachments, saveGradeScales, saveCommentSnippets, saveSettings, saveFavoriteStandards, saveCommentBank,
    saveExportTemplates,
} from '../store/storage';
import { nanoid } from '../utils/nanoid';

// ─── Actions ───────────────────────────────────────────────────────────────────

type Action =
    | { type: 'SET_ALL'; payload: StoreData }
    | { type: 'ADD_RUBRIC'; payload: Rubric }
    | { type: 'UPDATE_RUBRIC'; payload: Rubric }
    | { type: 'DELETE_RUBRIC'; id: string }
    | { type: 'ADD_STUDENT'; payload: Student }
    | { type: 'UPDATE_STUDENT'; payload: Student }
    | { type: 'DELETE_STUDENT'; id: string }
    | { type: 'ADD_CLASS'; payload: Class }
    | { type: 'UPDATE_CLASS'; payload: Class }
    | { type: 'DELETE_CLASS'; id: string }
    | { type: 'SAVE_STUDENT_RUBRIC'; payload: StudentRubric }
    | { type: 'DELETE_STUDENT_RUBRIC'; id: string }
    | { type: 'ADD_ATTACHMENT'; payload: Attachment }
    | { type: 'DELETE_ATTACHMENT'; id: string }
    | { type: 'ADD_GRADE_SCALE'; payload: GradeScale }
    | { type: 'UPDATE_GRADE_SCALE'; payload: GradeScale }
    | { type: 'DELETE_GRADE_SCALE'; id: string }
    | { type: 'ADD_COMMENT_SNIPPET'; payload: CommentSnippet }
    | { type: 'DELETE_COMMENT_SNIPPET'; id: string }
    | { type: 'ADD_COMMENT_SNIPPET'; payload: CommentSnippet }
    | { type: 'DELETE_COMMENT_SNIPPET'; id: string }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
    | { type: 'ADD_FAVORITE_STANDARD'; payload: LinkedStandard }
    | { type: 'REMOVE_FAVORITE_STANDARD'; guid: string }
    | { type: 'ADD_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'UPDATE_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'DELETE_COMMENT_BANK_ITEM'; id: string }
    | { type: 'ADD_EXPORT_TEMPLATE'; payload: ExportTemplate }
    | { type: 'DELETE_EXPORT_TEMPLATE'; id: string };

function reducer(state: StoreData, action: Action): StoreData {
    switch (action.type) {
        case 'SET_ALL': return action.payload;
        case 'ADD_RUBRIC': {
            const next = [...state.rubrics, action.payload];
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'UPDATE_RUBRIC': {
            const next = state.rubrics.map(r => r.id === action.payload.id ? action.payload : r);
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_RUBRIC': {
            const next = state.rubrics.filter(r => r.id !== action.id);
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'ADD_STUDENT': {
            const next = [...state.students, action.payload];
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'UPDATE_STUDENT': {
            const next = state.students.map(s => s.id === action.payload.id ? action.payload : s);
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'DELETE_STUDENT': {
            const next = state.students.filter(s => s.id !== action.id);
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'ADD_CLASS': {
            const next = [...state.classes, action.payload];
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'UPDATE_CLASS': {
            const next = state.classes.map(c => c.id === action.payload.id ? action.payload : c);
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'DELETE_CLASS': {
            const next = state.classes.filter(c => c.id !== action.id);
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'SAVE_STUDENT_RUBRIC': {
            const exists = state.studentRubrics.findIndex(sr => sr.id === action.payload.id);
            const next = exists >= 0
                ? state.studentRubrics.map(sr => sr.id === action.payload.id ? action.payload : sr)
                : [...state.studentRubrics, action.payload];
            saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'DELETE_STUDENT_RUBRIC': {
            const next = state.studentRubrics.filter(sr => sr.id !== action.id);
            saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'ADD_ATTACHMENT': {
            const next = [...state.attachments, action.payload];
            saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'DELETE_ATTACHMENT': {
            const next = state.attachments.filter(a => a.id !== action.id);
            saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'ADD_GRADE_SCALE': {
            const next = [...state.gradeScales, action.payload];
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'UPDATE_GRADE_SCALE': {
            const next = state.gradeScales.map(gs => gs.id === action.payload.id ? action.payload : gs);
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'DELETE_GRADE_SCALE': {
            const next = state.gradeScales.filter(gs => gs.id !== action.id);
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'ADD_COMMENT_SNIPPET': {
            const next = [...state.commentSnippets, action.payload];
            saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'DELETE_COMMENT_SNIPPET': {
            const next = state.commentSnippets.filter(cs => cs.id !== action.id);
            saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'UPDATE_SETTINGS': {
            const next = { ...state.settings, ...action.payload };
            saveSettings(next);
            return { ...state, settings: next };
        }
        case 'ADD_FAVORITE_STANDARD': {
            if (state.favoriteStandards.some(s => s.guid === action.payload.guid)) return state;
            const next = [...state.favoriteStandards, action.payload];
            saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'REMOVE_FAVORITE_STANDARD': {
            const next = state.favoriteStandards.filter(s => s.guid !== action.guid);
            saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'ADD_COMMENT_BANK_ITEM': {
            const next = [...state.commentBank, action.payload];
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'UPDATE_COMMENT_BANK_ITEM': {
            const next = state.commentBank.map(i => i.id === action.payload.id ? action.payload : i);
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'DELETE_COMMENT_BANK_ITEM': {
            const next = state.commentBank.filter(i => i.id !== action.id);
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'ADD_EXPORT_TEMPLATE': {
            const next = [...state.exportTemplates, action.payload];
            saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        case 'DELETE_EXPORT_TEMPLATE': {
            const next = state.exportTemplates.filter(t => t.id !== action.id);
            saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        default: return state;
    }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue extends StoreData {
    dispatch: React.Dispatch<Action>;
    // Convenience helpers
    addRubric: (r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>) => Rubric;
    updateRubric: (r: Rubric) => void;
    deleteRubric: (id: string) => void;
    addStudent: (s: Omit<Student, 'id'>) => Student;
    updateStudent: (s: Student) => void;
    deleteStudent: (id: string) => void;
    addClass: (c: Omit<Class, 'id'>) => Class;
    updateClass: (c: Class) => void;
    deleteClass: (id: string) => void;
    saveStudentRubric: (sr: StudentRubric) => void;
    createStudentRubric: (rubricId: string, studentId: string) => StudentRubric;
    deleteStudentRubric: (id: string) => void;
    addAttachment: (a: Omit<Attachment, 'id' | 'addedAt'>) => Attachment;
    deleteAttachment: (id: string) => void;
    addGradeScale: (gs: Omit<GradeScale, 'id'>) => GradeScale;
    updateGradeScale: (gs: GradeScale) => void;
    deleteGradeScale: (id: string) => void;
    addCommentSnippet: (text: string, tag: string) => CommentSnippet;
    deleteCommentSnippet: (id: string) => void;
    updateSettings: (s: Partial<AppSettings>) => void;
    getActiveGradeScale: () => GradeScale;
    addFavoriteStandard: (s: LinkedStandard) => void;
    removeFavoriteStandard: (guid: string) => void;
    isFavoriteStandard: (guid: string) => boolean;
    addCommentBankItem: (text: string, tags: string[]) => CommentBankItem;
    updateCommentBankItem: (item: CommentBankItem) => void;
    deleteCommentBankItem: (id: string) => void;
    addExportTemplate: (t: Omit<ExportTemplate, 'id' | 'addedAt'>) => ExportTemplate;
    deleteExportTemplate: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, null, loadStore);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', state.settings.theme);
    }, [state.settings.theme]);

    const addRubric = useCallback((r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>): Rubric => {
        const now = new Date().toISOString();
        const rubric: Rubric = { ...r, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_RUBRIC', payload: rubric });
        return rubric;
    }, []);

    const updateRubric = useCallback((r: Rubric) => {
        dispatch({ type: 'UPDATE_RUBRIC', payload: { ...r, updatedAt: new Date().toISOString() } });
    }, []);

    const deleteRubric = useCallback((id: string) => dispatch({ type: 'DELETE_RUBRIC', id }), []);

    const addStudent = useCallback((s: Omit<Student, 'id'>): Student => {
        const student: Student = { ...s, id: nanoid() };
        dispatch({ type: 'ADD_STUDENT', payload: student });
        return student;
    }, []);

    const updateStudent = useCallback((s: Student) => dispatch({ type: 'UPDATE_STUDENT', payload: s }), []);
    const deleteStudent = useCallback((id: string) => dispatch({ type: 'DELETE_STUDENT', id }), []);

    const addClass = useCallback((c: Omit<Class, 'id'>): Class => {
        const cls: Class = { ...c, id: nanoid() };
        dispatch({ type: 'ADD_CLASS', payload: cls });
        return cls;
    }, []);
    const updateClass = useCallback((c: Class) => dispatch({ type: 'UPDATE_CLASS', payload: c }), []);
    const deleteClass = useCallback((id: string) => dispatch({ type: 'DELETE_CLASS', id }), []);

    const saveStudentRubricFn = useCallback((sr: StudentRubric) => {
        dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr });
    }, []);

    const createStudentRubric = useCallback((rubricId: string, studentId: string): StudentRubric => {
        const rubric = state.rubrics.find(r => r.id === rubricId);
        const entries: ScoreEntry[] = (rubric?.criteria ?? []).map(c => ({
            criterionId: c.id,
            levelId: null,
            comment: '',
            checkedSubItems: [],
        }));
        const sr: StudentRubric = {
            id: nanoid(),
            rubricId,
            studentId,
            entries,
            overallComment: '',
            isPeerReview: false,
        };
        dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr });
        return sr;
    }, [state.rubrics]);

    const deleteStudentRubric = useCallback((id: string) => dispatch({ type: 'DELETE_STUDENT_RUBRIC', id }), []);

    const addAttachment = useCallback((a: Omit<Attachment, 'id' | 'addedAt'>): Attachment => {
        const att: Attachment = { ...a, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_ATTACHMENT', payload: att });
        return att;
    }, []);

    const deleteAttachment = useCallback((id: string) => dispatch({ type: 'DELETE_ATTACHMENT', id }), []);

    const addGradeScale = useCallback((gs: Omit<GradeScale, 'id'>): GradeScale => {
        const scale: GradeScale = { ...gs, id: nanoid() };
        dispatch({ type: 'ADD_GRADE_SCALE', payload: scale });
        return scale;
    }, []);

    const updateGradeScale = useCallback((gs: GradeScale) => dispatch({ type: 'UPDATE_GRADE_SCALE', payload: gs }), []);
    const deleteGradeScale = useCallback((id: string) => dispatch({ type: 'DELETE_GRADE_SCALE', id }), []);

    const addCommentSnippet = useCallback((text: string, tag: string): CommentSnippet => {
        const snip: CommentSnippet = { id: nanoid(), text, tag };
        dispatch({ type: 'ADD_COMMENT_SNIPPET', payload: snip });
        return snip;
    }, []);

    const deleteCommentSnippet = useCallback((id: string) => dispatch({ type: 'DELETE_COMMENT_SNIPPET', id }), []);
    const updateSettings = useCallback((s: Partial<AppSettings>) => dispatch({ type: 'UPDATE_SETTINGS', payload: s }), []);

    const getActiveGradeScale = useCallback((): GradeScale => {
        return state.gradeScales.find(gs => gs.id === state.settings.defaultGradeScaleId)
            ?? state.gradeScales[0];
    }, [state.gradeScales, state.settings.defaultGradeScaleId]);

    const addFavoriteStandard = useCallback((s: LinkedStandard) => dispatch({ type: 'ADD_FAVORITE_STANDARD', payload: s }), []);
    const removeFavoriteStandard = useCallback((guid: string) => dispatch({ type: 'REMOVE_FAVORITE_STANDARD', guid }), []);
    const isFavoriteStandard = useCallback((guid: string) => state.favoriteStandards.some(s => s.guid === guid), [state.favoriteStandards]);

    const addCommentBankItem = useCallback((text: string, tags: string[]): CommentBankItem => {
        const item: CommentBankItem = { id: nanoid(), text, tags, createdAt: new Date().toISOString() };
        dispatch({ type: 'ADD_COMMENT_BANK_ITEM', payload: item });
        return item;
    }, []);

    const updateCommentBankItem = useCallback((item: CommentBankItem) => dispatch({ type: 'UPDATE_COMMENT_BANK_ITEM', payload: item }), []);
    const deleteCommentBankItem = useCallback((id: string) => dispatch({ type: 'DELETE_COMMENT_BANK_ITEM', id }), []);

    const addExportTemplate = useCallback((t: Omit<ExportTemplate, 'id' | 'addedAt'>): ExportTemplate => {
        const template: ExportTemplate = { ...t, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_EXPORT_TEMPLATE', payload: template });
        return template;
    }, []);
    const deleteExportTemplate = useCallback((id: string) => dispatch({ type: 'DELETE_EXPORT_TEMPLATE', id }), []);

    const value: AppContextValue = {
        ...state,
        dispatch,
        addRubric, updateRubric, deleteRubric,
        addStudent, updateStudent, deleteStudent,
        addClass, updateClass, deleteClass,
        saveStudentRubric: saveStudentRubricFn,
        createStudentRubric, deleteStudentRubric,
        addAttachment, deleteAttachment,
        addGradeScale, updateGradeScale, deleteGradeScale,
        addCommentSnippet, deleteCommentSnippet,
        updateSettings, getActiveGradeScale,
        addFavoriteStandard, removeFavoriteStandard, isFavoriteStandard,
        addCommentBankItem, updateCommentBankItem, deleteCommentBankItem,
        addExportTemplate, deleteExportTemplate,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
