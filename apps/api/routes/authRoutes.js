const express = require('express');
const bcrypt = require('bcryptjs');
const { getCollections } = require('../db');
const { signToken } = require('../auth');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
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
      createdAt,
    });

    res.status(201).json({ user: { id: result.insertedId.toString(), email, createdAt } });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
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
      user: { id: user._id.toString(), email: user.email, role: user.role || 'user' },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
