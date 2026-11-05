"""Golden protocol checks shared by Python and the offline Worker parity suite."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from portable_hash import HASH_METHOD,canonical_bytes,portable_hash


class PortableHashTests(unittest.TestCase):
    def test_golden_typed_tokens_and_hashes(self):
        self.assertEqual(HASH_METHOD,'mcat-typed-utf8-f64-v1')
        self.assertEqual(canonical_bytes(None),b'z')
        self.assertEqual(canonical_bytes(True),b't')
        self.assertEqual(canonical_bytes(False),b'f')
        self.assertEqual(canonical_bytes(1),b'n3ff0000000000000')
        self.assertEqual(portable_hash(None),'6fa277142de0f0951c7b3f3f39e5bcd1879d6ce62218d227599faf5855685e95')
        self.assertEqual(portable_hash(1),'151b02395d8dee2f8c4d5e13acd663409f6cd95d358deeb07d2bd8e0a15d5744')

    def test_whole_float_zero_and_type_distinctions(self):
        self.assertEqual(portable_hash(1),portable_hash(1.0))
        self.assertEqual(portable_hash(0),portable_hash(-0.0))
        self.assertNotEqual(portable_hash(1),portable_hash(True))
        self.assertNotEqual(portable_hash(1),portable_hash('1'))
        self.assertNotEqual(portable_hash([1,2]),portable_hash([2,1]))

    def test_utf8_byte_lengths_codepoint_order_and_unambiguous_structure(self):
        self.assertEqual(canonical_bytes('\U0001f30d'),b's4:\xf0\x9f\x8c\x8d')
        self.assertEqual(canonical_bytes({'\U00010000':False,'\ue000':True}),b'o2:s3:\xee\x80\x80ts4:\xf0\x90\x80\x80f')
        self.assertEqual(portable_hash({'2':1,'10':2}),'0f461412150828ca45e5979f1ab518d056c5fd72b668ebf6cc84eb46e84e2cf6')
        self.assertEqual(portable_hash({'b':1,'a':2}),portable_hash({'a':2,'b':1}))
        self.assertNotEqual(portable_hash(['a','bc']),portable_hash(['ab','c']))

    def test_unsupported_or_nonportable_values_rejected(self):
        for value in [float('nan'),float('inf'),-float('inf'),9007199254740992,10**1000,{1:'nonstring'},object()]:
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(ValueError):canonical_bytes(value)
        with self.assertRaises(UnicodeEncodeError):canonical_bytes('\ud800')


if __name__=='__main__':unittest.main()
