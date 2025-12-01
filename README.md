# Azure Serverless Accelerator

An opinionated starter that combines a Vite/React front end, an Azure Functions (Flex Consumption) backend, Cosmos DB for NoSQL, and Azure OpenAI (GPT‑5 Mini) behind managed identities. Infrastructure is described with Bicep and deployed through a GitHub Actions workflow that provisions resources, uploads the Functions app code, and pushes the Static Web App build.

## Key Capabilities

- **Chat-first UI** with a cost panel that tracks prompt/completion tokens, AI spend (in cent), and Function compute cost per exchange.
- **Serverless data layer** that persists every conversation in Cosmos DB via user-assigned managed identity RBAC.
- **Azure OpenAI integration** wired to the `gpt5mini` deployment by default, with configurable regions/models and AAD auth (no API keys stored).
- **One-click infrastructure + app deployment** through GitHub Actions using workload identity (OIDC) instead of long-lived secrets.
- **Bicep-driven environment configuration** for Static Web Apps, Azure Functions (Flex Consumption), Cosmos DB Serverless, Application Insights, and Azure OpenAI.
- **App-only workflow** for fast redeploys once the baseline infrastructure exists.

## Architecture at a Glance

- **Static Web App** (Standard SKU) hosts the Vite build and proxies REST calls to the backend.
- **Azure Functions** (Node.js 22, Flex Consumption) exposes APIs defined in `backend/src/functions`, calls Azure OpenAI using Microsoft Entra tokens, and authenticates with Cosmos DB via a user-assigned managed identity.
- **Azure OpenAI** hosts the GPT‑5 Mini deployment (`gpt5mini`) that powers the chat completion endpoint and reports token usage for live cost tracking.
- **Cosmos DB for NoSQL (serverless)** provides on-demand throughput, RBAC, and native TLS.
- **App Insights + Storage** wire up logging and content storage for the Function App.
- **GitHub Actions** uses OIDC to deploy infrastructure and application artifacts without secrets.

```
frontend (Vite) → Static Web App ──► Azure Functions ──► Cosmos DB (NoSQL)
                             │                      ╰─► App Insights + Storage
                             │                      ╰─► Azure OpenAI (GPT‑5 Mini)
                             ╰── GitHub Actions/OIDC for infra + app deployment
```

## AI & Conversation Flow

1. The React client sends the user prompt plus the current conversation transcript to `/api/openai`.
2. The Function App enriches the transcript, requests an Azure AD token, and calls the configured Azure OpenAI deployment.
3. Usage data (`prompt_tokens`, `completion_tokens`) from Azure OpenAI is echoed back to the UI to update the live dashboard.
4. Conversations can be persisted, listed, and deleted via the Cosmos-backed CRUD APIs (`createItem`, `readItems`, `updateItem`, `deleteItem`).

### Cost Model & UI Telemetry

- Pricing constants live in `src/components/consts.jsx`. The defaults mirror €0.22 / €1.72 per 1M tokens for GPT‑5 Mini input/output.
- The UI derives per-message AI cost plus Flex Consumption compute cost and renders cumulative charts (tokens, execution time, total cost).
- Update the pricing map if you switch to a new model or if Azure updates rates.

### Chat Configuration

- Front end defaults to `selectedModel = "gpt5mini"` (`src/pages/MainPage.jsx`).
- Backend reads `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_DEPLOYMENT` (set by Bicep) and uses Microsoft Entra tokens instead of API keys.
- To experiment locally, define these settings in `backend/local.settings.json` or a `.env` file:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_OPENAI_ENDPOINT": "https://<your-aoai-name>.openai.azure.com/",
    "AZURE_OPENAI_DEPLOYMENT": "gpt5mini"
  }
}
```

> The deployment name is what Azure OpenAI expects in the `model` field for chat completions. Keep it in sync with the actual deployment name defined in Bicep or the Azure portal.

## Repository Structure

```
├── src/                     # React front end (Vite)
├── backend/                 # Azure Functions project (Node.js 22)
├── infra/
│   ├── main.bicep           # Resource group level template
│   └── main.parameters.json # Sample parameters
└── .github/workflows/
    └── deploy.yml           # IaC + app deployment pipeline
```

## Prerequisites

- **Node.js 22+** (the repo enforces this via the `engines` field).
- **Azure CLI 2.61+** (bundles the latest Bicep version and `az staticwebapp upload`).
- **Azure Static Web Apps CLI extension** (`az extension add --name staticwebapp --upgrade`) so the upload step is available locally and in CI.
- **Bicep CLI** (optional locally; Azure CLI compiles Bicep automatically).
- **Azure Functions Core Tools v4** (optional for local backend runs).

Verify locally:

```powershell
node --version
az version
```

## Setup Guide

Follow these steps the first time you deploy the accelerator:

1. **Fork or clone this repository** – you need write access so the GitHub Actions workflows can run.
2. **Install the tooling** listed above and run `az login` to connect the Azure CLI to the subscription you plan to use.
3. **Create (or select) a resource group** to hold everything:

```powershell
az group create --name rg-swa-demo --location westeurope
```

4. **Create a user-assigned managed identity (UAMI)** that GitHub Actions will impersonate:

```powershell
az identity create `
  --name gha-swa-identity `
  --resource-group rg-swa-demo `
  --location westeurope
```

