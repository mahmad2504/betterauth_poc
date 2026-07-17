import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3003);
const app = express();

app.use(express.static(here));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "SPA Application" });
});

app.listen(port, () => {
  console.log(`SPA Application: http://localhost:${port}`);
});
