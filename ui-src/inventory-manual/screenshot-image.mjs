// Pure image structure admission; PNG/JPEG parsers extracted byte-exact from reviewed OCR R2. No OCR dependency.
const need=(v,c)=>{if(!v)throw TypeError(c)};
const be16=(b,i)=>(b[i]<<8)|b[i+1],be32=(b,i)=>(b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3]);
const text=(b,i,n)=>String.fromCharCode(...b.subarray(i,i+n));
const CRC=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(b,start,end){let c=0xffffffff;for(let i=start;i<end;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
function dimensions(width,height){need(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=8192&&height<=8192&&width*height<=12000000,'image_dimensions');return{width,height}}
function png(b){
 need(b.length>=45&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x),'png_signature');let p=8,count=0,ihdr=false,idat=false,endIdat=false,plte=false,ended=false,d;
 while(p<b.length){need(++count<=4096&&p+12<=b.length,'png_chunks_bound');const n=be32(b,p),t=text(b,p+4,4);need(/^[A-Za-z]{4}$/.test(t)&&t[2]===t[2].toUpperCase()&&n<=b.length-p-12,'png_chunk');need(crc(b,p+4,p+8+n)===be32(b,p+8+n),'png_crc');need(!['acTL','fcTL','fdAT'].includes(t),'animated_image_unsupported');need(t!=='eXIf','png_exif_orientation_held');
  if(!ihdr){need(t==='IHDR'&&n===13,'png_ihdr');const w=be32(b,p+8),h=be32(b,p+12),bits=b[p+16],color=b[p+17];d=dimensions(w,h);need(({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[color]?.includes(bits)&&b[p+18]===0&&b[p+19]===0&&b[p+20]<=1,'png_profile');d.color=color;ihdr=true}
  else if(t==='IHDR')need(false,'png_duplicate_ihdr');
  else if(t==='PLTE'){need(!plte&&!idat&&n>0&&n<=768&&n%3===0&&d.color!==0&&d.color!==4,'png_palette');plte=true}
  else if(t==='IDAT'){need(!endIdat&&(d.color!==3||plte),'png_idat_order');idat=true}
  else if(t==='IEND'){need(idat&&n===0&&p+12===b.length,'png_iend');ended=true;p+=12;break}
  else {need(t[0]===t[0].toLowerCase(),'png_unknown_critical');if(idat)endIdat=true}
  p+=n+12;
 }
 need(ended&&p===b.length,'png_incomplete');return{...dimensions(d.width,d.height),format:'png',mime:'image/png',orientation:'encoding_orientation_only'};
}
function exif(b,start,end){
 need(end-start>=14&&text(b,start,6)==='Exif\0\0','jpeg_app1_metadata_held');const o=start+6,le=text(b,o,2)==='II';need(le||text(b,o,2)==='MM','jpeg_exif_profile');
 const u16=i=>{need(i>=o&&i+2<=end,'jpeg_exif_bounds');return le?b[i]+b[i+1]*256:be16(b,i)},u32=i=>{need(i>=o&&i+4<=end,'jpeg_exif_bounds');return le?b[i]+b[i+1]*256+b[i+2]*65536+b[i+3]*16777216:be32(b,i)};
 need(u16(o+2)===42,'jpeg_exif_profile');const offset=u32(o+4);need(offset>=8,'jpeg_exif_bounds');const p=o+offset,n=u16(p);need(n<=128&&p+2+n*12+4<=end,'jpeg_exif_entries');let seen=false;
 for(let k=0;k<n;k++){const q=p+2+k*12;if(u16(q)===0x112){need(!seen&&u16(q+2)===3&&u32(q+4)===1,'jpeg_exif_orientation');seen=true;need(u16(q+8)===1,'jpeg_orientation_held')}}
 // No linked secondary image/thumbnail chain is admitted in this initial profile.
 need(u32(p+2+n*12)===0,'jpeg_exif_secondary_held');
}
function jpeg(b){
 need(b.length>=4&&b[0]===255&&b[1]===216,'jpeg_signature');let p=2,markers=0,d=null,scans=0,inScan=false,exifSeen=false,ended=false;
 while(p<b.length){
  if(inScan){while(p<b.length){if(b[p++]!==255)continue;while(p<b.length&&b[p]===255)p++;need(p<b.length,'jpeg_truncated_scan');if(b[p]===0||b[p]>=0xd0&&b[p]<=0xd7){p++;continue}p--;break}inScan=false}
  need(++markers<=16384&&p+2<=b.length&&b[p++]===255,'jpeg_markers_bound');while(p<b.length&&b[p]===255)p++;need(p<b.length,'jpeg_marker');const m=b[p++];
  if(m===0xd9){need(d&&scans>0&&p===b.length,'jpeg_eoi');ended=true;break}
  need(m!==0&&m!==0xd8&&m!==0x01&&!(m>=0xd0&&m<=0xd7)&&m!==0xdc,'jpeg_marker');need(p+2<=b.length,'jpeg_segment');const n=be16(b,p);need(n>=2&&n<=b.length-p,'jpeg_segment');const s=p+2,e=p+n;
  if(m===0xe1){need(!exifSeen,'jpeg_duplicate_exif');exifSeen=true;exif(b,s,e)}
  if(m===0xe2)need(text(b,s,Math.min(4,e-s))!=='MPF\0','animated_image_unsupported');
  if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m)){need([0xc0,0xc1,0xc2].includes(m)&&!d&&n>=8&&b[s]===8,'jpeg_sof_profile');const components=b[s+5];need([1,3,4].includes(components)&&n===8+components*3,'jpeg_sof_components');d=dimensions(be16(b,s+3),be16(b,s+1));d.components=components}
  if(m===0xda){need(d&&n>=6&&b[s]>=1&&b[s]<=d.components&&n===6+b[s]*2,'jpeg_sos');scans++;inScan=true}
  p=e;
 }
 need(ended,'jpeg_incomplete');return{...dimensions(d.width,d.height),format:'jpeg',mime:'image/jpeg',orientation:'absent_or_explicit_identity_only'};
}
export const screenshotLimits=Object.freeze({maxBytes:8000000,maxBatchBytes:32000000,maxDimension:4096,maxPixels:8000000,maxTotalPixels:16000000,maxPages:10,maxPhysicalDecodes:1});
const typed=Object.getPrototypeOf(Uint8Array.prototype),nativeLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get,nativeOffset=Object.getOwnPropertyDescriptor(typed,'byteOffset').get,nativeBuffer=Object.getOwnPropertyDescriptor(typed,'buffer').get,nativeTag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,abLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
export function ownScreenshotBytes(input){
 let n,o,buffer;try{need(nativeTag.call(input)==='Uint8Array','image_bytes');n=nativeLength.call(input);o=nativeOffset.call(input);buffer=nativeBuffer.call(input);abLength.call(buffer)}catch{throw TypeError('image_bytes')}
 need(n>0&&n<=screenshotLimits.maxBytes,'image_bytes');const out=new Uint8Array(n);out.set(new Uint8Array(buffer,o,n));return out;
}
const le32=(b,i)=>b[i]+b[i+1]*256+b[i+2]*65536+b[i+3]*16777216,le24=(b,i)=>b[i]+b[i+1]*256+b[i+2]*65536;
function webp(b){
 need(b.length>=20&&text(b,0,4)==='RIFF'&&text(b,8,4)==='WEBP'&&le32(b,4)+8===b.length,'webp_riff');let p=12,count=0,canvas=null,payload=null,alpha=false;
 while(p<b.length){need(++count<=256&&p+8<=b.length,'webp_chunks');const t=text(b,p,4),n=le32(b,p+4),s=p+8;need(n<=b.length-s&&s+n+(n%2)<=b.length,'webp_chunk_bound');if(n%2)need(b[s+n]===0,'webp_padding');
  if(t==='VP8X'){need(count===1&&n===10&&!canvas&&(b[s]&~16)===0&&b[s+1]===0&&b[s+2]===0&&b[s+3]===0,'webp_extended_profile');canvas=dimensions(le24(b,s+4)+1,le24(b,s+7)+1)}
  else if(t==='ALPH'){need(canvas&&!payload&&!alpha&&n>0,'webp_alpha');alpha=true}
  else if(t==='VP8 '){need(!payload&&n>=10&&(b[s]&1)===0&&b[s+3]===157&&b[s+4]===1&&b[s+5]===42,'webp_vp8');payload=dimensions((b[s+6]+b[s+7]*256)&16383,(b[s+8]+b[s+9]*256)&16383)}
  else if(t==='VP8L'){need(!payload&&!alpha&&n>=5&&b[s]===47&&(b[s+4]&224)===0,'webp_vp8l');payload=dimensions(1+b[s+1]+((b[s+2]&63)<<8),1+(b[s+2]>>6)+(b[s+3]<<2)+((b[s+4]&15)<<10))}
  else need(false,'webp_metadata_or_animation_unsupported');p=s+n+(n%2);
 }
 need(payload&&p===b.length&&(!canvas||canvas.width===payload.width&&canvas.height===payload.height),'webp_dimensions');return{...payload,format:'webp',mime:'image/webp',orientation:'encoding_orientation_only'};
}
export function inspectScreenshotBytes(bytes,mime){
 // Caller owns bytes already; public admission still uses intrinsic bounds.
 const b=ownScreenshotBytes(bytes);try{need(['image/png','image/jpeg','image/webp'].includes(mime),'image_type_unsupported');const d=mime==='image/png'?png(b):mime==='image/jpeg'?jpeg(b):webp(b);need(d.width<=4096&&d.height<=4096&&d.width*d.height<=8000000,'image_dimensions');return Object.freeze({...d,bytes:b.length,pixelCount:d.width*d.height,sourceCapturedAt:null,recognition:false})}finally{b.fill(0)}
}
