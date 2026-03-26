const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const { tools, toolHandlers } = require('./tools.js');

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

function maybeTrimPayload(payload, maxBytes) {
  if (!maxBytes || maxBytes <= 0) return payload;

  const raw = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(raw, 'utf8');

  if (byteLength <= maxBytes) return payload;

  const truncatedText = raw.slice(0, Math.max(0, maxBytes - 3)) + '...';
  return {
    truncated: true,
    message: 'Response exceeded MCP_MAX_RESPONSE_BYTES and was truncated.',
    maxResponseBytes: maxBytes,
    originalBytes: byteLength,
    preview: truncatedText,
  };
}

function toToolResponse(payload, maxBytes) {
  return { content: [{ type: 'text', text: JSON.stringify(maybeTrimPayload(payload, maxBytes)) }] };
}

function getApiKeyFromRequest(req) {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const bearer = auth.match(/^Bearer\s+(.+)$/i);
    if (bearer && bearer[1]) return bearer[1].trim();
  }

  if (typeof req.query.key === 'string' && req.query.key.trim()) return req.query.key.trim();
  return '';
}

function createRequireApiKey(apiKey) {
  return function requireApiKey(req, res, next) {
    if (!apiKey) return next();
    const provided = getApiKeyFromRequest(req);
    if (provided === apiKey) return next();
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid MCP API key.' });
  };
}

function createServer(config) {
  const { toolTimeoutMs, maxResponseBytes } = config;

  const srv = new Server(
    { name: 'system-stats', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const handler = toolHandlers[toolName];
    if (!handler) throw new Error(`Tool not found: ${toolName}`);

    const args = request.params.arguments || {};
    const result = await withTimeout(handler(args), toolTimeoutMs, `Tool ${toolName}`);
    return toToolResponse(result, maxResponseBytes);
  });

  return srv;
}

async function startSSE(config) {
  const { port, basePath, apiKey } = config;
  const app = express();
  const sessions = new Map();
  const requireApiKey = createRequireApiKey(apiKey);

  app.get(`${basePath}/sse`, requireApiKey, async (req, res) => {
    const serverInstance = createServer(config);
    const transport = new SSEServerTransport(`${basePath}/messages`, res);
    await serverInstance.connect(transport);
    const sessionId = transport.sessionId;

    if (sessionId) {
      sessions.set(sessionId, transport);
      req.on('close', () => sessions.delete(sessionId));
    }
  });

  app.post(`${basePath}/messages`, requireApiKey, express.json(), async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sessions.get(sessionId);
    if (!transport) return res.status(404).send('Session not found');
    await transport.handlePostMessage(req, res, req.body);
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`System Stats MCP Server running on http://0.0.0.0:${port}${basePath}`);
    console.log(`MCP endpoint: http://0.0.0.0:${port}${basePath}/sse`);
    if (apiKey) console.log('MCP API key auth enabled.');
  });
}

async function startStdio(config) {
  const srv = createServer(config);
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  console.error('System Stats MCP Server running in stdio mode (MCP).');
}

module.exports = { startSSE, startStdio };
