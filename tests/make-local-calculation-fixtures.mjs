import {loadApiIndexDefinition} from '../ops/api-index-definition.mjs';
import {calculateApiIndexSnapshot,assertApiIndexSnapshot} from '../ops/api-index-calculations.mjs';
const definition=await loadApiIndexDefinition(),none=await calculateApiIndexSnapshot({definition});await assertApiIndexSnapshot(none,{definition});
process.stdout.write(JSON.stringify({none:JSON.stringify(none)}));
