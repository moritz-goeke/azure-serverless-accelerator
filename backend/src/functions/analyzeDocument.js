const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const { AzureOpenAI } = require("openai");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

dotenv.config();

const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const openAiEndpoint = process.env["AZURE_OPENAI_ENDPOINT"];
// =====================================================================
// >>> NEUES MODELL HINZUFÜGEN? <<<
// 1. Neue Env-Variable anlegen (z.B. AZURE_OPENAI_DEPLOYMENT_3)
//    → in Bicep (infra/main.bicep) und in den App-Settings ergänzen.
// 2. Hier einlesen und unten in deploymentMap eintragen.
// =====================================================================
const deployment1 = process.env["AZURE_OPENAI_DEPLOYMENT"];
const deployment2 = process.env["AZURE_OPENAI_DEPLOYMENT_2"];
const deployment3 = process.env["AZURE_OPENAI_DEPLOYMENT_3"] || "gpt-5.4-mini";
const credential = new DefaultAzureCredential();

const JOBS_CONTAINER = "DocumentJobs";
const MAX_TEXT_LENGTH = 500_000; // max chars to store per document
const MAX_LLM_INPUT_CHARS = 30_000; // truncate extracted text sent to LLM to fit context window

// >>> NEUES MODELL HINZUFÜGEN? Key muss zum "value" im Frontend (MODELS-Array) passen. <<<
const deploymentMap = {
    gpt5mini: deployment1,
    gpt4o: deployment2,
    gpt54mini: deployment3,
};

const getCosmosContainer = () => {
    const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
    return client.database(cosmosDbName).container(cosmosContainerName);
};

const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";
const apiVersion = "2024-12-01-preview";

const getAzureAdToken = async () => {
    const { token } = await credential.getToken(cognitiveServicesScope);
    return token;
};

const LLM_TIMEOUT_MS = 120_000; // 2 minute timeout for the entire LLM call

const summarizeWithLLM = async (text, deploymentName, context) => {
    const t0 = Date.now();
    context.log(`[LLM] Creating AzureOpenAI client (endpoint=${openAiEndpoint}, deployment=${deploymentName})`);

    const client = new AzureOpenAI({
        endpoint: openAiEndpoint,
        apiVersion,
        deployment: deploymentName,
        azureADTokenProvider: getAzureAdToken,
    });
    context.log(`[LLM] Client created in ${Date.now() - t0}ms`);

    // Truncate to avoid exceeding context window
    const truncatedText = text.length > MAX_LLM_INPUT_CHARS
        ? text.substring(0, MAX_LLM_INPUT_CHARS) + `\n\n[… Text gekürzt, ${text.length - MAX_LLM_INPUT_CHARS} Zeichen ausgelassen]`
        : text;
    context.log(`[LLM] Input text: ${truncatedText.length} chars, sending to model...`);

    const t1 = Date.now();
    const response = await client.chat.completions.create({
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
        model: deploymentName,
        max_completion_tokens: 16384,
    });
    context.log(`[LLM] Response received in ${Date.now() - t1}ms (total ${Date.now() - t0}ms), usage: ${JSON.stringify(response.usage)}`);

    return response.choices[0]?.message?.content || "Zusammenfassung konnte nicht erstellt werden.";
};

/** Extract text from all pages of a PDF buffer using unpdf (lightweight pdfjs wrapper) */
const extractTextFromPdf = async (pdfBuffer) => {
    const { extractText } = await import("unpdf");
    const data = new Uint8Array(pdfBuffer);
    const result = await extractText(data);
    // result.text is an array of strings (one per page)
    return Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
};

app.http("analyzeDocument", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: async (request, context) => {
        const reqStart = Date.now();
        context.log("analyzeDocument invoked at " + new Date().toISOString());
        try {
            const contentType = request.headers.get("content-type") || "";
            let body;
            if (contentType.includes("application/json")) {
                body = await request.json();
            } else {
                const raw = await request.text();
                body = raw ? JSON.parse(raw) : {};
            }

            const { document, fileName, model } = body;
            if (!document) {
                return { status: 400, body: "Missing document (base64) in request body." };
            }

            // Strip data-URL prefix if present (e.g. "data:application/pdf;base64,...")
            const base64Data = document.includes(",") ? document.split(",")[1] : document;

            // Parse PDF directly with pdf-parse (no Document Intelligence needed)
            const pdfBuffer = Buffer.from(base64Data, "base64");
            context.log(`Parsing PDF (${Math.round(pdfBuffer.length / 1024)} KB)`);

            let extractedText = "";
            try {
                extractedText = await extractTextFromPdf(pdfBuffer);
                if (extractedText.length > MAX_TEXT_LENGTH) {
                    extractedText = extractedText.substring(0, MAX_TEXT_LENGTH);
                    context.log(`Text truncated to ${MAX_TEXT_LENGTH} chars`);
                }
            } catch (parseError) {
                context.log.error("PDF parse failed:", parseError);
                return { status: 400, body: JSON.stringify({ error: "PDF konnte nicht gelesen werden. Bitte stellen Sie sicher, dass es ein gültiges PDF ist." }) };
            }

            if (!extractedText.trim()) {
                return { status: 400, body: JSON.stringify({ error: "Kein Text im PDF gefunden. Das Dokument ist möglicherweise bildbasiert (gescannt)." }) };
            }

            context.log(`[TIMING] PDF extracted (${extractedText.length} chars) in ${Date.now() - reqStart}ms`);

            // Determine deployment for selected model
            const selectedModel = model || "gpt5mini";
            const deployment = deploymentMap[selectedModel] || deployment1;
            context.log(`[TIMING] Model=${selectedModel}, Deployment=${deployment}, Endpoint=${openAiEndpoint}`);

            // Run LLM summarization directly in the POST handler
            let summary = null;
            let jobStatus = "completed";
            let jobError = null;
            try {
                context.log(`[TIMING] Starting LLM call at +${Date.now() - reqStart}ms`);
                summary = await summarizeWithLLM(extractedText, deployment, context);
                context.log(`[TIMING] LLM done at +${Date.now() - reqStart}ms (${summary.length} chars)`);
            } catch (llmErr) {
                context.log.error("LLM summarization failed:", llmErr);
                // Fallback: return extracted text without summary
                summary = `Textextraktion erfolgreich. Automatische Zusammenfassung fehlgeschlagen.\n\nExtrahierter Text:\n${extractedText.substring(0, 3000)}`;
                jobError = llmErr.message || "LLM summarization failed";
            }

            // Store completed job in Cosmos
            const jobId = uuidv4();
            const jobRecord = {
                id: jobId,
                type: JOBS_CONTAINER,
                status: jobStatus,
                fileName: fileName || "document",
                selectedModel,
                createdAt: Date.now(),
                completedAt: Date.now(),
                extractedText,
                summary,
                error: jobError,
            };

            context.log(`[TIMING] Storing to Cosmos at +${Date.now() - reqStart}ms`);
            const container = getCosmosContainer();
            await container.items.create(jobRecord);
            context.log(`[TIMING] Cosmos write done at +${Date.now() - reqStart}ms, returning response`);

            return {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, status: jobStatus, summary, extractedText }),
            };
        } catch (e) {
            context.log.error("analyzeDocument error:", e);
            return { status: 500, body: JSON.stringify({ error: "Dokumentverarbeitung fehlgeschlagen." }) };
        }
    },
});
