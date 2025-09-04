/** @type {import('next').NextConfig} */
const path = require('path')

// Override Next.js console logs in development to reduce API request noise
if (process.env.NODE_ENV === 'development') {
  const filter = (fn) => (...args) => {
    try {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      // Suppress noisy dev logs for API requests and build spam
      if (
        message.includes('GET /api') ||
        message.includes('POST /api') ||
        message.includes('DELETE /api') ||
        message.includes('PATCH /api') ||
        message.includes('PUT /api') ||
        /\b\d{3}\b in \d+ms/.test(message) || // e.g., "200 in 12ms"
        message.includes('✓ Compiled') ||
        message.includes('○ Compiling') ||
        message.includes('[WS(api)] Closed') ||
        message.includes('Warning:') && message.includes('defaultProps')
      ) {
        return
      }
    } catch {}
    fn(...args)
  }
  console.log = filter(console.log)
  console.info = filter(console.info)
  console.debug = filter(console.debug)
  // Also filter low-level writes that Next may emit directly
  const patchWrite = (stream) => {
    const orig = stream.write.bind(stream)
    stream.write = (chunk, encoding, cb) => {
      try {
        const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        if (
          /\b(GET|POST|DELETE|PATCH|PUT) \/api\//.test(s) ||
          /\b\d{3}\b in \d+ms\b/.test(s) ||
          s.includes('✓ Compiled') ||
          s.includes('○ Compiling') ||
          /Compiled in \d+ms/.test(s) ||
          s.includes('[WS(api)] Closed') ||
          (s.includes('Warning:') && s.includes('defaultProps'))
        ) {
          return true
        }
      } catch {}
      return orig(chunk, encoding, cb)
    }
  }
  try { patchWrite(process.stdout) } catch {}
  try { patchWrite(process.stderr) } catch {}
}

const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Disable critters optimizeCss to avoid missing module during build
  experimental: {
    optimizeCss: false,
    scrollRestoration: true,
    externalDir: true,
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    // Resolve monorepo packages via alias to source folders
    const r = (p) => path.resolve(__dirname, p)
    Object.assign(config.resolve.alias, {
      '@repo/config': r('../../packages/config/src'),
      '@repo/db': r('../../packages/db/src'),
      '@repo/ws': r('../../packages/ws/src'),
      '@repo/services-env': r('../../packages/services/env/src'),
      '@repo/services-assets': r('../../packages/services/assets/src'),
      '@repo/services-repo': r('../../packages/services/repo/src'),
      '@repo/services-git': r('../../packages/services/git/src'),
      '@repo/services-preview-runtime': r('../../packages/services/preview-runtime/src'),
      '@repo/services-projects': r('../../packages/services/projects/src'),
      '@repo/services-tokens': r('../../packages/services/tokens/src'),
      '@repo/services/cli': r('../../packages/services/cli/src'),
      // Keep generic repo aliasing; fine for '@repo/services/cli'
      '@repo/services-github': r('../../packages/services/github/src'),
      '@repo/services-vercel': r('../../packages/services/vercel/src'),
      '@repo/logging': r('../../packages/logging/src'),
    })

    // Ensure server runtime loads chunks from ./chunks
    // In some setups, Webpack's default chunkFilename may degrade to "[id].js",
    // causing the server runtime to require missing "./<id>.js" instead of "./chunks/<id>.js".
    // Force the expected chunk filenames for the Node server build.
    if (isServer) {
      config.output = {
        ...config.output,
        chunkFilename: 'chunks/[id].js',
        hotUpdateChunkFilename: 'chunks/[id].[fullhash].hot-update.js',
        hotUpdateMainFilename: 'chunks/[runtime].[fullhash].hot-update.json',
      }
    }
    return config
  },
};

module.exports = nextConfig;
