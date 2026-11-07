import {existsSync} from 'node:fs';
const contract=new URL('../ops/stamp-reference-contract.mjs',import.meta.url);
const {loadStampReferenceDefinition,serializeStampReferenceCapture}=await import((existsSync(contract)?contract:new URL('../site/ops/stamp-reference-contract.mjs',import.meta.url)).href);
const definition=await loadStampReferenceDefinition(),at=process.argv[2]??'2026-11-06T10:00:00.000Z';
const rows=definition.rows.map((r,index)=>index===0?[r[0],'verified_exact_identity','12345.123456789012345678901234567890123','23456.7',12,4,7]:[r[0],'absent_from_capture',null,null,null,null,null]);
const packed=await serializeStampReferenceCapture({schemaVersion:1,kind:'stamp_reference_median_capture',definitionHash:definition.definitionHash,registryArtifactSha256:definition.registryArtifactSha256,source:{capturedAt:at,rawBodySha256:'b'.repeat(64),reportedWindowDays:3,exactWindowBoundsKnown:false,sourceObservedAt:null},sourcePricesSnapshotItemCount:1,rows,coverage:{targetItemTypes:219,presentSnapshotIds:1,verifiedIdentityTypes:1,positiveAskingMedianTypes:1,positiveSaleMedianTypes:1},qualifiedIndividualTrades:0,activeAvailabilityVerified:false,minimumOfferVerified:false},{definition});
process.stdout.write(packed.body);
