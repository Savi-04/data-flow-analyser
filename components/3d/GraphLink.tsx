'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface GraphLinkProps {
    start: [number, number, number];
    end: [number, number, number];
    isDimmed?: boolean;
    props?: string[]; // Prop names being passed
}

export function GraphLink({ start, end, isDimmed = false, props }: GraphLinkProps) {
    const lineRef = useRef<THREE.Line>(null);
    const particlesRef = useRef<THREE.Points>(null);
    const arrowRef = useRef<THREE.Mesh>(null);
    const ringRef = useRef<THREE.Mesh>(null);

    const opacity = isDimmed ? 0.1 : 1;

    // Direction vector
    const direction = useMemo(() => {
        return new THREE.Vector3(
            end[0] - start[0],
            end[1] - start[1],
            end[2] - start[2]
        ).normalize();
    }, [start, end]);

    // Arrow position (20% back from target)
    const arrowPosition = useMemo(() => {
        return new THREE.Vector3(
            end[0] - (end[0] - start[0]) * 0.25,
            end[1] - (end[1] - start[1]) * 0.25,
            end[2] - (end[2] - start[2]) * 0.25
        );
    }, [start, end]);

    // Arrow rotation
    const arrowQuaternion = useMemo(() => {
        return new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
        );
    }, [direction]);

    // Label position (midpoint of the link, slightly offset)
    const labelPosition = useMemo(() => {
        return new THREE.Vector3(
            (start[0] + end[0]) / 2,
            (start[1] + end[1]) / 2 + 0.3, // Offset above the line
            (start[2] + end[2]) / 2
        );
    }, [start, end]);

    // Create line geometry
    const lineGeometry = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([...start, ...end]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geometry;
    }, [start, end]);

    // Create particles that flow along the line
    const particleGeometry = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        const particleCount = 8;
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            positions[i * 3] = start[0] + (end[0] - start[0]) * t;
            positions[i * 3 + 1] = start[1] + (end[1] - start[1]) * t;
            positions[i * 3 + 2] = start[2] + (end[2] - start[2]) * t;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geometry;
    }, [start, end]);

    // Animate particles flowing along the line + arrow pulsing
    useFrame((state) => {
        if (particlesRef.current && !isDimmed) {
            const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
            const particleCount = positions.length / 3;

            for (let i = 0; i < particleCount; i++) {
                const t = ((state.clock.elapsedTime * 0.5 + i / particleCount) % 1);
                positions[i * 3] = start[0] + (end[0] - start[0]) * t;
                positions[i * 3 + 1] = start[1] + (end[1] - start[1]) * t;
                positions[i * 3 + 2] = start[2] + (end[2] - start[2]) * t;
            }

            particlesRef.current.geometry.attributes.position.needsUpdate = true;
        }

        // Pulse the arrow
        if (arrowRef.current && !isDimmed) {
            const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
            arrowRef.current.scale.set(scale, scale, scale);
        }

        // Rotate the ring
        if (ringRef.current && !isDimmed) {
            ringRef.current.rotation.y += 0.02;
        }
    });

    return (
        <group>
            {/* Laser beam line - thicker and brighter */}
            <primitive object={new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
                color: isDimmed ? '#333355' : '#bf00ff',
                transparent: true,
                opacity: isDimmed ? 0.05 : 0.5,
                linewidth: 2,
            }))} ref={lineRef} />

            {/* Flowing particles */}
            <primitive object={new THREE.Points(particleGeometry, new THREE.PointsMaterial({
                color: isDimmed ? '#333355' : '#00f3ff',
                size: isDimmed ? 0.05 : 0.15,
                transparent: true,
                opacity: isDimmed ? 0.1 : 0.9,
                sizeAttenuation: true,
            }))} ref={particlesRef} />

            {/* Large Directional Arrow (Cone) */}
            <mesh
                ref={arrowRef}
                position={arrowPosition}
                quaternion={arrowQuaternion}
            >
                <coneGeometry args={[0.2, 0.5, 12]} />
                <meshStandardMaterial
                    color={isDimmed ? '#333355' : '#ff00ff'}
                    emissive={isDimmed ? '#000000' : '#bf00ff'}
                    emissiveIntensity={isDimmed ? 0 : 0.8}
                    transparent
                    opacity={isDimmed ? 0.1 : 0.9}
                />
            </mesh>

            {/* Glowing ring around arrow for extra visibility */}
            <mesh
                ref={ringRef}
                position={arrowPosition}
                quaternion={arrowQuaternion}
            >
                <torusGeometry args={[0.35, 0.03, 8, 24]} />
                <meshStandardMaterial
                    color={isDimmed ? '#333355' : '#00f3ff'}
                    emissive={isDimmed ? '#000000' : '#00f3ff'}
                    emissiveIntensity={isDimmed ? 0 : 0.5}
                    transparent
                    opacity={isDimmed ? 0.1 : 0.7}
                />
            </mesh>

            {/* Props label - only show if not dimmed and has props */}
            {props && props.length > 0 && !isDimmed && (
                <Html position={labelPosition} center>
                    <div className="bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md border border-neon-cyan/30 pointer-events-none">
                        <span className="text-[10px] text-neon-cyan font-mono whitespace-nowrap">
                            {props.slice(0, 3).join(', ')}
                            {props.length > 3 && `...+${props.length - 3}`}
                        </span>
                    </div>
                </Html>
            )}
        </group>
    );
}
