import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { auth } from "./auth.js";
import { presignedUploadUrl } from "./r2.js";

const app = new Hono();

app.use("/api/*", cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"], credentials: true }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/health", (c) => c.json({ ok: true, service: "naija-ledger", time: new Date().toISOString() }));

app.get("/api/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null }, 401);
  return c.json({ user: { id: session.user.id, email: session.user.email, name: session.user.name } });
});

// Authenticated: mint a presigned R2 PUT URL for a receipt upload.
// Body: { "expenseId": "...", "mime": "image/jpeg" }
app.post("/api/r2/upload-url", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const { expenseId, mime } = await c.req.json().catch(() => ({}));
  if (!expenseId || typeof mime !== "string" || !mime.startsWith("image/")) {
    return c.json({ error: "expenseId and image mime required" }, 400);
  }
  try {
    const key = `receipts/${session.user.id}/${expenseId}/${Date.now()}`;
    const url = await presignedUploadUrl(key, mime);
    return c.json({ key, url });
  } catch (e) {
    return c.json({ error: String((e as Error).message || e) }, 501);
  }
});

// Serve the static SPA (project root) when running locally.
app.use("/*", serveStatic({ root: "../" }));

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port });
console.log(`Naija Ledger server on http://localhost:${port}`);
