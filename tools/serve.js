#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development of the
 * djban.github.io site.
 *
 * - Serves the repo root over HTTP on PORT (default 3000).
 * - Handles the GitHub Pages apex-host quirk: the site is served at the
 *   domain root, so "/" -> index.html and "../x" from a root-level page
 *   resolves to "/x" (harmless no-op at the apex — there IS no level
 *   above root, exactly as on the live Pages host).
 * - Serves correct content types for the file types used by the site.
 * - Prefix option:  `npm run serve -- --prefix /djban.github.io` serves
 *   under a subpath to simulate project-page hosting if you ever deploy
 *   to a subfolder; path rewriting then handles "../" correctly.
 *
 * Node built-ins only — no dependencies. Run with:
 *   npm run serve   (port 3000)
 *   npm run serve -- --port 8080
 *   npm run serve -- --prefix /djban.github.io
 */

'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function parseArgs(argv) {
  const opts = { port: 3000, prefix: '' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[i + 1])
    if (argv[i] === '--prefix' && argv[i + 1]) opts.prefix = argv[i + 1]
  }
  return opts
}

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!Number.isInteger(opts.port) || opts.port < 0) {
    console.error('Invalid --port value.')
    process.exit(1)
  }

  const server = http.createServer((req, res) => {
    let urlPath
    try {
      urlPath = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      )
    } catch {
      res.writeHead(400).end('Bad request')
      return
    }
    if (req.url === '/' || urlPath === '/') urlPath = '/index.html'

    // Strip the simulation prefix if requested.
    let simPrefix = opts.prefix.replace(/\/+$/, '')
    let local = urlPath
    if (simPrefix && urlPath.startsWith(simPrefix + '/')) {
      local = urlPath.slice(simPrefix.length)
    }

    // Resolve against repo root; reject path traversal out of the root.
    const abs = path.join(ROOT, local.replace(/^\/+/, ''))
    if (!abs.startsWith(ROOT)) {
      res.writeHead(404).end('Not found')
      return
    }

    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const index = path.join(abs, 'index.html')
      if (fs.existsSync(index)) return serveFile(res, index)
      res.writeHead(403).end('Directory listing not enabled')
      return
    }

    serveFile(res, abs)
  })

  function serveFile(res, file) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return
    }
    const headers = { 'Content-Type': contentType(file) }
    const stat = fs.statSync(file)
    const readStream = fs.createReadStream(file)
    readStream.on('open', () => {
      res.writeHead(200, headers)
      readStream.pipe(res)
    })
    readStream.on('error', (err) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(`Server error: ${err.message}`)
    })
  }

  const displayPrefix = opts.prefix || '(apex root)'
  server.listen(opts.port, () => {
    console.log(`✓ Serving ${ROOT}`)
    console.log(
      `  → http://localhost:${opts.port}${opts.prefix}  (${displayPrefix})`,
    )
    console.log('  Press Ctrl+C to stop.')
  })
}

main()
