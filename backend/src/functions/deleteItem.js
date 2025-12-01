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
    console.error("Failed to parse deleteItem payload", error);
  }
  return {};
};

app.http("deleteItem", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("deleteItem was invoked and is now executing");
    try {
      const payload = await getRequestPayload(request);
      const params = request.params || {};
      const itemId = payload.itemId ?? params.itemId;

      if (!endpoint || !databaseName || !containerName) {
        context.log.error("Cosmos DB configuration is incomplete.");
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!itemId) {
        return { status: 400, body: "Missing itemId parameter" };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const database = client.database(databaseName);
      const container = database.container(containerName);

      const { resource } = await container.item(itemId, itemId).read();
      if (!resource || resource.owner !== user.userId) {
        return { status: 401, body: "Unauthorized" };
      }

      await container.item(itemId, itemId).delete();

      return { status: 200 };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
