import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../services/dbService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { componentType, search } = req.query;
    let items = db.data.components.filter((component) => component.userId === req.authUserId);

    if (componentType) {
      items = items.filter(c => c.componentType === componentType);
    }
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.prompt?.toLowerCase().includes(s) ||
        c.summary?.toLowerCase().includes(s)
      );
    }

    res.json(items.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDB();
    const component = db.data.components.find(
      (c) => c.id === req.params.id && c.userId === req.authUserId
    );
    if (!component) return res.status(404).json({ error: 'Component not found' });
    res.json(component);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDB();
    const { name, prompt, componentType, components, summary, governorLimitNotes, deploymentSteps, dependencies } = req.body;

    if (!name || !prompt || !components) {
      return res.status(400).json({ error: 'name, prompt, and components are required' });
    }

    const item = {
      id: uuidv4(),
      userId: req.authUserId,
      name,
      prompt,
      componentType: componentType || 'apex-class',
      components,
      summary,
      governorLimitNotes: governorLimitNotes || [],
      deploymentSteps: deploymentSteps || [],
      dependencies: dependencies || [],
      savedAt: new Date().toISOString(),
      version: 1,
    };

    db.data.components.push(item);
    await db.write();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDB();
    const idx = db.data.components.findIndex(
      (c) => c.id === req.params.id && c.userId === req.authUserId
    );
    if (idx === -1) return res.status(404).json({ error: 'Component not found' });

    const updated = {
      ...db.data.components[idx],
      ...req.body,
      id: req.params.id,
      userId: db.data.components[idx].userId,
      updatedAt: new Date().toISOString(),
      version: (db.data.components[idx].version || 1) + 1,
    };

    db.data.components[idx] = updated;
    await db.write();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    const idx = db.data.components.findIndex(
      (c) => c.id === req.params.id && c.userId === req.authUserId
    );
    if (idx === -1) return res.status(404).json({ error: 'Component not found' });

    db.data.components.splice(idx, 1);
    await db.write();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
