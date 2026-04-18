const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { signToken, requireAuth, JWT_SECRET } = require('../auth');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

router.post('/signup', async (req, res, next) => {
  try {
    const raw = (req.body && req.body.email) || '';
    const email = normalizeEmail(raw);
    const { password } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const { users } = await getCollections();
    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date();
    const result = await users.insertOne({
      email,
      password: hash,
      role: 'user',
      plan: 'free',
      jobCountMonthly: 0,
      lastResetAt: new Date(),
      emailVerified: false,
      createdAt,
    });

    res.status(201).json({
      user: {
        id: result.insertedId.toString(),
        email,
        emailVerified: false,
        createdAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const raw = (req.body && req.body.email) || '';
    const email = normalizeEmail(raw);
    const { password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { users } = await getCollections();
    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role || 'user' });
    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role || 'user',
        emailVerified: !!user.emailVerified,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Email verification — NO outbound email is sent. AsyncOps has no SMTP
// dependency. The verification link is printed to server stdout; operators
// running the hosted instance must deliver it manually until SMTP is funded.
// See docs/deployment.md.
const VERIFY_TOKEN_TTL = '1d';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

router.post('/request-verify', requireAuth, async (req, res, next) => {
  try {
    const { users } = await getCollections();
    const user = await users.findOne({ _id: req.user.id });
    if (!user) return res.status(401).json({ error: 'user not found' });

    if (user.emailVerified) {
      return res.json({ ok: true, alreadyVerified: true });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), purpose: 'email-verify', email: user.email },
      JWT_SECRET,
      { expiresIn: VERIFY_TOKEN_TTL }
    );
    const verifyUrl = `${DASHBOARD_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
    // eslint-disable-next-line no-console
    console.log(
      `[auth] email verification link for ${user.email}: ${verifyUrl} ` +
        '(AsyncOps does not send email — deliver this manually.)'
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'invalid or expired token' });
    }
    if (decoded.purpose !== 'email-verify' || !decoded.sub) {
      return res.status(400).json({ error: 'invalid token' });
    }

    let oid;
    try {
      oid = new ObjectId(decoded.sub);
    } catch {
      return res.status(400).json({ error: 'invalid token subject' });
    }

    const { users } = await getCollections();
    const result = await users.updateOne(
      { _id: oid },
      { $set: { emailVerified: true } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
