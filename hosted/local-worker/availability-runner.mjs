import {checkLivenessViaApi} from '../../liveness-api.mjs';
import {availabilityInput,availabilityResult} from '../control-plane/availability.mjs';
// API rung only: no browser fallback, model, arbitrary URL or tracker writes.
export async function runAvailability({input,signal},check=checkLivenessViaApi){
 input=availabilityInput(input);if(signal?.aborted)throw Error('scan_cancelled');
 const verdict=await check(input.url);if(signal?.aborted)throw Error('scan_cancelled');
 return {jobs:[],availability:availabilityResult(verdict)};
}
