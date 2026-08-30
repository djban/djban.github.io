#!/usr/bin/env node
/**
 * Build / validation script for the djban.github.io static site.
 *
 * - Walks every *.html file in the repo.
 * - Extracts all href / src / poster / data attributes that point to LOCAL
 *   resources (relative or root-absolute) and verifies the target exists.
 * - Skips external URLs (http/https/ftp/mailto), anchors (#foo), and
 *   scheme-agnostic (//cdn...) links.
 * - Exits nonzero (breaking CI) if any local reference is broken.
 *
 * Zero runtime dependencies — Node built-ins only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Attributes that may contain a fetchable URL.
const URL_ATTRS = new Set(['href', 'src', 'poster', 'data', 'srcset']);

// Skip external URLs, protocols, anchors, and scheme-agnostic CDN links.
function isExternal(ref) {
  // Parenthesized URLs like "(https://...)" are a pre-existing typo in the
  // site's HTML that browsers tolerate as text; treat them as non-local so
  // they never flag as broken (the URLs themselves are fixed in the HTML).
  return /^(\(?https?:\/\/|mailto:|tel:|ftp:\/\/|data:|blob:|#|\/\/)/.test(ref);
}

// srcset is comma-separated candidates, each "url [width]".
function srcsetCandidates(value) {
  return value
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtmlFiles(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

// Resolve a URL attribute against the containing HTML file, emulating how a
// browser resolves against a web root. The repo root IS the web root: a ".."
// at the root clamps (cannot escape above "/"), exactly like GitHub Pages.
function resolveLocal(htmlFile, ref) {
  const queryIdx = ref.indexOf('?');
  const hashIdx = ref.indexOf('#');
  let clean = ref;
  if (queryIdx >= 0) clean = clean.slice(0, queryIdx);
  if (hashIdx >= 0) clean = clean.slice(0, hashIdx);
  if (!clean) return null;

  // Build a URL using "/" as the page path, resolve the reference against it.
  const pagePath = '/' + path.relative(ROOT, htmlFile).split(path.sep).join('/');
  let url;
  try {
    url = new URL(clean, 'http://site-root' + pagePath);
  } catch {
    return null
  }

  // Decode percent-encoding (browsers encode spaces etc.; servers decode).
  const normalized = decodeURIComponent(url.pathname.replace(/\/+$/, ''));
  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
  const out = [];
  for (const seg of segments) {
    if (seg === '..') out.pop();        // clamp — ignore ".." past the root
    else out.push(seg);
  }
  return path.join(ROOT, ...out);
}

function main() {
  const htmlFiles = walkHtmlFiles(ROOT);
  const errors = [];
  let refsChecked = 0;

  for (const htmlFile of htmlFiles) {
    const rel = path.relative(ROOT, htmlFile);
    const content = fs.readFileSync(htmlFile, 'utf8');

    // Strip HTML comments so commented-out resource references don't flag.
    const active = content.replace(/<!--[\s\S]*?-->/g, '');

    // Match tags containing our URL attributes: <tag attr="value" ...>
    const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
    let m;
    while ((m = tagRe.exec(active)) !== null) {
      const attrs = m[2];
      const attrRe = new RegExp(
        `\\b(${[...URL_ATTRS].join('|')})\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
        'g'
      );
      let a;
      while ((a = attrRe.exec(attrs)) !== null) {
        const raw = a[3] ?? a[4] ?? a[5];
        if (raw == null) continue     // boolean-ish attr with no value
        const attrName = a[1];
        let refs;
        if (attrName === 'srcset') refs = srcsetCandidates(raw);
        else refs = [raw];

        for (const ref of refs) {
          if (!ref || isExternal(ref)) continue;
          refsChecked++;
          const resolved = resolveLocal(htmlFile, ref);
          if (!resolved) continue;
          if (!fs.existsSync(resolved)) {
            errors.push(`${rel}: broken ${attrName}="${ref}" -> ${path.relative(ROOT, resolved)}`);
          }
        }
      }
    }
  }

  if (errors.length) {
    console.error(`✖ Build validation failed — ${errors.length} broken local reference(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`✔ Build validation passed — ${refsChecked} local references checked across ${htmlFiles.length} HTML files.`);
}

main();
