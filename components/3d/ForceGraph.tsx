'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, Grid } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { GraphNode } from './GraphNode';
import { GraphLink } from './GraphLink';
import { GraphData, ComponentNode } from '@/types';
import * as THREE from 'three';

interface ForceGraphProps {
    data: GraphData;
    onNodeSelect: (node: ComponentNode | null) => void;
    filteredNodeIds?: string[] | null;
    highlightedNodeId?: string | null;
}

export function ForceGraph({ data, onNodeSelect, filteredNodeIds, highlightedNodeId }: ForceGraphProps) {
    const [hoveredNode, setHoveredNode] = useState<ComponentNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<ComponentNode | null>(null);

    // Simple force-directed layout algorithm
    const nodePositions = useMemo(() => {
        const positions = new Map<string, [number, number, number]>();
        const { nodes, links } = data;

        if (nodes.length === 0) return positions;

        // Initialize positions in a sphere
        nodes.forEach((node, index) => {
            const phi = Math.acos(-1 + (2 * index) / nodes.length);
            const theta = Math.sqrt(nodes.length * Math.PI) * phi;
            const radius = 10;

            positions.set(node.id, [
                radius * Math.cos(theta) * Math.sin(phi),
                radius * Math.sin(theta) * Math.sin(phi),
                radius * Math.cos(phi),
            ]);
        });

        // Simple force-directed adjustment
        for (let iteration = 0; iteration < 50; iteration++) {
            const forces = new Map<string, THREE.Vector3>();

            // Initialize forces
            nodes.forEach(node => {
                forces.set(node.id, new THREE.Vector3(0, 0, 0));
            });

            // Repulsion between all nodes
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

            // Attraction along links
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

            // Apply forces
            nodes.forEach(node => {
                const pos = positions.get(node.id)!;
                const force = forces.get(node.id)!;
                positions.set(node.id, [
                    pos[0] + force.x,
                    pos[1] + force.y,
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

    // Check if node should be dimmed (filtered out)
    const isNodeDimmed = (nodeId: string) => {
        if (!filteredNodeIds) return false;
        return !filteredNodeIds.includes(nodeId);
    };

    // Check if link should be dimmed
    const isLinkDimmed = (source: string, target: string) => {
        if (!filteredNodeIds) return false;
        return !filteredNodeIds.includes(source) || !filteredNodeIds.includes(target);
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
                />

                {/* Enhanced Lighting */}
                <ambientLight intensity={0.15} />
                <pointLight position={[10, 10, 10]} intensity={0.8} color="#00f3ff" />
                <pointLight position={[-10, -10, -10]} intensity={0.5} color="#bf00ff" />
                <pointLight position={[0, 15, 0]} intensity={0.3} color="#ffffff" />

                {/* Fog for depth */}
                <fog attach="fog" args={['#050510', 25, 80]} />

                {/* Starfield background */}
                <Stars
                    radius={150}
                    depth={80}
                    count={8000}
                    factor={5}
                    saturation={0.5}
                    fade
                    speed={0.5}
                />

                {/* Grid plane for spatial reference */}
                <Grid
                    position={[0, -12, 0]}
                    args={[50, 50]}
                    cellSize={1}
                    cellThickness={0.3}
                    cellColor="#1a1a3a"
                    sectionSize={5}
                    sectionThickness={0.8}
                    sectionColor="#2a2a5a"
                    fadeDistance={60}
                    fadeStrength={1}
                    infiniteGrid
                />

                {/* Render nodes */}
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
                        />
                    );
                })}

                {/* Render links */}
                {data.links.map((link, index) => {
                    const startPos = nodePositions.get(link.source);
                    const endPos = nodePositions.get(link.target);

                    if (!startPos || !endPos) return null;

                    return (
                        <GraphLink
                            key={`${link.source}-${link.target}-${index}`}
                            start={startPos}
                            end={endPos}
                            isDimmed={isLinkDimmed(link.source, link.target)}
                            props={link.props}
                        />
                    );
                })}

                {/* Post-processing effects */}
                <EffectComposer>
                    <Bloom
                        luminanceThreshold={0.2}
                        luminanceSmoothing={0.9}
                        intensity={1.5}
                        mipmapBlur
                    />
                    <Vignette eskil={false} offset={0.1} darkness={0.8} />
                </EffectComposer>
            </Canvas>

            {/* Holographic tooltip */}
            {hoveredNode && (
                <div className="absolute top-4 left-4 glass p-4 rounded-lg pointer-events-none border border-neon-cyan/30">
                    <h3 className="text-neon-cyan text-lg font-bold text-glow-cyan">
                        {hoveredNode.name}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">
                        Type: <span className="text-neon-purple">{hoveredNode.type}</span>
                    </p>
                    <p className="text-gray-400 text-sm">
                        Connections: <span className="text-neon-cyan">{hoveredNode.complexity}</span>
                    </p>
                    {hoveredNode.usesState && (
                        <span className="inline-block mt-2 px-2 py-1 bg-neon-purple/20 text-neon-purple text-xs rounded border border-neon-purple/30">
                            useState
                        </span>
                    )}
                    {hoveredNode.usesEffect && (
                        <span className="inline-block mt-2 ml-1 px-2 py-1 bg-neon-cyan/20 text-neon-cyan text-xs rounded border border-neon-cyan/30">
                            useEffect
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
