'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { FLOW_COLOR } from './GraphNode';

interface GraphLinkProps {
    start: [number, number, number];
    end: [number, number, number];
    isDimmed?: boolean;
    isNeighborhood?: boolean;
    isFlowActive?: boolean;
    neighborhoodColor?: string;
    props?: string[]; // Prop names being passed
}

const REST_COLOR = '#9497b8';
const TRAIL_COUNT = 4;

export function GraphLink({
    start,
    end,
    isDimmed = false,
    isNeighborhood = false,
    isFlowActive = false,
    neighborhoodColor,
    props,
}: GraphLinkProps) {
    const lineMaterialRef = useRef<THREE.LineBasicMaterial>(null);
    const cometRef = useRef<THREE.Points>(null);
    const cometMaterialRef = useRef<THREE.PointsMaterial>(null);

    const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
    const endVec = useMemo(() => new THREE.Vector3(...end), [end]);

    const curve = useMemo(() => {
        const mid = startVec.clone().add(endVec).multiplyScalar(0.5);
        const dir = endVec.clone().sub(startVec);
        const distance = dir.length();

        const up = new THREE.Vector3(0, 1, 0);
        let normal = new THREE.Vector3().crossVectors(dir, up);
        if (normal.lengthSq() < 1e-6) {
            normal = new THREE.Vector3(1, 0, 0);
        }
        normal.normalize();

        const control = mid.add(normal.multiplyScalar(distance * 0.22)).add(new THREE.Vector3(0, distance * 0.08, 0));
        return new THREE.QuadraticBezierCurve3(startVec, control, endVec);
    }, [startVec, endVec]);

    const lineGeometry = useMemo(() => {
        const points = curve.getPoints(32);
        return new THREE.BufferGeometry().setFromPoints(points);
    }, [curve]);

    const labelPosition = useMemo(() => curve.getPoint(0.5), [curve]);

    const cometGeometry = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(TRAIL_COUNT * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geometry;
    }, []);

    const targetOpacity = isFlowActive ? 0.95 : isDimmed ? 0.08 : isNeighborhood ? 0.7 : 0.35;
    const targetColorHex = isFlowActive ? FLOW_COLOR : (isNeighborhood && neighborhoodColor) ? neighborhoodColor : REST_COLOR;

    useFrame((state, delta) => {
        if (lineMaterialRef.current) {
            lineMaterialRef.current.opacity = THREE.MathUtils.lerp(
                lineMaterialRef.current.opacity,
                targetOpacity,
                Math.min(1, delta * 8)
            );
            lineMaterialRef.current.color.lerp(new THREE.Color(targetColorHex), Math.min(1, delta * 8));
        }

        if (isFlowActive && cometRef.current) {
            const t = (state.clock.elapsedTime * 0.625) % 1;
            const positions = cometGeometry.attributes.position.array as Float32Array;

            for (let i = 0; i < TRAIL_COUNT; i++) {
                const trailT = Math.max(0, t - i * 0.03);
                const p = curve.getPoint(trailT);
                positions[i * 3] = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;
            }
            cometGeometry.attributes.position.needsUpdate = true;

            if (cometMaterialRef.current) {
                cometMaterialRef.current.opacity = THREE.MathUtils.lerp(cometMaterialRef.current.opacity, 0.95, 0.2);
            }
        } else if (cometMaterialRef.current) {
            cometMaterialRef.current.opacity = THREE.MathUtils.lerp(cometMaterialRef.current.opacity, 0, 0.2);
        }
    });

    const showLabel = (isFlowActive || isNeighborhood) && !isDimmed && props && props.length > 0;

    return (
        <group>
            <primitive
                object={
                    new THREE.Line(
                        lineGeometry,
                        new THREE.LineBasicMaterial({
                            color: REST_COLOR,
                            transparent: true,
                            opacity: 0.35,
                        })
                    )
                }
                ref={(obj: THREE.Line | null) => {
                    if (obj) lineMaterialRef.current = obj.material as THREE.LineBasicMaterial;
                }}
            />

            <points ref={cometRef} geometry={cometGeometry}>
                <pointsMaterial
                    ref={cometMaterialRef}
                    color={FLOW_COLOR}
                    size={0.35}
                    transparent
                    opacity={0}
                    sizeAttenuation
                    depthWrite={false}
                />
            </points>

            {showLabel && (
                <Html position={labelPosition} center>
                    <div className="bg-white/95 px-2 py-1 rounded-md border border-black/10 shadow-sm pointer-events-none">
                        <span className="text-[10px] text-amber-800 font-mono whitespace-nowrap">
                            {props!.slice(0, 3).join(', ')}
                            {props!.length > 3 && `...+${props!.length - 3}`}
                        </span>
                    </div>
                </Html>
            )}
        </group>
    );
}
