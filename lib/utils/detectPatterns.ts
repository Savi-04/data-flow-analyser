import { ArchitecturalPattern, ComponentNode, GraphData, GraphLink, StateVariable } from '@/types';

/**
 * Deterministic architectural pattern detection over the dependency graph
 * `analyzeCode()` already builds. No LLM involved — plain graph algorithms,
 * which makes this cheap to run and easy to unit test.
 */

const GOD_COMPONENT_FLOOR = 8;
const PROP_DRILLING_DEPTH_THRESHOLD = 3;
const DEEP_HIERARCHY_THRESHOLD = 5;

function buildOutgoingLinks(links: GraphLink[]): Map<string, GraphLink[]> {
    const map = new Map<string, GraphLink[]>();
    for (const link of links) {
        if (!map.has(link.source)) map.set(link.source, []);
        map.get(link.source)!.push(link);
    }
    return map;
}

function buildOutgoingIds(links: GraphLink[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const link of links) {
        if (!map.has(link.source)) map.set(link.source, []);
        map.get(link.source)!.push(link.target);
    }
    return map;
}

function buildInboundCounts(nodes: ComponentNode[], links: GraphLink[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(node.id, 0);
    for (const link of links) {
        counts.set(link.target, (counts.get(link.target) ?? 0) + 1);
    }
    return counts;
}

function labelFor(nodeById: Map<string, ComponentNode>, id: string): string {
    return nodeById.get(id)?.name ?? id;
}

// ─── Prop drilling ──────────────────────────────────────────────────────────
// Follows a state variable's name through forwarding links (source -> target
// where the link's props include the variable) and reports the longest chain
// found. A chain of 3+ hops means the value is being threaded through
// intermediate components rather than handed directly to a consumer.

function longestForwardChain(
    nodeId: string,
    propName: string,
    outgoing: Map<string, GraphLink[]>,
    visited: Set<string>
): string[] {
    let longest: string[] = [nodeId];
    for (const link of outgoing.get(nodeId) ?? []) {
        if (!link.props?.includes(propName)) continue;
        if (visited.has(link.target)) continue; // guard against cycles
        const rest = longestForwardChain(link.target, propName, outgoing, new Set(visited).add(link.target));
        const candidate = [nodeId, ...rest];
        if (candidate.length > longest.length) longest = candidate;
    }
    return longest;
}

function detectPropDrilling(
    data: GraphData,
    stateVariables: StateVariable[],
    nodeById: Map<string, ComponentNode>
): ArchitecturalPattern[] {
    const outgoing = buildOutgoingLinks(data.links);
    const patterns: ArchitecturalPattern[] = [];

    for (const stateVar of stateVariables) {
        const chain = longestForwardChain(
            stateVar.sourceComponentId,
            stateVar.name,
            outgoing,
            new Set([stateVar.sourceComponentId])
        );
        const depth = chain.length - 1; // edges traversed
        if (depth >= PROP_DRILLING_DEPTH_THRESHOLD) {
            const labels = chain.map((id) => labelFor(nodeById, id));
            patterns.push({
                kind: 'prop-drilling',
                severity: 'warning',
                nodeIds: chain,
                description: `"${stateVar.name}" is threaded through ${depth} levels (${labels.join(' → ')}) before reaching its consumer — consider context or a store.`,
            });
        }
    }

    return patterns;
}

// ─── Circular dependency ────────────────────────────────────────────────────
// Classic DFS cycle detection with a recursion stack.

function detectCircularDependencies(data: GraphData, nodeById: Map<string, ComponentNode>): ArchitecturalPattern[] {
    const adjacency = buildOutgoingIds(data.links);
    const patterns: ArchitecturalPattern[] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];
    const reportedCycles = new Set<string>();

    function dfs(nodeId: string) {
        visited.add(nodeId);
        stack.add(nodeId);
        path.push(nodeId);

        for (const neighbor of adjacency.get(nodeId) ?? []) {
            if (stack.has(neighbor)) {
                const cycleStart = path.indexOf(neighbor);
                const cycle = path.slice(cycleStart).concat(neighbor);
                const signature = [...new Set(cycle)].sort().join('>');
                if (!reportedCycles.has(signature)) {
                    reportedCycles.add(signature);
                    const labels = cycle.map((id) => labelFor(nodeById, id));
                    patterns.push({
                        kind: 'circular-dependency',
                        severity: 'warning',
                        nodeIds: cycle,
                        description: `Circular dependency: ${labels.join(' → ')}`,
                    });
                }
            } else if (!visited.has(neighbor)) {
                dfs(neighbor);
            }
        }

        stack.delete(nodeId);
        path.pop();
    }

    for (const node of data.nodes) {
        if (!visited.has(node.id)) dfs(node.id);
    }

    return patterns;
}

// ─── God component ──────────────────────────────────────────────────────────
// Fan-in + fan-out in the top decile of the graph, AND above an absolute
// floor — the floor stops the biggest node in a tiny demo graph from being
// flagged just for being relatively the most connected.

