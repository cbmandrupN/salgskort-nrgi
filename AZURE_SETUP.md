# NRGi IT: activate Salgskort SharePoint access

Status: the public map is a demo. No Azure subscription, tenant/client IDs,
Graph credential or backend URL have been provided. A SharePoint browser link
does not grant the application access. Do not put a secret in GitHub, a Vite
variable, a document, a chat message or a Docker image.

## Copy-paste request to IT

Please provision a read-only SharePoint integration for Salgskort:

- SharePoint host: `nrgi.sharepoint.com`
- Site URL: `https://nrgi.sharepoint.com/sites/Admin.BygningerogIndustri`
- Workbook filename: `Salgsliste.xlsx`
- Source document GUID: `B7A1E06C-6E0D-4376-BEA5-5B2BCEDC6968`
- The GUID is a SharePoint document identifier, **not a confirmed Graph drive item ID**.
- Source repository: `https://github.com/cbmandrupN/salgskort-nrgi`
- Public demo: `https://cbmandrupn.github.io/salgskort-nrgi/`

1. Create a single-tenant Entra ID application for the backend workbook reader.
   Add Microsoft Graph **application** permission `Sites.Selected` and grant
   tenant admin consent. Do not use tenant-wide `Sites.Read.All` as a shortcut.
2. Resolve the site's Graph ID, then grant this application **read** access to
   that site. Admin consent alone does not give `Sites.Selected` access to any site.
3. Create an expiring client secret, with an owner and rotation procedure.
   Put the **secret value**, not its ID, in the backend host's secret store or
   an approved Key Vault reference. Do not send it in chat or email.
4. Confirm the document library, workbook's drive-relative path, worksheet name
   and column headers. The current path-based client uses the site's **default
   document library**; its path starts inside that library, not at the site.
   Do not assume that `Delte dokumenter` belongs in the drive-relative path.
   If the workbook is in another library, report the drive ID: library selection
   will need wiring before activation.
5. Provision the backend container on an approved Azure host with HTTPS and
   employee authentication/authorization enforced by the hosting platform.
   Assign only the intended NRGi employee group. Confirm access restrictions and
   service owner before enabling customer data.

Return these non-secret values: tenant ID, application/client ID, Graph site ID,
document library/drive ID, exact workbook path, exact worksheet name and column
headers, backend HTTPS URL, and the employee group that may use the app.
Confirm separately that the secret was placed in the host secret store.

### Administrative Graph requests

Run these using **IT's appropriately privileged administrative identity**,
not the workbook reader's runtime token. Replace placeholders with returned
values; never send placeholders to a real tenant.

```http
GET https://graph.microsoft.com/v1.0/sites/nrgi.sharepoint.com:/sites/Admin.BygningerogIndustri
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [{
    "application": {
      "id": "{workbook-reader-client-id}",
      "displayName": "Salgskort workbook reader"
    }
  }]
}
```

## Deploy the backend

The Dockerfile is runnable with the `backend` directory as build context:

```powershell
docker build -t salgskort-api .\backend
docker run --rm -p 8000:8000 --name salgskort-api salgskort-api
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/api/cases
```

Default mode is `demo`; startup does not need credentials. The container listens
on port **8000**, runs as UID 10001 and probes `/health`. Configure Azure's
container/target port as 8000. Deploy this image to an IT-approved Azure Container
Apps environment or App Service for Containers and obtain its HTTPS URL.
This file does not create a cloud subscription or incur cloud costs.

For App Service, enable Authentication with Microsoft Entra ID, require
authentication, and restrict the enterprise application's assignments to the
approved NRGi group. Do not leave a separate unprotected ingress to the container.
The API itself has no user authentication; CORS is **not** an authorization layer.
Keep demo mode until that hosting protection is verified.

### Backend settings (configure on host, not Pages)

| Setting | Value |
| --- | --- |
| `SALGSKORT_DATA_SOURCE` | `demo` initially; `graph` only after access checks |
| `SALGSKORT_GRAPH_TENANT_ID` | Confirmed tenant ID |
| `SALGSKORT_GRAPH_CLIENT_ID` | Workbook reader's client ID |
| `SALGSKORT_GRAPH_CLIENT_SECRET` | Host secret-store reference/value |
| `SALGSKORT_GRAPH_SITE_ID` | Graph ID returned by site lookup |
| `SALGSKORT_GRAPH_DRIVE_ITEM_PATH` | Confirmed path inside the default drive |
| `SALGSKORT_GRAPH_WORKSHEET_NAME` | Exact worksheet name, not filename |
| `SALGSKORT_CORS_ALLOW_ORIGINS` | Exact frontend origin, e.g. `https://cbmandrupn.github.io` (no path) |

`SALGSKORT_GRAPH_SHARE_URL` remains an optional backend-only fallback for a
Graph-compatible sharing link. It is encoded for `/shares/{shareId}/driveItem/content`.
An ordinary `Doc.aspx?sourcedoc=...` link may not be accepted as a sharing link.
The `/shares` endpoint has its own permission requirements: do **not** assume
`Sites.Selected` will work on that route, or broaden permissions just to use it.
Prefer the restricted site/drive path and verify with IT.

## Acceptance checks before live activation

1. Anonymous requests to the hosted API are denied. An employee outside the
   assigned group is denied. An assigned employee is allowed.
2. The workbook-reader identity can download **this** workbook, but cannot read
   an unrelated SharePoint site. Verify XLSX bytes rather than a login HTML page.
3. Parse the confirmed worksheet and compare row counts and any reported issues
   with the source. The current parser can choose the first worksheet if the
   configured name is missing, so explicitly verify the name before live use.
4. Review geocoding disclosure/terms: addresses are sent from the backend to the
   configured geocoder. Obtain approval for that use of customer addresses.
5. Connect the frontend to the chosen employee login flow. The current Pages
   demo does **not** acquire Entra access tokens or send cross-origin login cookies;
   simply changing `VITE_API_BASE_URL` will not complete an authenticated integration.
   Once IT chooses the host/login pattern, wire that flow, test authorized and
   denied users, and only then set `VITE_DEMO_MODE=false`.

The public demo stays available while IT completes these steps. Never publish
workbook contents or a shared API password into the static frontend as a workaround.
