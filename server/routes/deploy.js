import express from 'express';
import { createDeploymentPackage, deployToSalesforce } from '../services/deployService.js';
import { getConnection } from '../services/salesforceService.js';

const router = express.Router();

router.post('/package', async (req, res) => {
  try {
    const { generatedData, name } = req.body;
    if (!generatedData) return res.status(400).json({ error: 'generatedData is required' });

    const zipBuffer = await createDeploymentPackage(generatedData);
    const safeName = (name || 'salesforce-package').replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/salesforce', async (req, res) => {
  try {
    const { sessionId, generatedData } = req.body;
    if (!sessionId || !generatedData) {
      return res.status(400).json({ error: 'sessionId and generatedData are required' });
    }

    const conn = getConnection(sessionId);
    const result = await deployToSalesforce(conn, generatedData);

    res.json({
      success: result.success,
      status: result.status,
      numberComponentsDeployed: result.numberComponentsDeployed,
      numberComponentErrors: result.numberComponentErrors,
      details: result.details || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
