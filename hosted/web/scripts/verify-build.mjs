import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertSourceTree, copies } from './prepare.mjs';

const required = ['/page','/hosted/page','/api/auth/[...all]/route','/api/hosted/[...path]/route'];
const allowed = new Set([...required,'/_not-found/page','/_global-error/page']);
export async function verifyBuild(root) {
  await assertSourceTree(root);
  const sources = JSON.parse(await fs.readFile(path.join(root,'.generated-source.json'),'utf8'));
  const expected = new Set(copies.map(([,target])=>target));
  if (!Array.isArray(sources.files) || sources.files.length !== expected.size || new Set(sources.files.map(file=>file.path)).size !== expected.size || sources.files.some(file=>!expected.has(file.path))) throw new Error('Invalid generated source manifest');
  for (const file of sources.files) {
    const bytes = await fs.readFile(path.join(root,file.path));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Generated source changed during build');
  }
  const routes = JSON.parse(await fs.readFile(path.join(root,'.next/server/app-paths-manifest.json'),'utf8'));
  if (required.some(route=>!routes[route]) || Object.keys(routes).some(route=>!allowed.has(route))) throw new Error('Unexpected hosted route manifest');
  let traces = 0, dependencies = 0;
  const unique = new Set();
  const ancestorPackages = new Set();
  for (let parent = path.dirname(root); ; parent = path.dirname(parent)) {
    ancestorPackages.add(path.join(parent,'package.json'));
    if (path.dirname(parent) === parent) break;
  }
  async function walk(directory) {
    for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const filename = path.join(directory,entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.name.endsWith('.nft.json')) {
        traces++;
        const manifest = JSON.parse(await fs.readFile(filename,'utf8'));
        for (const relative of manifest.files) {
          const resolved = path.resolve(path.dirname(filename),relative);
          const inside = path.relative(root,resolved);
          // Node may trace ancestor package metadata, never ancestor source/data.
          if ((inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) && !ancestorPackages.has(resolved)) throw new Error(`Dependency outside hosted project: ${relative}`);
          const normalized = resolved.replaceAll('\\','/');
          if (/(?:\/node_modules\/playwright[^/]*\/|\/(?:docker-runner|supervisor|engine|migrate|auth-migrate)\.mjs$|\/\.env(?:\.|$)|\/cv\.md$|\/data\/applications\.md$)/.test(normalized)) throw new Error(`Forbidden hosted dependency: ${relative}`);
          dependencies++;
          unique.add(resolved);
        }
      }
    }
  }
  await walk(path.join(root,'.next/server'));
  if (!traces) throw new Error('Missing hosted dependency traces');
  let bytes = 0;
  for (const filename of unique) bytes += (await fs.stat(filename)).size;
  return { routes:Object.keys(routes),traces,dependencies,uniqueDependencyFiles:unique.size,dependencyBytes:bytes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyBuild(fileURLToPath(new URL('../',import.meta.url)))));
}
