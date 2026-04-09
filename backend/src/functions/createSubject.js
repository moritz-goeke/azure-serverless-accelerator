const { app } = require("@azure/functions");
const { v4: uuidv4 } = require("uuid");
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
    console.error("Failed to parse createSubject payload", error);
  }
  return {};
};

app.http("createSubject", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("createSubject was invoked");
    try {
      const payload = await getRequestPayload(request);
      const name = payload.name;

      if (!endpoint) {
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!name || !name.trim()) {
        return { status: 400, body: "Missing subject name" };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      const now = Date.now();
      const item = {
        id: uuidv4(),
        type: "subject",
        name: name.trim(),
        documents: [],
        owner: user.userId,
        createdAt: now,
        updatedAt: now,
      };

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const container = client.database(databaseName).container(containerName);
      await container.items.create(item);

      return { status: 200, body: JSON.stringify(item) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
