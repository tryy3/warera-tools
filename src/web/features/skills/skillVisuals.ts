import type { EcoSkillId } from "@/skills/values";

export type SkillVisualId = EcoSkillId | "management";

export type SkillVisual = {
  id: SkillVisualId;
  label: string;
  color: string;
  boxBackground: string;
  path: string;
};

/** Empty (unfilled) skill meter slot background — WarEra client. */
export const EMPTY_SKILL_BOX_BG = "#252E34";

export const SKILL_VISUALS: Record<SkillVisualId, SkillVisual> = {
  entrepreneurship: {
    id: "entrepreneurship",
    label: "Entrepreneurship",
    color: "#E0B8D7",
    boxBackground: "linear-gradient(45deg,#743265,#59274D)",
    path: "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
  },
  energy: {
    id: "energy",
    label: "Energy",
    color: "#ABC0ED",
    boxBackground: "linear-gradient(45deg,#1E3F88,#173168)",
    path: "M11 15H6L13 1V9H18L11 23V15Z",
  },
  production: {
    id: "production",
    label: "Production",
    color: "#E1CEA5",
    boxBackground: "linear-gradient(45deg,#705825,#56441C)",
    path: "M14.79,10.62L3.5,21.9L2.1,20.5L13.38,9.21L14.79,10.62M19.27,7.73L19.86,7.14L19.07,6.35L19.71,5.71L18.29,4.29L17.65,4.93L16.86,4.14L16.27,4.73C14.53,3.31 12.57,2.17 10.47,1.37L9.64,3.16C11.39,4.08 13,5.19 14.5,6.5L14,7L17,10L17.5,9.5C18.81,11 19.92,12.61 20.84,14.36L22.63,13.53C21.83,11.43 20.69,9.47 19.27,7.73Z",
  },
  companies: {
    id: "companies",
    label: "Companies Limit",
    color: "#E1CEA5",
    boxBackground: "linear-gradient(45deg,#705825,#56441C)",
    path: "M4,18V20H8V18H4M4,14V16H14V14H4M10,18V20H14V18H10M16,14V16H20V14H16M16,18V20H20V18H16M2,22V8L7,12V8L12,12V8L17,12L18,2H21L22,12V22H2Z",
  },
  management: {
    id: "management",
    label: "Management",
    color: "#C8B7E1",
    boxBackground: "linear-gradient(45deg,#4C3076,#3B255A)",
    path: "M12 3C14.21 3 16 4.79 16 7S14.21 11 12 11 8 9.21 8 7 9.79 3 12 3M16 13.54C16 14.6 15.72 17.07 13.81 19.83L13 15L13.94 13.12C13.32 13.05 12.67 13 12 13S10.68 13.05 10.06 13.12L11 15L10.19 19.83C8.28 17.07 8 14.6 8 13.54C5.61 14.24 4 15.5 4 17V21H20V17C20 15.5 18.4 14.24 16 13.54Z",
  },
};

/** Display order matching the in-game Skills panel. */
export const SKILL_PANEL_ORDER: SkillVisualId[] = [
  "entrepreneurship",
  "energy",
  "production",
  "companies",
  "management",
];
