# System Stats MCP Server

## Features

### System Monitoring Tools
- **Uptime** - Get system uptime in seconds and hours
- **CPU Usage** - Retrieve CPU information and load averages
- **RAM Usage** - Monitor total, free, and used system memory with percentage
- **Host Configuration** - Get OS platform, release, architecture, and hostname
- **Disk Usage** - List all mounted filesystems with usage information
- **Network Info** - Get network interface addresses (IPv4, IPv6, MAC)
- **Process List** - List all running processes with PID, user, CPU, and memory usage
- **Open Ports** - List all listening TCP/UDP ports and the processes using them

### Process Management
- **Kill Process** - Terminate a process by PID using SIGKILL
- **PM2 Integration** - Full PM2 process manager support:
  - List all PM2-managed processes
  - Start/stop PM2 processes
  - Restart PM2 processes
  - Delete PM2 processes

### Systemd Service Management
- **systemctl_list** - List systemd services, optionally filtered by state (`active`, `failed`, `inactive`)
- **systemctl_status** - Get the status of a specific systemd service
- **systemctl_action** - Start, stop, restart, enable, or disable a systemd service

### Log Viewing
- **get_logs** - Retrieve recent journal logs via `journalctl`, optionally filtered by service name and number of lines

## Installation

```bash
npm install
```

## Configuration

Configure the server using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port (SSE mode) |
| `BASE_PATH` | (empty) | URL path prefix for endpoints |
| `MCP_TOOL_TIMEOUT_MS` | 300000 | Tool execution timeout in milliseconds |
| `MCP_MAX_RESPONSE_BYTES` | 0 | Max response size (0 = unlimited) |
| `MCP_API_KEY` | (empty) | API key for authentication (optional) |
| `MODE` | sse | Startup mode: `sse` or `stdio` |

### Example `.env` file:
```
PORT=3001
BASE_PATH=/mcp
MCP_API_KEY=your-secret-key
MCP_TOOL_TIMEOUT_MS=300000
```

## Usage

### Start in SSE Mode (HTTP Server)
```bash
node index.js
# or with custom settings
node index.js --mode=sse
```

Server runs on `http://0.0.0.0:3001` (or custom PORT)

### Start in Stdio Mode
```bash
node index.js --mode=stdio
```

## API Authentication

If `MCP_API_KEY` is set, requests must include authentication via one of:
- Header: `X-API-Key: your-key`
- Header: `Authorization: Bearer your-key`
- Query parameter: `?key=your-key`

## Tool Response Format

All tools return JSON responses with error handling:

**Success Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{...tool result...}"
    }
  ]
}
```

**Error Response:**
```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

## Development

### Project Structure
- `index.js` - Entry point; initialises and starts the MCP server
- `src/server.js` - Server setup and MCP protocol wiring
- `src/tools.js` - Tool definitions and handler implementations
- `package.json` - Dependencies and scripts
- `.env` - Environment configuration (optional)

### Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `express` - HTTP server framework
- `dotenv` - Environment variable management

## Error Handling

The server includes built-in error handling for:
- Invalid tool inputs
- Tool execution timeouts
- PM2 not installed/available
- Shell command failures
- Response size limits
