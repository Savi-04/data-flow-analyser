import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPage } from './LandingPage';

// Mock the ParticleField component (uses Three.js/Canvas which isn't available in jsdom)
vi.mock('./ParticleField', () => ({
    ParticleField: () => <div data-testid="particle-field" />,
}));

describe('LandingPage', () => {
    const mockOnSubmit = vi.fn();

    beforeEach(() => {
        mockOnSubmit.mockClear();
    });

    it('renders the hero section with title and subtitle', () => {
        render(<LandingPage onSubmit={mockOnSubmit} />);

        expect(screen.getByText('React Repo')).toBeInTheDocument();
        expect(screen.getByText('X-Ray')).toBeInTheDocument();
        expect(screen.getByText(/interactive 3D constellation/i)).toBeInTheDocument();
    });

    it('renders the search input and analyze button', () => {
        render(<LandingPage onSubmit={mockOnSubmit} />);

        expect(screen.getByPlaceholderText('Paste GitHub repository URL...')).toBeInTheDocument();
        expect(screen.getByText('Analyze Repository')).toBeInTheDocument();
    });

    it('disables analyze button when input is empty', () => {
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const button = screen.getByText('Analyze Repository').closest('button');
        expect(button).toBeDisabled();
    });

    it('enables analyze button when URL is entered', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const input = screen.getByPlaceholderText('Paste GitHub repository URL...');
        await user.type(input, 'facebook/react');

        const button = screen.getByText('Analyze Repository').closest('button');
        expect(button).not.toBeDisabled();
    });

    it('calls onSubmit with URL when form is submitted', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const input = screen.getByPlaceholderText('Paste GitHub repository URL...');
        await user.type(input, 'facebook/react');

        const button = screen.getByText('Analyze Repository').closest('button')!;
        await user.click(button);

        expect(mockOnSubmit).toHaveBeenCalledWith('facebook/react', undefined);
    });

    it('renders Quick Start buttons', () => {
        render(<LandingPage onSubmit={mockOnSubmit} />);

        expect(screen.getByText('Demo Mode')).toBeInTheDocument();
        expect(screen.getByText('React')).toBeInTheDocument();
        expect(screen.getByText('Next.js')).toBeInTheDocument();
    });

    it('Quick Start "Demo Mode" sets URL to demo and triggers submit', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const demoButton = screen.getByText('Demo Mode').closest('button')!;
        await user.click(demoButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('demo', undefined);
    });

    it('Quick Start "React" button triggers submit with React repo URL', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const reactButton = screen.getByText('React').closest('button')!;
        await user.click(reactButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('https://github.com/facebook/react', undefined);
    });

    it('Quick Start "Next.js" button triggers submit with Next.js repo URL', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        const nextButton = screen.getByText('Next.js').closest('button')!;
        await user.click(nextButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('https://github.com/vercel/next.js', undefined);
    });

    it('renders feature cards', () => {
        render(<LandingPage onSubmit={mockOnSubmit} />);

        expect(screen.getByText('Deep Analysis')).toBeInTheDocument();
        expect(screen.getByText('3D Visualization')).toBeInTheDocument();
        expect(screen.getByText('Private Repos')).toBeInTheDocument();
    });

    it('shows advanced token input when toggled', async () => {
        const user = userEvent.setup();
        render(<LandingPage onSubmit={mockOnSubmit} />);

        // Token input should not be visible initially
        expect(screen.queryByPlaceholderText('GitHub Personal Access Token')).not.toBeInTheDocument();

        // Click "Private Repository Access"
        const advancedButton = screen.getByText('Private Repository Access').closest('button')!;
        await user.click(advancedButton);

        expect(screen.getByPlaceholderText('GitHub Personal Access Token')).toBeInTheDocument();
    });
});
