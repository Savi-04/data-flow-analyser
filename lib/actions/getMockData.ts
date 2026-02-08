'use server';

import { GraphData } from '@/types';

/**
 * Mock function to generate sample graph data for testing
 */
export async function getMockGraphData(): Promise<GraphData> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        nodes: [
            {
                id: 'App',
                name: 'App',
                type: 'component',
                filePath: 'src/App.tsx',
                imports: ['Header', 'Footer'],
                exports: ['App'],
                usesState: true,
                usesEffect: true,
                usesProps: false,
                complexity: 2,
            },
            {
                id: 'Header',
                name: 'Header',
                type: 'component',
                filePath: 'src/components/Header.tsx',
                imports: ['useAuth'],
                exports: ['Header'],
                usesState: false,
                usesEffect: false,
                usesProps: true,
                complexity: 2,
            },
            {
                id: 'Footer',
                name: 'Footer',
                type: 'component',
                filePath: 'src/components/Footer.tsx',
                imports: [],
                exports: ['Footer'],
                usesState: false,
                usesEffect: false,
                usesProps: true,
                complexity: 1,
            },
            {
                id: 'useAuth',
                name: 'useAuth',
                type: 'hook',
                filePath: 'src/hooks/useAuth.ts',
                imports: ['api'],
                exports: ['useAuth'],
                usesState: true,
                usesEffect: true,
                usesProps: false,
                complexity: 2,
            },
            {
                id: 'api',
                name: 'api',
                type: 'util',
                filePath: 'src/utils/api.ts',
                imports: [],
                exports: ['api', 'fetchUser', 'logout'],
                usesState: false,
                usesEffect: false,
                usesProps: false,
                complexity: 1,
            },
        ],
        links: [
            { source: 'App', target: 'Header', props: ['user', 'isLoggedIn', 'onLogout'] },
            { source: 'App', target: 'Footer', props: ['copyright'] },
            { source: 'Header', target: 'useAuth' },
            { source: 'useAuth', target: 'api' },
        ],
    };
}
