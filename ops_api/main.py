from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    prometheus_url: str = os.getenv("PROMETHEUS_URL", "http://172.30.1.240").rstrip("/")
    prometheus_host_header: str | None = os.getenv(
        "PROMETHEUS_HOST_HEADER",
        "prometheus.homelab.local",
    ) or None
    proxmox_url: str = os.getenv("PROXMOX_URL", "https://172.30.1.12:8006").rstrip("/")
    proxmox_verify_tls: bool = _bool_env("PROXMOX_VERIFY_TLS", False)
    proxmox_timeout: float = float(os.getenv("PROXMOX_TIMEOUT", "8"))

    pve_api_token_id: str | None = os.getenv("PVE_API_TOKEN_ID")
    pve_api_token_secret: str | None = os.getenv("PVE_API_TOKEN_SECRET")
    pve_username: str | None = os.getenv("PVE_USERNAME")
    pve_password: str | None = os.getenv("PVE_PASSWORD")

    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("OPS_API_CORS_ORIGINS", "*").split(",")
        if origin.strip()
    )
    stream_interval_seconds: float = float(os.getenv("OPS_API_STREAM_INTERVAL_SECONDS", "5"))


settings = Settings()

app = FastAPI(
    title="Portfolio Ops API",
    version="0.1.0",
    description="Read-only sanitized API for Prometheus and Proxmox-backed portfolio dashboards.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


async def prometheus_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{settings.prometheus_url}{path}"
    headers = {"Host": settings.prometheus_host_header} if settings.prometheus_host_header else None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Prometheus request failed: {exc}") from exc


async def prometheus_ready() -> str:
    url = f"{settings.prometheus_url}/-/ready"
    headers = {"Host": settings.prometheus_host_header} if settings.prometheus_host_header else None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.text.strip()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Prometheus readiness failed: {exc}") from exc


class ProxmoxClient:
    def __init__(self, config: Settings):
        self.config = config
        self._ticket: str | None = None
        self._csrf: str | None = None
        self._ticket_expiry = 0.0

    def auth_mode(self) -> str:
        if self.config.pve_api_token_id and self.config.pve_api_token_secret:
            return "api-token"
        if self.config.pve_username and self.config.pve_password:
            return "ticket"
        return "missing"

    async def headers(self) -> dict[str, str]:
        if self.config.pve_api_token_id and self.config.pve_api_token_secret:
            token = f"{self.config.pve_api_token_id}={self.config.pve_api_token_secret}"
            return {"Authorization": f"PVEAPIToken={token}"}

        if self.config.pve_username and self.config.pve_password:
            await self.ensure_ticket()
            headers = {"Cookie": f"PVEAuthCookie={self._ticket}"}
            if self._csrf:
                headers["CSRFPreventionToken"] = self._csrf
            return headers

        raise HTTPException(
            status_code=503,
            detail=(
                "Proxmox auth is not configured. Set PVE_API_TOKEN_ID and "
                "PVE_API_TOKEN_SECRET, or PVE_USERNAME and PVE_PASSWORD."
            ),
        )

    async def ensure_ticket(self) -> None:
        if self._ticket and time.time() < self._ticket_expiry:
            return
        url = f"{self.config.proxmox_url}/api2/json/access/ticket"
        data = {
            "username": self.config.pve_username,
            "password": self.config.pve_password,
        }
        try:
            async with httpx.AsyncClient(
                verify=self.config.proxmox_verify_tls,
                timeout=self.config.proxmox_timeout,
            ) as client:
                response = await client.post(url, data=data)
                response.raise_for_status()
                payload = response.json()["data"]
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=401, detail="Proxmox login failed") from exc
        except (httpx.HTTPError, KeyError) as exc:
            raise HTTPException(status_code=502, detail=f"Proxmox login request failed: {exc}") from exc

        self._ticket = payload["ticket"]
        self._csrf = payload.get("CSRFPreventionToken")
        self._ticket_expiry = time.time() + 90 * 60

    async def get(self, path: str, params: dict[str, Any] | None = None, auth: bool = True) -> Any:
        url = f"{self.config.proxmox_url}/api2/json{path}"
        headers = await self.headers() if auth else {}
        try:
            async with httpx.AsyncClient(
                verify=self.config.proxmox_verify_tls,
                timeout=self.config.proxmox_timeout,
            ) as client:
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                return response.json().get("data")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise HTTPException(status_code=401, detail="Proxmox authentication failed") from exc
            raise HTTPException(status_code=502, detail=f"Proxmox API error: {exc}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Proxmox request failed: {exc}") from exc


proxmox = ProxmoxClient(settings)


def _pack_result(value: Any) -> dict[str, Any]:
    if isinstance(value, Exception):
        return {"ok": False, "error": str(value)}
    return {"ok": True, "data": value}


def _pve_resource_view(resource: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "id",
        "type",
        "node",
        "name",
        "status",
        "vmid",
        "cpu",
        "maxcpu",
        "mem",
        "maxmem",
        "disk",
        "maxdisk",
        "uptime",
        "template",
        "storage",
        "pool",
    }
    return {key: resource.get(key) for key in allowed if key in resource}


def _target_view(target: dict[str, Any]) -> dict[str, Any]:
    labels = target.get("labels", {})
    return {
        "job": labels.get("job"),
        "instance": labels.get("instance"),
        "health": target.get("health"),
        "lastError": target.get("lastError") or None,
        "scrapeUrl": target.get("scrapeUrl"),
    }


async def prom_query(query: str) -> list[dict[str, Any]]:
    payload = await prometheus_get("/api/v1/query", {"query": query})
    if payload.get("status") != "success":
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {payload}")
    return payload.get("data", {}).get("result", [])


