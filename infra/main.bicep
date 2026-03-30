@description('Deployment location for all resources.')
param location string = resourceGroup().location

@description('Prefix used to build global resource names. Only alphanumeric characters and hyphens are allowed.')
@minLength(3)
@maxLength(15)
param namePrefix string

@description('Azure Functions worker runtime that matches the backend implementation.')
@allowed([
  'node'
])
param functionsWorkerRuntime string = 'node'

@description('Node.js version when using the node worker runtime.')
param nodeVersion string = '~22'

@description('GitHub repository URL used for Static Web App metadata (required by the resource provider).')
param repositoryUrl string = 'https://github.com/moritz-goeke/azure-serverless-accelerator'

@description('Default branch tracked by Azure Static Web Apps for metadata.')
param repositoryBranch string = 'main'

@description('Relative path inside the repo where the Static Web App build output is produced.')
param appOutputLocation string = 'dist'

@description('Relative path inside the repo for the Azure Functions backend used by Static Web Apps.')
param apiLocation string = 'backend'

@description('Name of the Cosmos DB SQL database that stores application data.')
param cosmosDatabaseName string = 'appdb'

@description('Name of the Cosmos DB SQL container that stores application data.')
param cosmosContainerName string = 'items'

@description('Partition key path for the Cosmos DB container.')
param cosmosPartitionKeyPath string = '/id'

@description('Azure region used specifically for Cosmos DB resources.')
param cosmosLocation string = 'germanywestcentral'

@description('Azure region where the Azure OpenAI resource is deployed. Choose a region that supports the selected model.')
param openAiLocation string = 'swedencentral'

@description('SKU used for the Azure OpenAI account.')
param openAiSkuName string = 'S0'

@description('Name assigned to the Azure OpenAI deployment.')
param openAiDeploymentName string = 'gpt5mini'

@description('Model name configured in the Azure OpenAI deployment.')
param openAiModelName string = 'gpt-5-mini'

@description('Model version configured in the Azure OpenAI deployment.')
param openAiModelVersion string = '2025-08-07'

@description('Capacity allocated to the Azure OpenAI deployment.')
@minValue(1)
@maxValue(20)
param openAiDeploymentCapacity int = 1

@description('Name assigned to the second Azure OpenAI deployment.')
param openAiDeploymentName2 string = 'gpt4o'

@description('Model name configured in the second Azure OpenAI deployment.')
param openAiModelName2 string = 'gpt-4o'

@description('Model version configured in the second Azure OpenAI deployment.')
param openAiModelVersion2 string = '2024-11-20'

@description('Capacity allocated to the second Azure OpenAI deployment.')
@minValue(1)
@maxValue(20)
param openAiDeploymentCapacity2 int = 1

@description('Maximum number of Flex Consumption instances to allow for the Function App.')
@minValue(40)
@maxValue(1000)
param functionMaxInstanceCount int = 100

@description('Memory allocated per Flex Consumption instance (in MB).')
@allowed([
  2048
  4096
])
param functionInstanceMemoryMB int = 2048

@description('Optional tags applied to every resource in this deployment.')
param tags object = {}

