process.env.NEXT_TELEMETRY_DISABLED = '1';
export default {
  agentRules: false, poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ['@hosted-career/control-plane','@vercel/sandbox','@vercel/queue','@vercel/oidc','pg'],
  outputFileTracingExcludes: { '/*': ['node_modules/@hosted-career/control-plane/{docker-runner,migrate,auth-migrate}.mjs','node_modules/@hosted-career/control-plane/migrations/**/*','node_modules/@hosted-career/control-plane/schema.sql'] },
};
