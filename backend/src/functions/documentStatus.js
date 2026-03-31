const { app } = require("@azure/functions");
const { DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const { AzureOpenAI } = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const diEndpoint = process.env["DOCUMENT_INTELLIGENCE_ENDPOINT"];
const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const openAiEndpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const deployment1 = process.env["AZURE_OPENAI_DEPLOYMENT"];
const deployment2 = process.env["AZURE_OPENAI_DEPLOYMENT_2"];
const credential = new DefaultAzureCredential();

const JOBS_CONTAINER = "DocumentJobs";

const deploymentMap = {
    gpt5mini: deployment1,
    gpt4o: deployment2,
};

const getCosmosContainer = () => {
    const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
    return client.database(cosmosDbName).container(cosmosContainerName);
};

const extractTextFromResult = (result) => {
    const lines = [];
    if (result.pages) {
        for (const page of result.pages) {
            if (page.lines) {
                for (const line of page.lines) {
                    lines.push(line.content);
                }
            }
        }
    }
    if (result.tables) {
        for (const table of result.tables) {
            lines.push("\n[Tabelle]");
            for (const cell of table.cells) {
                lines.push(`  Zeile ${cell.rowIndex}, Spalte ${cell.columnIndex}: ${cell.content}`);
            }
        }
    }
    return lines.join("\n");
};

const summarizeWithLLM = async (text, deploymentName) => {
    const client = new AzureOpenAI({
        endpoint: openAiEndpoint,
        azureADTokenProvider: async () => {
            const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
            return token.token;
        },
        apiVersion: "2024-10-21",
    });

    const response = await client.chat.completions.create({
        model: deploymentName,
        messages: [
            {
                role: "system",
                content: `Du bist ein medizinischer Dokumentations-Assistent. Fasse die folgende Krankenakte strukturiert zusammen. Verwende folgende Abschnitte wenn zutreffend:

- **Patienteninformationen** (soweit vorhanden)
- **Diagnosen**
- **Befunde & Untersuchungsergebnisse**
- **Medikation**
- **Behandlungsverlauf**
- **Empfehlungen / Nächste Schritte**

Antworte auf Deutsch. Sei präzise und sachlich. Verwende medizinische Fachbegriffe korrekt.`,
            },
            {
                role: "user",
                content: `Bitte fasse folgende Krankenakte zusammen:\n\n${text}`,
            },
        ],
        max_tokens: 2000,
        temperature: 0.3,
    });

    return response.choices[0]?.message?.content || "Zusammenfassung konnte nicht erstellt werden.";
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

            if (job.status === "completed" || job.status === "failed") {
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
            }

            if (job.status === "analyzing") {
                const diClient = new DocumentAnalysisClient(diEndpoint, credential);
                const poller = await diClient.beginAnalyzeDocument("prebuilt-layout", Buffer.from(""), {
                    resumeFrom: job.operationId,
                });

                if (poller.getOperationState().status === "succeeded") {
                    const result = await poller.pollUntilDone();
                    const extractedText = extractTextFromResult(result);

                    job.extractedText = extractedText;
                    job.status = "summarizing";
                    await container.item(jobId, jobId).replace(job);

                    try {
                        const deployment = deploymentMap[job.selectedModel] || deployment1;
                        const summary = await summarizeWithLLM(extractedText, deployment);
                        job.summary = summary;
                        job.status = "completed";
                        job.completedAt = Date.now();
                        await container.item(jobId, jobId).replace(job);
                    } catch (llmErr) {
                        context.log.error("LLM summarization failed:", llmErr);
                        job.status = "completed";
                        job.summary = `Textextraktion erfolgreich. Automatische Zusammenfassung fehlgeschlagen.\n\nExtrahierter Text:\n${extractedText.substring(0, 3000)}`;
                        job.completedAt = Date.now();
                        await container.item(jobId, jobId).replace(job);
                    }

                    return {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            jobId: job.id,
                            status: job.status,
                            summary: job.summary,
                            extractedText: job.extractedText,
                        }),
                    };
                }

                if (poller.getOperationState().status === "failed") {
                    job.status = "failed";
                    job.error = "Dokumentanalyse fehlgeschlagen.";
                    await container.item(jobId, jobId).replace(job);
                    return {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jobId: job.id, status: "failed", error: job.error }),
                    };
                }

                return {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: job.id, status: "analyzing" }),
                };
            }

            if (job.status === "summarizing") {
                return {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: job.id, status: "summarizing" }),
                };
            }

            return {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId: job.id, status: job.status }),
            };
        } catch (e) {
            context.log.error("documentStatus error:", e);
            return { status: 500, body: JSON.stringify({ error: "Statusabfrage fehlgeschlagen." }) };
        }
    },
});
