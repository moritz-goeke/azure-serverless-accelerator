const buildWellbeingModels = (env) => {
  return [
    {
      key: "strict_4o",
      label: "Strict 4o",
      description: "",
      deployment: env["AZURE_OPENAI_DEPLOYMENT_STRICT_4O"] || "gpt-4o",
    },
    {
      key: "supportive_4o",
      label: "Supportive 4o",
      description: "",
      deployment: env["AZURE_OPENAI_DEPLOYMENT_SUPPORTIVE_4O"] || "gpt-4o",
    },
    {
      key: "baseline_4.1",
      label: "Baseline 4.1",
      description: "",
      deployment: env["AZURE_OPENAI_DEPLOYMENT_BASELINE_41"] || "gpt-4.1",
    },
  ];
};

const getModelConfiguration = (env = process.env) => {
  const models = buildWellbeingModels(env);

  const deploymentMap = Object.fromEntries(
    models.map((model) => [model.key, model.deployment])
  );

  const defaultModelKey = "strict_4o";

  return { models, deploymentMap, defaultModelKey };
};

module.exports = { getModelConfiguration };