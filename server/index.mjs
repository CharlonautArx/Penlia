import { handle } from './api.mjs';

export async function handler(event) {
  const input = Buffer.isBuffer(event) || typeof event === 'string' ? JSON.parse(event.toString()) : event;
  return handle(input);
}
