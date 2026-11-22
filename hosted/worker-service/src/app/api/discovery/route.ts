import {handleCallback} from '@vercel/queue';
import {consumeDiscovery} from '../../../lib/discovery.mjs';
export const runtime='nodejs';
export const maxDuration=300;
export const POST=handleCallback(async value=>{console.info(JSON.stringify({event:'cloud_discovery_received'}));await consumeDiscovery(value);},{visibilityTimeoutSeconds:300,retry:(_error,metadata)=>metadata.deliveryCount>5?{acknowledge:true}:{afterSeconds:60}});
