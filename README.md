# Salgskort NRGi

Map-first dashboard for Danish sales and project cases. The frontend is a static React/Vite app suitable for GitHub Pages; the backend is a small FastAPI service that owns all Microsoft Graph credentials and live workbook access.

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

`.github/workflows/frontend-pages.yml` builds `frontend` and deploys it to GitHub Pages. Host the backend separately (Azure Container Apps, Azure App Service, Fly.io, or equivalent), set `SALGSKORT_CORS_ALLOW_ORIGINS` to the exact Pages origin, and set `VITE_API_BASE_URL` to the backend URL during the frontend build. Store Graph secrets only in the backend host's secret store. Review SharePoint data minimisation, retention and access controls before importing customer information. Dataforsyningen and Nominatim have their own usage/attribution terms; configure a commercial provider if those terms do not fit expected traffic.

## Integration inputs still needed

The final integration requires the exact workbook worksheet and column headers, Azure tenant/client/site IDs and secret, either the workbook drive path or authenticated sharing URL, the backend host URL, and the production GitHub Pages origin. The mapping already accepts common Danish variants; add any organization-specific headers to `backend/app/services/excel_parser.py`.