5. **Grant the UAMI Contributor _and_ User Access Administrator** on the resource group (or a custom role with equivalent permissions). The deployment needs to assign roles to the storage account and Azure OpenAI resource:

```powershell
PRINCIPAL_ID=$(az identity show --name gha-swa-identity --resource-group rg-swa-demo --query principalId -o tsv)
az role assignment create `
  --assignee-object-id $PRINCIPAL_ID `
  --role Contributor `
  --scope /subscriptions/<subscription-id>/resourceGroups/rg-swa-demo

az role assignment create `
  --assignee-object-id $PRINCIPAL_ID `
  --role "User Access Administrator" `
  --scope /subscriptions/<subscription-id>/resourceGroups/rg-swa-demo
```

6. **Add a federated credential** directly to the UAMI so GitHub’s OIDC tokens can exchange for Azure tokens:

```powershell
az identity federated-credential create `
  --name github-main `
  --identity-name gha-swa-identity `
  --resource-group rg-swa-demo `
  --issuer https://token.actions.githubusercontent.com `
  --subject repo:<owner>/<repo>:ref:refs/heads/main `
  --audience api://AzureADTokenExchange
```

Repeat for additional branches or environments if needed.

7. **Record the identity’s IDs** – client ID (`az identity show --name gha-swa-identity --resource-group rg-swa-demo --query clientId -o tsv`), tenant ID (`az account show --query tenantId -o tsv`), and subscription ID (`az account show --query id -o tsv`).

8. **Configure repository secrets**: `Settings → Secrets and variables → Actions → Secrets → New repository secret` for each item:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

9. **Add repository variables** (optional but recommended) under `Settings → Secrets and variables → Actions → Variables`:

- `AZURE_RESOURCE_GROUP` (for example `rg-swa-demo`)
- `AZURE_LOCATION` (for example `westeurope`)
- `NAME_PREFIX` (for example `swa-demo`)

10. **Run the infrastructure workflow** (details below) to provision the Static Web App, Function App, Cosmos DB, Azure OpenAI (account + deployment), and a runtime UAMI for the Functions backend.

11. **Use the app-only workflow** whenever you just need to ship code changes to the existing infrastructure.

## Local Development

Install dependencies once:

```powershell
npm install
npm install --prefix backend
```

Run the Vite dev server:

```powershell
npm run dev
```

Start the Functions runtime in a second terminal (requires Azure Functions Core Tools):

```powershell
cd backend
func start
```

## Infrastructure as Code

`infra/main.bicep` provisions every resource inside a single resource group and now creates a dedicated user-assigned managed identity that the Function App uses to talk to Cosmos DB. Customize values through `infra/main.parameters.json` or CLI overrides. Before deploying, review the built‑in parameters:

- `location`, `namePrefix`, `nodeVersion`
- `openAiLocation`, `openAiDeploymentName`, `openAiModelName`, `openAiModelVersion`, `openAiDeploymentCapacity`
- Cosmos DB names, container, partition key
- `cosmosLocation` (Cosmos DB region, defaults to `germanywestcentral`)
- Optional tags map

### Manual Deployment from Your Machine

```powershell
# (Optional) create the resource group first
az group create --name <rg-name> --location <azure-region>

# Preview changes
az deployment group what-if `
  --name swa-preview `
  --resource-group <rg-name> `
  --template-file infra/main.bicep `
  --parameters @infra/main.parameters.json namePrefix=<prefix> location=<region>

# Apply
az deployment group create `
  --name swa-deploy `
  --resource-group <rg-name> `
  --template-file infra/main.bicep `
  --parameters @infra/main.parameters.json namePrefix=<prefix> location=<region>
```

The outputs include the Function App and Static Web App names, Cosmos endpoint, Azure OpenAI endpoint, deployment name, and the managed identity IDs (resource + client ID) for easy RBAC audits.

## GitHub Actions Deployment

Workflow: `.github/workflows/deploy.yml`

### Required Repository Secrets

| Secret                  | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | Client ID of the user-assigned managed identity used for workload identity. |
| `AZURE_TENANT_ID`       | Entra ID tenant that hosts the managed identity.                            |
| `AZURE_SUBSCRIPTION_ID` | Subscription that owns the target resource group.                           |

The federated credential you created on the UAMI must trust `repo:owner/name:ref:refs/heads/main` (and optionally other refs you plan to deploy from).

### Recommended Repository Variables

| Variable               | Example       | Purpose                                                |
| ---------------------- | ------------- | ------------------------------------------------------ |
| `AZURE_RESOURCE_GROUP` | `rg-swa-demo` | Target resource group for both IaC and app deploys.    |
| `AZURE_LOCATION`       | `westeurope`  | Default Azure region.                                  |
| `NAME_PREFIX`          | `swa-demo`    | Input to the Bicep template for globally unique names. |

