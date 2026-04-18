const { app } = require("@azure/functions");
const { AzureOpenAI } = require("openai");
const { DefaultAzureCredential } = require("@azure/identity");
const dotenv = require("dotenv");
const path = require("path");
const { getModelConfiguration } = require("../utils/modelConfig");

dotenv.config();
dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
  override: false,
});

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = "2024-12-01-preview";
const credential = new DefaultAzureCredential();
const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";
const {
  deploymentMap,
  defaultModelKey,
} = getModelConfiguration(process.env);

const getAzureAdToken = async () => {
  const { token } = await credential.getToken(cognitiveServicesScope);
  return token;
};

const isMissingDeploymentError = (error) => {
  const errorCode = `${error?.error?.code || ""}`.toLowerCase();
  const message = `${error?.error?.message || error?.message || ""}`.toLowerCase();

  return (
    errorCode.includes("deploymentnotfound") ||
    (message.includes("deployment") &&
      (message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("could not be found")))
  );
};

const parseRequestBody = async (request, context) => {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      return await request.json();
    }
    const raw = await request.text();
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch (error) {
    context.log("Failed to parse request body", error);
    return {};
  }
};

app.http("openai", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("openai was invoked and is now executing");
    try {
      if (!endpoint) {
        context.log.error("AZURE_OPENAI_ENDPOINT is not configured.");
        return { status: 500, body: "Azure OpenAI endpoint missing." };
      }

      const body = await parseRequestBody(request, context);
      const requestMessage = body?.message ?? request.params?.message;
      const conversationPayload =
        body?.conversation ?? request.params?.conversation;
      const requestedModel = body?.model || defaultModelKey;
      const hasRequestedModel = Object.prototype.hasOwnProperty.call(
        deploymentMap,
        requestedModel
      );

      if (!hasRequestedModel) {
        const configuredModels = Object.keys(deploymentMap).join(", ");
        context.log(
          `Model '${requestedModel}' is not configured. Configured: ${configuredModels}`
        );
        return {
          status: 400,
          body: `Model '${requestedModel}' is not configured. Available models: ${configuredModels}`,
        };
      }

      const selectedDeployment = deploymentMap[requestedModel];

      if (!requestMessage) {
        return { status: 400, body: "Missing message payload" };
      }

      let requestConversation = [];
      if (Array.isArray(conversationPayload)) {
        requestConversation = conversationPayload;
      } else if (
        typeof conversationPayload === "string" &&
        conversationPayload.length
      ) {
        try {
          requestConversation = JSON.parse(conversationPayload);
        } catch (error) {
          context.log("Failed to parse conversation payload", error);
          return { status: 400, body: "Invalid conversation payload" };
        }
      }

      const messageArray = requestConversation
        .filter((entry) => entry && typeof entry.message === "string")
        .map((entry) => ({
          role: entry.from === "gpt" ? "assistant" : "user",
          content: entry.message,
        }));

      const completionObject = {
        messages: messageArray,
        model: selectedDeployment,
        max_completion_tokens: 16384,
      };

      const client = new AzureOpenAI(
        apiKey
          ? {
              endpoint,
              apiVersion,
              deployment: selectedDeployment,
              apiKey,
            }
          : {
              endpoint,
              apiVersion,
              deployment: selectedDeployment,
              azureADTokenProvider: getAzureAdToken,
            }
      );
      const result = await client.chat.completions.create(completionObject);

      return { body: JSON.stringify(result) };
    } catch (e) {
      context.log(e);
      if (isMissingDeploymentError(e)) {
        return {
          status: 400,
          body: `OpenAI error: deployment for selected model is not deployed in Azure OpenAI.`,
        };
      }
      const statusCode = e?.status || e?.statusCode || 500;
      const upstreamMessage =
        e?.error?.message ||
        e?.message ||
        "Azure OpenAI request failed.";
      return {
        status: statusCode,
        body: `OpenAI error: ${upstreamMessage}`,
      };
    }
  },
});
