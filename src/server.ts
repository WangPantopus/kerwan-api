import "dotenv/config";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/client.js";

async function main() {
  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutdown signal received");
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
