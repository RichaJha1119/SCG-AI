import express from 'express';
import { generateSalesforceComponent } from '../services/aiService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { prompt, componentType, refinement, orgMetadata, attachments, architecturePreference, strictImageMatch } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await generateSalesforceComponent(
      prompt.trim(),
      componentType || 'apex-trigger',
      orgMetadata || null,
      refinement || null,
      attachments || [],
      architecturePreference || 'auto',
      strictImageMatch !== false
    );

    res.json(result);
  } catch (error) {
    console.error('Generation error:', error.message);
    res.status(500).json({ error: error.message || 'Generation failed. Please try again.' });
  }
});

export default router;
