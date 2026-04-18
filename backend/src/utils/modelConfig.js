const MODEL_ENTRY_REGEX = /^AZURE_OPENAI_MODEL_(\d+)_(KEY|NAME|DEPLOYMENT|DESCRIPTION)$/;

const buildLegacyModels = (env) => {
  const deployment1 = env["AZURE_OPENAI_DEPLOYMENT"] || "gpt-5.4-mini-2";
  const deployment2 = env["AZURE_OPENAI_DEPLOYMENT_2"]?.trim();
  const deployment3 = env["AZURE_OPENAI_DEPLOYMENT_3"]?.trim();
  const deployment4 = env["AZURE_OPENAI_DEPLOYMENT_4"]?.trim();
  const deployment5 = env["AZURE_OPENAI_DEPLOYMENT_5"]?.trim();

  return [
    {
      key: "gpt5mini",
      label: "GPT-5 Mini",
      description: "Schnell & effizient",
      deployment: deployment1,
    },
    ...(deployment2
      ? [
          {
            key: "gpt4o",
            label: "GPT-4o",
            description: "Ausführlich & empathisch",
            deployment: deployment2,
          },
        ]
      : []),
    ...(deployment3
      ? [
          {
            key: "gpt41",
            label: "GPT-4.1",
            description: "Starke Textqualität",
            deployment: deployment3,
          },
        ]
      : []),
    ...(deployment4
      ? [
          {
            key: "gpt41mini",
            label: "GPT-4.1 Mini",
            description: "Kostenbewusst",
            deployment: deployment4,
          },
        ]
      : []),
    ...(deployment5
      ? [
          {
            key: "o3mini",
            label: "o3-mini",
            description: "Reasoning-fokussiert",
            deployment: deployment5,
          },
        ]
      : []),
  ];
};

const readNumberedModels = (env) => {
  const grouped = new Map();

  Object.entries(env).forEach(([name, value]) => {
    const match = name.match(MODEL_ENTRY_REGEX);
    if (!match) return;

    const index = Number(match[1]);
    const field = match[2].toLowerCase();
    const current = grouped.get(index) || {};
    current[field] = `${value || ""}`.trim();
    grouped.set(index, current);
  });

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, model]) => ({
      key: model.key,
      label: model.name,
      description: model.description || "",
      deployment: model.deployment,
    }))
    .filter((model) => model.key && model.label && model.deployment);
};

const dedupeByKey = (models) => {
  const seen = new Set();
  return models.filter((model) => {
    if (seen.has(model.key)) return false;
    seen.add(model.key);
    return true;
  });
};

const getModelConfiguration = (env = process.env) => {
  const numberedModels = readNumberedModels(env);
  const models = dedupeByKey(
    numberedModels.length ? numberedModels : buildLegacyModels(env)
  );

  const deploymentMap = Object.fromEntries(
    models.map((model) => [model.key, model.deployment])
  );

  const defaultModelKey = models[0]?.key || "gpt5mini";
  return { models, deploymentMap, defaultModelKey };
};

module.exports = { getModelConfiguration };
