const { app } = require("@azure/functions");
const { AzureOpenAI } = require("openai");
const { DefaultAzureCredential } = require("@azure/identity");
const dotenv = require("dotenv");

dotenv.config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"] || "gpt5mini";
const apiVersion = "2024-10-01-preview";
const credential = new DefaultAzureCredential();
const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

const getAzureAdToken = async () => {
  const { token } = await credential.getToken(cognitiveServicesScope);
  return token;
};

app.http("openai", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("openai was invoked and is now executing");
    try {
      if (!endpoint) {
        context.log.error("AZURE_OPENAI_ENDPOINT is not configured.");
        return { status: 500, body: "Azure OpenAI endpoint missing." };
      }

      const requestMessage = request.params.message;
      const requestConversation = JSON.parse(request.params.conversation);

      let messageArray = requestConversation
        .map((x) => ({
          role: x.from === "gpt" ? "assistant" : "user",
          content: x.message,
        }))
        .reverse();
      messageArray.push({ role: "user", content: requestMessage });

      const completionObject = {
        messages: messageArray,
        model: deployment,
        max_completion_tokens: 16384,
      };

      const client = new AzureOpenAI({
        endpoint,
        apiVersion,
        deployment,
        azureADTokenProvider: getAzureAdToken,
      });
      const result = await client.chat.completions.create(completionObject);

      return { body: JSON.stringify(result) };
    } catch (e) {
      context.log(e);
      return { status: 500, body: "Error!" };
    }
  },
});
