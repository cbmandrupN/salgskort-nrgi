# Salgskort NRGi

Map-first dashboard for Danish sales and project cases. The frontend is a static React/Vite app suitable for GitHub Pages; the backend is a small FastAPI service that owns all Microsoft Graph credentials and live workbook access.

## Share the map

The map is deployed at **https://cbmandrupn.github.io/salgskort-nrgi/**.
This is the app URL, not a source repository link. Colleagues do not need repository access.
The Pages workflow defaults to `VITE_DEMO_MODE=true`: only the fictional
cases in `frontend/src/data/demo-cases.json` are shown when no local import is saved, with approximate map positions.
It does not call a backend or read SharePoint, and it is visibly labelled as a demo.
Repository access is not needed to view the map.

## Open Salgsliste.xlsx locally (no IT setup)

1. Download the latest `Salgsliste.xlsx` from SharePoint, open the map and select **Åbn Excel-fil**.
2. Choose your local `Salgsliste.xlsx` with the **Opgaver** worksheet.
3. Filter by advisor, department or progress, search cases, and click a map group
   or case to inspect it. The latest successful import is saved automatically and
   restored when you refresh or reopen the site in the same browser profile.
4. Select **Skift Excel-fil** when you have a newer copy, even if it has the same
   filename. **Fjern gemt fil** removes the saved copy and clears the current view.

The app uses **manual import only**. No OneDrive synchronization, Power Automate
flow or File System Access permission is needed. There is no automatic polling
or background refresh; the displayed cases are a snapshot of the selected file.

The default audience is **advisors in Bygninger**. Initial load, each newly selected Excel
import, **Fjern gemt fil** and **Nulstil** select **Bygninger (alle)**, combining Bygninger
and its regional departments (including Bygninger Vest and Bygninger Øst).
The map, list, department KPIs and status options use that scope.
Changing department clears the previous advisor and status to avoid stale filters.
Other departments remain available via an explicit selection; this is a default
view, not access control. A successful new import resets the filters and closes
details/map-group selection because Excel row numbers can change.
Filters are not saved; reopening the site starts with the Bygninger overview.

The top advisor bar replaces the advisor dropdown and lists **only Bygninger
advisors**, including its regional departments. Names come from the imported cases;
**Casper Bøvling is always included and always pink**, with 0 cases if absent.
Each named advisor has a distinct color. Names are matched ignoring case,
extra whitespace, a trailing initials period and Unicode composition. Shared
assignments separated by `/` are split into individual advisors: their case is
counted once in the map/list, but counts towards each assigned advisor's total.
Colors are derived from the full
Bygninger roster, not filtered results, so filters, row ordering and reloads do not
change them. A changed advisor roster can reassign colliding palette slots.
Counts in this bar describe the full Bygninger snapshot, not the current search.
Click a name to filter; click it again or **Alle i Bygninger** to show all advisors.
These buttons return the department scope to Bygninger, retaining search/status
filters when applicable. Missing advisors have a separate gray button.

