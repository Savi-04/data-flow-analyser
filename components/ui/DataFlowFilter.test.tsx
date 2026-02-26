import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataFlowFilter } from './DataFlowFilter';
import { StateVariable } from '@/types';

const mockVariables: StateVariable[] = [
    {
        name: 'user',
        setterName: 'setUser',
        sourceComponentId: 'src/App',
        sourceComponentName: 'App',
        consumers: ['src/Header'],
    },
    {
        name: 'count',
        setterName: 'setCount',
        sourceComponentId: 'src/Counter',
        sourceComponentName: 'Counter',
        consumers: ['src/Display', 'src/Summary'],
    },
];

describe('DataFlowFilter', () => {
    it('returns null when no state variables exist', () => {
        const { container } = render(
            <DataFlowFilter stateVariables={[]} onFilter={vi.fn()} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders the dropdown trigger button', () => {
        render(
            <DataFlowFilter stateVariables={mockVariables} onFilter={vi.fn()} />
        );
        expect(screen.getByText('Filter by State')).toBeInTheDocument();
    });

    it('opens dropdown and shows grouped variables', async () => {
        const user = userEvent.setup();
        render(
            <DataFlowFilter stateVariables={mockVariables} onFilter={vi.fn()} />
        );

        await user.click(screen.getByText('Filter by State'));

        // Should show component group headers
        expect(screen.getByText('App')).toBeInTheDocument();
        expect(screen.getByText('Counter')).toBeInTheDocument();

        // Should show variable names
        expect(screen.getByText('user')).toBeInTheDocument();
        expect(screen.getByText('count')).toBeInTheDocument();
    });

    it('calls onFilter with correct node IDs when selecting a variable', async () => {
        const mockOnFilter = vi.fn();
        const user = userEvent.setup();
        render(
            <DataFlowFilter stateVariables={mockVariables} onFilter={mockOnFilter} />
        );

        await user.click(screen.getByText('Filter by State'));
        await user.click(screen.getByText('user'));

        expect(mockOnFilter).toHaveBeenCalledWith(['src/App', 'src/Header']);
    });

    it('calls onFilter(null) when "Show All" is selected', async () => {
        const mockOnFilter = vi.fn();
        const user = userEvent.setup();
        render(
            <DataFlowFilter stateVariables={mockVariables} onFilter={mockOnFilter} />
        );

        await user.click(screen.getByText('Filter by State'));
        await user.click(screen.getByText('Show All Components'));

        expect(mockOnFilter).toHaveBeenCalledWith(null);
    });

    it('shows consumer count for each variable', async () => {
        const user = userEvent.setup();
        render(
            <DataFlowFilter stateVariables={mockVariables} onFilter={vi.fn()} />
        );

        await user.click(screen.getByText('Filter by State'));

        expect(screen.getByText('1 consumer')).toBeInTheDocument();
        expect(screen.getByText('2 consumers')).toBeInTheDocument();
    });
});
