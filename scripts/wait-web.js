#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const waitOn = require('wait-on');

// Load root .env created by setup-env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const webPort = process.env.WEB_PORT || 3000;
const apiPort = process.env.API_PORT || 8080;

async function main() {
  const resources = [
    `http://localhost:${webPort}`,
    `http://localhost:${apiPort}/health`
  ];

  try {
    await waitOn({
      resources,
      timeout: 120000,
      interval: 250,
      strictSSL: false,
      validateStatus: function (status) {
        // Consider any 2xx/3xx as ready
        return status >= 200 && status < 400;
      }
    });
    process.exit(0);
  } catch (err) {
    console.error('\nTimed out waiting for dev servers:');
    console.error('  - Web:', resources[0]);
    console.error('  - API:', resources[1]);
    process.exit(1);
  }
}

main();

