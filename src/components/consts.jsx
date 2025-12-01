export const BLACK = "#000000";
export const BLUE = "#5d7b9a";
export const DARK_BLUE = "#004068";
export const LIGHT_BLUE = "#00a2b8";
export const RED = "#235864";
export const ORANGE = "#ea7024";
export const GREEN = "#00a28f";
export const WHITE = "#ffffff";

export const CHAT_USER_COLOR = WHITE;
export const CHAT_AI_COLOR = WHITE;

export function customScrollBar(color = LIGHT_BLUE) {
  return {
    "&::-webkit-scrollbar": {
      width: "0.4em",
      height: "0.4em",
    },
    "&::-webkit-scrollbar-track": {
      width: "0.6em",
      height: "0.6em",
      boxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
      webkitBoxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: color,
      borderRadius: 20,
    },
  };
}

export const costInCentPerInputToken = {
  gpt5mini: 0.000022,
};

export const costInCentPerOutputToken = {
  gpt5mini: 0.000172,
};
export const AZURE_FUNCTION_COST_CT_PER_GB_SECOND = 0.000023;