Map markers, list entries and case details use the same advisor colors. Locations
with several advisors show segments proportional to advisor assignments around the
case count (a shared case contributes to each advisor's segment);
hover/focus gives the named breakdown, and click/Enter opens the area list. Colors
are accompanied by names, counts and button selection state, not used alone.
Other departments remain available through the department filter, but their cases
are gray and their advisors never appear in the Bygninger advisor bar.

The workbook is read **in the browser**, not uploaded to GitHub or the backend.
The latest parsed case records, row issues, filename and original import timestamp
are stored in IndexedDB (`salgskort-nrgi-imports`), not the original workbook or its
excluded contact columns. A successful import atomically replaces the previous
snapshot; parse/storage failures keep the previous snapshot and show an error.
Saved-data errors are explicit, never masked with demo data. An unreadable saved
copy can be replaced by a new import or removed with **Fjern gemt fil**.

There is no localStorage/sessionStorage persistence or analytics. Every colleague
opens their own copy; sharing the website URL does not share the loaded workbook.
The saved records contain customer information: use a trusted computer and your
own browser profile. Browser storage is not an encrypted vault or an access-control
boundary; other scripts on the same origin can access it. Records remain until
replaced, explicitly removed, or cleared/evicted by the browser. Private browsing,
storage restrictions and cleared site data can prevent retention. This is not a
backup or cross-device/shared storage. Other open tabs keep their current snapshot
until reloaded; the last successful import across tabs is the saved copy.
Do not commit the workbook, screenshots of customer data or extracted case records.

### Mapping and placement

`frontend/src/lib/workbook.ts` explicitly maps the actual `Opgaver` columns:
`Virksomhed`, `Adresse (Besigtiget)`, `Post nr.`, `Afdeling`, `Rådgiver`,
`Projekt nr.`, `Salgsdato`, `Beløb`, `Produkt type` and progress/billing flags.
Contact names, CVR, telephone numbers, email addresses and free-text comments are
not copied into the app's case records.

Progress precedence is **Lukket i BC → Fuldført → Delvist færdig → Rapport sendt →
I gang (oprettet i BC) → Ny**. Billing is shown separately, not treated as completion.
The details panel names the source flag behind the derived status. Unknown flags,
bad amounts and missing/conflicting postcodes are reported with the Excel row number.
Duplicate project numbers remain separate cases.

The attached workbook's structure includes month-only template rows. They are
excluded from case counts, with the number explicitly shown in the UI. Rows with
case data are retained even when they cannot be placed. Missing/renamed worksheets
or required columns are errors; the importer never silently switches to a pivot.
Files are limited to 10 MB and worksheets to 5,000 rows.

**Placements are approximate postcode centers, not street geocoding.** The entire
public Danish postcode lookup is bundled in `frontend/src/data/postcodes.json`;
no customer addresses are sent to a geocoding service. Cases in the same postcode
share a counted marker; select it to see all its cases. The complete list remains
available for keyboard users and unplaced cases.

The lookup was generated from [DAWA/Dataforsyningen land-only postcodes](https://api.dataforsyningen.dk/postnumre?landpostnumre=true)
on 2026-09-11 (1,089 entries with land-clipped visual centers).
The `landpostnumre=true` parameter is essential: ordinary postcode polygons include
offshore territory, placing some west-coast centers far out in the North Sea.
These remain approximate postcode references, never exact customer addresses.
Refresh only the public lookup
using `python scripts/update_postcodes.py`; that script never takes workbook input.
Background map tiles are requested from OpenStreetMap and reveal the viewed map
area/IP to that tile service, but do not contain names or addresses from the file.
Respect [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
Private/screenshared screens can still expose the displayed workbook contents.

The background defaults to **Afdæmpet**: the existing OpenStreetMap tiles are
desaturated, softened and lightened locally. Only the background tile pane is
filtered; case markers, counts, controls and attribution retain their original
contrast. Use **Baggrund → Standard** on the map to restore the unmodified colors.
This does not change the tile provider, coordinates or data handling.

For local frontend-only preview, copy `frontend/.env.example` to `frontend/.env`
and run `npm run dev` inside `frontend`. For live mode, explicitly set
`VITE_DEMO_MODE=false` and `VITE_API_BASE_URL` to the authenticated backend.
Missing configuration and API failures show errors; they never select demo data.

## SharePoint activation

SharePoint is optional and **not provisioned yet**; local import works without it.
See [AZURE_SETUP.md](AZURE_SETUP.md)
for the copy-paste request to NRGi IT and the exact site/file identifiers.
`backend/Dockerfile` provides a non-root, demo-by-default backend image.
Live data must remain disabled until the host enforces employee authentication
and IT has granted the Graph application's site-specific read permission.

## Local development

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload

cd ..\frontend
npm install
npm run dev
```

The backend defaults to `SALGSKORT_DATA_SOURCE=demo`, using `backend/fixtures/demo.json`. Demo mode is explicit and safe; production errors are shown in the UI rather than replaced with demo data.

## Data pipeline

In `graph` mode, `GraphWorkbookClient` uses Azure AD client credentials to download the configured SharePoint workbook. A browser SharePoint link is not treated as public data access: direct fetches can return `403` and browser access can redirect to Microsoft login. Treat link metadata such as site name (`Admin.BygningerogIndustri`), filename (`Salgsliste.xlsx`) and sourcedoc ID as integration clues only; the backend must still authenticate through Microsoft Graph.

The preferred configuration is `SALGSKORT_GRAPH_SITE_ID` + `SALGSKORT_GRAPH_DRIVE_ITEM_PATH`. If the integration team only supplies a SharePoint sharing URL, set `SALGSKORT_GRAPH_SHARE_URL` instead and the backend will resolve it through Graph `/shares/{shareId}/driveItem/content` using the same backend app permissions. `excel_parser.py` contains the explicit Danish header mapping layer. Every non-empty row becomes a case or a visible row issue. Addresses are normalized before passing through the configurable, cached Dataforsyningen/DAWA or Nominatim provider. Unresolved addresses remain in the API response and are shown in the error panel.

Copy `.env.example` files and configure the backend with `SALGSKORT_GRAPH_TENANT_ID`, `SALGSKORT_GRAPH_CLIENT_ID`, `SALGSKORT_GRAPH_CLIENT_SECRET`, either `SALGSKORT_GRAPH_SITE_ID` + `SALGSKORT_GRAPH_DRIVE_ITEM_PATH` or `SALGSKORT_GRAPH_SHARE_URL`, and the exact worksheet name. The Azure app needs least-privilege `Sites.Selected` (with read access granted to the specific site) or an equivalent restricted permission. Never expose these values to Vite or GitHub Pages.

## Deployment and privacy

`.github/workflows/frontend-pages.yml` builds the public demo and deploys it to GitHub Pages. Pages must be enabled with **GitHub Actions** as its build source. For live deployment, host the backend separately (Azure Container Apps, Azure App Service, Fly.io, or equivalent), set `SALGSKORT_CORS_ALLOW_ORIGINS` to the exact Pages origin, and set `VITE_API_BASE_URL` to the backend URL during a live frontend build. Protect the live API with organizational authentication and authorization before connecting customer data: CORS is not access control and the current API has no user authentication. Store Graph secrets only in the backend host's secret store. Review SharePoint data minimisation, retention and access controls before importing customer information. Dataforsyningen and Nominatim have their own usage/attribution terms; configure a commercial provider if those terms do not fit expected traffic.

## Integration inputs still needed

The final integration requires the exact workbook worksheet and column headers, Azure tenant/client/site IDs and secret, either the workbook drive path or authenticated sharing URL, the backend host URL, and the production GitHub Pages origin. The mapping already accepts common Danish variants; add any organization-specific headers to `backend/app/services/excel_parser.py`.
