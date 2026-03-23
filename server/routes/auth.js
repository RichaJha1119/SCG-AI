import express from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDB } from '../services/dbService.js';

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function createSession(db, userId) {
  const token = `${randomUUID()}_${randomBytes(24).toString('hex')}`;
  db.data.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
  });
  return token;
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

router.post('/signup', async (req, res) => {
  try {
    const db = getDB();
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.data.users.find((user) => user.email === email);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const salt = randomBytes(16).toString('hex');
    const user = {
      id: randomUUID(),
      name,
      email,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(user);
    const token = createSession(db, user.id);
    await db.write();

    return res.status(201).json({ token, user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const db = getDB();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = db.data.users.find((item) => item.email === email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createSession(db, user.id);
    await db.write();

    return res.json({ token, user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/me', (req, res) => {
  try {
    const db = getDB();
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const session = db.data.sessions.find((item) => item.token === token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    const user = db.data.users.find((item) => item.id === session.userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const db = getDB();
    const token = getTokenFromRequest(req);
    if (!token) return res.json({ success: true });

    const index = db.data.sessions.findIndex((item) => item.token === token);
    if (index !== -1) {
      db.data.sessions.splice(index, 1);
      await db.write();
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
