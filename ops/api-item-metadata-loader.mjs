// Owner-code-only static loader. No fetch, ASSETS, R2, credentials or public route.
import {readBundledItemMetadata} from './api-item-static-metadata.mjs';
const PINS=Object.freeze([
 Object.freeze({expectedSha256:'e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f',bytes:749135,sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000',format:'cash_client_catalog'}),
 Object.freeze({expectedSha256:'60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92',bytes:1360609,sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'})]);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export class StaticMetadataError extends Error{constructor(code){super(code);this.name='StaticMetadataError';}}
export class StaticItemMetadataLoader{
 #reader;#cache=null;#flight=null;
 constructor({enabled=false,isEnabled=()=>true,readStaticSource=readBundledItemMetadata}={}){this.enabled=enabled===true;this.isEnabled=isEnabled;this.#reader=readStaticSource;}
 get active(){return this.enabled&&this.isEnabled()===true;}
 guard(){if(!this.active)throw new StaticMetadataError('static_metadata_disabled');}
 async load(){if(!this.active)return{status:'disabled'};if(!this.#cache){const flight=this.#flight??=this.verify();try{await flight;}finally{if(this.#flight===flight)this.#flight=null;}}this.guard();return{status:'ready',sources:this.#cache.map(({raw,...descriptor})=>({...descriptor,raw:new Uint8Array(raw)})),resource:{decodedBytes:2109744,sourceCount:2}};}
 async verify(){const values=[];for(let index=0;index<PINS.length;index++){
  this.guard();const encoded=this.#reader(index),pin=PINS[index];
  if(typeof encoded!=='string'||encoded.length>200000||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new StaticMetadataError('static_gzip_encoding');
  let compressed;try{compressed=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{throw new StaticMetadataError('static_gzip_encoding');}
  if(compressed.length>150000)throw new StaticMetadataError('static_gzip_bound');
  const chunks=[];let bytes=0,reader;
  try{reader=new Response(compressed).body.pipeThrough(new DecompressionStream('gzip')).getReader();for(;;){const part=await reader.read();this.guard();if(part.done)break;bytes+=part.value.length;if(bytes>pin.bytes){await reader.cancel();throw new StaticMetadataError('static_decoded_bound');}chunks.push(part.value);}}
  catch(error){try{await reader?.cancel();}catch{}if(error instanceof StaticMetadataError)throw error;throw new StaticMetadataError('static_gzip_invalid');}
  finally{reader?.releaseLock();}
  if(bytes!==pin.bytes)throw new StaticMetadataError('static_decoded_bytes');
  const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  if(await sha(raw)!==pin.expectedSha256)throw new StaticMetadataError('static_decoded_sha');this.guard();
  const {bytes:_,...descriptor}=pin;values.push({raw,...descriptor});
 }this.guard();this.#cache=values;}
}
