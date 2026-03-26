const os = require('os');
const { exec } = require('child_process');

function execShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }));
      resolve(stdout.trim());
    });
  });
}

function isPm2Missing(err) {
  return err.code === 'ENOENT' || /not found|No such file/i.test(err.message + (err.stderr || ''));
}

function pm2ActionTool(name, description) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: 'pm2 app name or numeric id. No wildcards.' } },
      required: ['target']
    }
  };
}

function pm2ActionHandler(subcommand) {
  return async ({ target }) => {
    if (!target || typeof target !== 'string' || target.trim() === '')
      return { error: 'invalid_target', message: 'target must be a non-empty string.' };
    if (!/^[\w.\-]+$/.test(target))
      return { error: 'invalid_target', message: 'target contains invalid characters.' };
    try {
      const stdout = await execShell(`pm2 ${subcommand} ${target}`);
      return { success: true, subcommand, target, output: stdout };
    } catch (err) {
      if (isPm2Missing(err)) return { error: 'pm2_not_installed', message: 'pm2 is not installed or not in PATH.' };
      return { error: 'pm2_error', message: err.stderr || err.message };
    }
  };
}

const tools = [
  {
    name: 'get_uptime',
    description: 'Get the system uptime in seconds.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_cpu_usage',
    description: 'Get CPU information and load averages.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_ram_usage',
    description: 'Get total, free, and used system memory in bytes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_host_config',
    description: 'Get OS platform, release, architecture, and hostname.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_disk_usage',
    description: 'Get disk usage for all mounted filesystems (via df -h).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_network_info',
    description: 'Get network interface addresses (IPv4, IPv6, MAC) from the OS.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_process_list',
    description: 'List all running processes with PID, user, CPU%, memory%, and command (via ps aux).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kill_process',
    description: 'Kill a process by its PID using SIGKILL (kill -9). Use get_process_list to find the target PID first.',
    inputSchema: {
      type: 'object',
      properties: { pid: { type: 'number', description: 'The numeric PID of the process to kill.' } },
      required: ['pid']
    },
  },
  {
    name: 'pm2_list',
    description: 'List all pm2-managed processes with their status, PID, CPU, and memory.',
    inputSchema: { type: 'object', properties: {} },
  },
  pm2ActionTool('pm2_start',   'Start a stopped pm2 process by name or id.'),
  pm2ActionTool('pm2_stop',    'Stop a running pm2 process by name or id.'),
  pm2ActionTool('pm2_restart', 'Restart a pm2 process by name or id.'),
  pm2ActionTool('pm2_delete',  'Delete a pm2 process by name or id (removes it from pm2 list).'),
];

const toolHandlers = {
  get_uptime: async () => ({
    uptimeSeconds: os.uptime(),
    uptimeHours: (os.uptime() / 3600).toFixed(2)
  }),
  get_cpu_usage: async () => ({
    loadAvg: os.loadavg(),
    cpus: os.cpus().map(cpu => ({ model: cpu.model, speed: cpu.speed }))
  }),
  get_ram_usage: async () => {
    const total = os.totalmem();
    const free = os.freemem();
    return {
      totalBytes: total,
      freeBytes: free,
      usedBytes: total - free,
      usedPercentage: (((total - free) / total) * 100).toFixed(2) + '%'
    };
  },
  get_host_config: async () => ({
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname()
  }),
  get_disk_usage: async () => {
    const output = await execShell('df -h');
    const lines = output.split('\n').slice(1).filter(Boolean);
    return {
      filesystems: lines.map(line => {
        const [filesystem, size, used, available, usePercent, ...mountParts] = line.split(/\s+/);
        return { filesystem, size, used, available, usePercent, mountedOn: mountParts.join(' ') };
      })
    };
  },
  get_network_info: async () => {
    const interfaces = os.networkInterfaces();
    const result = {};
    for (const [name, addrs] of Object.entries(interfaces)) {
      result[name] = addrs.map(a => ({
        family: a.family,
        address: a.address,
        netmask: a.netmask,
        mac: a.mac,
        internal: a.internal
      }));
    }
    return { interfaces: result };
  },
  get_process_list: async () => {
    const output = await execShell('ps aux --no-headers');
    const processes = output.split('\n').filter(Boolean).map(line => {
      const [user, pid, cpu, mem, , , , , , , ...cmdParts] = line.split(/\s+/);
      return { pid: parseInt(pid, 10), user, cpu: parseFloat(cpu), mem: parseFloat(mem), command: cmdParts.join(' ') };
    });
    return { count: processes.length, processes };
  },
  kill_process: async ({ pid }) => {
    if (!Number.isInteger(pid) || pid <= 0)
      return { error: 'invalid_pid', message: 'pid must be a positive integer.' };
    await execShell(`kill -9 ${pid}`);
    return { success: true, killed: pid };
  },
  pm2_list: async () => {
    let raw;
    try {
      raw = await execShell('pm2 jlist');
    } catch (err) {
      if (isPm2Missing(err)) return { error: 'pm2_not_installed', message: 'pm2 is not installed or not in PATH.' };
      throw err;
    }
    const list = JSON.parse(raw);
    return {
      count: list.length,
      processes: list.map(p => ({
        id: p.pm_id,
        name: p.name,
        status: p.pm2_env?.status,
        pid: p.pid,
        cpu: p.monit?.cpu,
        memory: p.monit?.memory,
        uptimeMs: p.pm2_env?.pm_uptime
      }))
    };
  },
  pm2_start:   pm2ActionHandler('start'),
  pm2_stop:    pm2ActionHandler('stop'),
  pm2_restart: pm2ActionHandler('restart'),
  pm2_delete:  pm2ActionHandler('delete'),
};

module.exports = { tools, toolHandlers };
