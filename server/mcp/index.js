import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { generateSalesforceComponent } from '../services/aiService.js';
import { getDB, initDB } from '../services/dbService.js';
import { createDeploymentPackage, deployToSalesforce } from '../services/deployService.js';
import {
  connectWithCredentials,
  disconnectSession,
  getConnection,
  getOrgMetadata,
} from '../services/salesforceService.js';

const TOOL_NAMES = {
  HEALTH_CHECK: 'health_check',
  GENERATE_COMPONENT: 'generate_component',
  SAVE_COMPONENT: 'save_component',
  LIST_COMPONENTS: 'list_components',
  GET_COMPONENT: 'get_component',
  UPDATE_COMPONENT: 'update_component',
  DELETE_COMPONENT: 'delete_component',
  SALESFORCE_CONNECT: 'salesforce_connect',
  SALESFORCE_GET_METADATA: 'salesforce_get_metadata',
  SALESFORCE_DISCONNECT: 'salesforce_disconnect',
  CREATE_DEPLOYMENT_PACKAGE: 'create_deployment_package',
  DEPLOY_TO_SALESFORCE: 'deploy_to_salesforce',
};

const COMPONENT_TYPES = new Set([
  'apex-trigger',
  'apex-class',
  'lwc',
  'integration',
  'batch',
  'rest-api',
  'cpq',
]);

