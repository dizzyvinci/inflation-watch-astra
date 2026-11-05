import {DurableObject} from 'cloudflare:workers';
import {ApiCollectorCore} from './api-collector-core.mjs';

export class ApiGrantCollector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.core = new ApiCollectorCore(ctx, env);
    });
  }
  async enqueueProbeRound(round) {await this.ready; return this.core.enqueueProbeRound(round);}
  async runOne() {await this.ready; return this.core.runOne();}
  async health() {await this.ready; return this.core.health();}
  async resumeAfterCredentialsReview(reference) {await this.ready; return this.core.resumeAfterCredentialsReview(reference);}
  // Even accidental HTTP exposure must not become an administrative endpoint.
  fetch() {return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});}
}

// No public administration route; the default fallback remains closed.
export default {fetch() {return new Response('Not found', {status: 404});}};
