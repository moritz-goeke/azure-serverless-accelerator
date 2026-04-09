const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { getUserFromRequest } = require("../utils/auth");

const endpoint = process.env.COSMOS_ENDPOINT || process.env.COSMOS_DB_ENDPOINT;
const databaseName = process.env.COSMOS_DATABASE_NAME || "appdb";
const containerName = process.env.COSMOS_CONTAINER_NAME || "items";
const credential = new DefaultAzureCredential();

const getRequestPayload = async (request) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await request.json();
    }
  } catch (error) {
    console.error("Failed to parse deleteDocument payload", error);
  }
  return {};
};

app.http("deleteDocument", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("deleteDocument was invoked");
    try {
      const payload = await getRequestPayload(request);
      const { subjectId, documentId } = payload;

      if (!endpoint) {
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!subjectId || !documentId) {
        return { status: 400, body: "Missing subjectId or documentId" };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const container = client.database(databaseName).container(containerName);

      const { resource: subject } = await container.item(subjectId, subjectId).read();
      if (!subject || subject.owner !== user.userId || subject.type !== "subject") {
        return { status: 401, body: "Unauthorized" };
      }

      const initialLength = subject.documents?.length || 0;
      subject.documents = (subject.documents || []).filter(
        (doc) => doc.id !== documentId
      );

      if (subject.documents.length === initialLength) {
        return { status: 404, body: "Document not found" };
      }

      subject.updatedAt = Date.now();
      await container.item(subjectId, subjectId).replace(subject);

      return {
        status: 200,
        body: JSON.stringify({
          deleted: documentId,
          remainingDocuments: subject.documents.length,
        }),
      };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
