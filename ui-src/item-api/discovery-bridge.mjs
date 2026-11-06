// WORK-only browser bridge. The client validates complete current-generation pages.
import {createIdentityDiscoveryClient} from './discovery-client.mjs';

export function searchIdentityView(value) {
  // This is a view adapter, not a second validator or a source of IDs/names.
  const {manifest,rows,mode}=value;
  return {
    itemCount:manifest.itemCount,
    pricedItemCount:manifest.sources.find(s=>s.operation==='prices').itemCount,
    indexHash:manifest.indexHash,
    priceProjectionGeneration:manifest.priceProjectionGeneration,
    mode,
    sourceSnapshots:manifest.sources.map(s=>({...s,capturedAt:s.retrievedAt})),
    rows:rows.map(r=>({
      ...r,
      name:r.name??`Item ${r.itemId} (name unavailable)`,
      memberships:r.memberships.map(m=>({...m,capturedAt:m.lastSeenRetrievedAt})),
      hasRetainedPriceSnapshot:r.memberships.some(m=>m.operation==='prices'),
      hasCurrentAcceptedPriceSnapshot:r.priceMembership==='in_committed_price_snapshot',
      retainedPriceCapturedAt:r.memberships.find(m=>m.operation==='prices')?.lastSeenRetrievedAt??null
    }))
  };
}

export function createSearchIdentityBridge(options={}) {
  const client=createIdentityDiscoveryClient(options);
  return Object.freeze({
    async load({signal}={}) {return searchIdentityView(await client.load({signal}));},
    state:()=>client.state()
  });
}
