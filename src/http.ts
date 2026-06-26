/** Shared HTTP client with sane timeouts, retries and a browser-like UA. */

import got, { type OptionsOfTextResponseBody } from 'got';
import { env } from './config/env.js';

export const httpClient = got.extend({
  timeout: { request: env.scrapeTimeoutMs },
  retry: { limit: 2, methods: ['GET'] },
  headers: {
    'user-agent': env.userAgent,
    accept: 'application/json, text/html, */*',
  },
  throwHttpErrors: true,
});

export async function getJson<T>(
  url: string,
  options?: OptionsOfTextResponseBody,
): Promise<T> {
  return httpClient.get(url, { ...options, responseType: 'json' }).json<T>();
}

export async function getText(
  url: string,
  options?: OptionsOfTextResponseBody,
): Promise<string> {
  const res = await httpClient.get(url, options);
  return res.body;
}
