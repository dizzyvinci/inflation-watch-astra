/* Browser-safe exact scalar leaf. No Number money, I/O or ambient authority. */
const owned=new WeakSet(),BITS=4096;
const need=(ok,code)=>{if(!ok)throw Error(code);};
const abs=n=>n<0n?-n:n;
const bits=n=>abs(n).toString(2).length;
const gcd=(a,b)=>{a=abs(a);b=abs(b);while(b){const t=a%b;a=b;b=t;}return a;};
function normalized(n,d){
 need(typeof n==='bigint'&&typeof d==='bigint'&&d!==0n&&bits(n)<=BITS*2&&bits(d)<=BITS*2,'rational_intermediate_bound');
 if(d<0n){n=-n;d=-d;}const g=gcd(n,d);n/=g;d/=g;
 need(bits(n)<=BITS&&bits(d)<=BITS,'rational_size_bound');
 const out=Object.freeze(Object.assign(Object.create(null),{n,d}));owned.add(out);return out;
}
export function rational(n,d=1n){need(typeof n==='bigint'&&typeof d==='bigint'&&bits(n)<=BITS&&bits(d)<=BITS,'rational_input_bound');return normalized(n,d);}
const check=x=>{need(owned.has(x),'owned_rational_required');return x;};
export const ZERO=rational(0n),ONE=rational(1n);
export function parse(value){
 need(typeof value==='string'&&value.length<=32&&/^(?:0|[1-9]\d{0,12})(?:\.\d{1,9}|\/[1-9]\d{0,8})?$/.test(value),'exact_decimal_or_rational_string');
 if(value.includes('/')){const[n,d]=value.split('/');return rational(BigInt(n),BigInt(d));}
 if(value.includes('.')){const[n,f]=value.split('.');return rational(BigInt(n+f),10n**BigInt(f.length));}
 return rational(BigInt(value));
}
export function text(x){check(x);return x.d===1n?String(x.n):x.n+'/'+x.d;}
export function add(x,y){check(x);check(y);const g=gcd(x.d,y.d),a=x.d/g,b=y.d/g;return normalized(x.n*b+y.n*a,a*y.d);}
export function neg(x){check(x);return normalized(-x.n,x.d);}
export function sub(x,y){return add(x,neg(y));}
export function mul(x,y){check(x);check(y);const a=gcd(x.n,y.d),b=gcd(y.n,x.d);return normalized((x.n/a)*(y.n/b),(x.d/b)*(y.d/a));}
export function div(x,y){check(x);check(y);need(y.n!==0n,'rational_divide_by_zero');return mul(x,normalized(y.d,y.n));}
export function compare(x,y){check(x);check(y);const n=x.n*y.d-y.n*x.d;return n<0n?-1:n>0n?1:0;}
export function equal(x,y){return compare(x,y)===0;}
export function sum(values){need(Array.isArray(values)&&values.length<=256,'rational_sum_bound');return values.reduce(add,ZERO);}
export function probability(value){const x=parse(value);need(x.d<=1000000000n&&compare(x,ONE)<=0,'bounded_rational_probability');return x;}
export function amount(value){const x=parse(value);need(x.d<=1000000000n&&compare(x,rational(1000000000000n))<=0,'bounded_nonnegative_rational');return x;}
