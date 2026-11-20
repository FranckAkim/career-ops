process.env.NEXT_TELEMETRY_DISABLED = '1';
export default {
  agentRules: false,
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ['@hosted-career/control-plane','pg','better-auth'],
  // The shared package also supplies the operator/worker tools. They are not
  // imported by HTTP code; exclude their conservative external-package traces.
  // verify-build still fails if any worker/legacy code survives in the output.
  outputFileTracingExcludes: { '/*': [
    'node_modules/@hosted-career/control-plane/{docker-runner,supervisor,migrate,auth-migrate}.mjs',
    'node_modules/@hosted-career/control-plane/migrations/**/*',
    'node_modules/@hosted-career/control-plane/schema.sql',
  ] },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] },
    { source:'/hosted',headers:[{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}] },
    { source:'/',headers:[{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}] }];
  },
};
