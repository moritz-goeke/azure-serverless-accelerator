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
    console.error("Failed to parse deleteSubject payload", error);
  }
  return {};
};

app.http("deleteSubject", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("deleteSubject was invoked");
    try {
      const payload = await getRequestPayload(request);
      const subjectId = payload.subjectId;

      if (!endpoint) {
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!subjectId) {
        return { status: 400, body: "Missing subjectId" };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const container = client.database(databaseName).container(containerName);

      const { resource } = await container.item(subjectId, subjectId).read();
      if (!resource || resource.owner !== user.userId || resource.type !== "subject") {
        return { status: 401, body: "Unauthorized" };
      }

      await container.item(subjectId, subjectId).delete();

      return { status: 200, body: JSON.stringify({ deleted: subjectId }) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
