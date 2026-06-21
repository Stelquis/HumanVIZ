/**
 * 深空背景 — 星尘粒子 + 太空底色 + 雾效
 *
 * Uses circular glow texture for all particles so they render as
 * soft luminous dots instead of hard square quads.
 */
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const STAR_COUNT = 2500;

/** Generate a tiny circular glow texture for soft particle rendering */
function createGlowTexture(size: number, falloff: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half * falloff);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.3)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const SpaceBackground: React.FC = () => {
  const starsRef = useRef<THREE.Points>(null);

  // ── Circular glow texture (shared by all particles) ──
  const glowTex = useMemo(() => createGlowTexture(64, 0.8), []);

  // ── Background stars — spherical shell scatter ──
  const starGeom = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Random sphere distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 180 + Math.random() * 140; // wide shell for galaxy-scale panorama
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      positions[i * 3 + 2] = Math.cos(phi) * r;
      sizes[i] = Math.random() * 0.15 + 0.03;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (starsRef.current) starsRef.current.rotation.y += delta * 0.008;
  });

  return (
    <group>
      {/* Distant star field — soft circular dots via glow texture */}
      <points ref={starsRef} geometry={starGeom}>
        <pointsMaterial
          map={glowTex}
          size={0.25}
          color="#c4a56e"
          transparent
          opacity={0.35}
          sizeAttenuation
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </points>

      {/* Ambient fog for depth — warm parchment fade */}
      <fog attach="fog" args={["#ede3d2", 220, 560]} />
    </group>
  );
};

export default SpaceBackground;
