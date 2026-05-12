import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { useToast } from './useToast';
import { ToastProvider } from '../context/ToastContext';

describe('useToast', () => {
    it('returns showToast function from context', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(ToastProvider, null, children);

        const { result } = renderHook(() => useToast(), { wrapper });
        expect(typeof result.current.showToast).toBe('function');
    });

    it('returns default no-op showToast outside provider', () => {
        const { result } = renderHook(() => useToast());
        expect(() => result.current.showToast('test')).not.toThrow();
    });
});
