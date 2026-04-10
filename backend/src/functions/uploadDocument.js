const { app } = require("@azure/functions");
const { v4: uuidv4 } = require("uuid");
const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { getUserFromRequest } = require("../utils/auth");

const endpoint = process.env.COSMOS_ENDPOINT || process.env.COSMOS_DB_ENDPOINT;
const databaseName = process.env.COSMOS_DATABASE_NAME || "appdb";
const containerName = process.env.COSMOS_CONTAINER_NAME || "items";
const credential = new DefaultAzureCredential();

const MAX_TEXT_LENGTH = 500_000; // ~500KB text per document to stay within Cosmos limits

/** Extract text from all pages of a PDF buffer using unpdf (lightweight pdfjs wrapper) */
const extractTextFromPdf = async (pdfBuffer) => {
  const { extractText } = await import("unpdf");
  const data = new Uint8Array(pdfBuffer);
  const result = await extractText(data);
  // result.text is an array of strings (one per page)
  return Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
};

const getRequestPayload = async (request) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await request.json();
    }
  } catch (error) {
    console.error("Failed to parse uploadDocument payload", error);
  }
  return {};
};

app.http("uploadDocument", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("uploadDocument was invoked");
    try {
      const payload = await getRequestPayload(request);
      const { subjectId, filename, fileBase64 } = payload;

      if (!endpoint) {
        return { status: 500, body: "Cosmos configuration missing." };
      }

      if (!subjectId || !filename || !fileBase64) {
        return { status: 400, body: "Missing subjectId, filename, or fileBase64" };
      }

      const user = getUserFromRequest(request, context);
      if (!user) {
        return { status: 401, body: "Unauthorized" };
      }

      // Decode base64 PDF and extract text
      const pdfBuffer = Buffer.from(fileBase64, "base64");
      let extractedText = "";
      try {
        extractedText = await extractTextFromPdf(pdfBuffer);
        if (extractedText.length > MAX_TEXT_LENGTH) {
          extractedText = extractedText.substring(0, MAX_TEXT_LENGTH);
          context.log(`Text truncated to ${MAX_TEXT_LENGTH} chars for ${filename}`);
        }
      } catch (parseError) {
        context.log("PDF parse failed", parseError);
        return { status: 400, body: "Failed to parse PDF. Make sure the file is a valid PDF." };
      }

      if (!extractedText.trim()) {
        return { status: 400, body: "No text could be extracted from the PDF. The file may be image-based." };
      }

      const client = new CosmosClient({ endpoint, aadCredentials: credential });
      const container = client.database(databaseName).container(containerName);

      // Fetch the subject
      const { resource: subject } = await container.item(subjectId, subjectId).read();
      if (!subject || subject.owner !== user.userId || subject.type !== "subject") {
        return { status: 401, body: "Unauthorized" };
      }

      // Add the document
      const document = {
        id: uuidv4(),
        filename: filename,
        extractedText: extractedText,
        charCount: extractedText.length,
        uploadedAt: Date.now(),
      };

      if (!Array.isArray(subject.documents)) {
        subject.documents = [];
      }
      subject.documents.push(document);
      subject.updatedAt = Date.now();

      await container.item(subjectId, subjectId).replace(subject);

      // Return without the full extracted text to save bandwidth
      const responseDoc = { ...document, extractedText: undefined };
      return {
        status: 200,
        body: JSON.stringify({
          document: responseDoc,
          subjectId: subjectId,
          totalDocuments: subject.documents.length,
        }),
      };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
