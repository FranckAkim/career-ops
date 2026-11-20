// Trusted, quiescent workspace transport. Stop the worker before exporting.
// This module has no cloud credentials or SDK dependency.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hash = data => createHash('sha256').update(data).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const protectedFile = name => /^(?:cv\.md|article-digest\.md|voice-dna\.md|confirmed-profile\.json)$/.test(name) || /^(?:config|modes|writing-samples)\//.test(name);
function checked(name) {
  if (typeof name !== 'string' || !name || name.length > 1024 || /[\\:\x00-\x1f]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || p === '.git' || p === 'node_modules' || p === '.career-ops-data' || /^\.env(?:\.|$)/.test(p))) fail('unsafe_transfer_path');
  return name;
}
export function validateTransfer(value, { maxFiles = 10000, maxBytes = 20000000 } = {}) {
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || value?.schema !== 1 || !Array.isArray(value.files) || value.files.length > maxFiles) fail('invalid_transfer');
  const seen = new Set(); let total = 0;
  for (const file of value.files) {
    checked(file.path);
    const folded = file.path.toLowerCase();
    if (seen.has(folded) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.data !== 'string') fail('invalid_transfer');
    seen.add(folded); total += file.bytes;
    if (total > maxBytes || file.data.length !== 4 * Math.ceil(file.bytes / 3)) fail('transfer_limit');
    const data = Buffer.from(file.data, 'base64');
    if (data.length !== file.bytes || data.toString('base64') !== file.data || hash(data) !== file.sha256) fail('transfer_corrupt');
  }
  for (const name of seen) {
    const parts = name.split('/'); parts.pop();
    while (parts.length) { if (seen.has(parts.join('/'))) fail('invalid_transfer'); parts.pop(); }
  }
  return value;
}
export async function exportWorkspace(workspace, limits = {}) {
  if (!path.isAbsolute(workspace) || !(await fs.lstat(workspace)).isDirectory()) fail('unsafe_transfer_root');
  const files = []; let total = 0, entries = 0;
  const walk = async (directory, prefix = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const name = checked(prefix ? `${prefix}/${entry.name}` : entry.name);
      if (++entries > (limits.maxFiles ?? 10000) * 2 || name.split('/').length > 32) fail('transfer_limit');
      const target = path.join(directory, entry.name);
      const stat = await fs.lstat(target);
      if (stat.isDirectory()) { await walk(target, name); continue; }
      if (!stat.isFile() || stat.nlink !== 1) fail('unsafe_transfer_entry');
      total += stat.size;
      if (total > (limits.maxBytes ?? 20000000) || files.length >= (limits.maxFiles ?? 10000)) fail('transfer_limit');
      const data = await fs.readFile(target);
      if (data.length !== stat.size) fail('transfer_changed');
      files.push({ path: name, bytes: data.length, sha256: hash(data), data: data.toString('base64') });
    }
  };
  await walk(workspace);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return validateTransfer({ schema: 1, files }, limits);
}
export function verifySourceRetention(before, after, limits) {
  validateTransfer(before, limits); validateTransfer(after, limits);
  const old = new Map(before.files.filter(f => protectedFile(f.path)).map(f => [f.path, f.sha256]));
  const next = new Map(after.files.filter(f => protectedFile(f.path)).map(f => [f.path, f.sha256]));
  if (old.size !== next.size || [...old].some(([name, digest]) => next.get(name) !== digest)) fail('source_changed');
}
export async function importWorkspace(workspace, bundle, limits) {
  validateTransfer(bundle, limits);
  if (!path.isAbsolute(workspace)) fail('unsafe_transfer_root');
  // Parent is supervisor-owned. Destination must be new: never merge generations.
  await fs.mkdir(workspace, { mode: 0o700 });
  for (const file of bundle.files) {
    const target = path.join(workspace, ...file.path.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, Buffer.from(file.data, 'base64'), { flag: 'wx', mode: 0o600 });
  }
}
