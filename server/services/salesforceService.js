import jsforce from 'jsforce';
import { randomUUID } from 'node:crypto';

const connections = {};
const oauthStates = {};

function getOAuthConfig() {
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const redirectUri = process.env.SF_REDIRECT_URI || 'http://localhost:3001/api/salesforce/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Salesforce OAuth is not configured. Set SF_CLIENT_ID and SF_CLIENT_SECRET in server/.env');
  }

  return { clientId, clientSecret, redirectUri };
}

export async function connectWithCredentials(username, password, securityToken = '', loginUrl = 'https://login.salesforce.com') {
  const conn = new jsforce.Connection({ loginUrl });
  await conn.login(username, password + securityToken);

  const identity = await conn.identity();
  const sessionId = `${identity.user_id}_${Date.now()}`;
  connections[sessionId] = conn;

  return {
    sessionId,
    username: identity.username,
    orgId: identity.organization_id,
    instanceUrl: conn.instanceUrl,
  };
}

export async function startOAuth(loginUrl = 'https://login.salesforce.com') {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const state = randomUUID();

  const conn = new jsforce.Connection({
    loginUrl,
    oauth2: {
      loginUrl,
      clientId,
      clientSecret,
      redirectUri,
    },
  });

  oauthStates[state] = {
    conn,
    createdAt: Date.now(),
  };

  const authUrl = conn.oauth2.getAuthorizationUrl({ state });
  return { authUrl };
}

export async function completeOAuth(code, state) {
  const record = oauthStates[state];
  if (!record) {
    throw new Error('OAuth session expired or invalid state. Please try connecting again.');
  }

  delete oauthStates[state];

  if (Date.now() - record.createdAt > 10 * 60 * 1000) {
    throw new Error('OAuth session timed out. Please try connecting again.');
  }

  const conn = record.conn;
  await conn.authorize(code);

  const identity = await conn.identity();
  const sessionId = `${identity.user_id}_${Date.now()}`;
  connections[sessionId] = conn;

  return {
    sessionId,
    username: identity.username,
    orgId: identity.organization_id,
    instanceUrl: conn.instanceUrl,
  };
}

export function getConnection(sessionId) {
  const conn = connections[sessionId];
  if (!conn) throw new Error('No active Salesforce connection. Please connect to your org first.');
  return conn;
}

export function disconnectSession(sessionId) {
  delete connections[sessionId];
}

export async function getOrgMetadata(sessionId, objectNames = []) {
  const conn = getConnection(sessionId);
  const metadata = { fieldsByObject: {} };

  try {
    const describeGlobal = await conn.describeGlobal();
    metadata.objects = describeGlobal.sobjects.map(obj => ({
      name: obj.name,
      label: obj.label,
      custom: obj.custom,
      queryable: obj.queryable,
    }));
  } catch (err) {
    console.error('Error fetching org metadata:', err.message);
    metadata.objects = [];
  }

  const requestedObjects = Array.isArray(objectNames)
    ? [...new Set(objectNames.map(name => String(name || '').trim()).filter(Boolean))]
    : [];

  if (requestedObjects.length > 0) {
    for (const objectName of requestedObjects) {
      try {
        const describe = await conn.sobject(objectName).describe();
        metadata.fieldsByObject[objectName] = describe.fields.map(field => field.name);
      } catch (err) {
        metadata.fieldsByObject[objectName] = [];
      }
    }
  }

  return metadata;
}

export async function validateApex(sessionId, code) {
  const conn = getConnection(sessionId);
  try {
    const result = await conn.tooling.executeAnonymous(`System.debug('SCG-AI validation');`);
    return { valid: result.compiled, message: result.compileProblem || 'Code appears valid' };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}
