// Linear bounded canonical Base64 decode; no recursive/repeated-group regex.
const invalid=()=>{throw new TypeError('invalid_bounded_base64');};
const digit=c=>c>=65&&c<=90?c-65:c>=97&&c<=122?c-71:c>=48&&c<=57?c+4:c===43?62:c===47?63:-1;
export function decodeCanonicalBase64(value,expectedBytes){
 if(typeof value!=='string'||!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>5000000||value.length!==4*Math.ceil(expectedBytes/3)||value.length>6666668)invalid();
 const n=value.length,pad=value.endsWith('==')?2:value.endsWith('=')?1:0,end=n-pad;
 if(n%4||(n/4)*3-pad!==expectedBytes)invalid();
 for(let i=0;i<end;i++)if(digit(value.charCodeAt(i))<0)invalid();
 if(pad===2&&(digit(value.charCodeAt(end-1))&15)!==0||pad===1&&(digit(value.charCodeAt(end-1))&3)!==0)invalid();
 let text;try{text=atob(value);}catch{invalid();}
 if(text.length!==expectedBytes)invalid();
 const bytes=new Uint8Array(expectedBytes);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);
 return bytes;
}
