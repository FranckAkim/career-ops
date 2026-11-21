import { hostedRequest } from '@/lib/hosted-server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Profile publication verifies a bounded private workspace snapshot; storage I/O
// can exceed the short API default even though no inference runs in this route.
export const maxDuration = 300;
export const GET = hostedRequest;
export const POST = hostedRequest;
