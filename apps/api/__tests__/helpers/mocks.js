const { ObjectId } = require('mongodb');

// ---- In-memory collection mock ----
function createMockCollection(initialDocs = []) {
  let docs = initialDocs.map((d) => ({ ...d }));

  return {
    _docs: () => docs,
    findOne: jest.fn(async (filter) => {
      return docs.find((d) => {
        for (const [k, v] of Object.entries(filter)) {
          if (v instanceof ObjectId) {
            if (!d[k] || d[k].toString() !== v.toString()) return false;
          } else if (typeof v === 'object' && v !== null) {
            continue; // skip complex queries ($gte etc.)
          } else if (d[k] !== v) {
            return false;
          }
        }
        return true;
      }) || null;
    }),
    find: jest.fn(() => {
      let result = [...docs];
      const chain = {
        project: jest.fn(() => chain),
        sort: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        toArray: jest.fn(async () => result),
      };
      return chain;
    }),
    insertOne: jest.fn(async (doc) => {
      const _id = doc._id || new ObjectId();
      const newDoc = { _id, ...doc };
      docs.push(newDoc);
      return { insertedId: _id };
    }),
    updateOne: jest.fn(async (filter, update) => {
      const idx = docs.findIndex((d) => {
        for (const [k, v] of Object.entries(filter)) {
          if (v instanceof ObjectId) {
            if (!d[k] || d[k].toString() !== v.toString()) return false;
          } else if (d[k] !== v) {
            return false;
          }
        }
        return true;
      });
      if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) Object.assign(docs[idx], update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          docs[idx][k] = (docs[idx][k] || 0) + v;
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    deleteOne: jest.fn(async (filter) => {
      const idx = docs.findIndex((d) => {
        for (const [k, v] of Object.entries(filter)) {
          if (v instanceof ObjectId) {
            if (!d[k] || d[k].toString() !== v.toString()) return false;
          } else if (d[k] !== v) {
            return false;
          }
        }
        return true;
      });
      if (idx === -1) return { deletedCount: 0 };
      docs.splice(idx, 1);
      return { deletedCount: 1 };
    }),
    createIndex: jest.fn(async () => 'ok'),
  };
}

// ---- Setup mock collections and wire them into db module ----
function setupMockDb(collections = {}) {
  const cols = {
    users: collections.users || createMockCollection(),
    jobs: collections.jobs || createMockCollection(),
    api_keys: collections.api_keys || createMockCollection(),
  };

  jest.doMock('../../db', () => ({
    connect: jest.fn(async () => {}),
    getCollections: jest.fn(async () => cols),
  }));

  // The queue module creates a BullMQ connection on require — stub it out so
  // tests never touch Redis.
  jest.doMock('../../queue', () => ({
    enqueueJob: jest.fn(async () => {}),
    signalComplete: jest.fn(() => false),
    signalFail: jest.fn(() => false),
    startProxyWorker: jest.fn(() => {}),
    closeQueue: jest.fn(async () => {}),
  }));

  return cols;
}

// ---- Mock events (in-memory pub/sub) ----
function setupMockEvents() {
  const mock = {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    publishEvent: jest.fn(),
  };
  jest.doMock('../../events', () => mock);
  return mock;
}

module.exports = {
  createMockCollection,
  setupMockDb,
  setupMockEvents,
};
