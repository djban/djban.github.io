#!/usr/bin/env node

/**
 * Build / validation script for the djban.github.io static site.
 *
 * Validates local href/src/poster/data/srcset references in:
 *
 *   1. Root static HTML files
 *   2. The built fencing Vite application
 *
 * The fencing application is deployed at:
 *
 *   /fencing/
 *
 * Therefore:
 *
 *   /fencing/assets/foo.js
 *
 * maps to:
 *
 *   fencing/dist/assets/foo.js
 *
 * Zero runtime dependencies — Node built-ins only.
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const URL_ATTRS = new Set([
  'href',
  'src',
  'poster',
  'data',
  'srcset',
])

function isExternal(ref) {
  return /^(\(?https?:\/\/|mailto:|tel:|ftp:\/\/|data:|blob:|#|\/\/)/.test(
    ref,
  )
}

function srcsetCandidates(value) {
  return value
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean)
}

/**
 * Walk HTML files while skipping generated/build directories.
 *
 * fencing/dist is handled separately because it has a different
 * deployment root.
 */
function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'fencing'
    ) {
      continue
    }

    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walkHtmlFiles(full, files)
    } else if (entry.name.endsWith('.html')) {
      files.push(full)
    }
  }

  return files
}


/**
 * Resolve a local URL reference.
 *
 * siteRoot:
 *   The filesystem directory corresponding to the web root.
 *
 * deploymentPrefix:
 *   URL prefix used when deploying a sub-application.
 *
 * Example:
 *
 *   deploymentPrefix = "/fencing/"
 *   ref = "/fencing/assets/app.js"
 *
 * resolves to:
 *
 *   fencing/dist/assets/app.js
 */
function resolveLocal(
  htmlFile,
  ref,
  siteRoot,
  deploymentPrefix = '/',
) {
  const queryIdx = ref.indexOf('?')
  const hashIdx = ref.indexOf('#')

  let clean = ref

  if (queryIdx >= 0) {
    clean = clean.slice(0, queryIdx)
  }

  if (hashIdx >= 0) {
    clean = clean.slice(0, hashIdx)
  }

  if (!clean) {
    return null
  }

  // Root-absolute URL.
  if (clean.startsWith('/')) {
    let urlPath = clean

    // Remove the application's deployment prefix.
    if (
      deploymentPrefix !== '/' &&
      urlPath.startsWith(deploymentPrefix)
    ) {
      urlPath = urlPath.slice(
        deploymentPrefix.length,
      )
    }

    // Remove leading slash before joining with filesystem root.
    urlPath = urlPath.replace(/^\/+/, '')

    return path.join(
      siteRoot,
      ...urlPath.split('/'),
    )
  }

  // Relative URL.
  const pageDir = path.dirname(htmlFile)

  return path.resolve(
    pageDir,
    clean,
  )
}

function validateHtmlFile(
  htmlFile,
  siteRoot,
  deploymentPrefix,
  errors,
) {
  const rel = path.relative(
    ROOT,
    htmlFile,
  )

  const content = fs.readFileSync(
    htmlFile,
    'utf8',
  )

  // Ignore commented-out references.
  const active = content.replace(
    /<!--[\s\S]*?-->/g,
    '',
  )

  const tagRe =
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g

  let tagMatch

  while (
    (tagMatch = tagRe.exec(active)) !== null
  ) {
    const attrs = tagMatch[2]

    const attrRe = new RegExp(
      `\\b(${[
        ...URL_ATTRS,
      ].join(
        '|',
      )})\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
      'g',
    )

    let attrMatch

    while (
      (attrMatch = attrRe.exec(attrs)) !== null
    ) {
      const raw =
        attrMatch[3] ??
        attrMatch[4] ??
        attrMatch[5]

      if (raw == null) {
        continue
      }

      const attrName = attrMatch[1]

      const refs =
        attrName === 'srcset'
          ? srcsetCandidates(raw)
          : [raw]

      for (const ref of refs) {
        if (
          !ref ||
          isExternal(ref)
        ) {
          continue
        }

        const resolved =
          resolveLocal(
            htmlFile,
            ref,
            siteRoot,
            deploymentPrefix,
          )

        if (
          resolved &&
          !fs.existsSync(resolved)
        ) {
          errors.push(
            `${rel}: broken ${attrName}="${ref}" -> ${path.relative(
              ROOT,
              resolved,
            )}`,
          )
        }
      }
    }
  }
}

function main() {
  const errors = []

  /*
   * ------------------------------------------------------------
   * Main static website
   * ------------------------------------------------------------
   */

  const rootHtmlFiles =
    walkHtmlFiles(ROOT)

  for (const htmlFile of rootHtmlFiles) {
    validateHtmlFile(
      htmlFile,
      ROOT,
      '/',
      errors,
    )
  }

  /*
   * ------------------------------------------------------------
   * Fencing Vite application
   * ------------------------------------------------------------
   */

  const fencingDist =
    path.join(
      ROOT,
      'fencing',
      'dist',
    )

  const fencingIndex =
    path.join(
      fencingDist,
      'index.html',
    )

  if (!fs.existsSync(fencingIndex)) {
    errors.push(
      'fencing/dist/index.html: missing — run the fencing Vite build first',
    )
  } else {
    validateHtmlFile(
      fencingIndex,
      fencingDist,
      '/fencing/',
      errors,
    )
  }

  /*
   * ------------------------------------------------------------
   * Result
   * ------------------------------------------------------------
   */

  if (errors.length) {
    console.error(
      `✖ Build validation failed — ${errors.length} broken local reference(s):`,
    )

    for (const error of errors) {
      console.error(
        `  ${error}`,
      )
    }

    process.exit(1)
  }

  console.log(
    '✔ Build validation passed.',
  )
}

main()
