const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const dotenv = require("dotenv");

dotenv.config();

const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const credential = new DefaultAzureCredential();

<<<<<<< HEAD
const JOBS_CONTAINER = "DocumentJobs";
const MAX_LLM_INPUT_CHARS = 30_000; // truncate extracted text sent to LLM to fit context window

// >>> NEUES MODELL HINZUFÜGEN? Key muss zum "value" im Frontend (MODELS-Array) passen. <<<
const deploymentMap = {
    gpt5mini: deployment1,
    gpt4o: deployment2,
    // neuesModell: deployment3,
//    gpt-5.4-mini: deployment3,
};

=======
>>>>>>> b25d44ec97a5e614c53f70cb18a4683840f2bbf0
const getCosmosContainer = () => {
    const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
    return client.database(cosmosDbName).container(cosmosContainerName);
};

app.http("documentStatus", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "documentStatus/{jobId}",
    handler: async (request, context) => {
        const jobId = request.params.jobId;
        context.log(`documentStatus invoked for jobId: ${jobId}`);

        if (!jobId) {
            return { status: 400, body: "Missing jobId parameter." };
        }

        try {
            const container = getCosmosContainer();
            const { resource: job } = await container.item(jobId, jobId).read();

            if (!job) {
                return { status: 404, body: JSON.stringify({ error: "Job nicht gefunden." }) };
            }

            // Return current job state (read-only – summarization now happens in analyzeDocument)
            return {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobId: job.id,
                    status: job.status,
                    summary: job.summary,
                    extractedText: job.extractedText,
                    error: job.error,
                }),
            };
        } catch (e) {
            context.log.error("documentStatus error:", e);
            return { status: 500, body: JSON.stringify({ error: "Statusabfrage fehlgeschlagen." }) };
        }
    },
});
