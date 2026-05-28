import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        if (this.props.fallback) return this.props.fallback;

        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    gap: '1rem',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                <AlertTriangle size={40} style={{ color: 'var(--yellow)' }} aria-hidden="true" />
                <h2 style={{ fontSize: '1.2rem', color: 'var(--text)' }}>Something went wrong</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '400px', fontSize: '0.9rem' }}>
                    An unexpected error occurred. Your data is safe — reload the page to continue.
                </p>
                {this.state.error && (
                    <pre
                        style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-dim)',
                            background: 'var(--bg-elevated)',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius)',
                            maxWidth: '500px',
                            overflow: 'auto',
                            textAlign: 'left',
                        }}
                    >
                        {this.state.error.message}
                    </pre>
                )}
                <button className="btn btn-primary" onClick={this.handleReload}>
                    Reload page
                </button>
            </div>
        );
    }
}
