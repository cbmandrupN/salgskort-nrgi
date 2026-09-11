# Salgskort NRGi

Map-first dashboard for Danish sales and project cases. The frontend is a static React/Vite app suitable for GitHub Pages; the backend is a small FastAPI service that owns all Microsoft Graph credentials and live workbook access.

## Share the map

The map is deployed at **https://cbmandrupn.github.io/salgskort-nrgi/**.
This is the app URL, not a source repository link. Colleagues do not need repository access.
The Pages workflow defaults to `VITE_DEMO_MODE=true`: only the fictional
cases in `frontend/src/data/demo-cases.json` are shown when no local import is saved, with approximate map positions.
It does not call a backend or read SharePoint, and it is visibly labelled as a demo.
Repository access is not needed to view the map.

## Shared team mode: one import for everyone

**Implemented, but not activated on the public site yet.** A separately hosted,
HTTPS-protected backend with persistent storage is required. GitHub Pages alone
cannot keep a private shared dataset. Until the configuration below is completed,
the published site remains explicitly local/demo and colleagues must import their
own file. Do not solve this by committing a workbook or customer JSON to GitHub.

When activated, everyone opens the same Pages URL and enters the team's access
code. **Del ny Excel-fil** reads the workbook in the browser and sends only the
mapped **Bygninger** cases/issues to the protected API, replacing its latest copy.
No raw workbook, contact columns or other departments are sent. All colleagues
see that copy on login; already-open tabs use **Hent seneste** to refresh.
If someone has published a newer version since your last read, your upload is
rejected rather than overwriting theirs. Fetch and review the latest copy first.

Shared mode never uses demo data or the browser's saved local import as a
fallback. The access code and retrieved cases remain only in tab memory; refresh
or **Log ud** requires login again. Logging out does not delete the team's data.
Local-mode saved imports remain separate and are neither migrated nor shared
automatically. Open the original XLSX explicitly to publish it.

### Activation (no Graph or SharePoint app registration)

1. Use an **NRGi-approved hosting account** that supports the backend Docker image,
   HTTPS, server secrets and a persistent disk. The hosting provider must be
   permitted to hold these customer records; no provider/account has been created.
2. Set a strong, randomly generated server secret `SALGSKORT_SHARED_ACCESS_CODE`
   (at least 24 characters), a persistent `SALGSKORT_SHARED_DATABASE_PATH`, and
   `SALGSKORT_CORS_ALLOW_ORIGINS=https://cbmandrupn.github.io`.
   Keep `SALGSKORT_DATA_SOURCE=demo` unless separately configuring Graph; shared
   uploads use their own protected endpoints and do not enter `/api/cases`.
3. Set repository **variables** `VITE_API_BASE_URL` to that backend's HTTPS base URL,
   `VITE_SHARED_MODE=true`, and `VITE_DEMO_MODE=false`; rerun the Pages workflow.
   **Never put the access code in a VITE variable, git file or public URL.**
4. Distribute the site URL and access code through an approved private channel.
   Import a file once using **Del ny Excel-fil**. Confirm from a second browser
   that the same shared version appears without uploading again.

The team code uses HTTP Basic authentication (fixed username `nrgi`) over HTTPS;
it is sent in an Authorization header, not a URL or cookie. All code holders
can read and replace the shared dataset. This is **team-level access**, not
individual employee identity, MFA or an audit trail. Rotate the code to revoke
access, and use organizational SSO instead if individual revocation/auditing is
required. Existing authorized tabs may still contain the previously read data.
Configure edge/proxy rate limiting and prevent Authorization headers and request
bodies from being logged. Run Uvicorn with `--no-proxy-headers` (as in the Docker
image) so clients cannot forge the peer IP used by the in-process rate limiter.
CORS is not the authentication boundary.

The backend keeps one latest SQLite snapshot on its persistent disk. Do not run
independent replicas with separate disks: they would serve different copies.
Restrict volume/backup access, configure encryption at rest with your host, define
backup/retention rules, and securely remove the volume/backups when retiring the
service. An ephemeral container filesystem is not sufficient.

**Remaining integration inputs:** an approved backend host/persistent volume,
its HTTPS URL, and the privately configured team access code. They cannot be
inferred from the SharePoint link or the GitHub repository.

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

The advisor bar sits below the search/filters, directly above the map. It replaces
the advisor dropdown and lists **only Bygninger
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
Scroll the mouse wheel over the map to zoom in or out. Outside the map, the wheel
scrolls the page or case list normally. The map's +/− buttons remain available.

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
