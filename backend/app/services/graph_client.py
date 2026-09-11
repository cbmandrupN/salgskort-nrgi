"""Microsoft Graph client: fetches the SharePoint-hosted Excel workbook bytes.

Uses the OAuth2 client-credentials flow (app-only, service account style) against
Azure AD, then downloads the workbook content via the Graph drive API. No
credentials or tokens ever leave the backend process.
"""
from __future__ import annotations

import time

import httpx

from app.core.config import Settings


class GraphAuthError(RuntimeError):
    """Raised when Azure AD token acquisition fails."""


class GraphDownloadError(RuntimeError):
    """Raised when the workbook cannot be downloaded from SharePoint via Graph."""


class GraphWorkbookClient:
    """Thin wrapper around the Microsoft Graph REST API for downloading one workbook."""

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = http_client or httpx.AsyncClient(timeout=30.0)
        self._owns_client = http_client is None
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _get_token(self) -> str:
        if self._token and time.monotonic() < self._token_expires_at - 30:
            return self._token

        s = self._settings
        url = f"https://login.microsoftonline.com/{s.graph_tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": s.graph_client_id,
            "client_secret": s.graph_client_secret,
            "scope": s.graph_scope,
            "grant_type": "client_credentials",
        }
        try:
            resp = await self._client.post(url, data=data)
        except httpx.HTTPError as exc:
            raise GraphAuthError(f"Kunne ikke kontakte Azure AD: {exc}") from exc

        if resp.status_code != 200:
            raise GraphAuthError(
                f"Azure AD token-anmodning fejlede ({resp.status_code}): {resp.text[:300]}"
            )

        payload = resp.json()
        token = payload.get("access_token")
        expires_in = payload.get("expires_in", 3600)
        if not token:
            raise GraphAuthError("Azure AD svarede uden access_token")

        self._token = token
        self._token_expires_at = time.monotonic() + float(expires_in)
        return token

    async def download_workbook(self) -> bytes:
        """Downloads the raw .xlsx bytes for the configured drive item."""
        s = self._settings
        token = await self._get_token()
        path = s.graph_drive_item_path.strip("/")
        url = (
            f"https://graph.microsoft.com/v1.0/sites/{s.graph_site_id}"
            f"/drive/root:/{path}:/content"
        )
        try:
            resp = await self._client.get(url, headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError as exc:
            raise GraphDownloadError(f"Kunne ikke hente regneark fra Graph: {exc}") from exc

        if resp.status_code != 200:
            raise GraphDownloadError(
                f"Graph-download fejlede ({resp.status_code}) for '{path}': {resp.text[:300]}"
            )
        return resp.content
