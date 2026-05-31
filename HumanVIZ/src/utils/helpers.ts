import { character_height } from "./consts";

// write generic normalize function
export const normalize = (
  value: number,
  min: number,
  max: number,
  newMin: number,
  newMax: number
) => newMin + ((value - min) * (newMax - newMin)) / (max - min);

export const normalizeMarkerSize = (value: number) =>
  normalize(value, 0, character_height, 1, 14);

export const normalizeImportance = (value: number, num_chars: number) => {
  const min = 1 / num_chars;
  const max = 1;
  return normalize(value, min, max, 0, 1);
};

export const extractChapterName = (fullChapterName: string) => {
  if (fullChapterName && fullChapterName.includes(":")) {
    fullChapterName = fullChapterName.split(":")[0];
  } else if (fullChapterName && fullChapterName.includes(".")) {
    fullChapterName = fullChapterName.split(".")[0];
  }

  if (fullChapterName && fullChapterName.toLowerCase().includes("the last")) {
    return fullChapterName;
  }

  // remove "#" from string
  fullChapterName = fullChapterName.replace(/#/g, "");
  // trim whitespace from string
  fullChapterName = fullChapterName.trim();

  // Regular expression to match "Chapter" followed by any word (which could be a number, Roman numeral, or word)
  const match = fullChapterName && fullChapterName.match(/^chapter \S+/i);

  // If a match is found, return it, otherwise return an empty string or handle it as needed
  return match ? match[0] : fullChapterName;
};
