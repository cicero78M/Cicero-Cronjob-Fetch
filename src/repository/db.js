import * as db from '../db/index.js';

export const query = db.query;
export const withTransaction =
  db.withTransaction ||
  (async (callback) => {
    return callback({ query: db.query, release: () => {} });
  });