def scalar_value(result: list[dict[str, Any]]) -> float | None:
    if not result:
        return None
    try:
        return float(result[0]["value"][1])
    except (KeyError, IndexError, TypeError, ValueError):
        return None


@app.get("/api/health")
async def health() -> dict[str, Any]:
    proxmox_auth_available = proxmox.auth_mode() != "missing"
    checks = await asyncio.gather(
        prometheus_ready(),
        proxmox.get("/version", auth=proxmox_auth_available),
        return_exceptions=True,
    )
    return {
        "ok": all(not isinstance(check, Exception) for check in checks),
        "prometheus": "ok" if not isinstance(checks[0], Exception) else str(checks[0]),
        "proxmox": "ok" if not isinstance(checks[1], Exception) else str(checks[1]),
        "proxmoxAuthMode": proxmox.auth_mode(),
    }


@app.get("/api/prometheus/query")
async def prometheus_query(
    query: str = Query(..., min_length=1, max_length=512),
) -> dict[str, Any]:
    return await prometheus_get("/api/v1/query", {"query": query})


@app.get("/api/prometheus/targets")
async def prometheus_targets() -> dict[str, Any]:
    payload = await prometheus_get("/api/v1/targets")
    targets = payload.get("data", {}).get("activeTargets", [])
    return {
        "status": payload.get("status"),
        "count": len(targets),
        "targets": [_target_view(target) for target in targets],
    }


@app.get("/api/prometheus/summary")
async def prometheus_summary() -> dict[str, Any]:
    targets_payload, up, pods, deployments, pvcs, containers = await asyncio.gather(
        prometheus_targets(),
        prom_query("count(up)"),
        prom_query("count(kube_pod_info)"),
        prom_query("count(kube_deployment_status_replicas_available)"),
        prom_query("count(kube_persistentvolumeclaim_status_phase)"),
        prom_query("count(container_cpu_usage_seconds_total)"),
    )
    return {
        "targets": {
            "total": targets_payload["count"],
            "up": sum(1 for target in targets_payload["targets"] if target["health"] == "up"),
            "down": sum(1 for target in targets_payload["targets"] if target["health"] != "up"),
        },
        "series": {
            "up": scalar_value(up),
            "pods": scalar_value(pods),
            "deployments": scalar_value(deployments),
            "pvcPhases": scalar_value(pvcs),
            "containerCpuSeries": scalar_value(containers),
        },
    }


@app.get("/api/proxmox/version")
async def proxmox_version() -> dict[str, Any]:
    data = await proxmox.get("/version", auth=proxmox.auth_mode() != "missing")
    return {"authMode": proxmox.auth_mode(), "version": data}


@app.get("/api/proxmox/resources")
async def proxmox_resources(
    type: str | None = Query(default=None, pattern="^(vm|node|storage|pool|sdn)$"),
) -> dict[str, Any]:
    params = {"type": type} if type else None
    data = await proxmox.get("/cluster/resources", params=params)
    resources = [_pve_resource_view(item) for item in data]
    return {"count": len(resources), "resources": resources}


@app.get("/api/proxmox/nodes")
async def proxmox_nodes() -> dict[str, Any]:
    data = await proxmox.get("/nodes")
    nodes = [
        {
            "node": item.get("node"),
            "status": item.get("status"),
            "cpu": item.get("cpu"),
            "maxcpu": item.get("maxcpu"),
            "mem": item.get("mem"),
            "maxmem": item.get("maxmem"),
            "uptime": item.get("uptime"),
        }
        for item in data
    ]
    return {"count": len(nodes), "nodes": nodes}


@app.get("/api/ops/summary")
async def ops_summary() -> dict[str, Any]:
    prom_task = asyncio.create_task(prometheus_summary())
    pve_nodes_task = asyncio.create_task(proxmox_nodes())
    pve_resources_task = asyncio.create_task(proxmox_resources(type="vm"))

    prom_result, pve_nodes_result, pve_resources_result = await asyncio.gather(
        prom_task,
        pve_nodes_task,
        pve_resources_task,
        return_exceptions=True,
    )

    return {
        "generatedAt": int(time.time()),
        "prometheus": _pack_result(prom_result),
        "proxmoxNodes": _pack_result(pve_nodes_result),
        "proxmoxVMs": _pack_result(pve_resources_result),
    }


async def ops_snapshot() -> dict[str, Any]:
    health_task = asyncio.create_task(health())
    targets_task = asyncio.create_task(prometheus_targets())
    prom_summary_task = asyncio.create_task(prometheus_summary())
    argocd_task = asyncio.create_task(prometheus_query(query="argocd_app_info"))
    pve_nodes_task = asyncio.create_task(proxmox_nodes())
    pve_resources_task = asyncio.create_task(proxmox_resources(type="vm"))

    (
        health_result,
        targets_result,
        prom_summary_result,
        argocd_result,
        pve_nodes_result,
        pve_resources_result,
    ) = await asyncio.gather(
        health_task,
        targets_task,
        prom_summary_task,
        argocd_task,
        pve_nodes_task,
        pve_resources_task,
        return_exceptions=True,
    )

    return {
        "type": "ops_snapshot",
        "generatedAt": int(time.time()),
        "health": _pack_result(health_result),
        "prometheusTargets": _pack_result(targets_result),
        "prometheusSummary": _pack_result(prom_summary_result),
        "argocdAppInfo": _pack_result(argocd_result),
        "proxmoxNodes": _pack_result(pve_nodes_result),
        "proxmoxVMs": _pack_result(pve_resources_result),
    }


@app.websocket("/api/ops/stream")
async def ops_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    interval = max(2.0, settings.stream_interval_seconds)
    try:
        while True:
            await websocket.send_json(await ops_snapshot())
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return
