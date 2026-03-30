const { app } = require("@azure/functions");
const { DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

dotenv.config();

const diEndpoint = process.env["DOCUMENT_INTELLIGENCE_ENDPOINT"];
const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const credential = new DefaultAzureCredential();

const JOBS_CONTAINER = "DocumentJobs";

const getCosmosContainer = () => {
  const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
  return client.database(cosmosDbName).container(cosmosContainerName);
};

app.http("analyzeDocument", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("analyzeDocument invoked");
    try {
      if (!diEndpoint) {
        return { status: 500, body: "Document Intelligence endpoint not configured." };
      }

      const contentType = request.headers.get("content-type") || "";
      let body;
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else {
        const raw = await request.text();
        body = raw ? JSON.parse(raw) : {};
      }

      const { document, fileName, model } = body;
      if (!document) {
        return { status: 400, body: "Missing document (base64) in request body." };
      }

      const docBuffer = Buffer.from(document, "base64");

      const diClient = new DocumentAnalysisClient(diEndpoint, credential);
      const poller = await diClient.beginAnalyzeDocument("prebuilt-layout", docBuffer);

      const operationId = poller.operationId;

      const jobId = uuidv4();
      const jobRecord = {
        id: jobId,
        type: JOBS_CONTAINER,
        operationId,
        diEndpoint,
        status: "analyzing",
        fileName: fileName || "document",
        selectedModel: model || "gpt5mini",
        createdAt: Date.now(),
        extractedText: null,
        summary: null,
        error: null,
      };

      const container = getCosmosContainer();
      await container.items.create(jobRecord);

      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status: "analyzing" }),
      };
    } catch (e) {
      context.log.error("analyzeDocument error:", e);
      return { status: 500, body: JSON.stringify({ error: "Failed to start document analysis." }) };
    }
  },
});
