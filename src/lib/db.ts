import { Pool, type PoolClient, type QueryResultRow, types } from "pg";

// Return DATE columns as plain 'YYYY-MM-DD' strings and NUMERIC as numbers.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => parseInt(v, 10));

const globalForPool = globalThis as unknown as { __prmPool?: Pool };

export const pool =
  globalForPool.__prmPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://prm:prm@localhost:5432/prm",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPool.__prmPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
