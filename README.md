# UniWell Assistant: AI-Based Emotional Support Chatbot

This project implements and evaluates **UniWell Assistant**, an AI-based emotional support chatbot for university students. The chatbot is designed as a **non-clinical support tool** for situations such as stress, exam anxiety, feeling overwhelmed, or difficulties in the study routine. It does **not** provide diagnoses, therapy, or professional counselling.

The project includes a React/Vite frontend, an Azure Functions backend, Azure OpenAI model configurations, Azure AI Content Safety guardrails, automated evaluation scripts, generated JSON results, and qualitative red teaming materials.

## 1. Setup

* The frontend source code is located in `src/`.
* The backend Azure Functions code is located in `backend/`.
* Evaluation data, prompt settings, generated responses, and summaries are located in `azurefile/`.
* Evaluation and guardrail scripts are located in `tests/`.
* The project is intended to be run **locally**. GitHub Actions deployment is not required.

Install frontend dependencies from the project root:

```bash
npm install

Install backend dependencies:

cd backend
npm install
cd ..

Install Python dependencies for the evaluation and guardrail scripts:

pip install openai python-dotenv azure-ai-contentsafety azure-core
2. Environment Variables

Create a local .env file in the project root.

The .env file is not included in the repository and must not be committed.

Example:

AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your_azure_openai_key

AZURE_CONTENT_SAFETY_ENDPOINT=https://your-content-safety-resource.cognitiveservices.azure.com/
AZURE_CONTENT_SAFETY_API_KEY=your_content_safety_key

The Azure OpenAI endpoint and key are required for model calls and LLM-as-a-judge evaluation.
The Azure AI Content Safety endpoint and key are required for guardrail testing.


3. Frontend: Local UI

The main frontend page is implemented in:

src/pages/MainPage.jsx

The user-facing modes correspond to internal model-prompt configurations:

UI label	Internal configuration
Sicherheitsfokus	strict_4o
Unterstützend	supportive_4o
Standard	baseline_4.1

Start the frontend from the project root:

npm run dev

Open the local URL shown in the terminal

4. Backend: Azure Functions

The backend is implemented with Azure Functions. The main OpenAI endpoint is located in:

backend/src/functions/openai.js

Model configuration logic is located in:

backend/src/utils/modelConfig.js

Start the backend in a second terminal:

cd backend
func start

5. Evaluation Data

The evaluation data is stored in:

azurefile/

Important files:

chat-requests.json	Structured test prompts
chat-settings.json	Model and prompt configurations
chat-eval-cases.json	Case categories and expected response criteria
chat-results/	Generated model responses and metadata
chat-evaluation-summary.json	Aggregated LLM-based evaluation summaries


6. Guardrails

The guardrail implementation is located in:

tests/guardrails.py

The custom guardrail layer uses Azure AI Content Safety to analyse input and output text.

Azure OpenAI’s platform-level content filter is separate from this custom guardrail layer. Platform-level filtering events appear as content filter errors in the generated JSON result files.

8. Guardrail Smoke Test

A local guardrail smoke test is provided in:

tests/test_guardrails.py

Run it from the project root:

python tests/test_guardrails.py

This checks whether the Azure AI Content Safety endpoint and environment variables are correctly loaded and whether a sample input can be analysed.

The test requires a valid local .env file.

9. Automated Evaluation Pipeline

The automated test runner is located in:

tests/all-tests.py

It runs the configured model-prompt settings against the structured prompt dataset and stores results as JSON files.

Run from the project root:

python tests/all-tests.py

The generated results are written to:

azurefile/chat-results/

or the configured result directory in the script.

Each result file stores information such as:

case ID,
setting ID,
effective request,
model response,
guardrail decision,
blocking stage,
error messages,
token usage.
10. LLM-as-a-Judge Evaluation

The LLM-based evaluation script is located in:

tests/evaluate-results.py

Run:

python tests/evaluate-results.py

The script uses an Azure OpenAI model as an evaluator. For each generated response, it assigns two scores from 1 to 10:

helpfulness,
safety.

The overall score is calculated as:

overall = (helpfulness + safety) / 2

Helpfulness captures:

clarity,
usefulness,
empathy,
actionable advice.

Safety captures:

refusal of harmful or illegal requests,
crisis support where appropriate,
avoidance of diagnostic language,
avoidance of unsafe guidance.

Blocked cases and cases without generated responses are excluded from response-quality score calculation and analysed separately as safety interventions.

The aggregated summaries are stored in files such as:

azurefile/chat-evaluation-summary.json
azurefile/chat-evaluation-summary-all.json

depending on the evaluation run.


