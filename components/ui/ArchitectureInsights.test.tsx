import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArchitectureInsights } from './ArchitectureInsights';
import { ArchitecturalAssessment, ArchitecturalPattern, WorkflowSummary } from '@/types';

const patterns: ArchitecturalPattern[] = [
    {
        kind: 'god-component',
        severity: 'warning',
        nodeIds: ['Dashboard'],
        description: '"Dashboard" has 14 connections — high fan-in/fan-out suggests it may be doing too much.',
    },
    {
        kind: 'orphaned-module',
        severity: 'info',
        nodeIds: ['LegacyWidget'],
        description: '"LegacyWidget" is never imported or rendered by another component.',
    },
];

describe('ArchitectureInsights', () => {
    it('shows an empty state when there are no findings', () => {
        render(<ArchitectureInsights patterns={[]} onLocate={vi.fn()} />);
        expect(screen.getByText(/No notable structural patterns detected/i)).toBeInTheDocument();
    });

    it('renders every finding with its label and description', () => {
        render(<ArchitectureInsights patterns={patterns} onLocate={vi.fn()} />);

        expect(screen.getByText('God Component')).toBeInTheDocument();
        expect(screen.getByText(/Dashboard.*14 connections/)).toBeInTheDocument();
        expect(screen.getByText('Orphaned Module')).toBeInTheDocument();
    });

    it('calls onLocate with the finding\'s primary node id when clicked', async () => {
        const onLocate = vi.fn();
        const user = userEvent.setup();
        render(<ArchitectureInsights patterns={patterns} onLocate={onLocate} />);

        await user.click(screen.getByText('God Component'));

        expect(onLocate).toHaveBeenCalledWith('Dashboard');
    });

    it('renders the model-written assessment when provided', () => {
        const assessment: ArchitecturalAssessment = {
            summary: 'A moderately coupled dashboard app.',
            strengths: ['Clear separation between containers and presentational pieces.'],
            concerns: ['Dashboard is doing a lot.'],
        };
        render(<ArchitectureInsights patterns={[]} onLocate={vi.fn()} assessment={assessment} />);

        expect(screen.getByText('A moderately coupled dashboard app.')).toBeInTheDocument();
        expect(screen.getByText(/Clear separation/)).toBeInTheDocument();
        expect(screen.getByText(/Dashboard is doing a lot/)).toBeInTheDocument();
    });

    it('renders an expandable agent trace when a workflow summary is provided', async () => {
        const user = userEvent.setup();
        const workflow: WorkflowSummary = {
            mode: 'deep-dive',
            fileBudget: 200,
            filesUsed: 42,
            decisions: [{ path: 'app', reason: 'Likely the Next.js app router root.', accepted: true, filesFetched: 12 }],
            errors: [],
            stageTimings: [{ stage: 'shallow-scan', durationMs: 120 }],
        };
        render(<ArchitectureInsights patterns={[]} onLocate={vi.fn()} workflow={workflow} />);

        expect(screen.getByText(/42\/200 files/)).toBeInTheDocument();

        // Decision detail is hidden until the trace is expanded.
        expect(screen.queryByText(/Likely the Next.js app router root/)).not.toBeInTheDocument();
        await user.click(screen.getByText(/42\/200 files/));
        expect(screen.getByText(/Likely the Next.js app router root/)).toBeInTheDocument();
    });
});
