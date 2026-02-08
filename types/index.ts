export interface FileNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
    content?: string;
}

export interface ComponentNode {
    id: string;
    name: string;
    type: 'component' | 'hook' | 'util';
    filePath: string;
    imports: string[];
    exports: string[];
    usesState: boolean;
    usesEffect: boolean;
    usesProps: boolean;
    complexity: number; // Number of connections
}

export interface GraphLink {
    source: string;
    target: string;
    props?: string[]; // Prop names passed from source to target
}

export interface GraphData {
    nodes: ComponentNode[];
    links: GraphLink[];
}

export interface RepoData {
    owner: string;
    repo: string;
    files: FileNode[];
}

export interface StateVariable {
    name: string;
    setterName: string;
    sourceComponentId: string;
    sourceComponentName: string;
    consumers: string[]; // Component IDs that receive this as props
}

