"""Existing immutable Nov4 test evidence; never a production cache fallback."""
import hashlib
import json
from pathlib import Path

_PATH = Path(__file__).resolve().parent / 'fixtures/worker-historical-market-20261104.json'
_SHA = '0aa5f6abdd337f7c7448d4ef0ca93859f8e12e5705fb6642fc9ef4efcb125ce6'

def historical_market():
    raw = _PATH.read_bytes()
    if len(raw) > 8 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != _SHA:
        raise ValueError('historical_test_input_changed')
    return json.loads(raw)
