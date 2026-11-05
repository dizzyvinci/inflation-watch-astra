# Ordered offline UI bundles

Bundling is opt-in: set `bundle_assets` to the Boolean `true` in `config.json`.
The missing/false setting preserves the individual scripts and stylesheets.
The module defaults off when the flag is absent. This project currently enables it in configuration; the module itself never deploys anything.

`engine.write_site` copies all original UI files and assets, then calls
`asset_bundles.bundle_site`. The bundler reads only that copied directory.
It preserves stylesheet order and external `defer` script order, keeps the
original `app.js` code as a standalone global script with a content-hashed URL,
emits a content-addressed
optional-module bundle before it and another after it, plus one CSS bundle,
all at the asset root. It writes
`ui-bundles.json`, and atomically switches **dist/index.html** last. Source
`web/index.html`, individual copied modules, data snapshots and history remain
unchanged. The local UI version marker is committed after bundling and hashes
the original module inputs plus the rewritten entry HTML. Data/source/check
clocks do not enter the bundle hash.

Referenced copied JS/CSS (including standalone `app.js`) and entry HTML are
normalized to UTF-8/LF before hashing. Changed copies are written atomically
before the generated files/entry switch. This makes the bundle names and
provenance stable across CRLF Windows copies, LF exports and public rebuilds.
Canonical `web` files, opaque fonts/artwork and immutable market JSON are not
normalized or rewritten. Disabling bundling keeps the normal copy behavior.

No downloads, minifier, package execution, `eval`, new inline script, framework
or runtime dependency is introduced. External scripts/styles, non-defer/module
scripts, media/integrity attributes, interleaved style/script content, sloppy
scripts and CSS import/charset/namespace rules fail closed before publication.
Only strict self-scoped arrow IIFEs enter the optional bundles. Each receives
a synchronous exception guard so one failing optional module does not stop
later modules. A failure dispatches the local `astrauimoduleerror` event with
only `{module: "validated-file.js", status: "initialization_failed"}`; the raw
error/message/stack is neither captured nor logged/transmitted. The original
app is not wrapped or rewritten beyond LF normalization, preserving its strict
global scope and separate script error boundary. Its normalized bytes are
copied exactly to `astra-app-<16 lowercase hex>.js`; the entry HTML loads that
hashed copy, while `app.js` is retained. Older cached HTML can therefore load
its matching older app when those verified immutable files are retained.
Generated JavaScript starts with a strict
directive and separates sources with newlines and semicolons. Root placement leaves existing relative image
and font URLs unchanged and works with the existing same-origin CSP.

## Export and cache integration

`asset_bundles.current_bundle_files(dist)` returns exactly the current manifest
and its four generated filenames (five files in total), or an empty tuple when
the index is unbundled.
It verifies the entry HTML hash, complete bundle SHA-256/content-address/size,
and all copied source hashes. It rejects incomplete/corrupt bundled output.
An old manifest and old hashed files may remain after opt-out; they are not
current export candidates. Export only this verified tuple, rather than a
broad wildcard for every retained bundle. Add `asset_bundles.py` to the explicit
source export allowlist. The manifest contains public filenames/hashes/sizes,
not secrets or market clocks.

Manifest schema version 2 includes `js` (two bundle records), `css` (one record),
`scriptOrder` (before-bundle filename, hashed app filename, after-bundle filename),
`preservedScripts` (`source: "app.js"`, hashed `file`, full `sha256`, `bytes`), and
`htmlSha256`. Each bundle has `file`, full `sha256`, `bytes` and ordered `inputs`
with those same provenance fields. Verification checks the preserved app too.

Generated names are `astra-ui-<16 lowercase hex>.js`/`.css` and
`astra-app-<16 lowercase hex>.js`. Public-launch
cache headers can mark those immutable; while the password gate remains,
its outer `private, no-store, no-transform` policy must still take precedence.
Bundling does not weaken the gate or change internal JSON cache freshness.

## Verification and limits

Run `python -m unittest discover -s tests -p test_asset_bundles.py` and
`node tests/asset-bundles.cjs` using the project's installed jsdom dependency.
Both create temporary directories; neither builds canonical dist, collects
provider data or deploys. Python verifies opt-out, ordering/strictness, safe
paths, deterministic hashes, original retention, atomic HTML switching,
export provenance, equivalent CRLF/LF fixtures and the real temporary
engine/UI-marker pipeline. The DOM
test loads **all actual deferred modules and CSS** using an intercepted
same-origin transport, comparing original versus bundled execution. It tests
model modes/3-day anchor, scenery, viewer/Escape, sprite autocomplete/item
history, Why50/privacy routes, unique IDs, unchanged data and zero provider or
optional tracking calls. Both immediate and delayed snapshot responses are
covered. A successive app revision changes only its hashed app URL; a cached
old generated index still loads its earlier matching app in the retained test
directory. Production retention/export of those verified previous files is a
separate release responsibility. Injected early optional-module failure leaves the app, later modules,
headline and tested flows usable with a sanitized failure event. A separate
test makes standalone app initialization throw and verifies the after-app
bundle still runs. Current resource count falls from 37 JS + 35 CSS requests
to three JS + one CSS (72 to 4, about 94% fewer UI requests). Bytes are not
minified, and artwork/data requests remain.

The guards isolate synchronous optional initialization failures; they do not
repair a failed module or absorb its asynchronous event/promise failures.
A syntax/download failure can still lose its whole optional bundle; the app
and other separate bundle remain independently loaded. Separate defer tags
also have different microtask checkpoints. The tests establish current
supported flows, not equivalence for every future module/browser failure.
The option remains off until reviewed; disable it and rebuild to restore the
original entry layout.
No throughput, browser-rendering or 10,000-user capacity claim follows from
reducing request count.
