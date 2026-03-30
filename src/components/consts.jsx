export const LIGHT_BLUE = "#00a2b8";
export const ACCENT_BLUE = "#235864";
export const WHITE = "#ffffff";

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
  gpt4o: 0.000180,
};

export const costInCentPerOutputToken = {
  gpt5mini: 0.000172,
  gpt4o: 0.000720,
};

export const MODEL_OPTIONS = [
  { key: "gpt5mini", label: "GPT-5 Mini", description: "Schnell & günstig" },
  { key: "gpt4o", label: "GPT-4o", description: "Leistungsstark" },
];
export const AZURE_FUNCTION_COST_CT_PER_GB_SECOND = 0.000023;
