/** Entry point. */

import { env } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const app = await buildServer();
  // If BASE_URL wasn't provided, derive it from the listening address so debrid
  // resolve links work out of the box in local development.
  if (!env.baseUrl) {
    env.baseUrl = `http://localhost:${env.port}`;
  }
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`Addon listening on ${env.baseUrl} — configure at ${env.baseUrl}/configure`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
