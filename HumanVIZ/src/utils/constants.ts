import { Position } from "./positions";

/* CONSTS */
export const location_height = 100;
export const location_offset = location_height / 5;
export const scene_base = 100;
export const scene_offset = scene_base;
const scene_margin = scene_base / 2;
export const character_height = 12;
export const character_offset = 1.5 * character_height;

export const location_buffer = location_height + 2 * character_height;

/** 固定时间轴总宽度，保证不同戏剧的时间轴长度一致 */
export const FIXED_PLOT_WIDTH = 2400;

export const scene_width = (_locations: string[], scenes: string[]) => {
  // 固定总宽度，按场次数均分间距
  // 减去起始偏移(scene_offset)和末尾边距(scene_margin)后，由场景间隙数平分
  const gaps = Math.max(scenes.length - 1, 1);
  return (FIXED_PLOT_WIDTH - scene_offset - scene_margin) / gaps;
};
export const plot_width = (scene_pos: Position[]) =>
  scene_pos[scene_pos.length - 1] &&
  scene_pos[scene_pos.length - 1].x + scene_margin;
