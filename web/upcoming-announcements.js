(() => {
'use strict';
// ui-src/upcoming-announcements/feed.json
var feed_default = {
  schemaVersion: 1,
  kind: "reviewed_classic_world_announcements",
  scope: {
    game: "MapleStory Classic World",
    region: "Global",
    targetWorld: "Windia",
    worldNameExplicitInReviewedPosts: false
  },
  reviewedAt: "2026-11-06T18:25:36.820292+00:00",
  coverage: {
    mode: "bounded_reviewed_primary_posts_not_exhaustive",
    automaticMonitoring: false,
    publicDiscordMessageContentsVerified: false,
    sourceIds: [
      "launch-46506",
      "cash-47031",
      "faq-45385"
    ]
  },
  sources: [
    {
      sourceId: "launch-46506",
      publisher: "Nexon",
      title: "Grand Launch Release Notes",
      url: "https://www.nexon.com/maplestory/news/general/46506/grand-launch-release-notes",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/46506",
      isMSCW: true,
      publishedAt: "2026-10-20T17:50:48Z",
      capturedAt: "2026-11-06T18:25:36.168774+00:00",
      bodySha256: "ba9a94b58f56515a7276339425bb5861f8f4ac3513c4f09020f5e7a71cb9798c"
    },
    {
      sourceId: "cash-47031",
      publisher: "Nexon",
      title: "Classic World Cash Shop Update: Nov. 4",
      url: "https://www.nexon.com/maplestory/news/general/47031/classic-world-cash-shop-update-nov-4",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/47031",
      isMSCW: true,
      publishedAt: "2026-11-03T16:00:00Z",
      capturedAt: "2026-11-06T18:25:35.765849+00:00",
      bodySha256: "027f2ced10bca9eae520cfc078cd7023314730b44c5ae89e4d3b9f012acaabe1"
    },
    {
      sourceId: "faq-45385",
      publisher: "Nexon",
      title: "MapleStory Classic World FAQ",
      url: "https://www.nexon.com/maplestory/news/general/45385/global-maple-story-classic-world-faq",
      cmsUrl: "https://g.nexonstatic.com/maplestory/cms/v1/news/45385",
      isMSCW: true,
      publishedAt: "2026-09-29T17:00:00Z",
      capturedAt: "2026-11-06T18:25:36.511094+00:00",
      bodySha256: "5ccc820a3c4bf3a9b675508ec853b4ce0b9d6b7875aa211cd55547abaf8dd3a2"
    }
  ],
  records: [
    {
      announcementId: "forgotten-hollow-november-2026",
      title: "Forgotten Hollow",
      kind: "world_update",
      status: "announced",
      date: {
        precision: "month",
        value: "2026-11",
        timeZone: null
      },
      summary: "The Grand Launch notes say this Classic World area is planned to open in November. The reviewed written notice gives no exact day, time or upcoming item lineup.",
      sourceIds: [
        "launch-46506"
      ],
      verifiedItems: [],
      nxPrice: null,
      rewardProbabilities: null,
      availabilityVerified: false,
      notes: "November 2026 follows the dated October 2026 notice. Exact roadmap days from community recaps are not independently verified primary evidence here."
    }
  ],
  referenceNotes: [
    {
      sourceId: "cash-47031",
      text: "The Nov. 4 cash-shop notice describes its scheduled sale window, not the next fashion lineup. A listed end at the start of Nov. 18 maintenance does not announce its replacement. Live shop availability was not checked."
    }
  ],
  limitations: [
    "No upcoming fashion or item reward lineup verified within this bounded primary review. This does not establish that no announcement exists.",
    "Windia is the user target; these Classic World articles do not separately name the world. No GMS/KMS or unrelated Worlds content is admitted.",
    "Unknown IDs, prices, probabilities and release times remain unknown. No future price, EV, stats or current-index effect is inferred."
  ]
};

// ui-src/upcoming-announcements/contract.mjs
var SHA = /^[a-f0-9]{64}$/;
var need = (v, c) => {
  if (!v) throw Error("upcoming_" + c);
};
var keys = (v, a) => need(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...a].sort().join(","), "fields");
var text = (v, max = 400) => need(typeof v === "string" && v.length > 0 && v.length <= max, "text");
var stamp = (v) => {
  text(v, 40);
  need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 19) === v.slice(0, 19), "clock");
};
var official = (v) => {
  const u = new URL(v);
  need(u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.hostname === "www.nexon.com" && /^\/maplestory\/news\/general\/[1-9]\d*\/[a-z0-9-]+$/.test(u.pathname), "official_source");
};
function freeze(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function validateAnnouncements(input) {
  const f = structuredClone(input);
  keys(f, ["schemaVersion", "kind", "scope", "reviewedAt", "coverage", "sources", "records", "referenceNotes", "limitations"]);
  need(f.schemaVersion === 1 && f.kind === "reviewed_classic_world_announcements", "profile");
  keys(f.scope, ["game", "region", "targetWorld", "worldNameExplicitInReviewedPosts"]);
  need(f.scope.game === "MapleStory Classic World" && f.scope.region === "Global" && f.scope.targetWorld === "Windia" && typeof f.scope.worldNameExplicitInReviewedPosts === "boolean", "edition");
  stamp(f.reviewedAt);
  keys(f.coverage, ["mode", "automaticMonitoring", "publicDiscordMessageContentsVerified", "sourceIds"]);
  need(f.coverage.mode === "bounded_reviewed_primary_posts_not_exhaustive" && f.coverage.automaticMonitoring === false && f.coverage.publicDiscordMessageContentsVerified === false, "coverage");
  need(Array.isArray(f.sources) && f.sources.length > 0 && f.sources.length <= 32 && Array.isArray(f.records) && f.records.length <= 128, "bound");
  const sourceIds = /* @__PURE__ */ new Set();
  for (const s of f.sources) {
    keys(s, ["sourceId", "publisher", "title", "url", "cmsUrl", "isMSCW", "publishedAt", "capturedAt", "bodySha256"]);
    text(s.sourceId, 80);
    need(!sourceIds.has(s.sourceId), "source_duplicate");
    sourceIds.add(s.sourceId);
    need(s.publisher === "Nexon" && s.isMSCW === true && typeof s.bodySha256 === "string" && SHA.test(s.bodySha256), "source");
    official(s.url);
    need(/^https:\/\/g\.nexonstatic\.com\/maplestory\/cms\/v1\/news\/[1-9]\d*$/.test(s.cmsUrl), "cms_source");
    need(new URL(s.url).pathname.split("/")[4] === s.cmsUrl.split("/").at(-1), "article_binding");
    stamp(s.publishedAt);
    stamp(s.capturedAt);
    need(Date.parse(s.publishedAt) <= Date.parse(s.capturedAt) && Date.parse(s.capturedAt) <= Date.parse(f.reviewedAt), "clock_order");
    text(s.title, 200);
  }
  const refs = (a) => need(Array.isArray(a) && a.length > 0 && new Set(a).size === a.length && a.every((id) => sourceIds.has(id)), "source_reference");
  refs(f.coverage.sourceIds);
  const ids = /* @__PURE__ */ new Set();
  for (const r of f.records) {
    keys(r, ["announcementId", "title", "kind", "status", "date", "summary", "sourceIds", "verifiedItems", "nxPrice", "rewardProbabilities", "availabilityVerified", "notes"]);
    text(r.announcementId, 100);
    need(!ids.has(r.announcementId), "record_duplicate");
    ids.add(r.announcementId);
    text(r.title, 200);
    text(r.summary, 600);
    text(r.notes, 500);
    need(["world_update", "fashion", "item"].includes(r.kind) && ["announced", "scheduled", "released", "cancelled"].includes(r.status), "state");
    refs(r.sourceIds);
    keys(r.date, ["precision", "value", "timeZone"]);
    need(["unknown", "month", "day", "instant"].includes(r.date.precision), "date_precision");
    if (r.date.precision !== "unknown") need(typeof r.date.value === "string", "date_value");
    if (r.date.precision === "unknown") need(r.date.value === null && r.date.timeZone === null, "unknown_date");
    if (r.date.precision === "month") need(/^\d{4}-(?:0[1-9]|1[0-2])$/.test(r.date.value) && r.date.timeZone === null, "month");
    if (r.date.precision === "day") need(/^\d{4}-\d\d-\d\d$/.test(r.date.value) && (/* @__PURE__ */ new Date(r.date.value + "T00:00:00Z")).toISOString().slice(0, 10) === r.date.value && r.date.timeZone === "UTC", "day");
    if (r.date.precision === "instant") {
      stamp(r.date.value);
      need(r.date.timeZone === "UTC", "zone");
    }
    need(r.status !== "scheduled" || ["day", "instant"].includes(r.date.precision), "scheduled_precision");
    need(Array.isArray(r.verifiedItems) && r.verifiedItems.length === 0 && r.nxPrice === null && r.rewardProbabilities === null && r.availabilityVerified === false, "unverified_economics");
  }
  need(Array.isArray(f.referenceNotes) && f.referenceNotes.length <= 16 && Array.isArray(f.limitations) && f.limitations.length > 0 && f.limitations.length <= 16, "notes");
  for (const n of f.referenceNotes) {
    keys(n, ["sourceId", "text"]);
    need(sourceIds.has(n.sourceId), "note_source");
    text(n.text, 600);
  }
  for (const n of f.limitations) text(n, 600);
  return freeze(f);
}
function dateLabel(date, instant) {
  if (date.precision === "unknown") return "Unknown";
  if (date.precision === "month") return "(" + date.value.slice(5) + "-" + date.value.slice(0, 4) + ") \xB7 month only; day/time unknown";
  if (date.precision === "day") return "(" + date.value.slice(5, 7) + "-" + date.value.slice(8) + "-" + date.value.slice(0, 4) + ") \xB7 UTC calendar day; time unknown";
  return instant(date.value);
}

// ui-src/upcoming-announcements/entry.mjs
var feed = validateAnnouncements(feed_default);
if (!window.AstraUpcomingAnnouncements) {
  let enabled = false, query = "", kind = "all", status = "all", sort = "title", ascending = true;
  const make = (tag, text2, cls) => {
    const n = document.createElement(tag);
    if (text2 !== void 0) n.textContent = text2;
    if (cls) n.className = cls;
    return n;
  };
  const options = document.getElementById("display-options"), content = document.getElementById("content"), nav = document.querySelector(".nav-wrap nav");
  const state = () => Object.freeze({ enabled, sourceReviewAt: feed.reviewedAt, verifiedUpcomingItemLineups: feed.records.filter((r) => r.kind !== "world_update" && ["announced", "scheduled"].includes(r.status)).length, automaticMonitoring: false });
  window.AstraUpcomingAnnouncements = Object.freeze({ getState: state });
  if (options && content && nav && !document.getElementById("view-upcoming-announcements")) {
    let instant = function(value) {
      let z = zone();
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: z });
      } catch {
        z = "UTC";
      }
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date(value)).filter((p2) => p2.type !== "literal").map((p2) => [p2.type, p2.value]));
      return "(" + p.month + "-" + p.day + "-" + p.year + " " + p.hour + ":" + p.minute + ":" + p.second + " " + p.timeZoneName + ")";
    }, sourceLink = function(s) {
      const a = make("a", s.title + " \u2197");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    }, draw = function() {
      link.hidden = !enabled;
      toggle.textContent = "Upcoming items page: " + (enabled ? "On" : "Off");
      toggle.setAttribute("aria-pressed", String(enabled));
      clocks.textContent = "Reviewed " + instant(feed.reviewedAt) + ".";
      const rows = feed.records.filter((r) => r.kind !== "world_update" && (kind === "all" || r.kind === kind) && (status === "all" || r.status === status) && (r.title + " " + r.kind + " " + r.status + " " + r.summary).toLowerCase().includes(query));
      const sortValue = (r) => sort === "date" ? r.date.value : r[sort];
      rows.sort((a, b) => {
        const av = sortValue(a), bv = sortValue(b);
        if (av === null) return bv === null ? a.title.localeCompare(b.title) : 1;
        if (bv === null) return -1;
        return (ascending ? 1 : -1) * String(av).localeCompare(String(bv)) || a.title.localeCompare(b.title);
      });
      result.textContent = rows.length + " matching fashion/item announcements in this review.";
      host.replaceChildren();
      const table = make("table"), head = make("thead"), tr = make("tr");
      for (const [key, label] of [["title", "Announcement"], ["status", "Status"], ["date", "Stated timing"], ["source", "Official source"]]) {
        const th = make("th");
        th.scope = "col";
        th.setAttribute("aria-sort", sort === key ? ascending ? "ascending" : "descending" : "none");
        if (["title", "kind", "status", "date"].includes(key)) {
          const b = make("button", label + (sort === key ? ascending ? " \u2191" : " \u2193" : ""));
          b.type = "button";
          b.dataset.upcomingSort = key;
          th.append(b);
        } else th.textContent = label;
        tr.append(th);
      }
      head.append(tr);
      table.append(head);
      const body = make("tbody");
      for (const r of rows) {
        const row = make("tr");
        row.dataset.announcementId = r.announcementId;
        const title = make("td");
        title.append(make("strong", r.title), make("p", r.summary));
        row.append(title);
        const statusCell = make("td"), dot = make("span", "\u25CF", "announcement-dot " + r.status);
        dot.setAttribute("aria-hidden", "true");
        statusCell.append(dot, document.createTextNode(" " + r.status[0].toUpperCase() + r.status.slice(1)));
        row.append(statusCell);
        const date = make("td", dateLabel(r.date, instant));
        date.dataset.sourceDatePrecision = r.date.precision;
        row.append(date);
        const source = make("td");
        for (const id of r.sourceIds) {
          const s = feed.sources.find((s2) => s2.sourceId === id), part = make("p");
          part.append(sourceLink(s));
          const published = make("time", instant(s.publishedAt));
          published.dateTime = s.publishedAt;
          const captured = make("time", instant(s.capturedAt));
          captured.dateTime = s.capturedAt;
          part.append(make("br"), document.createTextNode("Published "), published, make("br"), document.createTextNode("Retrieved "), captured);
          source.append(part);
        }
        row.append(source);
        body.append(row);
      }
      if (!rows.length) {
        const empty = make("tr"), cell = make("td", "No matching verified fashion or item announcement in this review.");
        cell.colSpan = 4;
        empty.append(cell);
        body.append(empty);
      }
      table.append(body);
      host.append(table);
      world.replaceChildren();
      const worldRows = feed.records.filter((r) => r.kind === "world_update");
      if (worldRows.length) {
        world.append(make("h2", "Separate world-update context"));
        for (const r of worldRows) {
          const card = make("p");
          card.dataset.worldAnnouncement = r.announcementId;
          const when = make("span", dateLabel(r.date, instant));
          when.dataset.sourceDatePrecision = r.date.precision;
          card.append(make("strong", r.title + " \xB7 " + r.status + " "), when, document.createTextNode(". " + r.summary + " "), sourceLink(feed.sources.find((s) => s.sourceId === r.sourceIds[0])));
          world.append(card);
        }
      }
      refs.replaceChildren(make("summary", "Official sources and review details"));
      refs.append(make("p", "This is a dated, bounded manual review, not an automatic announcement feed. Publication/retrieval clocks are separate from release timing and market/trade clocks. Unknown item IDs, NX prices and probabilities are not zero, and no EV or index impact is calculated. Announced/Scheduled are not release confirmations; Released is a source claim, not current shop stock. Calendar passage never changes a record\u2019s status."));
      for (const s of feed.sources) {
        const para = make("p");
        para.append(sourceLink(s));
        const published = make("time", instant(s.publishedAt));
        published.dateTime = s.publishedAt;
        const captured = make("time", instant(s.capturedAt));
        captured.dateTime = s.capturedAt;
        para.append(make("br"), document.createTextNode("Published "), published, document.createTextNode(" \xB7 retrieved "), captured);
        refs.append(para);
      }
      for (const n of feed.referenceNotes) {
        const para = make("p", n.text + " ");
        para.append(sourceLink(feed.sources.find((s) => s.sourceId === n.sourceId)));
        refs.append(para);
      }
      for (const n of feed.limitations) refs.append(make("p", n));
    }, route = function() {
      if (location.hash === "#upcoming-announcements") {
        if (!enabled) {
          view.hidden = true;
          location.hash = "#index";
          return;
        }
        document.querySelectorAll(".view").forEach((s) => s.hidden = s !== view);
        link.setAttribute("aria-current", "page");
      } else {
        view.hidden = true;
        link.setAttribute("aria-current", "false");
      }
    };
    const zone = () => document.getElementById("display-timezone")?.value || "UTC";
    const controls = make("div", void 0, "upcoming-options");
    controls.dataset.previewControls = "upcoming-announcements";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Upcoming announcements visibility");
    const toggle = make("button");
    toggle.type = "button";
    toggle.className = "upcoming-toggle";
    toggle.setAttribute("aria-controls", "view-upcoming-announcements upcoming-announcements-nav");
    controls.append(toggle, make("small", "Optional dated official-news review. Off by default in each tab; no announcement polling or model changes."));
    options.append(controls);
    const link = make("a", "Upcoming items", "nav-link");
    link.id = "upcoming-announcements-nav";
    link.href = "#upcoming-announcements";
    link.hidden = true;
    nav.querySelector(".fallback-link")?.before(link);
    if (!link.isConnected) nav.append(link);
    const view = make("section", void 0, "view upcoming-page");
    view.id = "view-upcoming-announcements";
    view.hidden = true;
    view.setAttribute("aria-labelledby", "upcoming-announcements-title");
    const h = make("h1", "Upcoming fashion & items");
    h.id = "upcoming-announcements-title";
    view.append(
      make("p", "Classic World / official announcements", "eyebrow"),
      h,
      make("p", "No upcoming fashion or item lineup is verified in the reviewed official posts.", "upcoming-scope")
    );
    const clocks = make("p", void 0, "upcoming-clocks");
    view.append(clocks);
    const searchLabel = make("label", "Search reviewed announcements "), search = make("input");
    search.type = "search";
    search.id = "upcoming-announcements-search";
    search.placeholder = "Title, category or status";
    searchLabel.append(search);
    const filterLabel = make("label", "Category "), filter = make("select");
    filter.id = "upcoming-announcements-kind";
    for (const [value, label] of [["all", "Fashion and items"], ["fashion", "Fashion"], ["item", "Items"]]) {
      const o = make("option", label);
      o.value = value;
      filter.append(o);
    }
    filterLabel.append(filter);
    const statusLabel = make("label", "Status "), statusFilter = make("select");
    statusFilter.id = "upcoming-announcements-status";
    for (const value of ["all", "announced", "scheduled", "released", "cancelled"]) {
      const o = make("option", value[0].toUpperCase() + value.slice(1));
      o.value = value;
      statusFilter.append(o);
    }
    statusLabel.append(statusFilter);
    const form = make("div", void 0, "upcoming-filters");
    form.append(searchLabel, filterLabel, statusLabel);
    view.append(form);
    const result = make("p", void 0, "upcoming-results");
    result.setAttribute("role", "status");
    view.append(result);
    const host = make("div", void 0, "table-wrap upcoming-table");
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Scrollable reviewed announcements");
    host.tabIndex = 0;
    view.append(host);
    const legend = make("p", "Status: yellow Announced / Scheduled \xB7 green Released \xB7 red Cancelled.", "upcoming-legend");
    view.append(legend);
    const world = make("section", void 0, "upcoming-world-context");
    world.setAttribute("aria-label", "Separate world-update context");
    view.append(world);
    const refs = make("details", void 0, "upcoming-sources");
    view.append(refs);
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      draw();
      route();
    });
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      draw();
    });
    filter.addEventListener("change", () => {
      kind = filter.value;
      draw();
    });
    statusFilter.addEventListener("change", () => {
      status = statusFilter.value;
      draw();
    });
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upcoming-sort]");
      if (!b) return;
      ascending = sort === b.dataset.upcomingSort ? !ascending : true;
      sort = b.dataset.upcomingSort;
      draw();
      host.querySelector('[data-upcoming-sort="' + sort + '"]')?.focus();
    });
    document.getElementById("display-timezone")?.addEventListener("change", draw);
    content.append(view);
    window.addEventListener("hashchange", route);
    draw();
    route();
  }
}

})();
