import { SQL } from "bun";

const PORT = Number(process.env.PORT ?? 8080);
const DB_HOST = process.env.DB_HOST ?? "localhost";
const DB_PORT = Number(process.env.DB_PORT ?? 5432);
const DB_NAME = process.env.DB_NAME ?? "appdb";
const DB_USER = process.env.DB_USER ?? "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";

const DB_CONNECTION_TIMEOUT_SECONDS = 3;
const MAX_WORK = 3_000_000;

const SQL_OPTIONS = {
  adapter: "postgres",
  hostname: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  max: 4,
  connectionTimeout: DB_CONNECTION_TIMEOUT_SECONDS,
} as const;

let sql = new SQL(SQL_OPTIONS);

let healthy = true;

process.on("SIGUSR1", () => {
  healthy = !healthy;
  console.log(`SIGUSR1 received; healthy=${healthy}`);
});

let schemaReady: Promise<void> | undefined;

function rebuildClient(): void {
  const old = sql;
  sql = new SQL(SQL_OPTIONS);
  schemaReady = undefined;
  old.close({ timeout: 0 }).catch(() => {});
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS visits (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
      .then(() => undefined)
      .catch((err) => {
        schemaReady = undefined;
        throw err;
      });
  }
  return schemaReady;
}

function clampWork(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_WORK);
}

function burn(iterations: number): void {
  let acc = 0n;
  for (let i = 0; i < iterations; i++) {
    acc = BigInt(Bun.hash(String(acc + BigInt(i)))) & 0xffffffffffffffffn;
  }
  if (acc === -1n) console.log("unreachable");
}

const jsonHeaders = { "Content-Type": "application/json" };
const noStoreJsonHeaders = {
  ...jsonHeaders,
  "Cache-Control": "no-store",
};

function handleHealthz(): Response {
  if (healthy) {
    return Response.json({ status: "ok" });
  }
  return Response.json({ status: "unhealthy" }, { status: 500 });
}

async function handleCounter(req: Request): Promise<Response> {
  const work = clampWork(new URL(req.url).searchParams.get("work"));
  if (work > 0) burn(work);

  try {
    await ensureSchema();
    await sql`INSERT INTO visits DEFAULT VALUES`;
    const rows = await sql`SELECT count(*)::int AS count FROM visits`;
    const count = rows[0].count;
    return Response.json({ count }, { headers: noStoreJsonHeaders });
  } catch {
    rebuildClient();
    return Response.json(
      { error: "database unavailable" },
      { status: 503, headers: noStoreJsonHeaders },
    );
  }
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    let res: Response;
    if (req.method === "GET" && url.pathname === "/healthz") {
      res = handleHealthz();
    } else if (req.method === "GET" && url.pathname === "/counter") {
      res = await handleCounter(req);
    } else {
      res = Response.json({ error: "not found" }, { status: 404 });
    }
    console.log(`${req.method} ${url.pathname} ${res.status}`);
    return res;
  },
});

console.log(`listening on :${PORT}`);
