'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ComponentNode } from '@/types';

interface GraphNodeProps {
    node: ComponentNode;
    position: [number, number, number];
    onClick: () => void;
    onHover: (node: ComponentNode | null) => void;
    isSelected: boolean;
    isDimmed?: boolean;
    isHighlighted?: boolean;
}

export function GraphNode({ node, position, onClick, onHover, isSelected, isDimmed = false, isHighlighted = false }: GraphNodeProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.PointLight>(null);

    // Determine color based on node type
    const getColor = () => {
        if (isHighlighted) return '#ffff00'; // Yellow for highlighted search result
        if (isDimmed) return '#333355';
        switch (node.type) {
            case 'component':
                return '#0066ff'; // Blue
            case 'hook':
                return '#ff0066'; // Red
            case 'util':
                return '#00ff66'; // Green
            default:
                return '#ffffff';
        }
    };

    // Size based on complexity (connections)
    const size = Math.max(0.3, Math.min(1.5, 0.3 + node.complexity * 0.1));

    // Animate the node
    useFrame((state) => {
        if (meshRef.current) {
            // Gentle floating animation (skip if dimmed)
            if (!isDimmed) {
                meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.1;
                meshRef.current.rotation.y += 0.005;
            }

            // Pulse effect when selected
            if (isSelected && !isDimmed) {
                const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
                meshRef.current.scale.setScalar(scale);
            } else {
                meshRef.current.scale.setScalar(isDimmed ? 0.6 : 1);
            }
        }

        // Animate glow intensity
        if (glowRef.current) {
            if (isDimmed) {
                glowRef.current.intensity = 0.1;
            } else {
                glowRef.current.intensity = isSelected ? 3 : 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.5;
            }
        }
    });

    return (
        <group position={position}>
            {/* Point light for glow effect */}
            <pointLight
                ref={glowRef}
                color={getColor()}
                intensity={isDimmed ? 0.1 : 1.5}
                distance={5}
            />

            {/* Main sphere */}
            <Sphere
                ref={meshRef}
                args={[size, 32, 32]}
                onClick={onClick}
                onPointerOver={() => onHover(node)}
                onPointerOut={() => onHover(null)}
            >
                <meshStandardMaterial
                    color={getColor()}
                    emissive={getColor()}
                    emissiveIntensity={isDimmed ? 0 : isSelected ? 1.5 : 0.5}
                    metalness={0.8}
                    roughness={0.2}
                    transparent
                    opacity={isDimmed ? 0.2 : 1}
                />
            </Sphere>

            {/* Outer glow ring */}
            {!isDimmed && (
                <Sphere args={[size * 1.2, 32, 32]}>
                    <meshBasicMaterial
                        color={getColor()}
                        transparent
                        opacity={0.2}
                        side={THREE.BackSide}
                    />
                </Sphere>
            )}

            {/* Node Label */}
            <Text
                position={[0, size + 0.5, 0]}
                fontSize={0.5}
                color={isDimmed ? '#555577' : 'white'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={isDimmed ? 0 : 0.05}
                outlineColor="black"
            >
                {node.name}
            </Text>
        </group>
    );
}
