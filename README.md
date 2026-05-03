# UniWell Assistant: AI-Based Emotional Support Chatbot

This project implements and evaluates **UniWell Assistant**, an AI-based emotional support chatbot for university students. The chatbot is designed as a **non-clinical support tool** for situations such as stress, exam anxiety, feeling overwhelmed, or difficulties in the study routine.

The project includes a React/Vite frontend, an Azure Functions backend, Azure OpenAI model configurations, Azure AI Content Safety guardrails, and automated evaluation scripts. The project is intended to be run **locally**.

---

## Project Structure

* **`src/`**: React/Vite frontend source code.
* **`backend/`**: Azure Functions backend code.
* **`azurefile/`**: Evaluation data, prompt settings, generated responses, and summaries.
* **`tests/`**: Python scripts for automated evaluation and guardrail testing.

---

## 1. Setup & Installation

### Install Dependencies

Run the following commands from the project root to install all required dependencies for the frontend, backend, and Python scripts:

~~~bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install Python dependencies for evaluation scripts
pip install openai python-dotenv azure-ai-contentsafety azure-core
~~~

### Environment Variables

Create a local `.env` file in the project root.

**Note:** The `.env` file is ignored by git and must not be committed.

Add the following keys to your `.env` file:

~~~env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your_azure_openai_key

AZURE_CONTENT_SAFETY_ENDPOINT=https://your-content-safety-resource.cognitiveservices.azure.com/
AZURE_CONTENT_SAFETY_API_KEY=your_content_safety_key
~~~

Azure OpenAI: Required for model calls and LLM-as-a-judge evaluation.

Azure AI Content Safety: Required for guardrail testing.

---

## 2. Running the Application Locally

### Start the Backend (Azure Functions)

The main OpenAI endpoint is located in `backend/src/functions/openai.js`, and the model config is in `backend/src/utils/modelConfig.js`.

~~~bash
cd backend
func start
~~~

### Start the Frontend

The main UI is located in `src/pages/MainPage.jsx`.

~~~bash
# In a new terminal window at the project root
npm run dev
~~~


### Frontend UI Modes

The user interface provides three modes that map to internal model configurations:

| UI Label | Internal Configuration |
|---|---|
| Sicherheitsfokus | `strict_4o` |
| Unterstützend | `supportive_4o` |
| Standard | `baseline_4.1` |

---

## 3. Running the Evaluation Pipeline

To run the experiment and generate scores for the models, run the Python scripts in the following order.

### Step 1: Generate Responses

Run the configured model-prompt settings against the structured test dataset.  
The script reads the test prompts, model settings, and guardrail settings from the `azurefile/` directory.

~~~bash
python tests/all-tests.py
~~~

This script stores the generated model responses, guardrail decisions, blocking stages, and token usage in the `azurefile/chat-results/` directory.

### Step 2: Evaluate Results (LLM-as-a-Judge)

Evaluate the quality of the generated responses.

~~~bash
python tests/evaluate-results.py
~~~

Once complete, the final scores for the models will be aggregated in `azurefile/chat-evaluation-summary.json`.

### Evaluation Data Reference

All evaluation datasets and results are stored in the `azurefile/` directory:

| File / Folder | Description |
|---|---|
| `chat-requests.json` | Structured test prompts. |
| `chat-settings.json` | Model and prompt configurations. |
| `chat-eval-cases.json` | Case categories and expected response criteria. |
| `chat-results/` | Generated model responses and metadata. |
| `chat-evaluation-summary.json` | Aggregated LLM-based evaluation summaries generated after Step 2. |

### Guardrail Test Files

The `tests/` folder also contains two guardrail-related scripts:

| File | Description |
|---|---|
| `tests/guardrails.py` | Helper module for Azure AI Content Safety guardrails. It checks user input and model output for unsafe content categories. |
| `tests/test_guardrails.py` | Standalone script used to verify that the guardrails are configured and working correctly. |

The guardrails check the following Azure AI Content Safety categories:

| Category | Description |
|---|---|
| `hate` | Hate or discriminatory content. |
| `violence` | Violent or threatening content. |
| `sexual` | Sexual content. |
| `self_harm` | Self-harm related content. |

To test the guardrails separately, run:

```bash
python tests/test_guardrails.py
```
