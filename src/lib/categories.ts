export const CATEGORIES = [
  "Design",
  "Programming",
  "Writing",
  "Video",
  "Music",
  "Marketing",
] as const;

export type Category = (typeof CATEGORIES)[number];
