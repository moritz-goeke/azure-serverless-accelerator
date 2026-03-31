export const PRIMARY_TEAL = "#0097a7";
export const ACCENT_TEAL = "#00796b";
export const LIGHT_BLUE = PRIMARY_TEAL;
export const ACCENT_BLUE = ACCENT_TEAL;
export const WHITE = "#ffffff";
export const BG_DARK = "#0d1b2a";
export const BG_CARD = "#132638";
export const BG_SURFACE = "#1b2d3e";
export const BORDER_COLOR = "#1e3a50";
export const TEXT_MUTED = "#8eacbe";
export const TEXT_PRIMARY = "#e0eaf0";
export const HEADER_GRADIENT = "linear-gradient(90deg, #0d2137, #143048)";

export function customScrollBar(color = PRIMARY_TEAL) {
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


