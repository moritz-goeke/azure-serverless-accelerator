const { app } = require("@azure/functions");
const { AzureOpenAI } = require("openai");
const { DefaultAzureCredential } = require("@azure/identity");
const dotenv = require("dotenv");

dotenv.config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
// =====================================================================
// >>> NEUES MODELL HINZUFÜGEN? <<<
// 1. Neue Env-Variable anlegen (z.B. AZURE_OPENAI_DEPLOYMENT_3)
//    → in Bicep (infra/main.bicep) und in den App-Settings ergänzen.
// 2. Hier einlesen und unten in deploymentMap eintragen.
// =====================================================================
const deployment1 = process.env["AZURE_OPENAI_DEPLOYMENT"] || "gpt5mini";
const deployment2 = process.env["AZURE_OPENAI_DEPLOYMENT_2"] || "gpt4o";
const apiVersion = "2024-10-01-preview";
const credential = new DefaultAzureCredential();
const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

// >>> NEUES MODELL HINZUFÜGEN? Key muss zum "value" im Frontend (MODELS-Array) passen. <<<
const deploymentMap = {
  gpt5mini: deployment1,
  gpt4o: deployment2,
  // neuesModell: deployment3,
};

const getAzureAdToken = async () => {
  const { token } = await credential.getToken(cognitiveServicesScope);
  return token;
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
      const requestedModel = body?.model || "gpt5mini";
      const deployment = deploymentMap[requestedModel] || deployment1;

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
        model: deployment,
        max_completion_tokens: 16384,
      };

      const client = new AzureOpenAI({
        endpoint,
        apiVersion,
        deployment,
        azureADTokenProvider: getAzureAdToken,
      });
      const result = await client.chat.completions.create(completionObject);

      return { body: JSON.stringify(result) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
