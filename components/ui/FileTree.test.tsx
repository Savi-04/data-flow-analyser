import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTree } from './FileTree';
import { FileNode } from '@/types';

const mockFiles: FileNode[] = [
    { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'export const App = () => {}' },
    { path: 'src/components/Header.tsx', name: 'Header.tsx', type: 'file', content: 'export const Header = () => {}' },
    { path: 'src/components/Footer.tsx', name: 'Footer.tsx', type: 'file', content: 'export const Footer = () => {}' },
    { path: 'src/hooks/useAuth.ts', name: 'useAuth.ts', type: 'file', content: 'export function useAuth() {}' },
];

describe('FileTree', () => {
    it('renders the File Explorer header', () => {
        render(<FileTree files={mockFiles} />);
        expect(screen.getByText('File Explorer')).toBeInTheDocument();
    });

    it('renders top-level directory nodes', () => {
        render(<FileTree files={mockFiles} />);
        expect(screen.getByText('src')).toBeInTheDocument();
    });

    it('expands directory to show children when clicked', async () => {
        const user = userEvent.setup();
        render(<FileTree files={mockFiles} />);

        // Initially, nested files should not be visible
        expect(screen.queryByText('App.tsx')).not.toBeInTheDocument();

        // Click "src" to expand
        await user.click(screen.getByText('src'));

        // Should see children
        expect(screen.getByText('App.tsx')).toBeInTheDocument();
        expect(screen.getByText('components')).toBeInTheDocument();
        expect(screen.getByText('hooks')).toBeInTheDocument();
    });

    it('expands nested directories', async () => {
        const user = userEvent.setup();
        render(<FileTree files={mockFiles} />);

        // Expand src
        await user.click(screen.getByText('src'));
        // Expand components
        await user.click(screen.getByText('components'));

        expect(screen.getByText('Header.tsx')).toBeInTheDocument();
        expect(screen.getByText('Footer.tsx')).toBeInTheDocument();
    });

    it('calls onFileClick when a file is clicked', async () => {
        const mockOnFileClick = vi.fn();
        const user = userEvent.setup();
        render(<FileTree files={mockFiles} onFileClick={mockOnFileClick} />);

        // Expand src
        await user.click(screen.getByText('src'));
        // Click App.tsx
        await user.click(screen.getByText('App.tsx'));

        expect(mockOnFileClick).toHaveBeenCalledWith(
            expect.objectContaining({
                path: 'src/App.tsx',
                name: 'App.tsx',
                type: 'file',
            })
        );
    });

    it('renders collapse button when onCollapse is provided', () => {
        const mockOnCollapse = vi.fn();
        render(<FileTree files={mockFiles} onCollapse={mockOnCollapse} />);

        // The collapse button should be present (uses PanelLeftClose icon)
        const collapseButton = screen.getByTitle('Collapse File Explorer');
        expect(collapseButton).toBeInTheDocument();
    });

    it('calls onCollapse when collapse button is clicked', async () => {
        const mockOnCollapse = vi.fn();
        const user = userEvent.setup();
        render(<FileTree files={mockFiles} onCollapse={mockOnCollapse} />);

        const collapseButton = screen.getByTitle('Collapse File Explorer');
        await user.click(collapseButton);

        expect(mockOnCollapse).toHaveBeenCalled();
    });

    it('handles empty file list', () => {
        render(<FileTree files={[]} />);
        expect(screen.getByText('File Explorer')).toBeInTheDocument();
    });
});
