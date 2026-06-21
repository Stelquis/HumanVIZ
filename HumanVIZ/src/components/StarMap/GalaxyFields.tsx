/**
 * 主题引力场 — 仅保留星云光晕与环，不显示文字标签。
 *
 * Each of the 12 themes is placed as a soft nebula glow at the edge of the
 * field, giving visual structure to the theme-bearing layout without text.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import type { GalaxyLayout } from "./UniverseLayout";

interface Props {
  galaxies: GalaxyLayout[];
}

function createNebulaTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  const grad = ctx.createRadialGradient(c, c, size * 0.05, c, c, size * 0.5);
  grad.addColorStop(0, "rgba(255,255,255,0.2)");
  grad.addColorStop(0.34, "rgba(255,255,255,0.08)");
  grad.addColorStop(0.72, "rgba(255,255,255,0.018)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const GalaxyFields: React.FC<Props> = ({ galaxies }) => {
  const nebulaTexture = useMemo(() => createNebulaTexture(), []);

  return (
    <group>
      {galaxies.map((galaxy) => {
        const color = new THREE.Color(galaxy.color);

        return (
          <group key={galaxy.name}>
            {/* Nebula glow */}
            <sprite position={galaxy.center} scale={[galaxy.radius * 1.05, galaxy.radius * 1.05, 1]} renderOrder={-2}>
              <spriteMaterial
                map={nebulaTexture}
                color={color}
                transparent
                opacity={0.055}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>

            {/* Thin ring */}
            <mesh position={galaxy.center} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
              <ringGeometry args={[galaxy.radius * 0.54, galaxy.radius * 0.56, 80]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.025}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export default GalaxyFields;