function createServer() {
  return new Server(
    { name: 'scg-ai-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
}

function okResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(message, code = 'TOOL_ERROR') {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: { code, message },
  };
}

function toStringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getTraceId(request) {
  return request.params?._meta?.traceId || randomUUID();
}

function registerHandlers(server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAMES.HEALTH_CHECK,
        description: 'Liveness/readiness probe for SCG-AI backend.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.GENERATE_COMPONENT,
        description: 'Generate Salesforce artifacts from prompt + context.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', minLength: 1 },
            componentType: {
              type: 'string',
              enum: [...COMPONENT_TYPES],
            },
            refinement: { type: ['object', 'null'] },
            orgMetadata: { type: ['object', 'null'] },
            attachments: { type: 'array', items: { type: 'object' } },
          },
          required: ['prompt', 'componentType'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.SAVE_COMPONENT,
        description: 'Persist generated component set into SCG-AI component library.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            prompt: { type: 'string', minLength: 1 },
            componentType: { type: 'string' },
            components: { type: 'array', items: { type: 'object' } },
            summary: { type: 'string' },
            governorLimitNotes: { type: 'array', items: { type: 'string' } },
            deploymentSteps: { type: 'array', items: { type: 'string' } },
            dependencies: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'prompt', 'components'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.LIST_COMPONENTS,
        description: 'List saved components with optional filtering by type or search term.',
        inputSchema: {
          type: 'object',
          properties: {
            componentType: { type: 'string' },
            search: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.GET_COMPONENT,
        description: 'Get one saved component by id.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.UPDATE_COMPONENT,
        description: 'Update a saved component by id with partial fields.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
            patch: { type: 'object' },
          },
          required: ['id', 'patch'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.DELETE_COMPONENT,
        description: 'Delete a saved component by id.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.SALESFORCE_CONNECT,
        description: 'Connect to Salesforce org and create a server-side session.',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
            securityToken: { type: 'string' },
            loginUrl: { type: 'string' },
          },
          required: ['username', 'password'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.SALESFORCE_GET_METADATA,
        description: 'Fetch Salesforce org metadata using an active sessionId.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', minLength: 1 },
          },
          required: ['sessionId'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.SALESFORCE_DISCONNECT,
        description: 'Disconnect an active Salesforce session by sessionId.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', minLength: 1 },
          },
          required: ['sessionId'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.CREATE_DEPLOYMENT_PACKAGE,
        description: 'Create a Salesforce deployment ZIP package from generatedData.',
        inputSchema: {
          type: 'object',
          properties: {
            generatedData: { type: 'object' },
            name: { type: 'string' },
          },
          required: ['generatedData'],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_NAMES.DEPLOY_TO_SALESFORCE,
        description: 'Deploy generatedData to Salesforce using an active sessionId.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', minLength: 1 },
            generatedData: { type: 'object' },
          },
          required: ['sessionId', 'generatedData'],
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const traceId = getTraceId(request);

    try {
      if (name === TOOL_NAMES.HEALTH_CHECK) {
        return okResult({
          traceId,
          status: 'ok',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        });
      }

      if (name === TOOL_NAMES.GENERATE_COMPONENT) {
        const prompt = toStringOrEmpty(args.prompt);
        const componentType = toStringOrEmpty(args.componentType) || 'apex-trigger';

        if (!prompt) {
          return errorResult('`prompt` is required', 'VALIDATION_ERROR');
        }
        if (!COMPONENT_TYPES.has(componentType)) {
          return errorResult('`componentType` is invalid', 'VALIDATION_ERROR');
        }

        const result = await generateSalesforceComponent(
          prompt,
          componentType,
          args.orgMetadata || null,
          args.refinement || null,
          Array.isArray(args.attachments) ? args.attachments : []
        );

        return okResult({ traceId, ...result });
      }

      if (name === TOOL_NAMES.SAVE_COMPONENT) {
        const db = getDB();

        const saveName = toStringOrEmpty(args.name);
        const prompt = toStringOrEmpty(args.prompt);
        const components = Array.isArray(args.components) ? args.components : null;

        if (!saveName || !prompt || !components) {
          return errorResult('`name`, `prompt`, and `components` are required', 'VALIDATION_ERROR');
        }

        const componentType = toStringOrEmpty(args.componentType) || 'apex-class';
        const item = {
          id: uuidv4(),
          name: saveName,
          prompt,
          componentType,
          components,
          summary: typeof args.summary === 'string' ? args.summary : '',
          governorLimitNotes: Array.isArray(args.governorLimitNotes) ? args.governorLimitNotes : [],
          deploymentSteps: Array.isArray(args.deploymentSteps) ? args.deploymentSteps : [],
          dependencies: Array.isArray(args.dependencies) ? args.dependencies : [],
          savedAt: new Date().toISOString(),
          version: 1,
        };

        db.data.components.push(item);
        await db.write();

        return okResult({ traceId, ...item });
      }

      if (name === TOOL_NAMES.LIST_COMPONENTS) {
        const db = getDB();
        const componentType = toStringOrEmpty(args.componentType);
        const search = toStringOrEmpty(args.search).toLowerCase();

        let items = [...db.data.components];

        if (componentType) {
          items = items.filter((component) => component.componentType === componentType);
        }

        if (search) {
          items = items.filter((component) =>
            component.name?.toLowerCase().includes(search) ||
            component.prompt?.toLowerCase().includes(search) ||
            component.summary?.toLowerCase().includes(search)
          );
        }

        items.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        return okResult({ traceId, items });
      }

      if (name === TOOL_NAMES.GET_COMPONENT) {
        const db = getDB();
        const id = toStringOrEmpty(args.id);

        if (!id) {
          return errorResult('`id` is required', 'VALIDATION_ERROR');
        }

        const component = db.data.components.find((item) => item.id === id);
        if (!component) {
          return errorResult('Component not found', 'NOT_FOUND');
        }

        return okResult({ traceId, ...component });
      }

      if (name === TOOL_NAMES.UPDATE_COMPONENT) {
        const db = getDB();
        const id = toStringOrEmpty(args.id);
        const patch = args.patch;

        if (!id || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
          return errorResult('`id` and object `patch` are required', 'VALIDATION_ERROR');
        }

        const index = db.data.components.findIndex((item) => item.id === id);
        if (index === -1) {
          return errorResult('Component not found', 'NOT_FOUND');
        }

        const updated = {
          ...db.data.components[index],
          ...patch,
          id,
          updatedAt: new Date().toISOString(),
          version: (db.data.components[index].version || 1) + 1,
        };

        db.data.components[index] = updated;
        await db.write();

        return okResult({ traceId, ...updated });
      }

      if (name === TOOL_NAMES.DELETE_COMPONENT) {
        const db = getDB();
        const id = toStringOrEmpty(args.id);

        if (!id) {
          return errorResult('`id` is required', 'VALIDATION_ERROR');
        }

        const index = db.data.components.findIndex((item) => item.id === id);
        if (index === -1) {
          return errorResult('Component not found', 'NOT_FOUND');
        }

        db.data.components.splice(index, 1);
        await db.write();
        return okResult({ traceId, success: true });
      }

      if (name === TOOL_NAMES.SALESFORCE_CONNECT) {
        const username = toStringOrEmpty(args.username);
        const password = toStringOrEmpty(args.password);
        const securityToken = typeof args.securityToken === 'string' ? args.securityToken : '';
        const loginUrl = toStringOrEmpty(args.loginUrl) || 'https://login.salesforce.com';

        if (!username || !password) {
          return errorResult('`username` and `password` are required', 'VALIDATION_ERROR');
        }

        const result = await connectWithCredentials(username, password, securityToken, loginUrl);
        return okResult({ traceId, ...result });
      }

      if (name === TOOL_NAMES.SALESFORCE_GET_METADATA) {
        const sessionId = toStringOrEmpty(args.sessionId);
        if (!sessionId) {
          return errorResult('`sessionId` is required', 'VALIDATION_ERROR');
        }

        const metadata = await getOrgMetadata(sessionId);
        return okResult({ traceId, ...metadata });
      }

      if (name === TOOL_NAMES.SALESFORCE_DISCONNECT) {
        const sessionId = toStringOrEmpty(args.sessionId);
        if (!sessionId) {
          return errorResult('`sessionId` is required', 'VALIDATION_ERROR');
        }

        disconnectSession(sessionId);
        return okResult({ traceId, success: true });
      }

      if (name === TOOL_NAMES.CREATE_DEPLOYMENT_PACKAGE) {
        const generatedData = args.generatedData;
        const requestedName = toStringOrEmpty(args.name) || 'salesforce-package';

        if (!generatedData || typeof generatedData !== 'object' || Array.isArray(generatedData)) {
          return errorResult('`generatedData` is required', 'VALIDATION_ERROR');
        }

        const zipBuffer = await createDeploymentPackage(generatedData);
        const safeName = requestedName.replace(/[^a-zA-Z0-9_-]/g, '_');

        return okResult({
          traceId,
          fileName: `${safeName}.zip`,
          contentType: 'application/zip',
          zipBase64: zipBuffer.toString('base64'),
        });
      }

      if (name === TOOL_NAMES.DEPLOY_TO_SALESFORCE) {
        const sessionId = toStringOrEmpty(args.sessionId);
        const generatedData = args.generatedData;

        if (!sessionId || !generatedData || typeof generatedData !== 'object' || Array.isArray(generatedData)) {
          return errorResult('`sessionId` and `generatedData` are required', 'VALIDATION_ERROR');
        }

        const conn = getConnection(sessionId);
        const result = await deployToSalesforce(conn, generatedData);

        return okResult({
          traceId,
          success: result.success,
          status: result.status,
          numberComponentsDeployed: result.numberComponentsDeployed,
          numberComponentErrors: result.numberComponentErrors,
          details: result.details || null,
        });
      }

      return errorResult(`Unknown tool: ${name}`, 'TOOL_NOT_FOUND');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected tool error';
      return errorResult(message, 'TOOL_EXECUTION_ERROR');
    }
  });
}

export async function startMcpServer() {
  await initDB();

  const server = createServer();
  registerHandlers(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('SCG-AI MCP server started on stdio');
  return server;
}

startMcpServer().catch((error) => {
  console.error('Failed to start SCG-AI MCP server:', error);
  process.exit(1);
});
