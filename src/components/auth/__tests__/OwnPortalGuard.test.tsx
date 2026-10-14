import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { OwnPortalGuard } from '../OwnPortalGuard';

function Portal() {
    const { studentId, deckId } = useParams();
    const { search } = useLocation();
    return (
        <div>
            portal:{studentId}
            {deckId ? `:deck:${deckId}` : ''}
            {search}
        </div>
    );
}

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/portal/:studentId"
                    element={
                        <OwnPortalGuard ownStudentId="anna">
                            <Portal />
                        </OwnPortalGuard>
                    }
                />
                <Route
                    path="/portal/:studentId/flashcards/:deckId"
                    element={
                        <OwnPortalGuard ownStudentId="anna">
                            <Portal />
                        </OwnPortalGuard>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

describe('OwnPortalGuard', () => {
    it("renders the signed-in student's own portal", () => {
        renderAt('/portal/anna');
        expect(screen.getByText('portal:anna')).toBeInTheDocument();
    });

    it("redirects another student's portal to the student's own", () => {
        renderAt('/portal/liam?tab=grades');
        expect(screen.getByText('portal:anna?tab=grades')).toBeInTheDocument();
        expect(screen.queryByText(/liam/)).toBeNull();
    });

    it('keeps the sub-route when redirecting a flashcard deck link', () => {
        renderAt('/portal/liam/flashcards/d1');
        expect(screen.getByText('portal:anna:deck:d1')).toBeInTheDocument();
    });

    it('keeps the sub-route and query when the URL differs in case', () => {
        renderAt('/PORTAL/liam/flashcards/d1?tab=grades');
        expect(screen.getByText('portal:anna:deck:d1?tab=grades')).toBeInTheDocument();
    });
});
