"""The committed OpenAPI document is the contract client generators consume.

A spec change must be a reviewed diff: regenerate with
``PYTHONPATH=sofabaton-x-server/src python -m sofabaton_server.openapi
sofabaton-x-server/openapi.json`` and commit the result.
"""

from __future__ import annotations

import json
from pathlib import Path

from sofabaton_server import openapi

COMMITTED = Path(__file__).resolve().parents[1] / "openapi.json"
REGENERATE = (
    "PYTHONPATH=sofabaton-x-server/src python -m sofabaton_server.openapi "
    "sofabaton-x-server/openapi.json"
)


def test_committed_openapi_matches_the_running_app() -> None:
    assert COMMITTED.exists(), f"run: {REGENERATE}"
    assert openapi.render(openapi.build_spec()) == COMMITTED.read_text(encoding="utf-8"), (
        f"openapi.json drifted; regenerate with: {REGENERATE}"
    )


def test_spec_quality_rules() -> None:
    spec = openapi.build_spec()
    seen: list[str] = []
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            assert "operationId" in op, f"{method.upper()} {path} has no operationId"
            seen.append(op["operationId"])
            for code, resp in op.get("responses", {}).items():
                content = resp.get("content", {}).get("application/json")
                if not content:
                    continue
                schema = content["schema"]
                # No anonymous object schemas inline: a $ref, a list of $refs,
                # or a nullable $ref (anyOf with null) only.
                assert _is_named(schema), f"{op['operationId']} {code}: inline schema {schema}"
    assert len(seen) == len(set(seen)), "duplicate operationIds"
    assert "servers" not in spec                                   # default settings advertise nothing
    schemas = spec["components"]["schemas"]
    for name in ("Activity", "Device", "Command", "Button", "Macro", "Favorite", "HubStatus", "HubInfo",
                 "HubConfig", "HubView", "HubStatusView", "Accepted", "Problem", "ServerInfo", "SendCommand"):
        assert name in schemas, name


def _is_named(schema: dict) -> bool:
    if "$ref" in schema:
        return True
    if schema.get("type") == "array" and "items" in schema:
        return _is_named(schema["items"])
    if "anyOf" in schema:
        return all(_is_named(s) or s == {"type": "null"} for s in schema["anyOf"])
    return False


def test_every_422_is_a_problem() -> None:
    spec = json.loads((Path(openapi.__file__).parents[2] / "openapi.json").read_text(encoding="utf-8"))
    schemas = spec["components"]["schemas"]
    assert "HTTPValidationError" not in schemas and "ValidationError" not in schemas
    seen = 0
    for operations in spec["paths"].values():
        for operation in operations.values():
            response = operation.get("responses", {}).get("422")
            if response is None:
                continue
            seen += 1
            assert response["description"] == "Validation error"
            assert response["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Problem"}
    assert seen >= 1
