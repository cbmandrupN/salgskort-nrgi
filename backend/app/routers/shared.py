from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.shared_auth import require_shared_access
from app.schemas.shared import SharedSnapshot, SharedWrite
from app.services.shared_store import MAX_JSON_BYTES, read_snapshot, replace_snapshot

router = APIRouter(prefix="/api/shared", dependencies=[Depends(require_shared_access)])


@router.get("/cases", response_model=SharedSnapshot, response_model_exclude_none=False)
def get_shared_cases() -> SharedSnapshot:
    return read_snapshot(get_settings().shared_database_path)


@router.put("/cases", response_model=SharedSnapshot)
async def put_shared_cases(request: Request) -> SharedSnapshot:
    length = request.headers.get("content-length")
    if length is not None:
        try:
            size = int(length)
        except ValueError:
            raise HTTPException(422, "Invalid content length") from None
        if size < 0:
            raise HTTPException(422, "Invalid content length")
        if size > MAX_JSON_BYTES:
            raise HTTPException(413, "Shared snapshot exceeds 10 MiB")
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(422, "Expected an application/json snapshot")
    if request.headers.get("content-encoding", "identity").lower() != "identity":
        raise HTTPException(422, "Compressed snapshots are not accepted")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_JSON_BYTES:
            raise HTTPException(413, "Shared snapshot exceeds 10 MiB")
        body.extend(chunk)
    try:
        payload = SharedWrite.model_validate_json(body)
    except ValidationError:
        # Do not echo rejected raw/contact fields in validation responses or logs.
        raise HTTPException(422, "Invalid shared snapshot fields, scope, or counters") from None
    return await run_in_threadpool(
        replace_snapshot, get_settings().shared_database_path, payload,
    )
