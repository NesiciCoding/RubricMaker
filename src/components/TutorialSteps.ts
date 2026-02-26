import { Step } from 'react-joyride';

export const tutorialSteps: Step[] = [
    {
        target: '.dashboard-container',
        content: 'Welcome to Rubric Maker! This dashboard gives you a high-level overview of your classes, students, and overall grading progress.',
        placement: 'center',
        disableBeacon: true,
    },
    {
        target: '[data-tour="/rubrics"]',
        content: 'Here is where you craft and manage your Rubrics. You can define criteria, levels, and point scales tailored to your assignments.',
        placement: 'right',
    },
    {
        target: '[data-tour="/students"]',
        content: 'Use the Students & Classes tab to organize your classroom rosters and link students to specific classes.',
        placement: 'right',
    },
    {
        target: '[data-tour="/statistics"]',
        content: 'Once you start grading, the Statistics tab provides powerful insights and analytics into student performance and rubric effectiveness.',
        placement: 'right',
    },
    {
        target: '.compare-btn-tutorial',
        content: 'Try our new Comparative Grading feature! It allows you to grade two students side-by-side and adaptively adjust scores based on their relative performance.',
        placement: 'bottom',
    },
    {
        target: '[data-tour="/settings"]',
        content: 'Customize your experience here. You can change themes, manage grade scales, configure standards integration, and set default export templates.',
        placement: 'right',
    }
];
