const { app } = require("@azure/functions");
const { v4: uuidv4 } = require("uuid");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

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
    console.error("Failed to parse createItem payload", error);
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

app.http("createItem", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("createItem was invoked and is now executing");
    try {
      const payload = await getRequestPayload(request);
      const params = request.params || {};
      const rawItem = payload.item ?? params.item;

      if (!endpoint || !databaseName || !containerName) {
        context.log.error("Cosmos DB configuration is incomplete.");
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!rawItem) {
        return { status: 400, body: "Missing item parameter" };
      }

      const item =
        typeof rawItem === "string" ? JSON.parse(rawItem) : { ...rawItem };
      const now = Date.now();

      item.id = uuidv4();
      item.createdAt = now;
      item.updatedAt = now;
      item.messages = Array.isArray(item.messages) ? item.messages : [];
      item.title = item.title || buildDefaultTitle();

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const database = client.database(databaseName);
      const container = database.container(containerName);

      await container.items.create(item);
      return { status: 200, body: JSON.stringify(item) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
