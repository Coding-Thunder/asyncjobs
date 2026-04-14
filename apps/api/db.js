const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'asyncops';

let clientPromise;

function connect() {
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().then(async (c) => {
      const db = c.db(dbName);
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('jobs').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('jobs').createIndex({ userId: 1, status: 1, type: 1, createdAt: 1 });
      await db
        .collection('jobs')
        .createIndex(
          { userId: 1, idempotencyKey: 1 },
          { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
        );
      await db.collection('api_keys').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('api_keys').createIndex({ prefix: 1 });
      console.log(`[db] connected to ${dbName}`);
      return c;
    });
  }
  return clientPromise;
}

async function getCollections() {
  const client = await connect();
  const db = client.db(dbName);
  return {
    users: db.collection('users'),
    jobs: db.collection('jobs'),
    api_keys: db.collection('api_keys'),
  };
}

module.exports = { connect, getCollections };
