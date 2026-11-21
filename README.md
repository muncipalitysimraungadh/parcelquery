# Cadastral Parcel Splitter

A static browser application inspired by the Parcel Split workflow. It reads a zipped polygon Shapefile, displays parcels on street/satellite basemaps, searches parcel attributes, measures area/perimeter, performs a directional area-based split, and exports GeoJSON/CSV.

## Run locally

1. Extract this folder.
2. Start a local web server in this folder (do not open `index.html` directly):
   - Python: `python -m http.server 8000`
   - Open `http://localhost:8000`
3. Upload a ZIP containing `.shp`, `.shx`, `.dbf`, and `.prj` for the same layer.

All GIS processing is performed in the browser. No parcel data is uploaded to a server by this application.

## Deploy to Netlify

1. Create a GitHub repository and upload the contents of this folder.
2. In Netlify choose **Add new site → Import an existing project**.
3. Select the repository.
4. Build command: leave blank.
5. Publish directory: `.` (the project root).
6. Deploy.

You can also drag-and-drop the extracted folder into Netlify's manual deploy area.

## Shapefile requirements

- Upload one ZIP per polygon layer.
- Include `.prj`. The `.prj` must describe the true source coordinate system and datum.
- Include `.dbf` attributes for parcel number, ward and land-use fields.
- The app tries to identify common attribute names automatically. If your DBF uses different names, edit `detectFields()` in `app.js`.

## Area units

The displayed Terai conversion uses:
- 1 Bigha = 6,772.63 m²
- 1 Kattha = 338.6315 m²
- 1 Dhur = 16.9316 m²
- 1 Dhurki = 0.84658 m²

Check the locally adopted legal/administrative conversion standard before official use.

## Important projection note for MUTM 84 / Everest 1830

The Shapefile's `.prj` file is essential. This prototype relies on shpjs to interpret the `.prj` and produce WGS84 GeoJSON for display. It then creates a local azimuthal-equidistant metric working plane around the selected parcel for splitting. If the `.prj` is missing, inaccurate, or unsupported, map placement and area results may be wrong.

Do not use **Define Projection** to relabel Everest coordinates as WGS84. Correctly define the source CRS, apply the correct Everest-to-WGS84 geographic transformation in GIS, and validate against known control points. For a production Nepal cadastral workflow, confirm the exact MUTM zone, Everest 1830 datum realization, transformation parameters and official area standard with the Survey Department / authorized GIS professional.

## Current limitations

- Supports polygon and multipolygon geometry.
- Directional split means a straight east/west or north/south cut in a local metric plane, with the requested area on the selected side.
- The app does not create legal parcel identifiers, cadastral survey records, or a certified cadastral map.
- GeoJSON and CSV export are included. Shapefile export, PDF map layout, custom cut-line drawing, multi-parcel batch processing, authentication and database storage are not included in this starter version.
- Very complex polygons with narrow corridors, holes or multipart islands should be checked carefully. A straight cut can create multiple pieces.
- Esri satellite and OpenStreetMap tiles require internet access and are subject to their providers' terms and usage policies.

## Suggested next production upgrades

1. Confirm actual DBF field names and the exact CRS from a sample dataset.
2. Add a field-mapping screen rather than relying on automatic field detection.
3. Add a scale bar, north arrow, coordinate readout, print layout and measurement labels.
4. Add user-drawn cut lines and snapping to parcel boundaries.
5. Add GeoPackage/Shapefile export and a robust geometry validation report.
6. Add server-side processing (e.g. PostGIS) for large datasets and multi-user workflows.
