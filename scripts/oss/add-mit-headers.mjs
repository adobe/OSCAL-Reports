#!/usr/bin/env node
/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 *
 * Add or replace MIT license headers on source files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const JS_HEADER = `/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
`;

const HASH_HEADER = `# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
`;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.cursor',
  'coverage',
  'dist',
  'build',
  '.terraform',
  'sample_output',
]);

const EXTENSIONS = new Set(['.js', '.jsx', '.sh', '.css', '.tf', '.tftpl', '.mjs']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function hasMitHeader(content) {
  return (
    content.includes('Copyright 2025 Adobe. All rights reserved.') &&
    content.includes('Licensed under the MIT License')
  );
}

function stripBlockComment(content) {
  return content.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
}

function stripHashCommentBlock(content) {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (!line.startsWith('#')) break;
    i += 1;
  }
  if (i === 0) return content;
  const first = lines[0];
  const looksLikeHeader =
    i > 0 &&
    lines.slice(0, i).some((l) =>
      /Copyright|@license|GPL|Concept:|Licensed under the MIT|All [Rr]ights [Rr]eserved/.test(l)
    );
  if (!looksLikeHeader) return content;
  return lines.slice(i).join('\n');
}

function applyHeader(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (hasMitHeader(content)) return false;

  const ext = path.extname(filePath);
  let updated;

  if (['.js', '.jsx', '.css', '.mjs'].includes(ext)) {
    const body = stripBlockComment(content);
    updated = JS_HEADER + body.replace(/^\n+/, '');
  } else if (['.sh', '.tf', '.tftpl'].includes(ext)) {
    const shebang = content.match(/^#![^\n]*\n/);
    let rest = shebang ? content.slice(shebang[0].length) : content;
    rest = stripHashCommentBlock(rest);
    updated = (shebang ? shebang[0] : '') + HASH_HEADER + '\n' + rest.replace(/^\n+/, '');
  } else {
    return false;
  }

  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

const files = walk(ROOT);
let changed = 0;
for (const file of files) {
  if (file.endsWith('add-mit-headers.mjs')) continue;
  if (applyHeader(file)) {
    changed += 1;
  }
}
console.log(`Done. ${changed} file(s) updated.`);
