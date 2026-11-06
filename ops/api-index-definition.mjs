// Code-owned reviewed retrospective calibration; never rebuilt from a later price revision.
import data from './api-index-definition-data-v1.json' with {type:'json'};
import {createApiIndexDefinition} from './api-index-calculations.mjs';
export const EXPECTED_DEFINITION_HASH='865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17';
let flight;
export function loadApiIndexDefinition(){return flight??=(async()=>{const definition=await createApiIndexDefinition(data);if(definition.definitionHash!==EXPECTED_DEFINITION_HASH)throw Error('compiled_index_definition_hash');return definition;})().catch(error=>{flight=undefined;throw error;});}
