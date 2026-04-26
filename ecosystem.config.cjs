module.exports = {
  apps: [
    {
      name: 'vigilancia',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      kill_timeout: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },

    // Cloudflare Tunnel — descomentá después de correr scripts/setup-tunnel.sh
    {
      name: 'tunnel',
      script: 'cloudflared',
      args: 'tunnel run vigilancia',
      autorestart: true,
      watch: false,
    },
  ],
};
