// Lightweight reviewed static descriptors only; no remote metadata/body decoder.
export const SEARCH_IDENTITY_DEFINITION=Object.freeze({
 metadata:Object.freeze([
  Object.freeze({expectedSha256:'e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f',sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000',format:'cash_client_catalog'}),
  Object.freeze({expectedSha256:'60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92',sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'})]),
 spriteBindingsSha256:'356280fac3d0b4719ce31aa9e263b5de5a2797e191600f178c3fa4e53d1711de'
});
export function matchesSearchIdentityDefinition(manifest,definition=SEARCH_IDENTITY_DEFINITION){const sort=rows=>[...rows].sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl));return manifest.spriteBindingsSha256===definition.spriteBindingsSha256&&JSON.stringify(sort(manifest.identityMetadata))===JSON.stringify(sort(definition.metadata));}
