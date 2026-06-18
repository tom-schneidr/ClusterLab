from __future__ import annotations

import re
from pathlib import Path

from fastapi.testclient import TestClient

from clusterlab.app_factory import create_app


def test_static_entrypoints_are_served(tmp_path) -> None:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    assert client.get("/").status_code == 200
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/js/ui/hats.js").status_code == 200
    assert client.get("/static/js/graph/index.js").status_code == 200


def test_index_references_existing_assets() -> None:
    root = Path(__file__).resolve().parent.parent
    html = (root / "static" / "index.html").read_text(encoding="utf-8")

    for href in re.findall(r'(?:href|src)="(/static/[^"?]+)', html):
        assert (root / href.removeprefix("/")).exists(), href


def test_static_js_import_paths_exist() -> None:
    root = Path(__file__).resolve().parent.parent
    for source in (root / "static").rglob("*.js"):
        text = source.read_text(encoding="utf-8")
        for imported in re.findall(r"from '((?:\./|\.\./)[^']+)'", text):
            target = (source.parent / imported).resolve()
            assert target.exists(), f"{source.relative_to(root)} imports missing {imported}"