var normalizedPrefix = toLower(replace(namePrefix, '-', ''))
var uniqueSuffix = toLower(substring(uniqueString(resourceGroup().id, namePrefix), 0, 5))
var storageAccountBase = toLower('${normalizedPrefix}${uniqueSuffix}sa')
var storageAccountName = substring(storageAccountBase, 0, min(length(storageAccountBase), 24))
var functionPlanName = toLower('plan-${namePrefix}-${uniqueSuffix}')
var functionAppName = toLower('func-${namePrefix}-${uniqueSuffix}')
var staticWebAppName = toLower('swa-${namePrefix}-${uniqueSuffix}')
var cosmosAccountBase = toLower('${normalizedPrefix}${uniqueSuffix}cos')
var cosmosAccountName = substring(cosmosAccountBase, 0, min(length(cosmosAccountBase), 44))
var aiServicesAccountBase = toLower('${normalizedPrefix}${uniqueSuffix}ais')
var aiServicesAccountName = substring(aiServicesAccountBase, 0, min(length(aiServicesAccountBase), 44))
var keyVaultName = toLower('kv${normalizedPrefix}${uniqueSuffix}')
var aiHubName = toLower('hub-${namePrefix}-${uniqueSuffix}')
var aiHubManagedRgName = toLower('rg-${namePrefix}-hub-${uniqueSuffix}')
var aiProjectName = toLower('proj-${namePrefix}-${uniqueSuffix}')
var functionIdentityName = toLower('id-${namePrefix}-${uniqueSuffix}')
var dataRoleDefinitionName = guid(cosmosAccountName, 'sql-data-role')
var dataRoleAssignmentName = guid(functionAppName, cosmosContainerName, 'sql-data-assignment')
var functionPackageContainerName = toLower('pkg-${namePrefix}-${uniqueSuffix}')
var sanitizedNodeVersion = replace(nodeVersion, '~', '')
var allTags = union(tags, {
  workload: namePrefix
})

resource functionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: functionIdentityName
  location: location
  tags: allTags
}

// ---------------------------------------------------------------------------
// Key Vault (required by AI Foundry Hub)
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: allTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// ---------------------------------------------------------------------------
// Azure AI Services (replaces standalone Azure OpenAI resource)
// ---------------------------------------------------------------------------
resource aiServicesAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: aiServicesAccountName
  location: openAiLocation
  kind: 'AIServices'
  sku: {
    name: openAiSkuName
  }
  tags: allTags
  properties: {
    customSubDomainName: aiServicesAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource aiModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  name: openAiDeploymentName
  parent: aiServicesAccount
  sku: {
    name: 'GlobalStandard'
    capacity: openAiDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
    raiPolicyName: 'Microsoft.Default'
  }
}

resource aiModelDeployment2 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  name: openAiDeploymentName2
  parent: aiServicesAccount
  sku: {
    name: 'GlobalStandard'
    capacity: openAiDeploymentCapacity2
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName2
      version: openAiModelVersion2
    }
    raiPolicyName: 'Microsoft.Default'
  }
  dependsOn: [
    aiModelDeployment
  ]
}

resource aiServicesRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServicesAccount.id, functionIdentity.id, 'aoai-user')
  scope: aiServicesAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
    )
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Azure AI Foundry Hub + Project
// ---------------------------------------------------------------------------
resource aiHub 'Microsoft.MachineLearningServices/workspaces@2025-01-01-preview' = {
  name: aiHubName
  location: location
  kind: 'Hub'
  tags: allTags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: '${namePrefix} AI Hub'
    storageAccount: storageAccount.id
    keyVault: keyVault.id
    applicationInsights: appInsights.id
    #disable-next-line BCP037
    managedResourceGroupResourceId: subscriptionResourceId('Microsoft.Resources/resourceGroups', aiHubManagedRgName)
  }
}

resource aiProject 'Microsoft.MachineLearningServices/workspaces@2025-01-01-preview' = {
  name: aiProjectName
  location: location
  kind: 'Project'
  tags: allTags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: '${namePrefix} AI Project'
    hubResourceId: aiHub.id
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-04-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  tags: allTags
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
    }
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

var storageAccountKeys = storageAccount.listKeys().keys
var azureWebJobsStorage = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccountKeys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource functionPackageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/${functionPackageContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource functionStorageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, functionIdentity.id, 'blob-data-contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    )
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${namePrefix}-${uniqueSuffix}'
  location: location
  tags: allTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'ai-${namePrefix}-${uniqueSuffix}'
  location: location
  kind: 'web'
  tags: allTags
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Bluefield'
    Request_Source: 'AzureMonitor'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: functionPlanName
  location: location
  tags: allTags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
    targetWorkerCount: 0
    targetWorkerSizeId: 0
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  tags: allTags
  dependsOn: [
    functionPackageContainer
    functionStorageBlobRoleAssignment
  ]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${functionIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    reserved: true
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: azureWebJobsStorage
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: functionIdentity.properties.clientId
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_DATABASE_NAME'
          value: cosmosDatabaseName
        }
        {
          name: 'COSMOS_CONTAINER_NAME'
          value: cosmosContainerName
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: 'https://${aiServicesAccount.name}.openai.azure.com/'
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: openAiDeploymentName
        }
        {
          name: 'AZURE_OPENAI_MODEL'
          value: openAiModelName
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT_2'
          value: openAiDeploymentName2
        }
        {
          name: 'AZURE_OPENAI_MODEL_2'
          value: openAiModelName2
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${functionPackageContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: functionIdentity.id
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: functionMaxInstanceCount
        instanceMemoryMB: functionInstanceMemoryMB
      }
      runtime: {
        name: functionsWorkerRuntime
        version: sanitizedNodeVersion
      }
    }
  }
}

