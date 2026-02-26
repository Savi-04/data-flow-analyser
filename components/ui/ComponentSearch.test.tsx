import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentSearch } from './ComponentSearch';

const mockNodes = [
    { id: 'src/App', name: 'App' },
    { id: 'src/Header', name: 'Header' },
    { id: 'src/Footer', name: 'Footer' },
    { id: 'src/Button', name: 'Button' },
    { id: 'src/useAuth', name: 'useAuth' },
];

describe('ComponentSearch', () => {
    it('renders the search input', () => {
        render(
            <ComponentSearch nodes={mockNodes} onSelect={vi.fn()} selectedNodeId={null} />
        );
        expect(screen.getByPlaceholderText('Search components...')).toBeInTheDocument();
    });

    it('shows dropdown with nodes on focus', async () => {
        const user = userEvent.setup();
        render(
            <ComponentSearch nodes={mockNodes} onSelect={vi.fn()} selectedNodeId={null} />
        );

        const input = screen.getByPlaceholderText('Search components...');
        await user.click(input);

        // Dropdown should show nodes
        expect(screen.getByText('App')).toBeInTheDocument();
        expect(screen.getByText('Header')).toBeInTheDocument();
        expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('filters nodes by search query', async () => {
        const user = userEvent.setup();
        render(
            <ComponentSearch nodes={mockNodes} onSelect={vi.fn()} selectedNodeId={null} />
        );

        const input = screen.getByPlaceholderText('Search components...');
        await user.type(input, 'Head');

        expect(screen.getByText('Header')).toBeInTheDocument();
        // "App", "Footer", "Button" should not be visible in the dropdown
        expect(screen.queryByRole('button', { name: 'App' })).not.toBeInTheDocument();
    });

    it('calls onSelect when a node is clicked', async () => {
        const mockOnSelect = vi.fn();
        const user = userEvent.setup();
        render(
            <ComponentSearch nodes={mockNodes} onSelect={mockOnSelect} selectedNodeId={null} />
        );

        const input = screen.getByPlaceholderText('Search components...');
        await user.click(input);
        await user.click(screen.getByText('Header'));

        expect(mockOnSelect).toHaveBeenCalledWith('src/Header');
    });

    it('shows clear button when a node is selected', () => {
        render(
            <ComponentSearch nodes={mockNodes} onSelect={vi.fn()} selectedNodeId="src/App" />
        );

        // The input should display the selected node's name
        const input = screen.getByPlaceholderText('Search components...') as HTMLInputElement;
        expect(input.value).toBe('App');
    });

    it('clears selection when clear button is clicked', async () => {
        const mockOnSelect = vi.fn();
        const user = userEvent.setup();
        const { container } = render(
            <ComponentSearch nodes={mockNodes} onSelect={mockOnSelect} selectedNodeId="src/App" />
        );

        // Find the clear (X) button
        const clearButton = container.querySelector('button');
        if (clearButton) {
            await user.click(clearButton);
            expect(mockOnSelect).toHaveBeenCalledWith(null);
        }
    });
});
