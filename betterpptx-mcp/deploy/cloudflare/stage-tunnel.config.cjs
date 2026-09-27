// Supervise only the staged Cloudflare connector. The public hostname remains
// controlled by DNS delegation and BetterPPTX OAuth, not by starting this app.
const path = require('node:path');
const os = require('node:os');

const mcpRoot = path.resolve(__dirname, '../..');
module.exports = {
  apps: [{
    name: 'betterpptx-cloudflare-tunnel',
    script: path.join(mcpRoot, '.tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
    args: [
      'tunnel', '--config', path.join(__dirname, 'betterpptx-tunnel.yml'),
      '--no-autoupdate', 'run', '--credentials-file',
      path.join(os.homedir(), '.cloudflared', 'betterpptx-mcp.token.json'),
      '13dd6bd9-29ab-436f-9cab-4188bed1848b',
    ],
    cwd: mcpRoot,
    interpreter: 'none',
    exec_mode: 'fork',
    instances: 1,
    restart_delay: 3000,
    max_restarts: 50,
  }],
};
