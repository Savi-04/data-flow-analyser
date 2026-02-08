import { FileNode, ComponentNode, GraphLink, GraphData, StateVariable } from '@/types';

/**
 * Detect if a file contains a React component
 */
function detectComponent(content: string, fileName: string): ComponentNode | null {
    // Remove comments
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    const components: string[] = [];

    // Pattern 1: Arrow function components - const App = () => {} or const App = (props) => {}
    const arrowPattern = /(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_][a-zA-Z0-9_]*)\s*=>/g;
    let match;
    while ((match = arrowPattern.exec(cleanContent)) !== null) {
        components.push(match[1]);
    }

    // Pattern 2: Regular function components - function App() {} or function App(props) {}
    const functionPattern = /(?:export\s+(?:default\s+)?)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    while ((match = functionPattern.exec(cleanContent)) !== null) {
        components.push(match[1]);
    }

    // Pattern 3: Class components
    const classPattern = /(?:export\s+(?:default\s+)?)?class\s+([A-Z][a-zA-Z0-9]*)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/g;
    while ((match = classPattern.exec(cleanContent)) !== null) {
        components.push(match[1]);
    }

    // Remove duplicates
    const uniqueComponents = [...new Set(components)];

    if (uniqueComponents.length === 0) {
        return null;
    }

    // Use the first component found as the primary component
    const componentName = uniqueComponents[0];

    // Detect hooks usage
    const usesState = /useState/.test(cleanContent);
    const usesEffect = /useEffect/.test(cleanContent);
    const usesProps = /props\.|{[^}]*}.*=.*props|\(\s*\{/.test(cleanContent);

    return {
        id: fileName.replace(/\.[^.]+$/, ''), // Remove extension
        name: componentName,
        type: 'component',
        filePath: fileName,
        imports: [],
        exports: uniqueComponents,
        usesState,
        usesEffect,
        usesProps,
        complexity: 0,
    };
}

/**
 * Detect if a file is a custom hook
 */
function detectHook(content: string, fileName: string): ComponentNode | null {
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    // Pattern for custom hooks (functions starting with 'use')
    const hookPatterns = [
        /(?:export\s+(?:default\s+)?)?function\s+(use[A-Z][a-zA-Z0-9]*)\s*\(/g,
        /(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(use[A-Z][a-zA-Z0-9]*)\s*=/g,
    ];

    for (const pattern of hookPatterns) {
        const match = pattern.exec(cleanContent);
        if (match) {
            const hookName = match[1];
            return {
                id: fileName.replace(/\.[^.]+$/, ''),
                name: hookName,
                type: 'hook',
                filePath: fileName,
                imports: [],
                exports: [hookName],
                usesState: /useState/.test(cleanContent),
                usesEffect: /useEffect/.test(cleanContent),
                usesProps: false,
                complexity: 0,
            };
        }
    }

    return null;
}

/**
 * Detect utility/helper files
 */
function detectUtil(content: string, fileName: string): ComponentNode | null {
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    // Pattern for exported functions (lowercase first letter = utility)
    const exportPatterns = [
        /export\s+function\s+([a-z][a-zA-Z0-9]*)\s*\(/g,
        /export\s+(?:const|let|var)\s+([a-z][a-zA-Z0-9]*)\s*=/g,
    ];

    const exports: string[] = [];

    for (const pattern of exportPatterns) {
        let match;
        while ((match = pattern.exec(cleanContent)) !== null) {
            exports.push(match[1]);
        }
    }

    if (exports.length === 0) {
        return null;
    }

    return {
        id: fileName.replace(/\.[^.]+$/, ''),
        name: exports[0], // Use first export as name
        type: 'util',
        filePath: fileName,
        imports: [],
        exports,
        usesState: false,
        usesEffect: false,
        usesProps: false,
        complexity: 0,
    };
}

/**
 * Extract import statements from file content
 */
function extractImports(content: string): string[] {
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    const imports: string[] = [];

    // Match named imports: import { Foo, Bar } from '...'
    const namedImportPattern = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = namedImportPattern.exec(cleanContent)) !== null) {
        const importPath = match[2];
        // Only track local imports (relative paths or @/ aliases)
        if (importPath.startsWith('.') || importPath.startsWith('@/')) {
            const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
            imports.push(...names);
        }
    }

    // Match default imports: import Foo from '...'
    const defaultImportPattern = /import\s+([A-Z][a-zA-Z0-9]*)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = defaultImportPattern.exec(cleanContent)) !== null) {
        const importPath = match[2];
        if (importPath.startsWith('.') || importPath.startsWith('@/')) {
            imports.push(match[1]);
        }
    }

    return imports;
}

