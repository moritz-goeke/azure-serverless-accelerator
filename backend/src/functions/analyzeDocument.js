const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

dotenv.config();

const cosmosEndpoint = process.env["COSMOS_ENDPOINT"];
const cosmosDbName = process.env["COSMOS_DATABASE_NAME"] || "appdb";
const cosmosContainerName = process.env["COSMOS_CONTAINER_NAME"] || "items";
const credential = new DefaultAzureCredential();

const JOBS_CONTAINER = "DocumentJobs";
const MAX_TEXT_LENGTH = 500_000; // max chars to store per document

const getCosmosContainer = () => {
    const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
    return client.database(cosmosDbName).container(cosmosContainerName);
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
        context.log("analyzeDocument invoked");
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

            context.log(`Extracted ${extractedText.length} chars from PDF`);

            // Store job with extracted text, ready for summarization
            const jobId = uuidv4();
            const jobRecord = {
                id: jobId,
                type: JOBS_CONTAINER,
                status: "summarizing",
                fileName: fileName || "document",
                selectedModel: model || "gpt5mini",
                createdAt: Date.now(),
                extractedText,
                summary: null,
                error: null,
            };

            const container = getCosmosContainer();
            await container.items.create(jobRecord);

            return {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, status: "summarizing" }),
            };
        } catch (e) {
            context.log.error("analyzeDocument error:", e);
            return { status: 500, body: JSON.stringify({ error: "Dokumentverarbeitung fehlgeschlagen." }) };
        }
    },
});
