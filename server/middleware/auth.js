import { getDB } from '../services/dbService.js';

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

export function requireAuth(req, res, next) {
  try {
    const db = getDB();
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = db.data.sessions.find((item) => item.token === token);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = db.data.users.find((item) => item.id === session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.authUserId = user.id;
    req.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
