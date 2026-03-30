// School chatbot theme
export const PRIMARY = "#6366f1";
export const PRIMARY_LIGHT = "#818cf8";
export const PRIMARY_DARK = "#4f46e5";
export const SURFACE = "#ffffff";
export const BACKGROUND = "#f1f5f9";
export const TEXT_PRIMARY = "#1e293b";
export const TEXT_SECONDARY = "#64748b";
export const TEXT_LIGHT = "#94a3b8";
export const BORDER = "#e2e8f0";

// Backward compat
export const LIGHT_BLUE = "#00a2b8";
export const ACCENT_BLUE = "#235864";
export const WHITE = "#ffffff";

export function customScrollBar(color = "#c7d2fe") {
  return {
    "&::-webkit-scrollbar": { width: "0.35em", height: "0.35em" },
    "&::-webkit-scrollbar-track": { background: "transparent" },
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
  { key: "gpt5mini", label: "GPT-5 Mini", description: "Schnell & günstig", icon: "⚡" },
  { key: "gpt4o", label: "GPT-4o", description: "Leistungsstark", icon: "🧠" },
];
export const AZURE_FUNCTION_COST_CT_PER_GB_SECOND = 0.000023;
