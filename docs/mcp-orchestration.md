# MCP Orchestration Blueprint for SCG-AI

This document defines a concrete MCP contract set for your current app so an orchestrator (LLM agent or workflow engine) can reliably call existing backend capabilities.

## 1) Why MCP here

Your current API already has clear units of work:
- Generation: `/api/generate`
- Library CRUD: `/api/components`
- Salesforce auth/metadata: `/api/salesforce/*`
- Packaging/deployment: `/api/deploy/*`

MCP standardizes these as tools with:
- Stable names and schemas
- Centralized auth/policy checks
- Traceable multi-step workflows (generate -> save -> deploy)

## 2) MCP Server Surface

Expose one MCP server (for example `scg-ai-mcp`) with tools below.

### Tool: `health_check`
**Purpose**: Liveness/readiness probe.

**Input schema**
```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

**Output schema**
```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string" },
    "version": { "type": "string" },
    "timestamp": { "type": "string" }
  },
  "required": ["status", "version", "timestamp"]
}
```

**Backend mapping**: `GET /api/health`

---

### Tool: `generate_component`
**Purpose**: Generate Salesforce artifacts from prompt + context.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "prompt": { "type": "string", "minLength": 1 },
    "componentType": {
      "type": "string",
      "enum": ["apex-trigger", "apex-class", "lwc", "integration", "batch", "rest-api", "cpq"]
    },
    "refinement": { "type": ["object", "null"] },
    "orgMetadata": { "type": ["object", "null"] },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "mimeType": { "type": "string" },
          "size": { "type": "number" },
          "content": { "type": "string" }
        },
        "required": ["name"],
        "additionalProperties": true
      }
    }
  },
  "required": ["prompt", "componentType"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": {
    "components": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string" },
          "name": { "type": "string" },
          "extension": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["type", "name", "extension", "content"]
      }
    },
    "summary": { "type": "string" },
    "governorLimitNotes": { "type": "array", "items": { "type": "string" } },
    "deploymentSteps": { "type": "array", "items": { "type": "string" } },
    "dependencies": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["components", "summary", "governorLimitNotes", "deploymentSteps", "dependencies"]
}
```

**Backend mapping**: `POST /api/generate`

---

### Tool: `list_components`
**Purpose**: Query generated/saved library items.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "componentType": { "type": "string" },
    "search": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "array",
  "items": {
    "$ref": "#/definitions/SavedComponent"
  },
  "definitions": {
    "SavedComponent": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "prompt": { "type": "string" },
        "componentType": { "type": "string" },
        "components": { "type": "array", "items": { "type": "object" } },
        "summary": { "type": "string" },
        "governorLimitNotes": { "type": "array", "items": { "type": "string" } },
        "deploymentSteps": { "type": "array", "items": { "type": "string" } },
        "dependencies": { "type": "array", "items": { "type": "string" } },
        "savedAt": { "type": "string" },
        "updatedAt": { "type": "string" },
        "version": { "type": "number" }
      },
      "required": ["id", "name", "prompt", "componentType", "components", "summary", "governorLimitNotes", "deploymentSteps", "dependencies", "savedAt", "version"]
    }
  }
}
```

**Backend mapping**: `GET /api/components`

---

### Tool: `get_component`
**Purpose**: Retrieve one library item by id.

**Input schema**
```json
{
  "type": "object",
  "properties": { "id": { "type": "string", "minLength": 1 } },
  "required": ["id"],
  "additionalProperties": false
}
```

**Output schema**: Same `SavedComponent` object as above.

**Backend mapping**: `GET /api/components/:id`

---

### Tool: `save_component`
**Purpose**: Persist newly generated component set.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "prompt": { "type": "string", "minLength": 1 },
    "componentType": { "type": "string" },
    "components": { "type": "array", "items": { "type": "object" } },
    "summary": { "type": "string" },
    "governorLimitNotes": { "type": "array", "items": { "type": "string" } },
    "deploymentSteps": { "type": "array", "items": { "type": "string" } },
    "dependencies": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["name", "prompt", "components"],
  "additionalProperties": false
}
```

**Output schema**: `SavedComponent`

**Backend mapping**: `POST /api/components`

---

