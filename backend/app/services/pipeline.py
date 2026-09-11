from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.core.config import Settings
from app.schemas.cases import Case, CasesResponse, GeocodeStatus, RowIssue, RowIssueSeverity, SyncMeta
from app.services.excel_parser import parse_workbook
from app.services.geocoding import build_geocoder
from app.services.graph_client import GraphWorkbookClient


class PipelineError(RuntimeError):
    pass


async def load_cases(settings: Settings) -> CasesResponse:
    async with httpx.AsyncClient(timeout=30) as client:
        if settings.data_source == "demo":
            fixture = Path(__file__).resolve().parents[2] / "fixtures" / "demo.json"
            payload = json.loads(fixture.read_text(encoding="utf-8"))
            cases = [Case.model_validate(item) for item in payload["cases"]]
            issues = [RowIssue.model_validate(item) for item in payload.get("issues", [])]
            return _response(cases, issues, "demo", len(cases), datetime.now(UTC))

        if not settings.graph_configured:
            raise PipelineError(
                "Graph er ikke konfigureret. Angiv tenant, client, secret, site og workbook path."
            )
        graph = GraphWorkbookClient(settings, client)
        try:
            content = await graph.download_workbook()
        finally:
            await graph.aclose()
        parsed = parse_workbook(content, settings.graph_worksheet_name)
        geocoder = build_geocoder(settings, client)
        issues = list(parsed.issues)
        for case in parsed.cases:
            if not case.address_normalized:
                continue
            result = await geocoder.geocode(case.address_normalized)
            if result is None:
                case.geocode_status = GeocodeStatus.FAILED
                issues.append(RowIssue(
                    row_number=case.source_row,
                    severity=RowIssueSeverity.ERROR,
                    field="address",
                    message=f"Adressen kunne ikke geokodes: {case.address_normalized}",
                ))
            else:
                case.latitude = result.latitude
                case.longitude = result.longitude
                case.geocode_score = result.score
                case.geocode_source = result.source
                case.geocode_status = GeocodeStatus.OK
        return _response(parsed.cases, issues, "graph", parsed.total_rows, datetime.now(UTC))


def _response(cases: list[Case], issues: list[RowIssue], source: str, total: int, fetched: datetime) -> CasesResponse:
    return CasesResponse(
        meta=SyncMeta(
            fetched_at=fetched,
            data_source=source,
            total_rows=total,
            resolved_count=sum(c.geocode_status == GeocodeStatus.OK for c in cases),
            unresolved_count=sum(c.geocode_status != GeocodeStatus.OK for c in cases),
            error_count=sum(i.severity == RowIssueSeverity.ERROR for i in issues),
            warning_count=sum(i.severity == RowIssueSeverity.WARNING for i in issues),
        ),
        cases=cases,
        issues=issues,
    )
