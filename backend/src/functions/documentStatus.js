const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const { AzureOpenAI } = require("openai");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const openAiEndpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const deployment1 = process.env["AZURE_OPENAI_DEPLOYMENT"];
const deployment2 = process.env["AZURE_OPENAI_DEPLOYMENT_2"];
const credential = new DefaultAzureCredential();

const JOBS_CONTAINER = "DocumentJobs";
const MAX_LLM_INPUT_CHARS = 30_000; // truncate extracted text sent to LLM to fit context window

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

    // Truncate to avoid exceeding context window
    const truncatedText = text.length > MAX_LLM_INPUT_CHARS
        ? text.substring(0, MAX_LLM_INPUT_CHARS) + `\n\n[… Text gekürzt, ${text.length - MAX_LLM_INPUT_CHARS} Zeichen ausgelassen]`
        : text;

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
                content: `Bitte fasse folgende Krankenakte zusammen:\n\n${truncatedText}`,
            },
        ],
        max_tokens: 4000,
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

            // DI analysis in progress → poll the operation-location URL directly
            if (job.status === "analyzing") {
                const tokenResponse = await credential.getToken("https://cognitiveservices.azure.com/.default");
                const res = await axios.get(job.operationLocation, {
                    headers: { "Authorization": `Bearer ${tokenResponse.token}` },
                    timeout: 15_000,
                });

                const diStatus = res.data.status;

                if (diStatus === "succeeded") {
                    const analyzeResult = res.data.analyzeResult;
                    const extractedText = extractTextFromResult(analyzeResult);

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

                if (diStatus === "failed") {
                    job.status = "failed";
                    job.error = "Dokumentanalyse fehlgeschlagen.";
                    await container.item(jobId, jobId).replace(job);
                    return {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jobId: job.id, status: "failed", error: job.error }),
                    };
                }

                // Still running
                return {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: job.id, status: "analyzing" }),
                };
            }

            // Summarization in progress or previously interrupted → retry LLM call
            if (job.status === "summarizing" && job.extractedText) {
                try {
                    const deployment = deploymentMap[job.selectedModel] || deployment1;
                    const summary = await summarizeWithLLM(job.extractedText, deployment);
                    job.summary = summary;
                    job.status = "completed";
                    job.completedAt = Date.now();
                    await container.item(jobId, jobId).replace(job);

                    return {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            jobId: job.id,
                            status: job.status,
                            summary: job.summary,
                            extractedText: job.extractedText,
                        }),
                    };
                } catch (llmErr) {
                    context.log.error("LLM summarization retry failed:", llmErr);
                    job.status = "completed";
                    job.summary = `Textextraktion erfolgreich. Automatische Zusammenfassung fehlgeschlagen.\n\nExtrahierter Text:\n${job.extractedText.substring(0, 3000)}`;
                    job.completedAt = Date.now();
                    await container.item(jobId, jobId).replace(job);

                    return {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            jobId: job.id,
                            status: job.status,
                            summary: job.summary,
                        }),
                    };
                }
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
