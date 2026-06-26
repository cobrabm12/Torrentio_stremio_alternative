/** Fastify server wiring the Stremio addon routes + configure UI. */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { buildManifest } from './addon/manifest.js';
import { getStreams, parseStreamId, resolveStream } from './addon/streamHandler.js';
import { decodeConfig } from './config/userConfig.js';
import { listScrapers } from './scrapers/index.js';
import { DEBRID_PROVIDERS } from './debrid/index.js';
import { stats } from './store/db.js';
import type { StreamType } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isValidType(t: string): t is StreamType {
  return t === 'movie' || t === 'series';
}

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(cors, { origin: '*' });

  // Serve the configure UI assets from /public.
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/public/',
  });

  const manifestHandler = (_req: unknown, reply: { send: (b: unknown) => void }) => {
    reply.send(buildManifest());
  };

  // Manifest (with and without a config segment).
  app.get('/manifest.json', manifestHandler);
  app.get('/:config/manifest.json', (req, reply) => {
    const { config } = req.params as { config: string };
    reply.send(buildManifest(decodeConfig(config)));
  });

  // Expose provider/option metadata for the configure UI.
  app.get('/api/options', (_req, reply) => {
    reply.send({ providers: listScrapers(), debrid: DEBRID_PROVIDERS });
  });

  // Lightweight cache stats (how much the lazy DB has accumulated).
  app.get('/api/stats', (_req, reply) => reply.send(stats()));

  // Stream endpoint.
  app.get('/:config/stream/:type/:id', async (req, reply) => {
    const { config, type, id } = req.params as { config: string; type: string; id: string };
    if (!isValidType(type)) return reply.code(404).send({ streams: [] });
    const streamId = id.replace(/\.json$/, '');
    const userConfig = decodeConfig(config);
    const streams = await getStreams(type, streamId, userConfig);
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send({ streams });
  });

  // Debrid resolve endpoint: 302-redirect playback to a direct link.
  app.get(
    '/:config/resolve/:type/:imdbId/:infoHash/:season/:episode',
    async (req, reply) => {
      const { config, type, imdbId, infoHash, season, episode } = req.params as Record<
        string,
        string
      >;
      if (!isValidType(type)) return reply.code(404).send('bad type');
      const userConfig = decodeConfig(config);
      const idSuffix = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;
      const request = parseStreamId(type, idSuffix);
      if (!request) return reply.code(400).send('bad id');
      const url = await resolveStream(userConfig, request, infoHash);
      if (!url) return reply.code(404).send('could not resolve stream');
      return reply.redirect(url, 302);
    },
  );

  // Configure UI: serve the same page with or without an existing config.
  app.get('/', (_req, reply) => reply.redirect('/configure'));
  app.get('/configure', (_req, reply) => reply.sendFile('configure.html'));
  app.get('/:config/configure', (_req, reply) => reply.sendFile('configure.html'));

  return app;
}
