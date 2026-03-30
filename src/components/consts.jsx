// University Wellbeing – warm sage/nature palette
export const PRIMARY = "#5B8A72";
export const PRIMARY_LIGHT = "#7BAE7F";
export const PRIMARY_DARK = "#3D6B56";
export const ACCENT_WARM = "#C49B5C";
export const BG_WARM = "#FAF7F2";
export const BG_CARD = "#FFFFFF";
export const TEXT_DARK = "#2C3E2D";
export const TEXT_MUTED = "#6B7C6E";
export const BORDER_SOFT = "#E2DCD4";

// Legacy aliases for shared components
export const LIGHT_BLUE = PRIMARY;
export const ACCENT_BLUE = PRIMARY_DARK;
export const WHITE = "#ffffff";

export function customScrollBar(color = PRIMARY) {
  return {
    "&::-webkit-scrollbar": {
      width: "0.4em",
      height: "0.4em",
    },
    "&::-webkit-scrollbar-track": {
      width: "0.6em",
      height: "0.6em",
      boxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
      WebkitBoxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: color,
      borderRadius: 20,
    },
  };
}

export const costInCentPerInputToken = {
  gpt5mini: 0.000022,
  gpt4o: 0.000250,
};

export const costInCentPerOutputToken = {
  gpt5mini: 0.000172,
  gpt4o: 0.001000,
};
export const AZURE_FUNCTION_COST_CT_PER_GB_SECOND = 0.000023;
