// Minimal preload to keep context isolated; extend as needed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('clovable', {
  env: process.env.NODE_ENV || (process.env.DEBUG ? 'development' : 'production')
});

