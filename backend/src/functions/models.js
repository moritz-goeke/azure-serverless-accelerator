const { app } = require("@azure/functions");
const { getModelConfiguration } = require("../utils/modelConfig");

app.http("models", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    const { models, defaultModelKey } = getModelConfiguration(process.env);

    return {
      body: JSON.stringify({
        defaultModel: defaultModelKey,
        models: models.map((model) => ({
          value: model.key,
          label: model.label,
          description: model.description,
        })),
      }),
    };
  },
});
