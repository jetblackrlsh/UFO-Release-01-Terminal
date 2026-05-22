const LIVE_CSV_URL = "https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv";

let payload = window.UFO_RELEASE_DATA;
let records = [];
let imageCount = 0;
let videoCount = 0;

const state = {
  query: "",
  agencies: new Set(),
  fileTypes: new Set(),
  releaseDate: "",
  incidentDate: "",
  location: "",
  sort: "signal",
  view: "list",
};

const els = {
  totalFiles: document.querySelector("#totalFiles"),
  imageFiles: document.querySelector("#imageFiles"),
  videoFiles: document.querySelector("#videoFiles"),
  visibleFiles: document.querySelector("#visibleFiles"),
  activeFilters: document.querySelector("#activeFilters"),
  searchInput: document.querySelector("#searchInput"),
  agencyFilters: document.querySelector("#agencyFilters"),
  typeFilters: document.querySelector("#typeFilters"),
  releaseDateFilter: document.querySelector("#releaseDateFilter"),
  incidentDateFilter: document.querySelector("#incidentDateFilter"),
  locationFilter: document.querySelector("#locationFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  clearFilters: document.querySelector("#clearFilters"),
  listViewButton: document.querySelector("#listViewButton"),
  galleryViewButton: document.querySelector("#galleryViewButton"),
  videoViewButton: document.querySelector("#videoViewButton"),
  resultStatus: document.querySelector("#resultStatus"),
  filterReadout: document.querySelector("#filterReadout"),
  dataStatus: document.querySelector("#dataStatus"),
  resultsList: document.querySelector("#resultsList"),
  imageGallery: document.querySelector("#imageGallery"),
  videoGallery: document.querySelector("#videoGallery"),
  emptyState: document.querySelector("#emptyState"),
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCSV(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (cell || row.length) {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && nextChar === "\n") i += 1;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(csvText) {
  const rows = parseCSV(csvText).filter((row) => row.some(Boolean));
  const headers = rows.shift() || [];
  return rows.map((row) =>
    headers.reduce((record, header, index) => {
      if (header) record[header] = row[index] || "";
      return record;
    }, {})
  );
}

function buildPayloadFromCsv(csvText, sourceUrl = LIVE_CSV_URL) {
  const sourceRows = rowsToObjects(csvText).filter((row) => row.Title || row["PDF | Image Link"] || row["DVIDS Video ID"]);
  const recordsFromCsv = sourceRows.map((row, index) => normalizeSourceRecord(row, index + 1));

  return {
    generatedFrom: sourceUrl,
    generatedAt: new Date().toISOString(),
    sourceUrl,
    total: recordsFromCsv.length,
    records: recordsFromCsv,
  };
}

function normalizeSourceRecord(row, id) {
  const originalTitle = cleanValue(row.Title, `PURSUE record ${id}`);
  const fileType = normalizeFileType(row.Type, row["PDF | Image Link"]);
  const dvidsVideoId = cleanValue(row["DVIDS Video ID"]);
  const fileUrl = cleanValue(row["PDF | Image Link"]);
  const actionUrl = getActionUrl(fileType, dvidsVideoId, fileUrl);
  const actionSource = getActionSource(fileType, dvidsVideoId, actionUrl);
  const descriptiveTitle = createDescriptiveTitle(originalTitle, row["Video Title"]);

  return {
    id,
    releaseDate: cleanValue(row["Release Date"], "N/A"),
    originalTitle,
    fileType,
    videoPairing: cleanValue(row["Video Pairing"]),
    pdfPairing: cleanValue(row["PDF Pairing"]),
    previewText: cleanValue(row["Description Blurb"]),
    dvidsVideoId,
    videoTitle: cleanValue(row["Video Title"]),
    agency: cleanValue(row.Agency, "Unknown agency"),
    incidentDate: cleanValue(row["Incident Date"], "N/A"),
    incidentLocation: cleanValue(row["Incident Location"], "N/A"),
    fileUrl,
    actionUrl,
    actionSource,
    thumbnailUrl: cleanValue(row["Modal Image"]),
    imageAltText: cleanValue(row["Image Alt Text"]),
    imageVirin: cleanValue(row["Image VIRIN"]),
    descriptiveTitle,
    descriptiveFilename: createDescriptiveFilename(descriptiveTitle, originalTitle, fileType, actionUrl),
    tags: createTags(row, fileType),
    signalScore: createSignalScore(row, fileType, dvidsVideoId),
  };
}

function cleanValue(value, fallback = "") {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function normalizeFileType(type, url) {
  const explicitType = cleanValue(type).replace(/^\./, "").toUpperCase();
  if (explicitType) return explicitType;

  const extension = getUrlExtension(url).replace(/^\./, "").toUpperCase();
  if (["JPG", "JPEG", "PNG", "GIF", "WEBP"].includes(extension)) return "IMG";
  if (["MP4", "MOV", "WEBM", "OGG"].includes(extension)) return "VID";
  if (["MP3", "WAV", "M4A"].includes(extension)) return "AUD";
  return extension || "PDF";
}

function getUrlExtension(url) {
  const match = String(url || "")
    .split("?")[0]
    .match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : "";
}

function getActionUrl(fileType, dvidsVideoId, fileUrl) {
  if (dvidsVideoId && fileType === "VID") return `https://www.dvidshub.net/video/${dvidsVideoId}`;
  return fileUrl || (dvidsVideoId ? `https://www.dvidshub.net/video/${dvidsVideoId}` : "");
}

function getActionSource(fileType, dvidsVideoId, actionUrl) {
  if (dvidsVideoId && fileType === "VID") return "DVIDS";
  if (!actionUrl) return "Source unavailable";
  if (actionUrl.includes("war.gov")) return "WAR media";
  try {
    return new URL(actionUrl).hostname.replace(/^www\./, "");
  } catch {
    return "External source";
  }
}

function createDescriptiveTitle(originalTitle, videoTitle) {
  const sourceTitle = cleanValue(videoTitle) || originalTitle;
  const withoutExtension = sourceTitle.replace(/\.[a-z0-9]+$/i, "");
  const withoutRecordCode = withoutExtension.replace(/^[A-Z0-9-]+,\s*/i, "");
  return withoutRecordCode
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^"(.+)"$/, "$1")
    .trim();
}

function createDescriptiveFilename(descriptiveTitle, originalTitle, fileType, actionUrl) {
  const extension = getDownloadExtension(fileType, actionUrl);
  const slugSource = descriptiveTitle || originalTitle || "pursue-record";
  const slug = slugSource
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${slug || "pursue-record"}${extension}`;
}

function getDownloadExtension(fileType, actionUrl) {
  const urlExtension = getUrlExtension(actionUrl);
  if (urlExtension) return urlExtension;
  if (fileType === "VID") return ".mp4";
  if (fileType === "AUD") return ".mp3";
  if (fileType === "IMG") return ".jpg";
  return ".pdf";
}

function createTags(row, fileType) {
  const text = normalize(
    [
      row.Title,
      row["Description Blurb"],
      row.Agency,
      row["Incident Location"],
      row["Image Alt Text"],
      fileType,
    ].join(" ")
  );
  const tagRules = [
    ["uap", /\buap\b/],
    ["ufo", /\bufo\b|\bufos\b/],
    ["orb", /\borb\b|\borbs\b/],
    ["disc", /\bdisc\b|\bdiscs\b|\bflying disc/],
    ["fireball", /\bfireball/],
    ["infrared", /\binfrared\b|\bir\b/],
    ["radar", /\bradar\b/],
    ["sensor", /\bsensor\b/],
    ["pilot", /\bpilot\b|\baircraft\b/],
    ["satellite", /\bsatellite\b|\bapollo\b|\bnasa\b/],
    ["report", /\breport\b|\bnarrative\b|\bcable\b/],
    ["photo", /\bphoto\b|\bimage\b|\bimagery\b/],
    ["video", /\bvideo\b|\bfootage\b/],
    ["audio", /\baudio\b|\btape\b/],
  ];
  return tagRules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag).slice(0, 8);
}

function createSignalScore(row, fileType, dvidsVideoId) {
  const text = normalize([row.Title, row["Description Blurb"], row["Incident Location"], row["Image Alt Text"]].join(" "));
  let score = 12;
  if (fileType === "VID") score += 28;
  if (fileType === "IMG") score += 22;
  if (fileType === "AUD") score += 18;
  if (dvidsVideoId) score += 8;
  if (/\borb\b|\borbs\b/.test(text)) score += 12;
  if (/\binfrared\b|\bsensor\b|\bradar\b/.test(text)) score += 10;
  if (/\balien\b|\bextraterrestrial\b/.test(text)) score += 8;
  if (/\bphoto\b|\bimage\b|\bimagery\b/.test(text)) score += 7;
  if (/\bpilot\b|\baircraft\b|\bhelicopter\b/.test(text)) score += 6;
  if (/\bredaction\b|\bredacted\b/.test(text)) score += 4;
  return Math.min(score, 99);
}

function hydrateData(nextPayload, statusText) {
  payload = nextPayload;
  records = payload.records.map((record) => ({
    ...record,
    tags: record.tags || [],
    searchable: normalize(
      [
        record.descriptiveTitle,
        record.descriptiveFilename,
        record.originalTitle,
        record.previewText,
        record.agency,
        record.releaseDate,
        record.incidentDate,
        record.incidentLocation,
        record.fileType,
        (record.tags || []).join(" "),
      ].join(" ")
    ),
  }));
  imageCount = records.filter((record) => record.fileType === "IMG").length;
  videoCount = records.filter((record) => record.fileType === "VID").length;
  pruneSelectedValues();
  buildControls();
  if (statusText && els.dataStatus) els.dataStatus.textContent = statusText;
}

function pruneSelectedValues() {
  const agencies = new Set(records.map((record) => displayValue(record.agency)));
  const fileTypes = new Set(records.map((record) => displayValue(record.fileType)));
  state.agencies = new Set([...state.agencies].filter((value) => agencies.has(value)));
  state.fileTypes = new Set([...state.fileTypes].filter((value) => fileTypes.has(value)));

  if (state.releaseDate && !records.some((record) => record.releaseDate === state.releaseDate)) state.releaseDate = "";
  if (state.incidentDate && !records.some((record) => record.incidentDate === state.incidentDate)) state.incidentDate = "";
  if (state.location && !records.some((record) => record.incidentLocation === state.location)) state.location = "";
}

function buildControls() {
  buildCheckboxes(els.agencyFilters, "agency", state.agencies);
  buildCheckboxes(els.typeFilters, "fileType", state.fileTypes);
  buildSelect(els.releaseDateFilter, "releaseDate", "All release dates");
  buildSelect(els.incidentDateFilter, "incidentDate", "All incident dates");
  buildSelect(els.locationFilter, "incidentLocation", "All locations");
  els.releaseDateFilter.value = state.releaseDate;
  els.incidentDateFilter.value = state.incidentDate;
  els.locationFilter.value = state.location;
}

async function refreshFromLiveCsv() {
  if (els.dataStatus) els.dataStatus.textContent = "Checking WAR.gov for the latest release data...";

  try {
    const response = await fetch(LIVE_CSV_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`WAR.gov CSV returned ${response.status}`);

    const csvText = await response.text();
    const livePayload = buildPayloadFromCsv(csvText);
    if (livePayload.total < payload.total) {
      throw new Error(`live CSV had fewer records than the bundled snapshot (${livePayload.total} < ${payload.total})`);
    }

    hydrateData(livePayload, `Live WAR.gov CSV loaded: ${livePayload.total} records.`);
    render();
  } catch (error) {
    if (els.dataStatus) {
      els.dataStatus.textContent = `Bundled snapshot in use; live refresh unavailable (${error.message}).`;
    }
  }
}

function displayValue(value) {
  return value && value.trim() ? value : "Unknown";
}

function countBy(field) {
  return records.reduce((counts, record) => {
    const value = displayValue(record[field]);
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map());
}

function sortFacetEntries(entries) {
  return [...entries].sort(([a], [b]) => {
    const special = new Set(["N/A", "Unknown"]);
    if (special.has(a) && !special.has(b)) return 1;
    if (!special.has(a) && special.has(b)) return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

function buildCheckboxes(container, field, selectedSet) {
  container.replaceChildren();
  for (const [value, count] of sortFacetEntries(countBy(field))) {
    const id = `${field}-${value}`.replace(/[^a-z0-9]+/gi, "-");
    const label = document.createElement("label");
    label.className = "filter-check";
    label.htmlFor = id;
    label.innerHTML = `
      <input id="${id}" type="checkbox" value="${escapeAttr(value)}" ${selectedSet.has(value) ? "checked" : ""} />
      <span>${escapeHtml(value)}</span>
      <span class="count">${count}</span>
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) {
        selectedSet.add(value);
      } else {
        selectedSet.delete(value);
      }
      render();
    });
    container.append(label);
  }
}

