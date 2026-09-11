import httpx
import pytest

from app.core.config import Settings
from app.services.graph_client import GraphDownloadError, GraphWorkbookClient, _share_id_from_url


@pytest.mark.parametrize("shared", [False, True])
async def test_download_redirect_does_not_forward_token(shared):
    settings = Settings(
        _env_file=None,
        graph_tenant_id="test-tenant",
        graph_client_id="test-client",
        graph_client_secret="test-only-secret",
        graph_site_id="test-site",
        graph_drive_item_path="Folder/Salgsliste #1.xlsx",
        graph_share_url="https://example.sharepoint.com/:x:/s/demo" if shared else "",
    )
    requests = []

    def respond(request):
        requests.append(request)
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "test-token", "expires_in": 3600})
        if request.url.host == "graph.microsoft.com":
            assert request.headers["authorization"] == "Bearer test-token"
            if shared:
                assert f"/shares/{_share_id_from_url(settings.graph_share_url)}/" in request.url.path
            else:
                assert b"Salgsliste%20%231.xlsx" in request.url.raw_path
            return httpx.Response(
                302, headers={"Location": "https://downloads.example.test/workbook.xlsx"}
            )
        assert request.url.host == "downloads.example.test"
        assert "authorization" not in request.headers
        return httpx.Response(200, content=b"test-workbook")

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        graph = GraphWorkbookClient(settings, client)
        assert await graph.download_workbook() == b"test-workbook"
    assert len(requests) == 3


async def test_permission_denied_is_an_error():
    settings = Settings(_env_file=None, graph_tenant_id="test")

    def respond(request):
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "test-token"})
        return httpx.Response(403, text="access denied")

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(GraphDownloadError, match="403"):
            await GraphWorkbookClient(settings, client).download_workbook()
