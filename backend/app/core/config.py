"""Application configuration loaded from environment variables.

All Microsoft Graph credentials and SharePoint identifiers live only on the
backend. The frontend never sees these values; it only talks to this API.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SALGSKORT_", extra="ignore")

    # --- Microsoft Graph / SharePoint (service account, client-credentials flow) ---
    graph_tenant_id: str = Field(default="", description="Azure AD tenant ID")
    graph_client_id: str = Field(default="", description="App registration client ID")
    graph_client_secret: str = Field(default="", description="App registration client secret")
    graph_site_id: str = Field(default="", description="SharePoint site ID hosting the workbook")
    graph_drive_item_path: str = Field(
        default="", description="Drive-relative path to the Excel workbook, e.g. 'Delte dokumenter/Salgskort.xlsx'"
    )
    graph_share_url: str = Field(
        default="",
        description=(
            "Optional SharePoint sharing URL. If set, the backend resolves it via "
            "Microsoft Graph /shares/{shareId}/driveItem/content using app permissions."
        ),
    )
    graph_worksheet_name: str = Field(default="Salgskort", description="Worksheet/table name to read")
    graph_scope: str = Field(default="https://graph.microsoft.com/.default")

    # --- Geocoding provider ---
    geocode_provider: Literal["dataforsyningen", "nominatim", "none"] = Field(
        default="dataforsyningen",
        description="Address -> coordinate provider. 'dataforsyningen' (DAWA, Danish addresses, free, no key) is the default.",
    )
    geocode_cache_ttl_seconds: int = Field(default=60 * 60 * 24 * 30, description="Geocode cache TTL (30 days default)")
    geocode_user_agent: str = Field(default="salgskort-nrgi/1.0 (contact: it@nrgi.dk)")

    # --- Data source mode ---
    data_source: Literal["graph", "demo"] = Field(
        default="demo",
        description="'graph' pulls the live workbook via Microsoft Graph. 'demo' serves the bundled sample fixture only.",
    )
    sync_cache_ttl_seconds: int = Field(default=60 * 15, description="How long a fetched+parsed dataset is cached in memory")

    # --- Shared manual import (independent of Graph/demo) ---
    shared_access_code: str = Field(default="", repr=False)
    shared_database_path: str = Field(default="")

    # --- CORS ---
    cors_allow_origins: str = Field(
        default="http://localhost:5173",
        description="Comma-separated list of allowed origins, e.g. the GitHub Pages URL",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]

    @property
    def graph_configured(self) -> bool:
        return bool(
            self.graph_tenant_id
            and self.graph_client_id
            and self.graph_client_secret
            and ((self.graph_site_id and self.graph_drive_item_path) or self.graph_share_url)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
