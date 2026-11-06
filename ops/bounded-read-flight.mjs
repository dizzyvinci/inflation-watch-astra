// Cache one soft deadline per underlying promise. Never clear/restart the SDK
// operation on timeout. Settled deadlines cannot accumulate visitor reactions
// on a permanently pending SDK read; WeakMap keys do not retain finished work.
export function createSharedReadWait(waitMs){
 if(!Number.isSafeInteger(waitMs)||waitMs<1||waitMs>10000)throw TypeError('bounded_read_wait');
 const waits=new WeakMap();
 return value=>{
  if(!value||typeof value.then!=='function')return Promise.resolve(value);
  let shared=waits.get(value);if(shared)return shared;
  shared=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('read_wait')),waitMs);Promise.resolve(value).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
  waits.set(value,shared);return shared;
 };
}
// Encode once into a private cache; independent bounded pull/copy per consumer.
// A zero high-water mark avoids pre-queuing a full cached body per response.
export function cachedBodyStream(bytes){
 let offset=0;return new ReadableStream({pull(controller){if(offset>=bytes.byteLength){controller.close();return;}const end=Math.min(offset+65536,bytes.byteLength);controller.enqueue(bytes.slice(offset,end));offset=end;}},{highWaterMark:0});
}
