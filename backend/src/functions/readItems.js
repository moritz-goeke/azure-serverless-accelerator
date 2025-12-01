const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

const endpoint = process.env.COSMOS_ENDPOINT || process.env.COSMOS_DB_ENDPOINT;
const databaseName = process.env.COSMOS_DATABASE_NAME || "appdb";
const containerName = process.env.COSMOS_CONTAINER_NAME || "items";
const credential = new DefaultAzureCredential();

app.http("readItems", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("readItems was invoked and is now executing");
    try {
      if (!endpoint || !databaseName || !containerName) {
        context.log.error("Cosmos DB configuration is incomplete.");
        return { status: 500, body: "Cosmos configuration missing." };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const database = client.database(databaseName);
      const container = database.container(containerName);

      const querySpec = {
        query: "SELECT * FROM c ORDER BY c.createdAt DESC",
        parameters: [],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      return { status: 200, body: JSON.stringify(resources) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