### Tool: `update_component`
**Purpose**: Update existing saved component.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "patch": { "type": "object" }
  },
  "required": ["id", "patch"],
  "additionalProperties": false
}
```

**Output schema**: `SavedComponent`

**Backend mapping**: `PUT /api/components/:id`

---

### Tool: `delete_component`
**Purpose**: Remove saved component.

**Input schema**
```json
{
  "type": "object",
  "properties": { "id": { "type": "string", "minLength": 1 } },
  "required": ["id"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": { "success": { "type": "boolean" } },
  "required": ["success"]
}
```

**Backend mapping**: `DELETE /api/components/:id`

---

### Tool: `salesforce_connect`
**Purpose**: Establish Salesforce session.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "username": { "type": "string", "minLength": 1 },
    "password": { "type": "string", "minLength": 1 },
    "securityToken": { "type": "string" },
    "loginUrl": { "type": "string" }
  },
  "required": ["username", "password"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "string" },
    "username": { "type": "string" },
    "orgId": { "type": "string" },
    "instanceUrl": { "type": "string" }
  },
  "required": ["sessionId", "username", "orgId", "instanceUrl"]
}
```

**Backend mapping**: `POST /api/salesforce/connect`

---

### Tool: `salesforce_get_metadata`
**Purpose**: Pull org metadata to guide generation.

**Input schema**
```json
{
  "type": "object",
  "properties": { "sessionId": { "type": "string", "minLength": 1 } },
  "required": ["sessionId"],
  "additionalProperties": false
}
```

**Output schema**: free-form JSON object from metadata service.

**Backend mapping**: `GET /api/salesforce/metadata?sessionId=...`

---

### Tool: `salesforce_disconnect`
**Purpose**: Clear server-side Salesforce session.

**Input schema**
```json
{
  "type": "object",
  "properties": { "sessionId": { "type": "string", "minLength": 1 } },
  "required": ["sessionId"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": { "success": { "type": "boolean" } },
  "required": ["success"]
}
```

**Backend mapping**: `POST /api/salesforce/disconnect`

---

### Tool: `create_deployment_package`
**Purpose**: Build a deployable ZIP package.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "generatedData": { "type": "object" },
    "name": { "type": "string" }
  },
  "required": ["generatedData"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": {
    "fileName": { "type": "string" },
    "contentType": { "type": "string" },
    "zipBase64": { "type": "string" }
  },
  "required": ["fileName", "contentType", "zipBase64"]
}
```

**Backend mapping**: `POST /api/deploy/package` (convert binary response to base64 in MCP adapter)

---

### Tool: `deploy_to_salesforce`
**Purpose**: Deploy generated artifacts to Salesforce org.

**Input schema**
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "string", "minLength": 1 },
    "generatedData": { "type": "object" }
  },
  "required": ["sessionId", "generatedData"],
  "additionalProperties": false
}
```

**Output schema**
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "status": { "type": "string" },
    "numberComponentsDeployed": { "type": "number" },
    "numberComponentErrors": { "type": "number" },
    "details": {}
  },
  "required": ["success", "status", "numberComponentsDeployed", "numberComponentErrors"]
}
```

**Backend mapping**: `POST /api/deploy/salesforce`

## 3) Orchestration Recipes (What to run in sequence)

### A) Generate + Save
1. `generate_component`
2. `save_component`
3. Return saved id/version + generated preview

### B) Connect + Metadata-aware Generate
1. `salesforce_connect`
2. `salesforce_get_metadata`
3. `generate_component` with `orgMetadata`
4. Optional `save_component`

### C) One-click Deploy
1. Ensure `sessionId` exists (else `salesforce_connect`)
2. `deploy_to_salesforce`
3. If success: optional `save_component` update with deployment notes

### D) Download Package Flow
1. `create_deployment_package`
2. Return `zipBase64` + metadata to client

## 4) Policies to enforce in MCP layer

Add policy checks before tool execution:
- `deploy_to_salesforce`: require `environment=dev|sandbox` unless explicit approval token exists
- `salesforce_connect`: redact credentials in logs and traces
- `generate_component`: prompt length and attachment size caps
- `update_component`/`delete_component`: require ownership/tenant check if multi-tenant

## 5) Suggested MCP response envelope

Use a consistent envelope regardless of tool:
```json
{
  "ok": true,
  "tool": "generate_component",
  "traceId": "uuid",
  "durationMs": 412,
  "data": {}
}
```
On error:
```json
{
  "ok": false,
  "tool": "deploy_to_salesforce",
  "traceId": "uuid",
  "error": {
    "code": "SF_DEPLOY_FAILED",
    "message": "Component validation failed",
    "retryable": false
  }
}
```

## 6) Minimal implementation approach

1. Build `server/mcp/index.js` that registers above tools.
2. Each tool function calls existing REST endpoints (no service rewrite needed).
3. Add correlation id propagation (`x-trace-id`) from MCP -> API.
4. Add policy middleware in MCP before forwarding calls.

This keeps your current app stable while adding orchestration, governance, and auditable workflows.

## 7) Implemented MVP in this repo

Implemented files:
- `server/mcp/index.js`
- `server/package.json` script: `mcp:start`

Currently available tools in MCP runtime:
- `health_check`
- `generate_component`
- `save_component`
- `list_components`
- `get_component`
- `update_component`
- `delete_component`
- `salesforce_connect`
- `salesforce_get_metadata`
- `salesforce_disconnect`
- `create_deployment_package`
- `deploy_to_salesforce`

Run locally:
```bash
npm run mcp:start --workspace=server
```

## 8) MCP client config (stdio)

Example client configuration:

```json
{
  "mcpServers": {
    "scg-ai": {
      "command": "npm",
      "args": ["run", "mcp:start", "--workspace=server"],
      "cwd": "C:/Users/richafnu/scg-ai"
    }
  }
}
```

Notes:
- The MCP server is long-running on stdio; ending it with Ctrl+C is expected.
- A non-zero terminal exit code after manual interruption does not indicate startup failure.