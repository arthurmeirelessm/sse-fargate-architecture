import "dotenv/config";
import path from "node:path";
import { createApp, defaultConfig } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const staticDir =
  defaultConfig.staticDir ?? path.resolve(process.cwd(), "public");

const app = createApp({ ...defaultConfig, staticDir });

app.listen(port, () => {
  console.log(`[app] escutando em http://0.0.0.0:${port}`);
  console.log(`[app] sidecar esperado em ${defaultConfig.sidecarUrl}`);
});
