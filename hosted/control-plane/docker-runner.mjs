import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControlError } from './queue.mjs';
import {workerErrorCode} from './worker-errors.mjs';

const hostEnvironment = () => Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','PROGRAMDATA'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
function docker(args, { input = '', env = hostEnvironment(), maxBytes = 2000000, timeoutMs = 150000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env, shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    const output = []; let size = 0, failure;
    const timer = setTimeout(() => { failure = new ControlError('launcher_timeout'); child.kill(); }, timeoutMs);
    child.on('error', () => { failure = new ControlError('launcher_failed'); });
    child.stdout.on('data', data => { size += data.length; if (size <= maxBytes) output.push(data); else { failure = new ControlError('launcher_output_limit'); child.kill(); } });
    child.stderr.on('data', data => { size += data.length; if (size > maxBytes) { failure = new ControlError('launcher_output_limit'); child.kill(); } });
    child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else resolve({ code, stdout: Buffer.concat(output).toString('utf8') }); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}

// Trusted operator configuration only. The Docker daemon is a privileged control
// plane dependency; never offer these options through a tenant API.
export function dockerRunner({ image, seccomp, network, provider, timeoutMs = 120000, allowLocalProvider = false, uid, tailoringFormat = 'html', workerNamespace }) {
  if (!['html','json'].includes(tailoringFormat) || (workerNamespace !== undefined && !/^[a-f0-9]{32}$/.test(workerNamespace))) throw new ControlError('invalid_runner_config');
  if (!/^sha256:[a-f0-9]{64}$/.test(image) || !path.isAbsolute(seccomp) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(network) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new ControlError('invalid_runner_config');
  const url = new URL(provider.baseUrl);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (allowLocalProvider && url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) || typeof provider.model !== 'string' || !provider.model) throw new ControlError('invalid_runner_config');
  if (uid !== undefined && !/^[1-9]\d*:[1-9]\d*$/.test(uid)) throw new ControlError('invalid_runner_config');
  if (network === 'host') throw new ControlError('invalid_runner_config');
  return async ({ workspace, job, engineRevision, signal }) => {
    if (signal?.aborted) throw new ControlError('cancelled');
    const inspection = await docker(['image','inspect',image,'--format','{{json .Config}}']);
    const config = inspection.code === 0 ? JSON.parse(inspection.stdout) : null;
    if (!config?.Env?.includes(`HOSTED_ENGINE_REVISION=${engineRevision}`) || !['node','1000','1000:1000'].includes(config.User)) throw new ControlError('engine_revision_mismatch');
    const name = `hc-job-${randomUUID()}`;
    const env = { ...hostEnvironment(), HOSTED_MODEL_BASE_URL: provider.baseUrl, HOSTED_MODEL: provider.model, HOSTED_MODEL_API_KEY: provider.apiKey || '' };
    let stopPromise;
    // Retrying stop after the run client exits covers cancellation during Docker
    // container creation, when an early `rm` may have found no container yet.
    const stop = () => { stopPromise = docker(['rm','-f',name], { timeoutMs: 30000 }); stopPromise.catch(() => {}); };
    const abort = () => stop();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(stop, timeoutMs);
    try {
      if (signal?.aborted) throw new ControlError('cancelled');
      const output = await docker(['run','--name',name,'-i','--network',network,
        ...(workerNamespace ? ['--label',`io.career-workspace.worker=${workerNamespace}`] : []),
        '--init','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',`--security-opt=seccomp=${seccomp}`,
        '--pids-limit=256','--memory=1g','--cpus=1','--shm-size=256m','--tmpfs=/tmp:rw,nosuid,noexec,size=128m',
        ...(uid ? [`--user=${uid}`] : []), '--mount',`type=bind,source=${workspace},target=/workspace`,
        '--env=HOSTED_MODEL_BASE_URL','--env=HOSTED_MODEL','--env=HOSTED_MODEL_API_KEY',`--env=HOSTED_TIMEOUT_MS=${timeoutMs}`,
        `--env=HOSTED_TAILOR_FORMAT=${tailoringFormat}`,
        ...(allowLocalProvider ? ['--env=HOSTED_ALLOW_LOCAL_PROVIDER=1'] : []), image], { input: JSON.stringify(job), env, timeoutMs: timeoutMs + 30000 });
      if (signal?.aborted) throw new ControlError('cancelled');
      let envelope;
      try { envelope = JSON.parse(output.stdout); } catch { throw new ControlError('invalid_worker_response'); }
      if (output.code !== 0 || envelope.ok !== true) throw new ControlError(workerErrorCode(envelope));
      return envelope.result;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (stopPromise) await stopPromise.catch(() => {});
      try {
        const removal = await docker(['rm','-f',name], { timeoutMs: 30000 });
        if (removal.code !== 0) {
          const exists = await docker(['ps','-aq','--filter',`name=^/${name}$`], { timeoutMs: 30000 });
          if (exists.code !== 0 || exists.stdout.trim()) throw new ControlError('container_cleanup_failed');
        }
      } catch { throw new ControlError('container_cleanup_failed'); }
    }
  };
}