function detectGodComponents(data: GraphData): ArchitecturalPattern[] {
    const degree = new Map<string, number>();
    for (const node of data.nodes) degree.set(node.id, 0);
    for (const link of data.links) {
        degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
        degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }

    const positiveDegrees = [...degree.values()].filter((d) => d > 0).sort((a, b) => a - b);
    if (positiveDegrees.length === 0) return [];

    const decileIndex = Math.min(Math.floor(positiveDegrees.length * 0.9), positiveDegrees.length - 1);
    const threshold = Math.max(positiveDegrees[decileIndex], GOD_COMPONENT_FLOOR);

    const patterns: ArchitecturalPattern[] = [];
    for (const node of data.nodes) {
        const d = degree.get(node.id) ?? 0;
        if (d >= threshold) {
            patterns.push({
                kind: 'god-component',
                severity: 'warning',
                nodeIds: [node.id],
                description: `"${node.name}" has ${d} connections — high fan-in/fan-out suggests it may be doing too much.`,
            });
        }
    }
    return patterns;
}

// ─── Orphaned module ────────────────────────────────────────────────────────
// Zero inbound links. Note analyzeCode() already drops nodes with
// complexity === 0 entirely, so every node here has *some* link — "orphaned"
// specifically means nothing points at it (it may still point at others).

function detectOrphanedModules(data: GraphData): ArchitecturalPattern[] {
    const inbound = buildInboundCounts(data.nodes, data.links);

    return data.nodes
        .filter((node) => (inbound.get(node.id) ?? 0) === 0)
        .map((node) => ({
            kind: 'orphaned-module' as const,
            severity: 'info' as const,
            nodeIds: [node.id],
            description: `"${node.name}" is never imported or rendered by another component — likely an entry point, or worth confirming it's still in use.`,
        }));
}

// ─── Container vs presentational ───────────────────────────────────────────

function detectContainerPresentational(data: GraphData): ArchitecturalPattern[] {
    const outboundCount = new Map<string, number>();
    for (const link of data.links) {
        outboundCount.set(link.source, (outboundCount.get(link.source) ?? 0) + 1);
    }

    const patterns: ArchitecturalPattern[] = [];
    for (const node of data.nodes) {
        if (node.type !== 'component') continue;
        const hasOutbound = (outboundCount.get(node.id) ?? 0) > 0;

        if ((node.usesState || node.usesEffect) && hasOutbound) {
            patterns.push({
                kind: 'container-component',
                severity: 'info',
                nodeIds: [node.id],
                description: `"${node.name}" owns state/effects and renders other components — a container component.`,
            });
        } else if (node.usesProps && !node.usesState && !node.usesEffect) {
            patterns.push({
                kind: 'presentational-component',
                severity: 'info',
                nodeIds: [node.id],
                description: `"${node.name}" only consumes props with no local state — a presentational component.`,
            });
        }
    }
    return patterns;
}

// ─── Deep hierarchy ─────────────────────────────────────────────────────────
// Longest root-to-leaf path, where "root" means a node nothing points at.

function longestPathDepth(nodeId: string, outgoing: Map<string, string[]>, visiting: Set<string>): number {
    if (visiting.has(nodeId)) return 0; // cycle guard
    const children = outgoing.get(nodeId) ?? [];
    if (children.length === 0) return 0;

    const nextVisiting = new Set(visiting).add(nodeId);
    let max = 0;
    for (const child of children) {
        max = Math.max(max, 1 + longestPathDepth(child, outgoing, nextVisiting));
    }
    return max;
}

function detectDeepHierarchies(data: GraphData): ArchitecturalPattern[] {
    const outgoing = buildOutgoingIds(data.links);
    const inbound = buildInboundCounts(data.nodes, data.links);
    const roots = data.nodes.filter((node) => (inbound.get(node.id) ?? 0) === 0);

    const patterns: ArchitecturalPattern[] = [];
    for (const root of roots) {
        const depth = longestPathDepth(root.id, outgoing, new Set());
        if (depth > DEEP_HIERARCHY_THRESHOLD) {
            patterns.push({
                kind: 'deep-hierarchy',
                severity: 'warning',
                nodeIds: [root.id],
                description: `The tree rooted at "${root.name}" is ${depth} levels deep — consider flattening or splitting it up.`,
            });
        }
    }
    return patterns;
}

export function detectPatterns(data: GraphData, stateVariables: StateVariable[] = []): ArchitecturalPattern[] {
    const nodeById = new Map(data.nodes.map((node) => [node.id, node]));

    return [
        ...detectPropDrilling(data, stateVariables, nodeById),
        ...detectCircularDependencies(data, nodeById),
        ...detectGodComponents(data),
        ...detectOrphanedModules(data),
        ...detectContainerPresentational(data),
        ...detectDeepHierarchies(data),
    ];
}