> Cosmos DB uses a dedicated parameter (`cosmosLocation`) that defaults to `germanywestcentral`. The workflow also exposes a manual input so you can temporarily override the Cosmos region without changing repository files.

> Azure OpenAI configuration is provided through `openAi*` parameters. Supply a region that supports your chosen model and make sure your subscription has quota before running the workflow.

You can override `namePrefix`, `location`, and the dedicated `cosmosLocation` per run via the `workflow_dispatch` inputs.

> ⚠️ **RBAC requirement:** The GitHub Actions managed identity needs either Owner or the combination of Contributor + User Access Administrator on the resource group so the deployment can create the storage role assignment used by Flex Consumption package deployment. Without that privilege the workflow fails with `roleAssignments/write` errors during `what-if`.

### What the Workflow Does

1. **Builds artifacts** – installs Node 22, builds the Vite front end, installs backend dependencies, and zips the Functions app.
2. **Logs into Azure with OIDC** using `azure/login@v2` and the federated user-assigned managed identity you created earlier.
3. **Runs `what-if`** against `infra/main.bicep` to preview changes.
4. **Deploys the template** and captures outputs (Function App, Static Web App, Azure OpenAI endpoint/deployment names, URLs).
5. **Deploys the backend** via `az functionapp deployment source config-zip` using the newly zipped package.
6. **Uploads the front end** using `az staticwebapp upload` and publishes a summary with the production hostname + Azure OpenAI details for quick verification.

> The workflow assumes `infra/main.parameters.json` exists in the repository. Adjust parameter values or add secure parameters via `--parameters key=value` if needed.

### Triggering the Workflow

**Automatic deploys** happen on every push to `main` once secrets/variables exist.

**Manual run instructions:**

1. Open `Actions` in GitHub.
2. Select **Deploy Azure Serverless Accelerator**.
3. Click **Run workflow**.
4. Choose the `main` branch and, if desired, override `namePrefix` or `location`.
5. Click **Run workflow** again and wait ~10 minutes. Watch the logs for the `what-if`, Bicep deployment, Function zip deploy, and Static Web App upload steps.
6. Copy the Function + Static Web App names/URLs from the final step summary.

### App-Only Deployment Workflow

Workflow: `.github/workflows/deploy-app.yml`

Use this manual workflow when the infrastructure is already provisioned and you only need to ship updated frontend/back-end artifacts.

| Input                 | Description                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `resourceGroup`       | Resource group that contains the existing Function App + Static Web App.                      |
| `functionAppName`     | Target Function App for the zipped backend package.                                           |
| `staticWebAppName`    | Static Web App that should receive the Vite build.                                            |
| `slot`                | Optional Static Web App environment (e.g., `default`, `staging`). Leave blank for production. |
| `azureClientId`       | Client ID of the user-assigned managed identity configured with a federated credential.       |
| `azureTenantId`       | Tenant ID hosting the managed identity.                                                       |
| `azureSubscriptionId` | Subscription that contains the resources.                                                     |

The workflow rebuilds both projects with Node 22, logs into Azure via OIDC using the supplied managed identity identifiers, deploys the backend zip via `az functionapp deployment source config-zip`, and uploads the `dist/` folder with `az staticwebapp upload`. Provide the same federated identity inputs you configured earlier—no additional secrets are required.

**How to run it:**

1. Open `Actions → Deploy App Artifacts (Existing Infra)`.
2. Click **Run workflow**.
3. Fill in the required inputs (resource group, function app, static web app, Azure IDs). You can copy the names from the IaC workflow outputs or `az deployment group show`.
4. (Optional) Set the `slot` input if you want to deploy to a staging environment.
5. Start the workflow and monitor its logs. The summary will confirm the target Function/Static Web App.

## Node.js Tooling Alignment

Both the root project and the Functions backend enforce `"engines": { "node": ">=22" }`. GitHub Actions and the Function App (via the `nodeVersion` parameter and `WEBSITE_NODE_DEFAULT_VERSION`) are pinned to Node 22 to keep local dev, CI, and Azure runtimes consistent.

## Testing the AI Endpoint

Invoke the Function directly once the infrastructure is live:

```powershell
curl -X POST https://<function-app>.azurewebsites.net/api/openai \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","conversation":"[]"}'
```

You should receive a JSON payload with `choices[0].message.content` and a `usage` object. A `404 DeploymentNotFound` error indicates the deployment name in `AZURE_OPENAI_DEPLOYMENT` does not match the Azure OpenAI deployment.

## Troubleshooting

- **Azure OpenAI `DeploymentNotFound`** – verify that `AZURE_OPENAI_DEPLOYMENT` equals the deployment name in your Azure OpenAI resource. Remember: Azure expects the deployment name in the `model` field when calling chat completions.
- **`az staticwebapp upload` not found** – upgrade Azure CLI to the latest version (`az upgrade`).
- **Function App zip deploy failures** – ensure the `backend.zip` contains `host.json`, `package.json`, and the `node_modules` folder created during `npm install --prefix backend`.
- **Bicep validation errors** – run `az deployment group what-if` locally to inspect detailed diagnostics.

Deploy, iterate, and expand the accelerator to fit your workloads.
