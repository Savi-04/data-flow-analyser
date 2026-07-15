'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { GraphNode, TYPE_COLORS } from './GraphNode';
import { GraphLink } from './GraphLink';
import { GraphData, ComponentNode, StateVariable } from '@/types';
import * as THREE from 'three';

interface ForceGraphProps {
    data: GraphData;
    onNodeSelect: (node: ComponentNode | null) => void;
    filteredNodeIds?: string[] | null;
    highlightedNodeId?: string | null;
    activeFlow?: StateVariable | null;
}

// Vertical strata by architectural role — the layout itself communicates
// the app's shape instead of nodes settling into an arbitrary hairball.
const STRATA_Y: Record<ComponentNode['type'], number> = {
    component: 6,
    hook: 0,
    util: -6,
};

function topLevelDir(filePath: string): string {
    const parts = filePath.split('/');
    return parts.length > 1 ? parts[0] : '__root__';
}

export function ForceGraph({ data, onNodeSelect, filteredNodeIds, highlightedNodeId, activeFlow }: ForceGraphProps) {
    const [hoveredNode, setHoveredNode] = useState<ComponentNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<ComponentNode | null>(null);

    const { adjacency, linkTouches } = useMemo(() => {
        const adjacency = new Map<string, Set<string>>();
        const linkTouches = new Map<string, Set<number>>();

        data.links.forEach((link, index) => {
            if (!adjacency.has(link.source)) adjacency.set(link.source, new Set());
            if (!adjacency.has(link.target)) adjacency.set(link.target, new Set());
            adjacency.get(link.source)!.add(link.target);
            adjacency.get(link.target)!.add(link.source);

            if (!linkTouches.has(link.source)) linkTouches.set(link.source, new Set());
            if (!linkTouches.has(link.target)) linkTouches.set(link.target, new Set());
            linkTouches.get(link.source)!.add(index);
            linkTouches.get(link.target)!.add(index);
        });

        return { adjacency, linkTouches };
    }, [data.links]);

    // Stratified force-directed layout: Y is locked by role (component / hook /
    // util), X/Z clustered by top-level directory, then relaxed with a
    // Y-flattened repulsion/attraction pass plus weak gravity to cluster centers.
    const nodePositions = useMemo(() => {
        const positions = new Map<string, [number, number, number]>();
        const { nodes, links } = data;

        if (nodes.length === 0) return positions;

        const dirs = Array.from(new Set(nodes.map(n => topLevelDir(n.filePath))));
        const clusterCenters = new Map<string, THREE.Vector2>();
        dirs.forEach((dir, index) => {
            const angle = (index / dirs.length) * Math.PI * 2;
            clusterCenters.set(dir, new THREE.Vector2(Math.cos(angle) * 8, Math.sin(angle) * 8));
        });

        nodes.forEach((node) => {
            const center = clusterCenters.get(topLevelDir(node.filePath))!;
            const jitterAngle = Math.random() * Math.PI * 2;
            const jitterRadius = Math.random() * 2.5;
            const baseY = STRATA_Y[node.type] ?? 0;

            positions.set(node.id, [
                center.x + Math.cos(jitterAngle) * jitterRadius,
                baseY + (Math.random() - 0.5) * 1.6,
                center.y + Math.sin(jitterAngle) * jitterRadius,
            ]);
        });

        for (let iteration = 0; iteration < 50; iteration++) {
            const forces = new Map<string, THREE.Vector3>();

            nodes.forEach(node => {
                forces.set(node.id, new THREE.Vector3(0, 0, 0));
            });

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const nodeA = nodes[i];
                    const nodeB = nodes[j];
                    const posA = positions.get(nodeA.id)!;
                    const posB = positions.get(nodeB.id)!;

                    const vecA = new THREE.Vector3(...posA);
                    const vecB = new THREE.Vector3(...posB);
                    const delta = vecA.clone().sub(vecB);
                    const distance = delta.length();

                    if (distance > 0) {
                        const repulsion = delta.normalize().multiplyScalar(0.5 / distance);
                        forces.get(nodeA.id)!.add(repulsion);
                        forces.get(nodeB.id)!.sub(repulsion);
                    }
                }
            }

            links.forEach(link => {
                const posSource = positions.get(link.source);
                const posTarget = positions.get(link.target);

                if (posSource && posTarget) {
                    const vecSource = new THREE.Vector3(...posSource);
                    const vecTarget = new THREE.Vector3(...posTarget);
                    const delta = vecTarget.clone().sub(vecSource);
                    const distance = delta.length();

                    if (distance > 0) {
                        const attraction = delta.normalize().multiplyScalar(distance * 0.01);
                        forces.get(link.source)!.add(attraction);
                        forces.get(link.target)!.sub(attraction);
                    }
                }
            });

            nodes.forEach(node => {
                const pos = positions.get(node.id)!;
                const center = clusterCenters.get(topLevelDir(node.filePath))!;
                const toCenter = new THREE.Vector3(center.x - pos[0], 0, center.y - pos[2]);
                forces.get(node.id)!.add(toCenter.multiplyScalar(0.01));
            });

            nodes.forEach(node => {
                const pos = positions.get(node.id)!;
                const force = forces.get(node.id)!;
                positions.set(node.id, [
                    pos[0] + force.x,
                    pos[1],
                    pos[2] + force.z,
                ]);
            });
        }

        return positions;
    }, [data]);

    const handleNodeClick = (node: ComponentNode) => {
        setSelectedNode(node);
        onNodeSelect(node);
    };

    const handleNodeHover = (node: ComponentNode | null) => {
        setHoveredNode(node);
    };

    const hoveredNeighbors = hoveredNode ? adjacency.get(hoveredNode.id) : undefined;
    const hoveredLinkIndices = hoveredNode ? linkTouches.get(hoveredNode.id) : undefined;
    const neighborhoodColor = hoveredNode ? TYPE_COLORS[hoveredNode.type] : undefined;

    const flowLinkIndices = useMemo(() => {
        if (!activeFlow) return new Set<number>();
        const consumers = new Set(activeFlow.consumers);
        const indices = new Set<number>();
        data.links.forEach((link, index) => {
            if (link.source === activeFlow.sourceComponentId && consumers.has(link.target)) {
                indices.add(index);
            }
        });
        return indices;
    }, [activeFlow, data.links]);

    const flowNodeIds = useMemo(() => {
        if (!activeFlow) return new Set<string>();
        return new Set([activeFlow.sourceComponentId, ...activeFlow.consumers]);
    }, [activeFlow]);

    const isNodeDimmed = (nodeId: string) => {
        if (activeFlow) return !flowNodeIds.has(nodeId);
        if (filteredNodeIds && !filteredNodeIds.includes(nodeId)) return true;
        if (hoveredNode && nodeId !== hoveredNode.id && !hoveredNeighbors?.has(nodeId)) return true;
        return false;
    };

    const isNodeInNeighborhood = (nodeId: string) => {
        if (!hoveredNode) return false;
        return hoveredNeighbors?.has(nodeId) ?? false;
    };

    const isLinkDimmed = (source: string, target: string, index: number) => {
        if (activeFlow) return !flowLinkIndices.has(index);
        if (filteredNodeIds && (!filteredNodeIds.includes(source) || !filteredNodeIds.includes(target))) return true;
        if (hoveredNode && !hoveredLinkIndices?.has(index)) return true;
        return false;
    };

    const isLinkInNeighborhood = (index: number) => {
        if (!hoveredNode) return false;
        return hoveredLinkIndices?.has(index) ?? false;
    };

    return (
        <div className="w-full h-full">
            <Canvas>
                <PerspectiveCamera makeDefault position={[0, 0, 30]} />
                <OrbitControls
                    enableDamping
                    dampingFactor={0.05}
                    rotateSpeed={0.5}
                    zoomSpeed={0.8}
                    mouseButtons={{
                        LEFT: 0,
                        MIDDLE: 1,
                        RIGHT: 2,
                    }}
                />

                <color attach="background" args={['#f6f7fb']} />
                <ambientLight intensity={0.9} />
                <directionalLight position={[10, 14, 10]} intensity={0.6} />
                <directionalLight position={[-10, -6, -8]} intensity={0.25} />
                <fog attach="fog" args={['#f6f7fb', 30, 90]} />

                {data.nodes.map((node) => {
                    const position = nodePositions.get(node.id);
                    if (!position) return null;

                    return (
                        <GraphNode
                            key={node.id}
                            node={node}
                            position={position}
                            onClick={() => handleNodeClick(node)}
                            onHover={handleNodeHover}
                            isSelected={selectedNode?.id === node.id}
                            isDimmed={isNodeDimmed(node.id)}
                            isHighlighted={highlightedNodeId === node.id}
                            inNeighborhood={isNodeInNeighborhood(node.id)}
                            isFlowActive={flowNodeIds.has(node.id)}
                        />
                    );
                })}

                {data.links.map((link, index) => {
                    const startPos = nodePositions.get(link.source);
                    const endPos = nodePositions.get(link.target);

                    if (!startPos || !endPos) return null;

                    return (
                        <GraphLink
                            key={`${link.source}-${link.target}-${index}`}
                            start={startPos}
                            end={endPos}
                            isDimmed={isLinkDimmed(link.source, link.target, index)}
                            isNeighborhood={isLinkInNeighborhood(index)}
                            isFlowActive={flowLinkIndices.has(index)}
                            neighborhoodColor={neighborhoodColor}
                            props={link.props}
                        />
                    );
                })}
            </Canvas>

            {hoveredNode && (
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg pointer-events-none border border-black/10 shadow-sm">
                    <h3 className="text-gray-900 text-sm font-semibold">
                        {hoveredNode.name}
                    </h3>
                    <p className="text-gray-500 text-xs mt-1">
                        {hoveredNode.type} · {hoveredNode.complexity} connection{hoveredNode.complexity !== 1 ? 's' : ''}
                    </p>
                </div>
            )}
        </div>
    );
}
