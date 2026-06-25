'use strict';

// Copies Font Awesome files from node_modules to vendor/ so they can be
// served without exposing the entire node_modules directory.

const fs = require('fs');
const path = require('path');

const srcBase = path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free');
const destBase = path.join(__dirname, 'vendor', 'fontawesome');

const files = [
  'css/all.min.css',
  'webfonts/fa-solid-900.woff2',
  'webfonts/fa-solid-900.ttf',
  'webfonts/fa-regular-400.woff2',
  'webfonts/fa-regular-400.ttf',
  'webfonts/fa-brands-400.woff2',
  'webfonts/fa-brands-400.ttf',
  'webfonts/fa-v4compatibility.ttf'
];

let copied = 0;
for (const rel of files) {
  const src = path.join(srcBase, rel);
  const dest = path.join(destBase, rel);
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠  missing: ${src}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied++;
}

console.log(`✓ 已复制 ${copied}/${files.length} 个 Font Awesome 文件到 vendor/fontawesome/`);
