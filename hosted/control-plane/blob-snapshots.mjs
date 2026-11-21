import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { get, put, list,head,del,BlobNotFoundError } from '@vercel/blob';
import { SnapshotStore, manifestValid, safePath } from './snapshots.mjs';
import { hash, ControlError } from './queue.mjs';

const digest = /^[a-f0-9]{64}$/;
// Server-only SDK transport injection is for deterministic tests.
export class BlobSnapshotStore {
  constructor({ token, storeId, transport = { get, put,head,del }, maxFiles = 10000, maxBytes = 100000000, generationSnapshots = false } = {}) {
    if (typeof generationSnapshots!=='boolean') throw new ControlError('invalid_snapshot_configuration');
    if (!token && !storeId) throw new ControlError('storage_configuration_required');
    this.credentials = token ? { token } : { storeId };
    this.transport = transport; this.maxFiles = maxFiles; this.maxBytes = maxBytes; this.generationSnapshots = generationSnapshots;
  }
  key(id, file) {
    if (!digest.test(id)) throw new ControlError('invalid_snapshot');
    return `career-workspaces/v1/${id}/${file}`;
  }
  async listMetadata({cursor}={}) {
    const result=await list({...this.credentials,prefix:'career-workspaces/v1/',mode:'expanded',limit:1000,...(cursor?{cursor}:{}),abortSignal:AbortSignal.timeout(15000)});
    // URLs and download capabilities never leave this storage boundary.
    return {blobs:result.blobs.map(({pathname,size,uploadedAt})=>({pathname,size,uploadedAt})),hasMore:result.hasMore,cursor:result.cursor};
  }
  async objectPresent(id,fileHash=null){
    if(fileHash!==null&&!digest.test(fileHash))throw new ControlError('invalid_snapshot');
    const key=this.key(id,fileHash===null?'manifest.json':`files/${fileHash}`);
    try{return await this.transport.head(key,{...this.credentials,abortSignal:AbortSignal.timeout(15000)});}catch(error){if(error instanceof BlobNotFoundError)return null;throw new ControlError('storage_verification_failed');}
  }
  async deleteInventoriedObject(id,fileHash=null){
    const existing=await this.objectPresent(id,fileHash);if(!existing)return;
    const key=this.key(id,fileHash===null?'manifest.json':`files/${fileHash}`);
    try{await this.transport.del(key,{...this.credentials,ifMatch:existing.etag,abortSignal:AbortSignal.timeout(15000)});}catch{/* A lost response is success only after verified absence. */}
    if(await this.objectPresent(id,fileHash))throw new ControlError('object_delete_failed');
  }
  async download(key, maxBytes) {
    const result = await this.transport.get(key, { ...this.credentials, access: 'private', useCache: false, abortSignal: AbortSignal.timeout(15000) });
    if (!result || result.statusCode !== 200) throw new ControlError('snapshot_missing');
    const reader = result.stream.getReader(); let bytes = 0; const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.length; if (bytes > maxBytes) throw new ControlError('snapshot_limit');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  async immutablePut(key, data) {
    try {
      await this.transport.put(key, data, { ...this.credentials, access: 'private', addRandomSuffix: false, allowOverwrite: false,
        contentType: 'application/octet-stream', abortSignal: AbortSignal.timeout(15000) });
    } catch {
      // Duplicate/lost responses are safe only after verifying existing bytes.
      const existing = await this.download(key, data.length);
      if (!existing.equals(data)) throw new ControlError('snapshot_corrupt');
    }
  }
  async capture(workspace, {beforeStore,assertActive} = {}) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-blob-'));
    await fs.chmod(temporary, 0o700);
    try {
      const local = new SnapshotStore(path.join(temporary, 'objects'), { maxFiles: this.maxFiles, maxBytes: this.maxBytes, generationSnapshots: this.generationSnapshots });
      const saved = await local.capture(workspace);
      await beforeStore?.(saved);assertActive?.();
      for (const file of saved.files) {
        assertActive?.();
        const bytes = await fs.readFile(safePath(path.join(local.root, saved.id, 'files'), file.path));
        await this.immutablePut(this.key(saved.id, `files/${file.sha256}`), bytes);
      }
      // Manifest last; a partial upload cannot look like a full snapshot.
      assertActive?.();
      await this.immutablePut(this.key(saved.id, 'manifest.json'), await fs.readFile(path.join(local.root, saved.id, 'manifest.json')));
      await this.verify(saved.id);
      assertActive?.();
      return saved;
    } finally {
      if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('hc-blob-')) throw new ControlError('unsafe_cleanup');
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  async manifest(id) {
    const raw = await this.download(this.key(id, 'manifest.json'), 21000000);
    if (hash(raw) !== id) throw new ControlError('snapshot_corrupt');
    return manifestValid(JSON.parse(raw), this.maxFiles, this.maxBytes);
  }
  async file(id, file) {
    const data = await this.download(this.key(id, `files/${file.sha256}`), file.bytes);
    if (data.length !== file.bytes || hash(data) !== file.sha256) throw new ControlError('snapshot_corrupt');
    return data;
  }
  async verify(id, destination) {
    const manifest = await this.manifest(id);
    for (const file of manifest.files) {
      const data = await this.file(id, file);
      if (destination) {
        const target = safePath(destination, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await fs.writeFile(target, data, { flag: 'wx', mode: 0o600 });
      }
    }
    return manifest;
  }
  async materialize(id, destination) {
    await fs.mkdir(destination, { mode: 0o700 });
    return this.verify(id, destination);
  }
  async readBytes(id, relative, { maxBytes = this.maxBytes } = {}) {
    const manifest = await this.manifest(id);
    const file = manifest.files.find(f => f.path === relative);
    if (!file) throw new ControlError('artifact_missing');
    if (file.bytes > maxBytes) throw new ControlError('artifact_limit');
    return this.file(id, file);
  }
  async read(id, relative) {
    return (await this.readBytes(id, relative)).toString('utf8');
  }
}
