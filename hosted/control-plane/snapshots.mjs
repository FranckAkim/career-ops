import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, ControlError } from './queue.mjs';

const digest = /^[a-f0-9]{64}$/;
export function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 1024 || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p => !p || p === '.' || p === '..' || p.includes('\0'))) throw new ControlError('unsafe_path');
  return path.join(root, ...relative.split('/'));
}
export function manifestValid(value, maxFiles, maxBytes) {
  if (value?.schema !== 1 || !Array.isArray(value.files) || value.files.length > maxFiles) throw new ControlError('invalid_snapshot');
  let total = 0;
  const seen = new Set();
  for (const file of value.files) {
    safePath('.', file.path);
    if (seen.has(file.path) || !digest.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new ControlError('invalid_snapshot');
    seen.add(file.path); total += file.bytes;
  }
  if (total > maxBytes) throw new ControlError('snapshot_limit');
  return value;
}

// Private local implementation of the immutable snapshot contract. Production
// needs a durable private object-store adapter with the same verification rules.
// root is operator-owned and inaccessible to worker containers or public routes.
export class SnapshotStore {
  constructor(root, { maxFiles = 10000, maxBytes = 100000000 } = {}) {
    if (!path.isAbsolute(root)) throw new ControlError('invalid_store_root');
    this.root = path.resolve(root); this.maxFiles = maxFiles; this.maxBytes = maxBytes;
  }
  async capture(workspace, {beforeStore,assertActive} = {}) {
    const source = await fs.realpath(workspace);
    const relation = path.relative(source, this.root);
    if (!relation || (!relation.startsWith(`..${path.sep}`) && relation !== '..' && !path.isAbsolute(relation))) throw new ControlError('store_inside_workspace');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const stage = path.join(this.root, `.pending-${randomUUID()}`);
    await fs.mkdir(stage, { mode: 0o700 });
    try {
      const files = []; let bytes = 0;
      const walk = async (directory, prefix = '') => {
        for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          const target = safePath(source, relative);
          // Do not persist server credentials, engine code, or host links.
          if (entry.name === '.git' || entry.name === 'node_modules' || /^\.env(?:\.|$)/.test(entry.name) || entry.name === '.career-ops-data') throw new ControlError('unsafe_snapshot_entry');
          if (entry.isDirectory()) { await walk(target, relative); continue; }
          if (!entry.isFile()) throw new ControlError('unsafe_snapshot_entry');
          const stat = await fs.lstat(target);
          if (!stat.isFile()) throw new ControlError('unsafe_snapshot_entry');
          if (bytes + stat.size > this.maxBytes || files.length >= this.maxFiles) throw new ControlError('snapshot_limit');
          const data = await fs.readFile(target);
          bytes += data.length;
          if (bytes > this.maxBytes || files.length >= this.maxFiles) throw new ControlError('snapshot_limit');
          const destination = safePath(path.join(stage, 'files'), relative);
          await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
          await fs.writeFile(destination, data, { flag: 'wx', mode: 0o600 });
          files.push({ path: relative, bytes: data.length, sha256: hash(data) });
        }
      };
      await walk(source);
      files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const manifest = JSON.stringify({ schema: 1, files });
      const id = hash(manifest);
      await beforeStore?.({id,files});assertActive?.();
      await fs.writeFile(path.join(stage, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
      try { await fs.rename(stage, path.join(this.root, id)); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
        // Another publisher may have stored the identical snapshot. Verify all
        // bytes before allowing a DB pointer to refer to the existing object.
        await this.verify(id);
      }
      return { id, files };
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
  async manifest(id) {
    if (!digest.test(id)) throw new ControlError('invalid_snapshot');
    const raw = await fs.readFile(path.join(this.root, id, 'manifest.json'));
    if (hash(raw) !== id) throw new ControlError('snapshot_corrupt');
    return manifestValid(JSON.parse(raw), this.maxFiles, this.maxBytes);
  }
  async verify(id, destination) {
    const manifest = await this.manifest(id);
    for (const file of manifest.files) {
      const source = safePath(path.join(this.root, id, 'files'), file.path);
      const stat = await fs.lstat(source);
      if (!stat.isFile()) throw new ControlError('snapshot_corrupt');
      const data = await fs.readFile(source);
      if (data.length !== file.bytes || hash(data) !== file.sha256) throw new ControlError('snapshot_corrupt');
      if (destination) {
        const target = safePath(destination, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await fs.writeFile(target, data, { flag: 'wx', mode: 0o600 });
      }
    }
    return manifest;
  }
  async materialize(id, destination) {
    // Destination must be new, private and disposable. Never merge generations.
    await fs.mkdir(destination, { mode: 0o700 });
    return this.verify(id, destination);
  }
  async readBytes(id, relative, { maxBytes = this.maxBytes } = {}) {
    const manifest = await this.manifest(id);
    const file = manifest.files.find(f => f.path === relative);
    if (!file) throw new ControlError('artifact_missing');
    if (file.bytes > maxBytes) throw new ControlError('artifact_limit');
    const source = safePath(path.join(this.root, id, 'files'), relative);
    const stat = await fs.lstat(source);
    if (!stat.isFile() || stat.size !== file.bytes) throw new ControlError('snapshot_corrupt');
    const data = await fs.readFile(source);
    if (data.length !== file.bytes || hash(data) !== file.sha256) throw new ControlError('snapshot_corrupt');
    return data;
  }
  async read(id, relative) {
    return (await this.readBytes(id, relative)).toString('utf8');
  }
}