function buildSelect(select, field, allLabel) {
  const values = sortFacetEntries(countBy(field)).map(([value]) => value);
  select.replaceChildren(new Option(allLabel, ""));
  for (const value of values) {
    select.add(new Option(value, value));
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function highlight(text) {
  const value = escapeHtml(text);
  const terms = normalize(state.query)
    .split(" ")
    .filter((term) => term.length > 2)
    .slice(0, 6);
  if (!terms.length) return value;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return value.replace(pattern, "<mark>$1</mark>");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeFilterCount() {
  let count = 0;
  if (state.query) count += 1;
  count += state.agencies.size;
  count += state.fileTypes.size;
  if (state.releaseDate) count += 1;
  if (state.incidentDate) count += 1;
  if (state.location) count += 1;
  return count;
}

function getFilteredRecords() {
  const terms = normalize(state.query).split(" ").filter(Boolean);
  return records
    .filter((record) => {
      if (state.agencies.size && !state.agencies.has(record.agency)) return false;
      if (state.fileTypes.size && !state.fileTypes.has(record.fileType)) return false;
      if (state.releaseDate && record.releaseDate !== state.releaseDate) return false;
      if (state.incidentDate && record.incidentDate !== state.incidentDate) return false;
      if (state.location && record.incidentLocation !== state.location) return false;
      return terms.every((term) => record.searchable.includes(term));
    })
    .sort(compareRecords);
}

function getVisibleRecords() {
  const filtered = getFilteredRecords();
  if (state.view === "gallery") {
    return filtered.filter((record) => record.fileType === "IMG");
  }
  if (state.view === "video") {
    return filtered.filter((record) => record.fileType === "VID");
  }
  return filtered;
}

function compareRecords(a, b) {
  switch (state.sort) {
    case "agency":
      return compareText(a.agency, b.agency) || compareText(a.descriptiveTitle, b.descriptiveTitle);
    case "location":
      return compareText(a.incidentLocation, b.incidentLocation) || b.signalScore - a.signalScore;
    case "incidentDate":
      return compareText(a.incidentDate, b.incidentDate) || b.signalScore - a.signalScore;
    case "title":
      return compareText(a.descriptiveFilename, b.descriptiveFilename);
    case "type":
      return compareText(a.fileType, b.fileType) || b.signalScore - a.signalScore;
    case "signal":
    default:
      return b.signalScore - a.signalScore || compareText(a.descriptiveTitle, b.descriptiveTitle);
  }
}

function compareText(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function render() {
  const filtered = getVisibleRecords();
  const active = activeFilterCount();
  const noun = state.view === "gallery" ? "images" : state.view === "video" ? "videos" : "files";

  els.totalFiles.textContent = payload.total;
  els.imageFiles.textContent = imageCount;
  els.videoFiles.textContent = videoCount;
  els.visibleFiles.textContent = filtered.length;
  els.activeFilters.textContent = active;
  els.resultStatus.textContent = resultStatusText(filtered.length);
  els.filterReadout.textContent = active ? describeActiveFilters() : defaultReadout();
  els.listViewButton.classList.toggle("is-active", state.view === "list");
  els.galleryViewButton.classList.toggle("is-active", state.view === "gallery");
  els.videoViewButton.classList.toggle("is-active", state.view === "video");
  els.listViewButton.setAttribute("aria-pressed", String(state.view === "list"));
  els.galleryViewButton.setAttribute("aria-pressed", String(state.view === "gallery"));
  els.videoViewButton.setAttribute("aria-pressed", String(state.view === "video"));

  els.emptyState.hidden = filtered.length > 0;
  els.resultsList.hidden = state.view !== "list" || filtered.length === 0;
  els.imageGallery.hidden = state.view !== "gallery" || filtered.length === 0;
  els.videoGallery.hidden = state.view !== "video" || filtered.length === 0;
  els.emptyState.querySelector("strong").textContent = `No matching ${noun}`;

  if (state.view === "gallery") {
    els.resultsList.replaceChildren();
    els.videoGallery.replaceChildren();
    els.imageGallery.replaceChildren(...filtered.map(renderGalleryItem));
  } else if (state.view === "video") {
    els.resultsList.replaceChildren();
    els.imageGallery.replaceChildren();
    els.videoGallery.replaceChildren(...filtered.map(renderVideoItem));
  } else {
    els.imageGallery.replaceChildren();
    els.videoGallery.replaceChildren();
    els.resultsList.replaceChildren(...filtered.map(renderRecord));
  }
}

function resultStatusText(count) {
  if (state.view === "gallery") return `${count} of ${imageCount} images visible`;
  if (state.view === "video") return `${count} of ${videoCount} videos visible`;
  return `${count} of ${payload.total} files visible`;
}

function defaultReadout() {
  if (state.view === "gallery") {
    return "Gallery mode shows image files only while preserving keyword and metadata filters.";
  }
  if (state.view === "video") {
    return "Video gallery embeds DVIDS players for direct browsing and playback.";
  }
  return "Search generated names, original names, metadata, and preview text.";
}

function describeActiveFilters() {
  const parts = [];
  if (state.query) parts.push(`keyword: "${state.query}"`);
  if (state.agencies.size) parts.push(`agency: ${[...state.agencies].join(", ")}`);
  if (state.fileTypes.size) parts.push(`type: ${[...state.fileTypes].join(", ")}`);
  if (state.releaseDate) parts.push(`release: ${state.releaseDate}`);
  if (state.incidentDate) parts.push(`incident date: ${state.incidentDate}`);
  if (state.location) parts.push(`location: ${state.location}`);
  return parts.join(" · ");
}

function renderRecord(record) {
  const card = document.createElement("article");
  card.className = `release-card${record.signalScore >= 60 ? " high-signal" : ""}${
    record.fileType === "IMG" ? " has-image" : ""
  }`;

  const tags = record.tags.length
    ? `<div class="tag-list">${record.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
  const actionLabel = record.actionSource === "WAR media" ? "Download" : "Open file";
  const actionTitle =
    record.actionSource === "WAR media"
      ? `Download ${record.descriptiveFilename}`
      : `Open ${record.actionSource} page for ${record.descriptiveFilename}`;
  const imagePreview =
    record.fileType === "IMG"
      ? `
        <a class="inline-image-preview" href="${escapeAttr(record.actionUrl)}" target="_blank" rel="noreferrer" aria-label="Open image preview for ${escapeAttr(record.descriptiveTitle)}">
          <img src="${escapeAttr(record.thumbnailUrl || record.fileUrl)}" alt="${escapeAttr(record.descriptiveTitle)}" loading="lazy" />
          <span>Image preview</span>
        </a>
      `
      : "";

  card.innerHTML = `
    <div class="record-main">
      <div class="record-kicker">
        <span>#${String(record.id).padStart(3, "0")}</span>
        <span class="type-chip">${escapeHtml(record.fileType)}</span>
        <span>${escapeHtml(record.agency)}</span>
        <span class="score-chip">signal ${record.signalScore}</span>
      </div>
      <h2 class="record-title">${highlight(record.descriptiveTitle)}</h2>
      <div class="filename-row">
        <span>Generated filename: <code>${highlight(record.descriptiveFilename)}</code></span>
        <span>Original filename: <code>${highlight(record.originalTitle)}</code></span>
      </div>
      <div class="meta-grid" aria-label="File metadata">
        <div><span>Release date</span><strong>${escapeHtml(record.releaseDate || "Unknown")}</strong></div>
        <div><span>Incident date</span><strong>${escapeHtml(record.incidentDate || "Unknown")}</strong></div>
        <div><span>Location</span><strong>${escapeHtml(record.incidentLocation || "Unknown")}</strong></div>
        <div><span>Action source</span><strong>${escapeHtml(record.actionSource)}</strong></div>
      </div>
      <p class="preview">${highlight(record.previewText || "No preview text provided in the source catalog.")}</p>
      ${tags}
    </div>
    ${imagePreview}
    <div class="record-actions">
      <a class="download-button" href="${escapeAttr(record.actionUrl)}" target="_blank" rel="noreferrer" download="${escapeAttr(record.descriptiveFilename)}" title="${escapeAttr(actionTitle)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
        </svg>
        ${actionLabel}
      </a>
      <div class="action-source">${escapeHtml(record.actionSource)}</div>
    </div>
  `;
  attachImageFallback(card, record);
  return card;
}

function renderGalleryItem(record) {
  const item = document.createElement("article");
  item.className = "gallery-item";
  const actionLabel = record.actionSource === "WAR media" ? "Download" : "Open file";

  item.innerHTML = `
    <a class="gallery-image-link" href="${escapeAttr(record.actionUrl)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeAttr(record.descriptiveTitle)}">
      <img src="${escapeAttr(record.thumbnailUrl || record.fileUrl)}" alt="${escapeAttr(record.descriptiveTitle)}" loading="lazy" />
    </a>
    <div class="gallery-copy">
      <div class="record-kicker">
        <span>#${String(record.id).padStart(3, "0")}</span>
        <span class="type-chip">${escapeHtml(record.fileType)}</span>
        <span>${escapeHtml(record.agency)}</span>
      </div>
      <h2 class="gallery-title">${highlight(record.descriptiveTitle)}</h2>
      <div class="filename-row">
        <span>Generated filename: <code>${highlight(record.descriptiveFilename)}</code></span>
        <span>Original filename: <code>${highlight(record.originalTitle)}</code></span>
      </div>
      <div class="gallery-meta">
        <span>${escapeHtml(record.incidentLocation || "Unknown location")}</span>
        <span>${escapeHtml(record.incidentDate || "Unknown date")}</span>
      </div>
      <p class="preview">${highlight(record.previewText || "No preview text provided in the source catalog.")}</p>
      <a class="download-button" href="${escapeAttr(record.actionUrl)}" target="_blank" rel="noreferrer" download="${escapeAttr(record.descriptiveFilename)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
        </svg>
        ${actionLabel}
      </a>
    </div>
  `;
  attachImageFallback(item, record);
  return item;
}

function renderVideoItem(record) {
  const item = document.createElement("article");
  item.className = "video-item";
  const dvidsUrl = record.dvidsVideoId ? `https://www.dvidshub.net/video/${record.dvidsVideoId}` : record.actionUrl;
  const embedUrl = record.dvidsVideoId ? `https://www.dvidshub.net/video/embed/${record.dvidsVideoId}` : "";
  const reportLink =
    record.fileUrl && record.fileUrl !== dvidsUrl
      ? `
        <a class="secondary-link" href="${escapeAttr(record.fileUrl)}" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h6M10 17h6" />
          </svg>
          Open report
        </a>
      `
      : "";
  const player = embedUrl
    ? `
      <iframe
        title="${escapeAttr(record.descriptiveTitle)}"
        src="${escapeAttr(embedUrl)}"
        loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    `
    : `
      <div class="video-unavailable">
        <strong>Player unavailable</strong>
        <span>Open the external source to view this video.</span>
      </div>
    `;

  item.innerHTML = `
    <div class="video-frame">
      ${player}
    </div>
    <div class="video-copy">
      <div class="record-kicker">
        <span>#${String(record.id).padStart(3, "0")}</span>
        <span class="type-chip">${escapeHtml(record.fileType)}</span>
        <span>${escapeHtml(record.agency)}</span>
        ${record.dvidsVideoId ? `<span>DVIDS ${escapeHtml(record.dvidsVideoId)}</span>` : ""}
      </div>
      <h2 class="gallery-title">${highlight(record.descriptiveTitle)}</h2>
      <div class="filename-row">
        <span>Generated filename: <code>${highlight(record.descriptiveFilename)}</code></span>
        <span>Original filename: <code>${highlight(record.originalTitle)}</code></span>
      </div>
      <div class="gallery-meta">
        <span>${escapeHtml(record.incidentLocation || "Unknown location")}</span>
        <span>${escapeHtml(record.incidentDate || "Unknown date")}</span>
        <span>${escapeHtml(record.actionSource)}</span>
      </div>
      <p class="preview">${highlight(record.previewText || "No preview text provided in the source catalog.")}</p>
      <div class="video-actions">
        <a class="download-button" href="${escapeAttr(dvidsUrl)}" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5h14v14H5zM10 9l5 3-5 3z" />
          </svg>
          Open DVIDS
        </a>
        ${reportLink}
      </div>
    </div>
  `;
  return item;
}

function attachImageFallback(root, record) {
  const img = root.querySelector("img");
  if (!img) return;
  let triedFullSource = false;

  img.addEventListener("error", () => {
    if (!triedFullSource && record.fileUrl && img.src !== record.fileUrl) {
      triedFullSource = true;
      img.src = record.fileUrl;
      return;
    }

    const shell = img.closest(".inline-image-preview, .gallery-image-link");
    if (!shell) return;
    shell.classList.add("image-load-failed");
    shell.dataset.fallbackTitle = "Remote preview unavailable";
    shell.dataset.fallbackDetail = record.actionSource || "Open the source file";
    img.alt = "";
  });
}

function clearFilters() {
  state.query = "";
  state.releaseDate = "";
  state.incidentDate = "";
  state.location = "";
  state.agencies.clear();
  state.fileTypes.clear();

  els.searchInput.value = "";
  els.releaseDateFilter.value = "";
  els.incidentDateFilter.value = "";
  els.locationFilter.value = "";
  document.querySelectorAll(".filter-check input").forEach((input) => {
    input.checked = false;
  });
  render();
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    render();
  });
  els.releaseDateFilter.addEventListener("change", () => {
    state.releaseDate = els.releaseDateFilter.value;
    render();
  });
  els.incidentDateFilter.addEventListener("change", () => {
    state.incidentDate = els.incidentDateFilter.value;
    render();
  });
  els.locationFilter.addEventListener("change", () => {
    state.location = els.locationFilter.value;
    render();
  });
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    render();
  });
  els.listViewButton.addEventListener("click", () => {
    state.view = "list";
    render();
  });
  els.galleryViewButton.addEventListener("click", () => {
    state.view = "gallery";
    clearFileTypeFilters();
    render();
  });
  els.videoViewButton.addEventListener("click", () => {
    state.view = "video";
    clearFileTypeFilters();
    render();
  });
  els.clearFilters.addEventListener("click", clearFilters);
}

function clearFileTypeFilters() {
  state.fileTypes.clear();
  document.querySelectorAll("#typeFilters input").forEach((input) => {
    input.checked = false;
  });
}

function init() {
  hydrateData(payload, `Bundled snapshot loaded: ${payload.total} records.`);
  bindEvents();
  render();
  refreshFromLiveCsv();
}

init();
