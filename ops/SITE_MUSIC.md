# Licensed village music

This optional browser feature uses **Village Consort**, an original composition and recording by **Kevin MacLeod**, ISRC **USUAN1700007**, under **CC BY 4.0**. It is adjacent medieval-village music, not official MapleStory music or a MapleStory arrangement. No official MapleStory OST is included: the researched Nexon platform/content guides did not establish a general license to redistribute its soundtrack in a standalone website.

Primary source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700007

The composer-owned page loads its own `pieces.json` catalog, identifies this recording/MP3, and renders CC BY 4.0 attribution for it. The composer’s FAQ (https://incompetech.com/music/royalty-free/faq.html) confirms the music and recordings are copyrighted, offered for use with attribution. The licensing page (https://incompetech.com/music/royalty-free/licenses/) expressly offers free Creative Commons use with credit. License: https://creativecommons.org/licenses/by/4.0/ . These are affirmative licensed-composition and recording grounds, not an inference from a fan upload or a royalty-free label alone.

The original MP3 was captured 2026-11-05 12:35:04.161027 UTC, 6,876,000 bytes, SHA-256 `53861c78cb4c788f83b563d47fb4fa73bf4c66a8786d61215750738d856a8fd2`. The shipped MP3 is a disclosed 96 kbps / 44.1 kHz transcode with no musical rearrangement: 2,578,464 bytes, 214.804898 seconds, stereo MP3. SHA-256 `62a6f215a35b10416da741f5ed51938ea38b2dc3b7813d3a4aff984a09758243`. Browser looping repeats the complete track; no custom remix was made. Credits do not imply composer endorsement or extra restrictions on the CC-licensed audio.

Private primary HTML, catalog, original recording, composer-hosted license PDF, receipts and selected-track metadata are retained under the task’s `work/music-licenses/village-consort-20261105/` directory. That private folder must not be copied into public output. The Creative Commons legal-code ordinary HTTP request returned 403 and was not retried; the official deed was readable in the web tool and the composer’s linked license PDF was captured successfully.

## Parent integration

Add `site-music.css` and deferred `site-music.js` to the HTML/module export lists, after the footer/community modules. Add `tests/site-music.cjs` to the DOM test command. Existing `engine.py` copies all approved source `assets/` into the site; ensure the sanitized asset export allows these three files:

- `assets/village-consort-kevin-macleod-62a6f215a35b1041.mp3`
- `assets/site-music-attribution.txt`
- `assets/site-music-attribution.json`

The module creates one section immediately before the shared footer and does not rewrite any footer content. It has no fetch, third-party player, analytics or network API. Audio requests are same-origin only. The current CSP’s `default-src 'self'` permits this media; do not open broader media sources. Ordinary external composer/license links are followed only when the visitor chooses them. Do not precache the MP3 on initial load when saved Off; the module itself leaves `src` unset and `preload=none` in that state.

Default preference is On with volume 18%. A browser may reject the initial `play()` attempt; only an explicit music control retries it. Blocked autoplay displays “Tap to play.” Off pauses, clears the media source, cancels loading and is saved locally. Pause/Play and volume controls remain accessible. Storage denial keeps controls functional for the current tab. No global click/key handler triggers playback. Tests cover these behaviors and the actual shipped file’s hash/MP3 signature/size; audible playback and visual placement require parent browser QA. No build/export/deployment was performed by this task.
