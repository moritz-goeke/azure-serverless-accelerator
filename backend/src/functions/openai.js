const { app } = require("@azure/functions");
const { AzureOpenAI } = require("openai");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const dotenv = require("dotenv");

dotenv.config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const cosmosEndpoint = process.env.COSMOS_ENDPOINT || process.env.COSMOS_DB_ENDPOINT;
const cosmosDatabaseName = process.env.COSMOS_DATABASE_NAME || "appdb";
const cosmosContainerName = process.env.COSMOS_CONTAINER_NAME || "items";
// =====================================================================
// >>> NEUES MODELL HINZUFÜGEN? <<<
// 1. Neue Env-Variable anlegen (z.B. AZURE_OPENAI_DEPLOYMENT_3)
//    → in Bicep (infra/main.bicep) und in den App-Settings ergänzen.
// 2. Hier einen neuen Eintrag in "deployments" hinzufügen.
// 3. Im Frontend: MODEL_OPTIONS in src/components/consts.jsx erweitern
//    (key muss zum Key hier passen).
// =====================================================================
const deployments = {
  [process.env["AZURE_OPENAI_DEPLOYMENT"] || "gpt5mini"]: process.env["AZURE_OPENAI_DEPLOYMENT"] || "gpt5mini",
  [process.env["AZURE_OPENAI_DEPLOYMENT_2"] || "gpt4o"]: process.env["AZURE_OPENAI_DEPLOYMENT_2"] || "gpt4o",
  // [process.env["AZURE_OPENAI_DEPLOYMENT_3"] || "neuesModell"]: process.env["AZURE_OPENAI_DEPLOYMENT_3"] || "neuesModell",
};
const defaultDeployment = process.env["AZURE_OPENAI_DEPLOYMENT"] || "gpt5mini";
const apiVersion = "2024-10-01-preview";
const credential = new DefaultAzureCredential();
const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

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
      const requestModel = body?.model;
      const subjectId = body?.subjectId;
      const conversationPayload =
        body?.conversation ?? request.params?.conversation;

      if (!requestMessage) {
        return { status: 400, body: "Missing message payload" };
      }

      // Fetch subject context if a subjectId is provided
      let subjectContext = "";
      if (subjectId && cosmosEndpoint) {
        try {
          const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
          const container = cosmosClient.database(cosmosDatabaseName).container(cosmosContainerName);
          const { resource: subject } = await container.item(subjectId, subjectId).read();
          if (subject && subject.type === "subject" && Array.isArray(subject.documents) && subject.documents.length > 0) {
            const docTexts = subject.documents.map((doc) => {
              return `--- Dokument: ${doc.filename} ---\n${doc.extractedText}`;
            });
            subjectContext = docTexts.join("\n\n");
            context.log(`Loaded ${subject.documents.length} document(s) for subject "${subject.name}" (${subjectContext.length} chars)`);
          }
        } catch (subjectError) {
          context.log("Failed to load subject context, continuing without it", subjectError);
        }
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

      // Prepend system message with subject context if available
      const systemMessages = [];
      if (subjectContext) {
        systemMessages.push({
          role: "system",
          content: `Du bist ein hilfreicher KI-Assistent für den Unterricht. Dir stehen folgende Unterrichtsmaterialien als Kontext zur Verfügung. Nutze diese Materialien, um die Fragen der Schüler*innen zu beantworten. Beziehe dich auf die Materialien, wenn sie relevant sind.\n\n${subjectContext}`,
        });
      } else {
        systemMessages.push({
          role: "system",
          content: "Du bist ein hilfreicher KI-Assistent für den Unterricht. Beantworte Fragen klar, verständlich und altersgerecht.",
        });
      }

      const deployment = (requestModel && deployments[requestModel]) ? deployments[requestModel] : defaultDeployment;

      const completionObject = {
        messages: [...systemMessages, ...messageArray],
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
