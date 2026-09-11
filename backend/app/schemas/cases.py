"""Pydantic schemas for case records, sync results and API responses."""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class CaseStatus(str, Enum):
    NEW = "ny"
    IN_PROGRESS = "i_gang"
    OFFER_SENT = "tilbud_sendt"
    WON = "vundet"
    LOST = "tabt"
    ON_HOLD = "afventer"


class GeocodeStatus(str, Enum):
    OK = "ok"
    PARTIAL = "delvis"
    FAILED = "fejlet"
    PENDING = "afventer"


class RowIssueSeverity(str, Enum):
    ERROR = "fejl"
    WARNING = "advarsel"


class RowIssue(BaseModel):
    """A parse or geocode problem tied to a specific source row. Never silently dropped."""

    row_number: int = Field(description="1-based row number in the source worksheet")
    severity: RowIssueSeverity
    field: str | None = Field(default=None, description="Column/field the issue relates to, if any")
    message: str


class Case(BaseModel):
    id: str = Field(description="Stable identifier, derived from source row or case number")
    case_number: str | None = None
    customer_name: str | None = None
    address_raw: str = Field(description="Address as read from the workbook")
    address_normalized: str | None = Field(default=None, description="Normalized 'Vejnavn nr, postnr by' form")
    street: str | None = None
    house_number: str | None = None
    postal_code: str | None = None
    city: str | None = None
    advisor: str | None = Field(default=None, description="Rådgiver / sagsbehandler")
    department: str | None = Field(default=None, description="Afdeling")
    status: CaseStatus | None = None
    estimated_value_dkk: float | None = None
    created_date: str | None = None
    note: str | None = None

    latitude: float | None = None
    longitude: float | None = None
    geocode_status: GeocodeStatus = GeocodeStatus.PENDING
    geocode_source: str | None = None
    geocode_score: float | None = Field(default=None, description="Provider confidence 0-1 if available")

    source_row: int = Field(description="1-based row number in the source worksheet")


class SyncMeta(BaseModel):
    fetched_at: datetime
    data_source: str = Field(description="'graph' or 'demo'")
    total_rows: int
    resolved_count: int
    unresolved_count: int
    error_count: int
    warning_count: int


class CasesResponse(BaseModel):
    meta: SyncMeta
    cases: list[Case]
    issues: list[RowIssue]


class HealthResponse(BaseModel):
    status: str
    data_source: str
    graph_configured: bool
    geocode_provider: str
