module.exports = {
  apps: [
    {
      name: 'push-blaster',
      script: 'npm',
      args: 'run dev:push-only',
      cwd: __dirname,
      watch: false,
      autorestart: false,
      env: {
        FORCE_COLOR: '1',
      }
    },
    {
      name: 'push-cadence-service',
      script: 'npm',
      args: 'run dev',
      cwd: '../push-cadence-service',
      watch: false,
      autorestart: false,
      env: {
        FORCE_COLOR: '1',
      }
    },
  ],
};