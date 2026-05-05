import '@testing-library/jest-dom';

// Recharts' ResponsiveContainer uses ResizeObserver which doesn't exist in jsdom
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
