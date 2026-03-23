import express from 'express';
import {
  connectWithCredentials,
  getOrgMetadata,
  disconnectSession,
  startOAuth,
  completeOAuth,
} from '../services/salesforceService.js';

const router = express.Router();

router.post('/connect', async (req, res) => {
  try {
    const { username, password, securityToken, loginUrl } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await connectWithCredentials(
      username,
      password,
      securityToken || '',
      loginUrl || 'https://login.salesforce.com'
    );

    res.json(result);
  } catch (error) {
    console.error('Salesforce connect error:', error.message);
    res.status(401).json({ error: `Connection failed: ${error.message}` });
  }
});

router.post('/oauth/init', async (req, res) => {
  try {
    const { loginUrl } = req.body || {};
    const result = await startOAuth(loginUrl || 'https://login.salesforce.com');
    res.json(result);
  } catch (error) {
    console.error('Salesforce OAuth init error:', error.message);
    res.status(400).json({ error: `OAuth init failed: ${error.message}` });
  }
});

router.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('<html><body><h3>Missing OAuth callback parameters.</h3></body></html>');
  }

  try {
    const connection = await completeOAuth(String(code), String(state));
    const payload = JSON.stringify({ ok: true, connection });

    return res.send(`<!doctype html>
<html>
  <body>
    <script>
      (function () {
        var payload = ${payload};
        if (window.opener) {
          window.opener.postMessage({ type: 'scg-salesforce-oauth', payload: payload }, '*');
        }
        window.close();
      })();
    </script>
    <p>Authentication complete. You can close this window.</p>
  </body>
</html>`);
  } catch (error) {
    const payload = JSON.stringify({ ok: false, error: `Connection failed: ${error.message}` });
    return res.status(401).send(`<!doctype html>
<html>
  <body>
    <script>
      (function () {
        var payload = ${payload};
        if (window.opener) {
          window.opener.postMessage({ type: 'scg-salesforce-oauth', payload: payload }, '*');
        }
      })();
    </script>
    <h3>${error.message}</h3>
    <p>You can close this window and try again.</p>
  </body>
</html>`);
  }
});

router.get('/metadata', async (req, res) => {
  try {
    const { sessionId, objectNames } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const parsedObjectNames = String(objectNames || '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);

    const metadata = await getOrgMetadata(String(sessionId), parsedObjectNames);
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) disconnectSession(sessionId);
  res.json({ success: true });
});

export default router;
