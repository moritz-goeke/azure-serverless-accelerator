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
    console.error("Failed to parse updateItem payload", error);
  }
  return {};
};

const buildDefaultTitle = () => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  } catch (error) {
    console.warn("Falling back to ISO title", error);
    return new Date().toISOString();
  }
};

app.http("updateItem", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("updateItem was invoked and is now executing");
    try {
      const payload = await getRequestPayload(request);
      const params = request.params || {};
      const rawItem = payload.item ?? params.item;
      const itemId = payload.itemId ?? params.itemId;

      if (!endpoint || !databaseName || !containerName) {
        context.log.error("Cosmos DB configuration is incomplete.");
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!rawItem || !itemId) {
        return { status: 400, body: "Missing parameters" };
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

      const updates =
        typeof rawItem === "string" ? JSON.parse(rawItem) : { ...rawItem };

      const newResource = {
        ...resource,
        ...updates,
        updatedAt: Date.now(),
      };

      newResource.owner = resource.owner;

      if (!newResource.title || !newResource.title.trim()) {
        newResource.title = buildDefaultTitle();
      }

      if (!Array.isArray(newResource.messages)) {
        newResource.messages = Array.isArray(resource.messages)
          ? resource.messages
          : [];
      }

      await container.item(itemId, itemId).replace(newResource);
      return { status: 200, body: JSON.stringify(newResource) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