resource functionAppScmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  name: 'scm'
  parent: functionApp
  properties: {
    allow: true
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosAccountName
  location: cosmosLocation
  tags: allTags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: false
    isVirtualNetworkFilterEnabled: false
    minimalTlsVersion: 'Tls12'
    disableKeyBasedMetadataWriteAccess: true
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Geo'
      }
    }
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxIntervalInSeconds: 5
      maxStalenessPrefix: 100
    }
    locations: [
      {
        locationName: cosmosLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  name: cosmosDatabaseName
  parent: cosmosAccount
  tags: allTags
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  name: cosmosContainerName
  parent: cosmosDatabase
  tags: allTags
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          cosmosPartitionKeyPath
        ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
      defaultTtl: -1
    }
  }
}

resource cosmosSqlDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleDefinitions@2023-04-15' = {
  name: dataRoleDefinitionName
  parent: cosmosAccount
  properties: {
    roleName: '${namePrefix}-cosmos-data'
    type: 'CustomRole'
    assignableScopes: [
      '${cosmosAccount.id}/dbs/${cosmosDatabaseName}'
    ]
    permissions: [
      {
        dataActions: [
          'Microsoft.DocumentDB/databaseAccounts/readMetadata'
          'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/*'
          'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/*'
        ]
        notDataActions: []
      }
    ]
  }
}

resource cosmosSqlDataAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-04-15' = {
  name: dataRoleAssignmentName
  parent: cosmosAccount
  properties: {
    principalId: functionIdentity.properties.principalId
    roleDefinitionId: cosmosSqlDataRole.id
    scope: '${cosmosAccount.id}/dbs/${cosmosDatabaseName}/colls/${cosmosContainerName}'
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: location
  tags: allTags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: repositoryBranch
    buildProperties: {
      appLocation: '/'
      apiLocation: apiLocation
      outputLocation: appOutputLocation
      skipGithubActionWorkflowGeneration: true
    }
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

resource staticSiteBackend 'Microsoft.Web/staticSites/linkedBackends@2022-03-01' = {
  name: functionApp.name
  parent: staticWebApp
  properties: {
    backendResourceId: functionApp.id
    region: location
  }
}

output functionAppName string = functionApp.name
output functionAppResourceId string = functionApp.id
output functionAppPrincipalId string = functionIdentity.properties.principalId
output functionUserAssignedIdentityId string = functionIdentity.id
output functionUserAssignedIdentityClientId string = functionIdentity.properties.clientId
output functionAppDefaultHostname string = functionApp.properties.defaultHostName
output staticWebAppName string = staticWebApp.name
output staticWebAppResourceId string = staticWebApp.id
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output cosmosAccountName string = cosmosAccount.name
output cosmosAccountEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseOutputName string = cosmosDatabaseName
output cosmosContainerOutputName string = cosmosContainerName
output cosmosRoleDefinitionId string = cosmosSqlDataRole.id
output aiServicesAccountName string = aiServicesAccount.name
output aiServicesEndpoint string = 'https://${aiServicesAccount.name}.openai.azure.com/'
output aiDeploymentName string = openAiDeploymentName
output aiDeploymentName2 string = openAiDeploymentName2
output aiHubName string = aiHub.name
output aiProjectName string = aiProject.name
