import { Hono } from "hono";

export function healthRoutes() {
  const app = new Hono();
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}
