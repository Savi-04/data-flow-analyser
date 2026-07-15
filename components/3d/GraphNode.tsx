'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Billboard, Text } from '@react-three/drei';
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
    inNeighborhood?: boolean;
    isFlowActive?: boolean;
}

// Light-theme, WCAG-conscious type palette (AA-contrast against a light backdrop)
export const TYPE_COLORS: Record<ComponentNode['type'], string> = {
    component: '#4338ca', // indigo-700
    hook: '#be185d',      // pink-700
    util: '#047857',      // emerald-700
};

export const FLOW_COLOR = '#b45309'; // amber-700
const HIGHLIGHT_COLOR = '#0f172a';   // near-black, max contrast on light bg
const DIMMED_COLOR = '#c7c9d9';

const INTENSITY = {
    dimmed: 0.15,
    rest: 0.55,
    neighborhood: 0.85,
    flow: 1.0,
    selected: 1.1,
    highlighted: 1.2,
};

export function GraphNode({
    node,
    position,
    onClick,
    onHover,
    isSelected,
    isDimmed = false,
    isHighlighted = false,
    inNeighborhood = false,
    isFlowActive = false,
}: GraphNodeProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [labelOpacity, setLabelOpacity] = useState(1);

    const baseColor = TYPE_COLORS[node.type] ?? '#4338ca';
    const color = isHighlighted ? HIGHLIGHT_COLOR : isFlowActive ? FLOW_COLOR : isDimmed ? DIMMED_COLOR : baseColor;

    // Size based on complexity (connections)
    const size = Math.max(0.3, Math.min(1.3, 0.32 + node.complexity * 0.09));

    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    useFrame((state, delta) => {
        const targetIntensity = isHighlighted
            ? INTENSITY.highlighted
            : isSelected
                ? INTENSITY.selected
                : isFlowActive
                    ? INTENSITY.flow
                    : isDimmed
                        ? INTENSITY.dimmed
                        : (inNeighborhood || isHovered)
                            ? INTENSITY.neighborhood
                            : INTENSITY.rest;

        if (materialRef.current) {
            materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, targetIntensity, Math.min(1, delta * 8));
            materialRef.current.color.lerp(new THREE.Color(color), Math.min(1, delta * 8));
            materialRef.current.emissive.lerp(new THREE.Color(color), Math.min(1, delta * 8));
        }

        if (isSelected && meshRef.current) {
            const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.06;
            meshRef.current.scale.setScalar(scale);
        } else if (meshRef.current) {
            meshRef.current.scale.setScalar(1);
        }

        const targetLabelOpacity = isDimmed ? 0.35 : 1;
        setLabelOpacity((prev) => THREE.MathUtils.lerp(prev, targetLabelOpacity, Math.min(1, delta * 8)));
    });

    return (
        <group position={position}>
            <Sphere
                ref={meshRef}
                args={[size, 32, 32]}
                onClick={onClick}
                onPointerOver={() => {
                    setIsHovered(true);
                    onHover(node);
                }}
                onPointerOut={() => {
                    setIsHovered(false);
                    onHover(null);
                }}
            >
                <meshStandardMaterial
                    ref={materialRef}
                    color={color}
                    emissive={color}
                    emissiveIntensity={INTENSITY.rest}
                    metalness={0.1}
                    roughness={0.4}
                    transparent
                    opacity={isDimmed ? 0.45 : 1}
                />
            </Sphere>

            {/* Names are always visible — billboarded so they face the camera at every angle */}
            <Billboard position={[0, size + 0.55, 0]} follow>
                <Text
                    fontSize={0.42}
                    color={isDimmed ? '#9295b3' : '#1a1a2e'}
                    anchorX="center"
                    anchorY="middle"
                    fillOpacity={labelOpacity}
                    outlineWidth={0.018}
                    outlineColor="#ffffff"
                    outlineOpacity={labelOpacity}
                >
                    {node.name}
                </Text>
            </Billboard>
        </group>
    );
}
