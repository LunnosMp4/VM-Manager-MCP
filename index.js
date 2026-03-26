require('dotenv').config({ quiet: true });
const { startSSE, startStdio } = require('./src/server.js');

function envInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port:           envInt(process.env.PORT, 3001),
  basePath:       process.env.BASE_PATH || '',
  toolTimeoutMs:  envInt(process.env.MCP_TOOL_TIMEOUT_MS, 300000),
  maxResponseBytes: envInt(process.env.MCP_MAX_RESPONSE_BYTES, 0),
  apiKey:         process.env.MCP_API_KEY || '',
};

const MODE = (process.argv.find((arg) => arg.startsWith('--mode=')) || '').split('=')[1] || 'sse';

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

if (MODE === 'stdio') {
  startStdio(config).catch((err) => {
    console.error('Failed to start stdio mode:', err);
    process.exit(1);
  });
} else {
  startSSE(config).catch((err) => {
    console.error('Failed to start SSE mode:', err);
    process.exit(1);
  });
}