/**
 * Main analysis function
 */
export function analyzeCode(files: FileNode[]): GraphData & { stateVariables: StateVariable[] } {
    const nodes: ComponentNode[] = [];
    const nodeMap = new Map<string, ComponentNode>();
    const nameToNode = new Map<string, ComponentNode>(); // Map component names to nodes
    const stateVariables: StateVariable[] = [];

    // First pass: Detect all nodes and extract state variables
    for (const file of files) {
        if (!file.content) continue;

        let node: ComponentNode | null = null;

        // Try to detect component first
        node = detectComponent(file.content, file.path);

        // If not a component, try hook
        if (!node) {
            node = detectHook(file.content, file.path);
        }

        // If not a hook, try util
        if (!node) {
            node = detectUtil(file.content, file.path);
        }

        if (node) {
            // Extract imports
            node.imports = extractImports(file.content);
            nodes.push(node);
            nodeMap.set(node.id, node);
            nameToNode.set(node.name, node); // Also map by name

            // Extract useState variables
            const useStatePattern = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState/g;
            let stateMatch;
            while ((stateMatch = useStatePattern.exec(file.content)) !== null) {
                stateVariables.push({
                    name: stateMatch[1],
                    setterName: stateMatch[2],
                    sourceComponentId: node.id,
                    sourceComponentName: node.name,
                    consumers: [], // Will be filled in second pass
                });
            }
        }
    }

    // Second pass: Build links based on imports and JSX usage
    const links: GraphLink[] = [];

    for (const file of files) {
        if (!file.content) continue;

        const sourceNode = nodeMap.get(file.path.replace(/\.[^.]+$/, ''));
        if (!sourceNode) continue;

        // Check for JSX usage of other components
        for (const [_, targetNode] of nameToNode.entries()) {
            if (targetNode.id === sourceNode.id) continue;

            // Check if this component is imported
            const isImported = sourceNode.imports.includes(targetNode.name);

            // Check if this component is used in JSX
            const jsxPattern = new RegExp(`<${targetNode.name}[\\s/>]`, 'g');
            const isUsedInJSX = jsxPattern.test(file.content);

            // Create link if imported OR used in JSX (to catch default exports)
            if (isImported || isUsedInJSX) {
                // Extract props passed to this component
                // Pattern: <ComponentName prop1={...} prop2={...} />
                const propsPattern = new RegExp(`<${targetNode.name}\\s+([^>]*)/?\\s*>`, 'gs');
                const propMatch = propsPattern.exec(file.content);
                const propsStr = propMatch ? propMatch[1] : '';

                // Extract individual prop names (propName={...} or propName="...")
                const propNamePattern = /(\w+)\s*=/g;
                const propNames: string[] = [];
                let propNameMatch;
                while ((propNameMatch = propNamePattern.exec(propsStr)) !== null) {
                    const propName = propNameMatch[1];
                    // Skip common internal props
                    if (!['key', 'ref', 'className', 'style', 'children'].includes(propName)) {
                        propNames.push(propName);
                    }
                }

                links.push({
                    source: sourceNode.id,
                    target: targetNode.id,
                    props: propNames.length > 0 ? propNames : undefined,
                });

                // Check if any state variables are passed as props to this component
                for (const stateVar of stateVariables) {
                    // Check if this state variable is passed to the target component
                    const propPattern = new RegExp(`<${targetNode.name}[^>]*\\b${stateVar.name}\\b`);
                    if (propPattern.test(file.content) || propPattern.test(file.content.replace(/\n/g, ' '))) {
                        if (!stateVar.consumers.includes(targetNode.id)) {
                            stateVar.consumers.push(targetNode.id);
                        }
                    }
                }
            }
        }
    }

    // Calculate complexity (number of connections)
    for (const link of links) {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);

        if (sourceNode) sourceNode.complexity++;
        if (targetNode) targetNode.complexity++;
    }

    // Filter out isolated nodes (no connections)
    const connectedNodes = nodes.filter(node => node.complexity > 0);

    return { nodes: connectedNodes, links, stateVariables };
}

