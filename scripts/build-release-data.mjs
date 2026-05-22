import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_SOURCE_URL = "https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv";
const OUTPUT_PATH = new URL("../data/releases.js", import.meta.url);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    return [key, valueParts.join("=") || "true"];
  })
);

const source = args.get("source") || DEFAULT_SOURCE_URL;
const generatedAt = args.get("generated-at") || new Date().toISOString();

const csvText = await loadCsv(source);
const payload = buildPayloadFromCsv(csvText, source, generatedAt);
const js = `window.UFO_RELEASE_DATA = ${JSON.stringify(payload, null, 2)};\n`;

await writeFile(OUTPUT_PATH, js);
console.log(`Wrote ${payload.total} records to ${OUTPUT_PATH.pathname}`);

async function loadCsv(sourceRef) {
  if (/^https?:\/\//i.test(sourceRef)) {
    const response = await fetch(sourceRef, { cache: "no-store" });
    if (!response.ok) throw new Error(`CSV fetch failed: ${response.status} ${response.statusText}`);
    return response.text();
  }

  const filePath = new URL(sourceRef, `file://${process.cwd()}/`);
  return readFile(filePath, "utf8");
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

function buildPayloadFromCsv(csvText, sourceUrl, timestamp) {
  const sourceRows = rowsToObjects(csvText).filter((row) => row.Title || row["PDF | Image Link"] || row["DVIDS Video ID"]);
  const records = sourceRows.map((row, index) => normalizeSourceRecord(row, index + 1));

  return {
    generatedFrom: sourceUrl,
    generatedAt: timestamp,
    sourceUrl,
    total: records.length,
    records,
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

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createTags(row, fileType) {
  const text = normalize([row.Title, row["Description Blurb"], row.Agency, row["Incident Location"], row["Image Alt Text"], fileType].join(" "));
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
