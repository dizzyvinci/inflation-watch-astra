// Finite compatibility adapter: same first exact capture/policy/id=1 behavior.
import {FastCurrentReplayEngine} from './api-fast-current-replay-engine.mjs';
export {FAST_CURRENT_POINTER} from './api-fast-current-replay-engine.mjs';
export class FastCurrentPublication extends FastCurrentReplayEngine{
 constructor(ctx,core,sink,writer,options={}){super(ctx,core,sink,writer,{...options,adapter:null});}
}
