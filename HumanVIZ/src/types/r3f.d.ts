/**
 * JSX type augmentation for @react-three/fiber v9 with React 18
 */
import type { ThreeElements } from "@react-three/fiber";

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
