from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.schemas.cases import CasesResponse, HealthResponse
from app.services.pipeline import PipelineError, load_cases

settings = get_settings()
app = FastAPI(title="Salgskort API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        data_source=settings.data_source,
        graph_configured=settings.graph_configured,
        geocode_provider=settings.geocode_provider,
    )


@app.get("/api/cases", response_model=CasesResponse)
async def cases(
    advisor: str | None = Query(default=None),
    department: str | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> CasesResponse:
    try:
        result = await load_cases(settings)
    except PipelineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if advisor or department or status or search:
        needle = search.lower().strip() if search else None
        result.cases = [
            case for case in result.cases
            if (not advisor or case.advisor == advisor)
            and (not department or case.department == department)
            and (not status or (case.status and case.status.value == status))
            and (not needle or needle in " ".join(filter(None, [case.customer_name, case.address_raw, case.case_number])).lower())
        ]
    return result
