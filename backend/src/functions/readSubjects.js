const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { getUserFromRequest } = require("../utils/auth");

const endpoint = process.env.COSMOS_ENDPOINT || process.env.COSMOS_DB_ENDPOINT;
const databaseName = process.env.COSMOS_DATABASE_NAME || "appdb";
const containerName = process.env.COSMOS_CONTAINER_NAME || "items";
const credential = new DefaultAzureCredential();

app.http("readSubjects", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("readSubjects was invoked");
    try {
      if (!endpoint) {
        return { status: 500, body: "Cosmos configuration missing." };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const container = client.database(databaseName).container(containerName);

      const querySpec = {
        query:
          "SELECT c.id, c.name, c.createdAt, c.updatedAt, c.owner, c.type, ARRAY_LENGTH(c.documents) AS documentCount FROM c WHERE c.owner = @owner AND c.type = 'subject' ORDER BY c.name ASC",
        parameters: [{ name: "@owner", value: user.userId }],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      return { status: 200, body: JSON.stringify(resources) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
