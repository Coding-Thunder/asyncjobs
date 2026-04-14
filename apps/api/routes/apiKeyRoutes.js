const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.use(requireAuth);

const KEY_MARKER = 'ak_live_';
const RAW_BYTES = 32;
// Length of the random portion we use as a DB-searchable prefix.
const PREFIX_LEN = 8;

function generateRawKey() {
  return KEY_MARKER + crypto.randomBytes(RAW_BYTES).toString('base64url');
}

function extractPrefix(rawKey) {
  return rawKey.slice(KEY_MARKER.length, KEY_MARKER.length + PREFIX_LEN);
}

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    const rawKey = generateRawKey();
    const prefix = extractPrefix(rawKey);
    const keyHash = await bcrypt.hash(rawKey, 10);
    const now = new Date();

    const { api_keys } = await getCollections();

    const doc = {
      userId: req.user.id,
      name: name.trim(),
      keyHash,
      prefix,
      createdAt: now,
      lastUsedAt: null,
    };

    const result = await api_keys.insertOne(doc);

    res.status(201).json({
      id: result.insertedId.toString(),
      name: doc.name,
      key: rawKey,
      prefix,
      createdAt: now,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { api_keys } = await getCollections();
    const docs = await api_keys
      .find({ userId: req.user.id })
      .project({ keyHash: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      keys: docs.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        prefix: d.prefix,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { api_keys } = await getCollections();

    let oid;
    try {
      oid = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'invalid key id' });
    }

    const result = await api_keys.deleteOne({ _id: oid, userId: req.user.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.extractPrefix = extractPrefix;
router.KEY_MARKER = KEY_MARKER;
router.PREFIX_LEN = PREFIX_LEN;

module.exports = router;
