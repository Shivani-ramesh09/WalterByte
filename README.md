# Campus Explore v12 — named hover pins and label-free map

## Included changes
- Switched the basemap to OpenFreeMap's Positron vector style through MapLibre GL Leaflet. Symbol layers (including background POI icons and blue names) are hidden so the app's own locations define the visible named places.
- App-owned locations use compact warm-brown pins. Hovering a pin highlights it and shows the place name; the selected place stays highlighted with its label visible. Names are not all rendered permanently, reducing clutter.
- Added mapped hostel points based on OpenStreetMap-derived Mapcarta listings: Nachiketas, Yagnavalkya, Vyasa Maharshi, Yagnavalkya Annexe, Adithi, Gauthama, Vasishta, Agasthya and Gargi Bhavanam. Kashyapa uses the student's supplied coordinate, marked as requiring on-site confirmation.
- Corrected the three previously mismapped hostel positions. Original off-campus submitted candidates were removed from active record fields.
- Removed Central Library, its library restroom child record, and Anugraha Hall as requested.
- Removed the visible coordinate source field and source links from the place-details panel. Source metadata remains in JSON only for internal traceability; it is not rendered in the UI.
- Coordinate picker avoids creating a temporary pin when the user clicks an existing custom marker.

## New dependency
From the root of your existing Vite project, install:

```bash
npm install maplibre-gl @maplibre/maplibre-gl-leaflet
```

Then replace these files from the zip:
- `src/App.jsx`
- `src/App.css`
- `src/data/locations.json`

Keep `package.json` except for the dependency change introduced by the install command; also keep `src/main.jsx` and `src/index.css`.

Run `npm run dev`.

## Map and coordinate caveats
- OpenFreeMap provides vector basemap styles and allows integration through the MapLibre GL Leaflet adapter. Style symbol layers are hidden at runtime; attribution remains visible. Provider service is best-effort.
- Public OSM-derived coordinates are building reference points, not surveyed indoor/entrance locations. Verify them on campus.
- `coordinateSource` and `sourceUrl` are retained in the data for maintainability but aren't shown in the UI.
