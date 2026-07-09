'use client';

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { ComponentNode } from '@/types';

// Desaturated type tints — shared with GraphLink for neighborhood coloring
export const TYPE_TINTS: Record<ComponentNode['type'], string> = {
    component: '#7dd3fc', // ice blue
    hook: '#f0abfc',      // orchid
    util: '#86efac',      // mint
};

const HIGHLIGHT_TINT = '#ffe9c4'; // warm white for search highlight

// Intensity targets per visual state
const INTENSITY = {
    dimmed: 0.12,
    rest: 0.5,
    neighborhood: 1.2,
    flow: 1.8,
    selected: 2.0,
    highlighted: 2.5,
};

const FLOW_TINT = '#ffd27d'; // warm gold — matches the flow comet on links

const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = /* glsl */ `
    uniform vec3 uRimColor;
    uniform float uIntensity;
    uniform float uTime;
    uniform float uPulse;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 3.0);
        float pulse = 1.0 + uPulse * 0.25 * sin(uTime * 2.0);
        vec3 core = uRimColor * 0.08;
        vec3 color = core + uRimColor * fresnel * uIntensity * pulse;
        float alpha = clamp(0.15 + fresnel * uIntensity, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
    }
`;

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
    const [isHovered, setIsHovered] = useState(false);

    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uRimColor: { value: new THREE.Color(TYPE_TINTS[node.type] ?? '#ffffff') },
                uIntensity: { value: INTENSITY.rest },
                uTime: { value: 0 },
                uPulse: { value: 0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }, [node.type]);

    // Size based on complexity (connections)
    const size = Math.max(0.3, Math.min(1.5, 0.3 + node.complexity * 0.1));

    useFrame((state, delta) => {
        const targetIntensity = isHighlighted
            ? INTENSITY.highlighted
            : isSelected
                ? INTENSITY.selected
                : isDimmed
                    ? INTENSITY.dimmed
                    : isFlowActive
                        ? INTENSITY.flow
                        : (inNeighborhood || isHovered)
                            ? INTENSITY.neighborhood
                            : INTENSITY.rest;

        const uniforms = material.uniforms;
        uniforms.uIntensity.value = THREE.MathUtils.lerp(
            uniforms.uIntensity.value,
            targetIntensity,
            Math.min(1, delta * 8)
        );
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uPulse.value = THREE.MathUtils.lerp(
            uniforms.uPulse.value,
            isSelected ? 1 : 0,
            Math.min(1, delta * 8)
        );

        const targetColor = isHighlighted
            ? HIGHLIGHT_TINT
            : isFlowActive
                ? FLOW_TINT
                : TYPE_TINTS[node.type] ?? '#ffffff';
        (uniforms.uRimColor.value as THREE.Color).lerp(new THREE.Color(targetColor), Math.min(1, delta * 8));
    });

    const showLabel = !isDimmed && (isHovered || isSelected || isHighlighted || inNeighborhood || isFlowActive);

    return (
        <group position={position}>
            <mesh
                material={material}
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
                <sphereGeometry args={[size, 32, 32]} />
            </mesh>

            {showLabel && (
                <Text
                    position={[0, size + 0.5, 0]}
                    fontSize={0.45}
                    color={isHighlighted ? HIGHLIGHT_TINT : '#e2e8f0'}
                    anchorX="center"
                    anchorY="middle"
                    fillOpacity={0.95}
                    outlineWidth={0.04}
                    outlineColor="#050510"
                >
                    {node.name}
                </Text>
            )}
        </group>
    );
}
