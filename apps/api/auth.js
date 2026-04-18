const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getCollections } = require('./db');

const DEV_JWT_SECRET = 'dev-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEV_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error(
    '[auth] JWT_SECRET is unset or set to the dev default in production. ' +
      'Set JWT_SECRET to a long random string (>= 32 bytes of entropy) before boot.'
  );
  process.exit(1);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id.toString(), email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

const KEY_MARKER = 'ak_live_';
const PREFIX_LEN = 8;

async function authenticateApiKey(token) {
  // Prefix is the first PREFIX_LEN chars of the random portion, not the marker.
  const prefix = token.slice(KEY_MARKER.length, KEY_MARKER.length + PREFIX_LEN);
  const { api_keys, users } = await getCollections();

  const candidates = await api_keys.find({ prefix }).toArray();
  for (const candidate of candidates) {
    const match = await bcrypt.compare(token, candidate.keyHash);
    if (match) {
      const user = await users.findOne({ _id: candidate.userId });
      if (!user) return null;

      api_keys
        .updateOne(
          { _id: candidate._id },
          { $set: { lastUsedAt: new Date() } }
        )
        .catch(() => {});

      return { id: user._id, email: user.email, role: user.role || 'user' };
    }
  }
  return null;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'missing or invalid Authorization header' });
  }

  const token = parts[1];

  // API key path — keys start with "ak_live_"
  if (token.startsWith('ak_live_')) {
    try {
      const user = await authenticateApiKey(token);
      if (!user) {
        return res.status(401).json({ error: 'invalid API key' });
      }
      req.user = user;
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'API key authentication failed' });
    }
  }

  // JWT path
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: new ObjectId(decoded.sub), email: decoded.email, role: decoded.role || 'user' };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin access required' });
  }
  next();
}

module.exports = { signToken, requireAuth, requireAdmin, JWT_SECRET };
