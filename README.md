# UFO Release 01 Terminal

UFO Release 01 Terminal is a static web app for browsing the May 8, 2026 WAR UFO/UAP Release 01 catalog. It turns the release inventory into a searchable, filterable file terminal with generated descriptive filenames, preview text, source metadata, image previews, and embedded DVIDS video players.

The app is intentionally static. It has no build step, backend, package manager, database, or tracking code. Open `index.html` directly or serve the folder from any static host.

## What the App Does

- Indexes 162 Release 01 records from the WAR UFO/UAP release page.
- Searches generated filenames, original filenames, agencies, dates, locations, tags, and preview text.
- Filters by agency, file type, release date, incident date, and incident location.
- Sorts by signal score, agency, location, incident date, generated filename, or file type.
- Provides a list view for the full release inventory.
- Provides an image gallery for image records with remote thumbnails and direct source links.
- Provides a video gallery for video records with embedded DVIDS players when a DVIDS video ID is available.
- Links each item back to its WAR media file or external source page.

## Screenshots

The `screenshots/` folder is included in the release so the main interface sections are visible from the repository without running the app.

| Section | Screenshot |
| --- | --- |
| Full release index and summary counters | [`screenshots/01-release-index.png`](screenshots/01-release-index.png) |
| Keyword search with highlighted matches | [`screenshots/02-keyword-search.png`](screenshots/02-keyword-search.png) |
| Metadata filters and active filter readout | [`screenshots/03-metadata-filters.png`](screenshots/03-metadata-filters.png) |
| Image gallery | [`screenshots/04-image-gallery.png`](screenshots/04-image-gallery.png) |
| Video gallery with embedded players | [`screenshots/05-video-gallery.png`](screenshots/05-video-gallery.png) |
| Responsive mobile layout | [`screenshots/06-mobile-layout.png`](screenshots/06-mobile-layout.png) |

## How to Use It

1. Open `index.html` in a browser.
2. Use **Keyword sweep** to search names, metadata, and preview text.
3. Use the agency and file type checkboxes for broad filtering.
4. Use the release date, incident date, and location menus for precise filtering.
5. Change **Sort vector** to reorder the visible records.
6. Switch between **File index**, **Image gallery**, and **Video gallery** using the view buttons in the toolbar.
7. Use **Download**, **Open file**, **Open DVIDS**, or **Open report** to inspect the original source item.
8. Use **Clear filters** to return to the complete release inventory.

## Running Locally

Direct file open:

```bash
open index.html
```

Local static server:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

A local server is recommended when testing embedded video behavior or browser security edge cases, but the core app works as plain static files.

## Repository Contents

```text
.
├── index.html
├── app.js
├── styles.css
├── data/
│   └── releases.js
└── screenshots/
    ├── 01-release-index.png
    ├── 02-keyword-search.png
    ├── 03-metadata-filters.png
    ├── 04-image-gallery.png
    ├── 05-video-gallery.png
    └── 06-mobile-layout.png
```

## Data Notes

The bundled data file is `data/releases.js`. It was generated from a local CSV capture of the WAR Release 01 page and contains normalized metadata plus generated descriptive titles and filenames for browsing. This repository includes only the static app release, not the larger review workspace, source PDFs, videos, analysis exports, or data-processing scripts.

The app is a release browser and triage aid. It does not validate claims in the underlying government records or external source pages.

## Source

- WAR UFO/UAP release page: <https://www.war.gov/UFO/#release>
