export const CDP_HOST = process.env.TV_CDP_HOST || process.env.CDP_HOST || '127.0.0.1';
const configuredPort = process.env.TV_CDP_PORT ?? process.env.CDP_PORT;
export const CDP_PORT = configuredPort === undefined ? 9222 : Number(configuredPort);
if (!Number.isInteger(CDP_PORT) || CDP_PORT < 1 || CDP_PORT > 65535) {
  throw new Error('TV_CDP_PORT/CDP_PORT must be an integer from 1 to 65535.');
}
