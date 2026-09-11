"""Allowlisted manual-import fields; never accept raw workbook/contact columns."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    field_serializer,
    field_validator,
    model_validator,
)

Count = Annotated[int, Field(strict=True, ge=0)]
RowNumber = Annotated[int, Field(strict=True, ge=1)]
Text = Annotated[str, Field(max_length=4096)]


class SharedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=4096)


class SharedCase(SharedModel):
    id: Annotated[str, Field(min_length=1, max_length=255)]
    case_number: Text | None = None
    customer_name: Text | None = None
    address_raw: Text
    address_normalized: Text | None = None
    advisor: Text | None = None
    department: Text
    status: Literal[
        "ny", "i_gang", "tilbud_sendt", "vundet", "tabt", "afventer",
        "delvist_faerdig", "rapport_sendt", "fuldfoert", "lukket",
    ] | None = None
    estimated_value_dkk: FiniteFloat | None = None
    created_date: Text | None = None
    latitude: Annotated[FiniteFloat, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[FiniteFloat, Field(ge=-180, le=180)] | None = None
    geocode_status: Literal["ok", "delvis", "fejlet", "afventer"]
    source_row: RowNumber
    postal_code: Text | None = None
    city: Text | None = None
    product_type: Text | None = None
    invoiced: Annotated[bool, Field(strict=True)] | None = None
    status_basis: Text | None = None

    @field_validator("department")
    @classmethod
    def require_buildings(cls, value: str) -> str:
        name = re.sub(r"\s+", " ", value.strip()).lower()
        if not re.match(r"^bygninger(?:$|[\s-])", name):
            raise ValueError("Only Bygninger cases can be shared")
        return value


class SharedIssue(SharedModel):
    row_number: RowNumber
    severity: Literal["fejl", "advarsel"]
    field: Text | None = None
    message: Text


class SharedMeta(SharedModel):
    fetched_at: datetime
    data_source: Literal["local"]
    total_rows: Count
    resolved_count: Count
    unresolved_count: Count
    error_count: Count
    warning_count: Count
    template_rows_skipped: Count | None = None

    @field_validator("fetched_at", mode="before")
    @classmethod
    def require_iso_datetime(cls, value: object) -> object:
        if not isinstance(value, (str, datetime)):
            raise ValueError("Expected ISO datetime")  # noqa: TRY004 -- Pydantic validation error
        if isinstance(value, str) and not re.match(r"^\d{4}-\d{2}-\d{2}T", value):
            raise ValueError("Expected ISO datetime")
        return value


class SharedData(SharedModel):
    meta: SharedMeta
    cases: Annotated[list[SharedCase], Field(max_length=5000)]
    issues: Annotated[list[SharedIssue], Field(max_length=50000)]

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        rows = {case.source_row for case in self.cases}
        if len(rows) != len(self.cases) or len({c.id for c in self.cases}) != len(self.cases):
            raise ValueError("Duplicate case identifiers or source rows")
        if any(issue.row_number not in rows for issue in self.issues):
            raise ValueError("Issues must belong to published cases")
        resolved = sum(c.latitude is not None and c.longitude is not None for c in self.cases)
        expected = (
            len(self.cases), resolved, len(self.cases) - resolved,
            sum(i.severity == "fejl" for i in self.issues),
            sum(i.severity == "advarsel" for i in self.issues),
        )
        actual = (
            self.meta.total_rows, self.meta.resolved_count, self.meta.unresolved_count,
            self.meta.error_count, self.meta.warning_count,
        )
        if actual != expected:
            raise ValueError("Snapshot counters do not match cases and issues")
        return self


class SharedWrite(SharedModel):
    expected_revision: Annotated[int, Field(strict=True, ge=0, le=9223372036854775806)]
    file_name: Annotated[str, Field(min_length=1, max_length=255)]
    data: SharedData


class SharedSnapshot(SharedModel):
    revision: Count = 0
    file_name: str | None = None
    uploaded_at: datetime | None = None
    data: SharedData | None = None

    @field_serializer("data")
    def serialize_data(self, value: SharedData | None):
        # Frontend optional fields are absent, not null; the empty envelope still has nulls.
        return value.model_dump(mode="json", exclude_none=True) if value is not None else None
