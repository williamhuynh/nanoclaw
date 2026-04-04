/**
 * Tests for /api/todos route proxying in the credential proxy.
 *
 * The credential proxy forwards /api/todos/* requests to Mission Control
 * (localhost:3002) instead of the upstream Anthropic API.  These tests
 * verify:
 *   - Todo routes are intercepted and never reach the upstream mock.
 *   - Non-todo routes are forwarded to the upstream mock with API key
 *     injection.
 *
 * NOTE: Because the proxy hardcodes port 3002, the todo-route behaviour
 * depends on whether Mission Control is actually running on the host.
 * When MC is up the proxy returns its response; when it's down we get 502.
 * The tests accept either outcome for the todo routes while strictly
 * verifying that upstream isolation and credential injection are correct.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

const mockEnv: Record<string, string> = {};
vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({ ...mockEnv })),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { startCredentialProxy } from './credential-proxy.js';

function makeRequest(
  port: number,
  options: http.RequestOptions,
  body = '',
): Promise<{
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { ...options, hostname: '127.0.0.1', port },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Check whether Mission Control is reachable on port 3002. */
function mcAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 3002, path: '/api/todos', method: 'GET', timeout: 500 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

describe('credential-proxy todo routes', () => {
  let proxyServer: http.Server;
  let upstreamServer: http.Server;
  let proxyPort: number;
  let upstreamPort: number;
  let lastUpstreamHeaders: http.IncomingHttpHeaders;
  let lastUpstreamPath: string;
  let lastUpstreamMethod: string;
  let upstreamHitCount: number;
  let isMcUp: boolean;

  beforeEach(async () => {
    lastUpstreamHeaders = {};
    lastUpstreamPath = '';
    lastUpstreamMethod = '';
    upstreamHitCount = 0;

    isMcUp = await mcAvailable();

    upstreamServer = http.createServer((req, res) => {
      lastUpstreamHeaders = { ...req.headers };
      lastUpstreamPath = req.url || '';
      lastUpstreamMethod = req.method || '';
      upstreamHitCount++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      upstreamServer.listen(0, '127.0.0.1', resolve),
    );
    upstreamPort = (upstreamServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((r) => proxyServer?.close(() => r()));
    await new Promise<void>((r) => upstreamServer?.close(() => r()));
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  });

  async function startProxy(env: Record<string, string>): Promise<number> {
    Object.assign(mockEnv, env, {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    });
    proxyServer = await startCredentialProxy(0);
    return (proxyServer.address() as AddressInfo).port;
  }

  // --- Todo routes are intercepted and never reach upstream ---

  it('GET /api/todos is proxied to MC, not upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(proxyPort, {
      method: 'GET',
      path: '/api/todos',
      headers: { 'content-type': 'application/json' },
    });

    // Whether MC is running (200) or not (502), upstream must not be hit
    if (isMcUp) {
      expect(res.statusCode).toBe(200);
    } else {
      expect(res.statusCode).toBe(502);
      expect(res.body).toBe('Mission Control unavailable');
    }
    expect(upstreamHitCount).toBe(0);
  });

  it('POST /api/todos is proxied to MC, not upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(
      proxyPort,
      {
        method: 'POST',
        path: '/api/todos',
        headers: { 'content-type': 'application/json' },
      },
      JSON.stringify({ title: 'Test todo' }),
    );

    if (isMcUp) {
      expect([200, 201]).toContain(res.statusCode);
    } else {
      expect(res.statusCode).toBe(502);
      expect(res.body).toBe('Mission Control unavailable');
    }
    expect(upstreamHitCount).toBe(0);
  });

  it('GET /api/todos/search?q=test is proxied to MC, not upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(proxyPort, {
      method: 'GET',
      path: '/api/todos/search?q=test',
      headers: { 'content-type': 'application/json' },
    });

    if (isMcUp) {
      // MC may return 200 or 404 depending on whether the search endpoint exists
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      expect(res.statusCode).toBeLessThan(500);
    } else {
      expect(res.statusCode).toBe(502);
    }
    expect(upstreamHitCount).toBe(0);
  });

  it('PUT /api/todos/abc123 is proxied to MC, not upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(
      proxyPort,
      {
        method: 'PUT',
        path: '/api/todos/abc123',
        headers: { 'content-type': 'application/json' },
      },
      JSON.stringify({ status: 'done' }),
    );

    if (isMcUp) {
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      expect(res.statusCode).toBeLessThan(600);
    } else {
      expect(res.statusCode).toBe(502);
    }
    expect(upstreamHitCount).toBe(0);
  });

  // --- Non-todo routes go to upstream ---

  it('non-todo POST /v1/messages goes to upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(
      proxyPort,
      {
        method: 'POST',
        path: '/v1/messages',
        headers: { 'content-type': 'application/json' },
      },
      '{}',
    );

    expect(res.statusCode).toBe(200);
    expect(lastUpstreamPath).toBe('/v1/messages');
    expect(lastUpstreamMethod).toBe('POST');
    expect(upstreamHitCount).toBe(1);
  });

  it('non-todo GET /v1/models goes to upstream', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    const res = await makeRequest(proxyPort, {
      method: 'GET',
      path: '/v1/models',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    expect(lastUpstreamPath).toBe('/v1/models');
    expect(lastUpstreamMethod).toBe('GET');
    expect(upstreamHitCount).toBe(1);
  });

  // --- API key injection: non-todo routes get x-api-key, todo routes do not ---

  it('API key is injected on non-todo routes', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    await makeRequest(
      proxyPort,
      {
        method: 'POST',
        path: '/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'placeholder',
        },
      },
      '{}',
    );

    expect(lastUpstreamHeaders['x-api-key']).toBe('sk-ant-test-key');
  });

  it('todo routes do not send x-api-key to upstream (isolated from upstream)', async () => {
    proxyPort = await startProxy({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });

    // Send a todo request with an x-api-key header — it should go to MC,
    // not upstream, so the upstream mock should never see the request at all.
    await makeRequest(
      proxyPort,
      {
        method: 'GET',
        path: '/api/todos',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'should-not-reach-upstream',
        },
      },
    );

    // Upstream was never contacted — no API key injection occurred
    expect(upstreamHitCount).toBe(0);
    expect(lastUpstreamHeaders['x-api-key']).toBeUndefined();
  });
});
