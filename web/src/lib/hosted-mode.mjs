// Vercel must never accidentally serve the local file/process dashboard.
export function hostedMode(env = process.env) {
  return env.CAREER_OPS_MODE === 'hosted' || env.VERCEL === '1';
}
export function hostedPathAllowed(pathname) {
  return pathname.startsWith('/api/hosted/') || pathname.startsWith('/api/auth/');
}
