"""Portable typed catalogue hashes, independent of display-number printing."""
import hashlib
import math
import struct

HASH_METHOD='mcat-typed-utf8-f64-v1'
MAX_SAFE_INTEGER=9007199254740991


def canonical_bytes(value):
    if value is None:return b'z'
    if isinstance(value,bool):return b't' if value else b'f'
    if isinstance(value,(int,float)):
        if abs(value)>MAX_SAFE_INTEGER or not math.isfinite(value):raise ValueError('Unsupported canonical number')
        return b'n'+struct.pack('>d',0.0 if value==0 else float(value)).hex().encode('ascii')
    if isinstance(value,str):
        encoded=value.encode('utf-8',errors='strict')
        return b's'+str(len(encoded)).encode('ascii')+b':'+encoded
    if isinstance(value,(list,tuple)):
        return b'a'+str(len(value)).encode('ascii')+b':'+b''.join(canonical_bytes(part) for part in value)
    if isinstance(value,dict):
        if any(not isinstance(key,str) for key in value):raise ValueError('Canonical object keys must be strings')
        return b'o'+str(len(value)).encode('ascii')+b':'+b''.join(canonical_bytes(key)+canonical_bytes(value[key]) for key in sorted(value))
    raise ValueError('Unsupported canonical value')


def portable_hash(value):
    return hashlib.sha256(HASH_METHOD.encode('ascii')+b'\n'+canonical_bytes(value)).hexdigest()
