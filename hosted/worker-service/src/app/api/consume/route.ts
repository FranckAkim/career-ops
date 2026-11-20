import { handleCallback } from '@vercel/queue';
import { consume } from '../../../lib/runtime.mjs';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = handleCallback(async () => { await consume(); }, {
  visibilityTimeoutSeconds:300,
  retry: (_error,metadata) => metadata.deliveryCount > 5 ? {acknowledge:true} : {afterSeconds:60},
});
