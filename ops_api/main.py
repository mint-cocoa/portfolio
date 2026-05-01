from __future__ import annotations

import asyncio
import json
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
    edge_proxy_metrics_file: str = os.getenv(
        "OPS_API_EDGE_PROXY_METRICS_FILE",
        "/run/iouring-runtime/tcp_reverse_proxy.metrics.json",
    )
    edge_runtime_services: tuple[str, ...] = tuple(
        service.strip()
        for service in os.getenv(
            "OPS_API_EDGE_RUNTIME_SERVICES",
            "tcp_reverse_proxy.service,file_store_server.service,speedtest_server.service",
        ).split(",")
        if service.strip()
    )
    edge_kubernetes_upstream: str = os.getenv(
        "OPS_API_EDGE_KUBERNETES_UPSTREAM",
        "172.30.1.240:80",
    )
    edge_node_address: str = os.getenv("OPS_API_EDGE_NODE_ADDRESS", "172.30.1.27")
    edge_public_entry: str = os.getenv("OPS_API_EDGE_PUBLIC_ENTRY", "WAN :80 / :443")
    edge_public_listen: str = os.getenv("OPS_API_EDGE_PUBLIC_LISTEN", "0.0.0.0:80 / 443")
    edge_kubernetes_label: str = os.getenv("OPS_API_EDGE_KUBERNETES_LABEL", "MetalLB VIP 172.30.1.240")
    kubernetes_api_endpoint: str = os.getenv("OPS_API_KUBERNETES_API_ENDPOINT", "172.30.1.27:6443")
    kubernetes_control_plane_endpoints: tuple[str, ...] = tuple(
        endpoint.strip()
        for endpoint in os.getenv(
            "OPS_API_KUBERNETES_CONTROL_PLANE_ENDPOINTS",
            "172.30.1.231:6443,172.30.1.232:6443,172.30.1.233:6443",
        ).split(",")
        if endpoint.strip()
    )
    edge_probe_timeout: float = float(os.getenv("OPS_API_EDGE_PROBE_TIMEOUT", "2"))
    github_api_url: str = os.getenv("OPS_API_GITHUB_API_URL", "https://api.github.com").rstrip("/")
    github_token: str | None = os.getenv("OPS_API_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    deploy_repo_owner: str = os.getenv("OPS_API_DEPLOY_REPO_OWNER", "mint-cocoa")
    deploy_repo_name: str = os.getenv("OPS_API_DEPLOY_REPO_NAME", "portfolio")
    deploy_branch: str = os.getenv("OPS_API_DEPLOY_BRANCH", "master")
    deploy_workflow_name: str = os.getenv("OPS_API_DEPLOY_WORKFLOW_NAME", "portfolio image")
    gitops_repo_owner: str = os.getenv("OPS_API_GITOPS_REPO_OWNER", "mint-cocoa")
    gitops_repo_name: str = os.getenv("OPS_API_GITOPS_REPO_NAME", "home-k8s-gitops")
    gitops_values_path: str = os.getenv(
        "OPS_API_GITOPS_VALUES_PATH",
        "apps/portfolio/values.yaml",
    )
    gitops_local_repo: str | None = os.getenv("OPS_API_GITOPS_LOCAL_REPO", "/home/cocoa/home-k8s-gitops")
    argocd_namespace: str = os.getenv("OPS_API_ARGOCD_NAMESPACE", "argocd")
    argocd_application: str = os.getenv("OPS_API_ARGOCD_APPLICATION", "portfolio")
    kubernetes_namespace: str = os.getenv("OPS_API_KUBERNETES_NAMESPACE", "portfolio")
    kubernetes_deployment: str = os.getenv("OPS_API_KUBERNETES_DEPLOYMENT", "portfolio")
    kubectl_bin: str = os.getenv(
        "OPS_API_KUBECTL_BIN",
        "/home/cocoa/.local/bin/kubectl" if os.path.exists("/home/cocoa/.local/bin/kubectl") else "kubectl",
    )
    live_dashboard_url: str = os.getenv(
        "OPS_API_LIVE_DASHBOARD_URL",
        "https://mint-cocoa.github.io/portfolio/devops/OpsDashboard.html",
    )


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


def _evidence_card(label: str, value: Any, detail: str = "", status: str | None = None) -> dict[str, Any]:
    return {
        "label": label,
        "value": "-" if value is None or value == "" else str(value),
        "detail": detail,
        "status": status,
    }


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


def _parse_key_value_lines(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


async def _run_command(*args: str, timeout: float = 2.0) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.communicate()
        return 124, "", "command timed out"
    return (
        process.returncode,
        stdout.decode(errors="replace"),
        stderr.decode(errors="replace"),
    )


def _short_sha(value: str | None, length: int = 7) -> str | None:
    return value[:length] if value else None


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mintcocoa-ops-dashboard",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


async def _github_get(path: str, params: dict[str, Any] | None = None) -> Any:
    url = f"{settings.github_api_url}{path}"
    async with httpx.AsyncClient(timeout=6, headers=_github_headers()) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def _status_from_action(status: str | None, conclusion: str | None) -> str:
    if status == "completed":
        return conclusion or "completed"
    return status or "unknown"


def _step_status(ok: bool, pending: bool = False) -> str:
    if pending:
        return "running"
    return "success" if ok else "unknown"


async def _kubectl_json(*args: str, timeout: float = 3.0) -> dict[str, Any] | None:
    rc, stdout, _stderr = await _run_command(
        settings.kubectl_bin,
        *args,
        "-o",
        "json",
        timeout=timeout,
    )
    if rc != 0:
        return None
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


async def _systemd_unit_view(unit: str) -> dict[str, Any]:
    rc, stdout, stderr = await _run_command(
        "systemctl",
        "show",
        unit,
        "--no-pager",
        "-p",
        "ActiveState",
        "-p",
        "SubState",
        "-p",
        "MainPID",
        "-p",
        "Description",
        "-p",
        "FragmentPath",
        "-p",
        "EnvironmentFiles",
        timeout=2.0,
    )
    if rc != 0:
        return {
            "unit": unit,
            "activeState": "unknown",
            "subState": "unknown",
            "mainPid": 0,
            "description": stderr.strip() or "systemctl show failed",
            "environmentFiles": [],
        }

    fields = _parse_key_value_lines(stdout)
    environment_files = []
    for item in fields.get("EnvironmentFiles", "").split():
        if item.startswith("/"):
            environment_files.append(item)

    return {
        "unit": unit,
        "activeState": fields.get("ActiveState", "unknown"),
        "subState": fields.get("SubState", "unknown"),
        "mainPid": int(fields.get("MainPID") or 0),
        "description": fields.get("Description") or unit,
        "fragmentPath": fields.get("FragmentPath"),
        "environmentFiles": environment_files,
    }


async def _read_text_file(path: str) -> str | None:
    try:
        return await asyncio.to_thread(lambda: open(path, encoding="utf-8").read())
    except OSError:
        return None


async def _read_json_file(path: str) -> dict[str, Any] | None:
    text = await _read_text_file(path)
    if not text:
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _first_host_port_from_env(env: dict[str, str]) -> tuple[str, int] | None:
    for key, host in env.items():
        if not key.endswith("_HOST") or not host:
            continue
        port_key = f"{key[:-5]}_PORT"
        port = env.get(port_key)
        if not port:
            continue
        try:
            return host, int(port)
        except ValueError:
            continue
    return None


async def _probe_http(host: str, port: int) -> dict[str, Any]:
    url = f"http://{host}:{port}/"
    try:
        async with httpx.AsyncClient(timeout=settings.edge_probe_timeout) as client:
            response = await client.head(url, follow_redirects=False)
            return {
                "ok": True,
                "url": url,
                "statusCode": response.status_code,
                "server": response.headers.get("server"),
                "contentType": response.headers.get("content-type"),
            }
    except httpx.HTTPError as exc:
        return {"ok": False, "url": url, "error": str(exc)}


def _normalize_upstream(host: str, port: int) -> str:
    if host in {"0.0.0.0", "::"}:
        host = "127.0.0.1"
    return f"{host}:{port}"


def _route_destination(upstream: str, cxx_web_upstreams: set[str]) -> str:
    if upstream in cxx_web_upstreams:
        return "cxx-web"
    if upstream == settings.edge_kubernetes_upstream:
        return "kubernetes"
    if upstream.startswith("127.0.0.1:") or upstream.startswith("localhost:"):
        return "docker-or-local"
    return "external"


async def edge_runtime_snapshot() -> dict[str, Any]:
    proxy_metrics = await _read_json_file(settings.edge_proxy_metrics_file)
    unit_results = await asyncio.gather(
        *(_systemd_unit_view(unit) for unit in settings.edge_runtime_services),
        return_exceptions=True,
    )

    services: list[dict[str, Any]] = []
    cxx_web_upstreams: set[str] = set()
    for unit_result in unit_results:
        if isinstance(unit_result, Exception):
            continue
        service = dict(unit_result)
        env: dict[str, str] = {}
        for env_file in service.get("environmentFiles", []):
            text = await _read_text_file(env_file)
            if text:
                env.update(_parse_key_value_lines(text))

        is_proxy = service["unit"] == "tcp_reverse_proxy.service"
        endpoint = None if is_proxy else _first_host_port_from_env(env)
        probe = None
        upstream = None
        runtime = "RuntimeProxy" if is_proxy else None
        if endpoint:
            host, port = endpoint
            upstream = _normalize_upstream(host, port)
            probe = await _probe_http(host, port)
            if probe.get("server") == "iouring_runtime_web":
                runtime = "RuntimeWeb"
                cxx_web_upstreams.add(upstream)

        services.append(
            {
                **service,
                "runtime": runtime,
                "upstream": upstream,
                "probe": probe,
            }
        )

    routes = []
    if proxy_metrics:
        seen_routes: set[tuple[str, str]] = set()
        for route in proxy_metrics.get("configured_routes", []):
            upstream = route.get("upstream")
            hostname = route.get("hostname")
            if not hostname or not upstream:
                continue
            route_key = (hostname, upstream)
            if route_key in seen_routes:
                continue
            seen_routes.add(route_key)
            routes.append(
                {
                    **route,
                    "destination": _route_destination(upstream, cxx_web_upstreams),
                }
            )
        default_upstream = proxy_metrics.get("default_upstream")
        if default_upstream:
            routes.insert(
                0,
                {
                    "hostname": "default",
                    "upstream": default_upstream,
                    "destination": _route_destination(default_upstream, cxx_web_upstreams),
                },
            )

    destination_counts: dict[str, int] = {}
    for route in routes:
        destination = route["destination"]
        destination_counts[destination] = destination_counts.get(destination, 0) + 1

    return {
        "generatedAt": int(time.time()),
        "proxy": proxy_metrics,
        "services": services,
        "routes": routes,
        "destinationCounts": destination_counts,
        "topology": {
            "edgeNode": settings.edge_node_address,
            "publicEntry": settings.edge_public_entry,
            "publicListen": settings.edge_public_listen,
            "kubernetesUpstream": settings.edge_kubernetes_upstream,
            "kubernetesLabel": settings.edge_kubernetes_label,
            "kubernetesApiEndpoint": settings.kubernetes_api_endpoint,
            "controlPlaneEndpoints": settings.kubernetes_control_plane_endpoints,
        },
    }


async def _latest_workflow_runs() -> list[dict[str, Any]]:
    params = {
        "branch": settings.deploy_branch,
        "event": "push",
        "per_page": 10,
    }
    try:
        payload = await _github_get(
            f"/repos/{settings.deploy_repo_owner}/{settings.deploy_repo_name}/actions/runs",
            params,
        )
    except httpx.HTTPError:
        rc, stdout, _stderr = await _run_command(
            "gh",
            "api",
            f"repos/{settings.deploy_repo_owner}/{settings.deploy_repo_name}/actions/runs",
            "--method",
            "GET",
            "-f",
            f"branch={settings.deploy_branch}",
            "-f",
            "event=push",
            "-f",
            "per_page=10",
            timeout=4.0,
        )
        if rc != 0 or not stdout.strip():
            return []
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            return []
    runs = payload.get("workflow_runs", []) if isinstance(payload, dict) else []
    return [
        run
        for run in runs
        if run.get("name") == settings.deploy_workflow_name
    ]


async def _latest_gitops_commit() -> dict[str, Any] | None:
    try:
        payload = await _github_get(
            f"/repos/{settings.gitops_repo_owner}/{settings.gitops_repo_name}/commits",
            {
                "path": settings.gitops_values_path,
                "per_page": 1,
            },
        )
        if isinstance(payload, list) and payload:
            commit = payload[0]
            return {
                "sha": commit.get("sha"),
                "shortSha": _short_sha(commit.get("sha")),
                "message": commit.get("commit", {}).get("message"),
                "url": commit.get("html_url"),
                "createdAt": commit.get("commit", {}).get("committer", {}).get("date"),
            }
    except httpx.HTTPError:
        pass

    rc, stdout, _stderr = await _run_command(
        "gh",
        "api",
        f"repos/{settings.gitops_repo_owner}/{settings.gitops_repo_name}/commits",
        "--method",
        "GET",
        "-f",
        f"path={settings.gitops_values_path}",
        "-f",
        "per_page=1",
        "--jq",
        ".[0]",
        timeout=4.0,
    )
    if rc == 0 and stdout.strip():
        try:
            commit = json.loads(stdout)
            return {
                "sha": commit.get("sha"),
                "shortSha": _short_sha(commit.get("sha")),
                "message": commit.get("commit", {}).get("message"),
                "url": commit.get("html_url"),
                "createdAt": commit.get("commit", {}).get("committer", {}).get("date"),
                "source": "gh-cli",
            }
        except json.JSONDecodeError:
            pass

    if not settings.gitops_local_repo:
        return None

    rc, stdout, _stderr = await _run_command(
        "git",
        "-C",
        settings.gitops_local_repo,
        "log",
        "-1",
        "--format=%H%x1f%s%x1f%cI",
        "--",
        settings.gitops_values_path,
        timeout=2.0,
    )
    if rc != 0 or not stdout.strip():
        return None
    sha, message, created_at = (stdout.strip().split("\x1f") + ["", ""])[:3]
    return {
        "sha": sha,
        "shortSha": _short_sha(sha),
        "message": message,
        "url": f"https://github.com/{settings.gitops_repo_owner}/{settings.gitops_repo_name}/commit/{sha}",
        "createdAt": created_at,
        "source": "local-git",
    }


async def _argocd_application_view() -> dict[str, Any] | None:
    payload = await _kubectl_json(
        "get",
        "application",
        settings.argocd_application,
        "-n",
        settings.argocd_namespace,
    )
    if not payload:
        return None
    status = payload.get("status", {})
    sync = status.get("sync", {})
    health = status.get("health", {})
    operation = status.get("operationState", {})
    return {
        "name": payload.get("metadata", {}).get("name"),
        "namespace": payload.get("metadata", {}).get("namespace"),
        "syncStatus": sync.get("status"),
        "healthStatus": health.get("status"),
        "revision": sync.get("revision"),
        "shortRevision": _short_sha(sync.get("revision")),
        "operationPhase": operation.get("phase"),
        "message": operation.get("message"),
        "finishedAt": operation.get("finishedAt"),
    }


async def _kubernetes_deployment_view() -> dict[str, Any] | None:
    payload = await _kubectl_json(
        "get",
        "deployment",
        settings.kubernetes_deployment,
        "-n",
        settings.kubernetes_namespace,
    )
    if not payload:
        return None
    status = payload.get("status", {})
    spec = payload.get("spec", {})
    containers = spec.get("template", {}).get("spec", {}).get("containers", [])
    image = containers[0].get("image") if containers else None
    tag = image.rsplit(":", 1)[1] if image and ":" in image else None
    return {
        "name": payload.get("metadata", {}).get("name"),
        "namespace": payload.get("metadata", {}).get("namespace"),
        "image": image,
        "imageTag": tag,
        "shortImageTag": _short_sha(tag),
        "replicas": status.get("replicas") or 0,
        "readyReplicas": status.get("readyReplicas") or 0,
        "updatedReplicas": status.get("updatedReplicas") or 0,
        "availableReplicas": status.get("availableReplicas") or 0,
        "observedGeneration": status.get("observedGeneration"),
    }


async def _live_dashboard_view() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                settings.live_dashboard_url,
                headers={"Cache-Control": "no-cache"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        return {
            "url": settings.live_dashboard_url,
            "ok": False,
            "error": str(exc),
            "assets": [],
        }

    assets = []
    for marker in ('src="./assets/', 'href="./assets/'):
        start = 0
        while True:
            index = response.text.find(marker, start)
            if index == -1:
                break
            asset_start = index + len(marker)
            asset_end = response.text.find('"', asset_start)
            if asset_end == -1:
                break
            assets.append(response.text[asset_start:asset_end])
            start = asset_end + 1

    return {
        "url": settings.live_dashboard_url,
        "ok": True,
        "statusCode": response.status_code,
        "assets": assets,
    }


def _pipeline_steps(
    *,
    commit: dict[str, Any],
    actions: dict[str, Any],
    image: dict[str, Any],
    gitops: dict[str, Any] | None,
    argocd: dict[str, Any] | None,
    kubernetes: dict[str, Any] | None,
    live: dict[str, Any],
) -> list[dict[str, Any]]:
    action_status = actions.get("status")
    action_done = action_status == "success"
    image_matches_commit = bool(image.get("tag") and commit.get("sha") == image.get("tag"))
    gitops_matches = bool(gitops and argocd and gitops.get("sha") == argocd.get("revision"))
    argocd_ok = argocd and argocd.get("syncStatus") == "Synced" and argocd.get("healthStatus") == "Healthy"
    replicas = kubernetes.get("replicas") if kubernetes else 0
    ready = kubernetes.get("readyReplicas") if kubernetes else 0
    rollout_ok = bool(kubernetes and replicas and ready == replicas and image_matches_commit)

    return [
        {
            "id": "commit",
            "label": "Commit",
            "status": _step_status(bool(commit.get("sha"))),
            "primary": commit.get("shortSha") or "-",
            "secondary": commit.get("message") or settings.deploy_branch,
            "href": commit.get("url"),
            "details": commit,
        },
        {
            "id": "actions",
            "label": "GitHub Actions",
            "status": action_status or "unknown",
            "primary": actions.get("displayStatus") or action_status or "-",
            "secondary": actions.get("workflowName") or settings.deploy_workflow_name,
            "href": actions.get("url"),
            "details": actions,
        },
        {
            "id": "image",
            "label": "GHCR Image",
            "status": _step_status(image_matches_commit),
            "primary": image.get("shortTag") or "-",
            "secondary": image.get("repository") or "ghcr.io",
            "details": image,
        },
        {
            "id": "gitops",
            "label": "GitOps Commit",
            "status": _step_status(bool(gitops)),
            "primary": gitops.get("shortSha") if gitops else "-",
            "secondary": settings.gitops_values_path,
            "href": gitops.get("url") if gitops else None,
            "details": gitops or {},
        },
        {
            "id": "argocd",
            "label": "ArgoCD Sync",
            "status": _step_status(bool(argocd_ok)),
            "primary": argocd.get("syncStatus") if argocd else "-",
            "secondary": argocd.get("healthStatus") if argocd else "not observed",
            "details": {**(argocd or {}), "gitopsRevisionMatched": gitops_matches},
        },
        {
            "id": "rollout",
            "label": "K8s Rollout",
            "status": _step_status(rollout_ok),
            "primary": f"{ready}/{replicas}" if kubernetes else "-",
            "secondary": kubernetes.get("shortImageTag") if kubernetes else "deployment unavailable",
            "details": kubernetes or {},
        },
        {
            "id": "live",
            "label": "Live Route",
            "status": _step_status(bool(live.get("ok") and live.get("assets"))),
            "primary": f"{len(live.get('assets', []))} assets",
            "secondary": settings.live_dashboard_url.replace("https://", ""),
            "href": settings.live_dashboard_url,
            "details": live,
        },
    ]


async def deploy_pipeline_snapshot() -> dict[str, Any]:
    runs_result, gitops_result, argocd_result, kubernetes_result, live_result = await asyncio.gather(
        _latest_workflow_runs(),
        _latest_gitops_commit(),
        _argocd_application_view(),
        _kubernetes_deployment_view(),
        _live_dashboard_view(),
        return_exceptions=True,
    )

    runs = [] if isinstance(runs_result, Exception) else runs_result
    kubernetes = None if isinstance(kubernetes_result, Exception) else kubernetes_result
    deployed_tag = kubernetes.get("imageTag") if kubernetes else None
    selected_run = next((run for run in runs if run.get("head_sha") == deployed_tag), None)
    selected_run = selected_run or (runs[0] if runs else {})

    head_commit = selected_run.get("head_commit") or {}
    sha = selected_run.get("head_sha") or deployed_tag
    commit = {
        "sha": sha,
        "shortSha": _short_sha(sha),
        "branch": settings.deploy_branch,
        "message": head_commit.get("message"),
        "author": (head_commit.get("author") or {}).get("name"),
        "createdAt": selected_run.get("created_at"),
        "url": f"https://github.com/{settings.deploy_repo_owner}/{settings.deploy_repo_name}/commit/{sha}" if sha else None,
    }
    actions = {
        "workflowName": selected_run.get("name"),
        "runNumber": selected_run.get("run_number"),
        "runAttempt": selected_run.get("run_attempt"),
        "status": _status_from_action(selected_run.get("status"), selected_run.get("conclusion")),
        "displayStatus": selected_run.get("conclusion") or selected_run.get("status"),
        "url": selected_run.get("html_url"),
        "createdAt": selected_run.get("created_at"),
        "updatedAt": selected_run.get("updated_at"),
    }
    image_value = kubernetes.get("image") if kubernetes else None
    image_repo = image_value.rsplit(":", 1)[0] if image_value and ":" in image_value else image_value
    image = {
        "image": image_value,
        "repository": image_repo,
        "tag": deployed_tag,
        "shortTag": _short_sha(deployed_tag),
    }
    gitops = None if isinstance(gitops_result, Exception) else gitops_result
    argocd = None if isinstance(argocd_result, Exception) else argocd_result
    live = {"ok": False, "assets": [], "error": str(live_result)} if isinstance(live_result, Exception) else live_result

    return {
        "generatedAt": int(time.time()),
        "commit": commit,
        "actions": actions,
        "image": image,
        "gitops": gitops,
        "argocd": argocd,
        "kubernetes": kubernetes,
        "live": live,
        "steps": _pipeline_steps(
            commit=commit,
            actions=actions,
            image=image,
            gitops=gitops,
            argocd=argocd,
            kubernetes=kubernetes,
            live=live,
        ),
        "recentRuns": [
            {
                "sha": run.get("head_sha"),
                "shortSha": _short_sha(run.get("head_sha")),
                "status": _status_from_action(run.get("status"), run.get("conclusion")),
                "url": run.get("html_url"),
                "createdAt": run.get("created_at"),
            }
            for run in runs[:5]
        ],
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


@app.get("/api/edge-runtime")
async def edge_runtime() -> dict[str, Any]:
    return await edge_runtime_snapshot()


@app.get("/api/deploy-pipeline")
async def deploy_pipeline() -> dict[str, Any]:
    return await deploy_pipeline_snapshot()


@app.get("/api/portfolio/evidence")
async def portfolio_evidence(
    section: str = Query(
        default="overview",
        pattern="^(overview|deploy|infra|edge|apps|observability)$",
    ),
) -> dict[str, Any]:
    if section in {"deploy", "apps"}:
        deploy_result, summary_result = await asyncio.gather(
            deploy_pipeline_snapshot(),
            ops_summary(),
            return_exceptions=True,
        )
        deploy = deploy_result if isinstance(deploy_result, dict) else {}
        steps = deploy.get("steps", [])
        rollout = next((step for step in steps if step.get("id") == "rollout"), {})
        argocd = next((step for step in steps if step.get("id") == "argocd"), {})
        ok_steps = sum(1 for step in steps if step.get("status") in {"ok", "success"})
        cards = [
            _evidence_card("Pipeline", f"{ok_steps}/{len(steps) or '-'}", "ok steps"),
            _evidence_card("Rollout", rollout.get("primary"), rollout.get("secondary", "")),
            _evidence_card("Argo CD", argocd.get("primary"), argocd.get("secondary", "")),
            _evidence_card("Commit", _short_sha(deploy.get("commit", {}).get("sha")), deploy.get("commit", {}).get("branch", "")),
        ]
        return {
            "section": section,
            "generatedAt": int(time.time()),
            "title": "Deploy Pipeline" if section == "deploy" else "Prepared Workloads",
            "summary": "GitHub Actions, GHCR image, GitOps promotion, Argo CD sync, rollout evidence.",
            "endpoints": ["/deploy-pipeline"] if section == "deploy" else ["/deploy-pipeline", "/ops/summary"],
            "cards": cards,
            "sources": {
                "deployPipeline": _pack_result(deploy_result),
                "opsSummary": _pack_result(summary_result),
            },
        }

    if section == "edge":
        edge_result, health_result = await asyncio.gather(
            edge_runtime_snapshot(),
            health(),
            return_exceptions=True,
        )
        edge = edge_result if isinstance(edge_result, dict) else {}
        health_data = health_result if isinstance(health_result, dict) else {}
        services = edge.get("services", [])
        routes = edge.get("routes", [])
        cards = [
            _evidence_card("Runtime Services", len(services), ", ".join(filter(None, (service.get("runtime") or service.get("unit") for service in services)))),
            _evidence_card("Routes", len(routes), " · ".join(f"{key}:{value}" for key, value in edge.get("destinationCounts", {}).items())),
            _evidence_card("API", "ok" if health_data.get("ok") else "check", f"Prometheus {health_data.get('prometheus', '-')}"),
            _evidence_card("Proxy", edge.get("proxy", {}).get("default_upstream"), "default upstream"),
        ]
        return {
            "section": section,
            "generatedAt": int(time.time()),
            "title": "Edge Runtime",
            "summary": "C++ RuntimeProxy/RuntimeWeb route, upstream, service health evidence.",
            "endpoints": ["/edge-runtime", "/health"],
            "cards": cards,
            "sources": {
                "edgeRuntime": _pack_result(edge_result),
                "health": _pack_result(health_result),
            },
        }

    if section == "infra":
        nodes_result, resources_result, prom_result, targets_result = await asyncio.gather(
            proxmox_nodes(),
            proxmox_resources(type="vm"),
            prometheus_summary(),
            prometheus_targets(),
            return_exceptions=True,
        )
        nodes = nodes_result.get("nodes", []) if isinstance(nodes_result, dict) else []
        resources = resources_result.get("resources", []) if isinstance(resources_result, dict) else []
        prom = prom_result if isinstance(prom_result, dict) else {}
        targets = targets_result.get("targets", []) if isinstance(targets_result, dict) else []
        cards = [
            _evidence_card("PVE Nodes", len(nodes), nodes[0].get("node", "Proxmox API") if nodes else "Proxmox API"),
            _evidence_card("Running VMs", sum(1 for vm in resources if vm.get("status") == "running"), f"{len(resources)} qemu resources"),
            _evidence_card("Pods", prom.get("series", {}).get("pods"), f"{prom.get('series', {}).get('deployments', '-')} deployments"),
            _evidence_card("Targets", f"{sum(1 for target in targets if target.get('health') == 'up')}/{len(targets)}", "healthy scrape targets"),
        ]
        return {
            "section": section,
            "generatedAt": int(time.time()),
            "title": "Cluster Runtime",
            "summary": "Proxmox VM inventory and Prometheus-observed Kubernetes runtime evidence.",
            "endpoints": ["/proxmox/nodes", "/proxmox/resources?type=vm", "/prometheus/summary", "/prometheus/targets"],
            "cards": cards,
            "sources": {
                "proxmoxNodes": _pack_result(nodes_result),
                "proxmoxVMs": _pack_result(resources_result),
                "prometheusSummary": _pack_result(prom_result),
                "prometheusTargets": _pack_result(targets_result),
            },
        }

    if section == "observability":
        prom_result, targets_result, health_result = await asyncio.gather(
            prometheus_summary(),
            prometheus_targets(),
            health(),
            return_exceptions=True,
        )
        prom = prom_result if isinstance(prom_result, dict) else {}
        targets = targets_result.get("targets", []) if isinstance(targets_result, dict) else []
        health_data = health_result if isinstance(health_result, dict) else {}
        cards = [
            _evidence_card("Prometheus", health_data.get("prometheus"), "readiness"),
            _evidence_card("Targets Up", f"{sum(1 for target in targets if target.get('health') == 'up')}/{len(targets)}", "scrape health"),
            _evidence_card("Pods", prom.get("series", {}).get("pods"), "observed series"),
            _evidence_card("Deployments", prom.get("series", {}).get("deployments"), "kube-state-metrics"),
        ]
        return {
            "section": section,
            "generatedAt": int(time.time()),
            "title": "Observability",
            "summary": "Prometheus readiness, scrape target, pod, deployment evidence.",
            "endpoints": ["/prometheus/summary", "/prometheus/targets", "/health"],
            "cards": cards,
            "sources": {
                "prometheusSummary": _pack_result(prom_result),
                "prometheusTargets": _pack_result(targets_result),
                "health": _pack_result(health_result),
            },
        }

    health_result, summary_result = await asyncio.gather(
        health(),
        ops_summary(),
        return_exceptions=True,
    )
    health_data = health_result if isinstance(health_result, dict) else {}
    summary = summary_result if isinstance(summary_result, dict) else {}
    nodes = summary.get("proxmoxNodes", {}).get("data", {}).get("nodes", [])
    vms = summary.get("proxmoxVMs", {}).get("data", {}).get("resources", [])
    cards = [
        _evidence_card("Ops API", "ok" if health_data.get("ok") else "-", f"generated {summary.get('generatedAt', '-')}"),
        _evidence_card("Prometheus", health_data.get("prometheus"), "readiness"),
        _evidence_card("Proxmox", health_data.get("proxmox"), nodes[0].get("node", "node view") if nodes else "node view"),
        _evidence_card("VMs", sum(1 for vm in vms if vm.get("status") == "running"), f"{len(vms)} observed"),
    ]
    return {
        "section": section,
        "generatedAt": int(time.time()),
        "title": "Portfolio Health",
        "summary": "Compact health evidence for the current portfolio operations surface.",
        "endpoints": ["/health", "/ops/summary"],
        "cards": cards,
        "sources": {
            "health": _pack_result(health_result),
            "opsSummary": _pack_result(summary_result),
        },
    }


async def ops_snapshot() -> dict[str, Any]:
    health_task = asyncio.create_task(health())
    targets_task = asyncio.create_task(prometheus_targets())
    prom_summary_task = asyncio.create_task(prometheus_summary())
    argocd_task = asyncio.create_task(prometheus_query(query="argocd_app_info"))
    pve_nodes_task = asyncio.create_task(proxmox_nodes())
    pve_resources_task = asyncio.create_task(proxmox_resources(type="vm"))
    edge_runtime_task = asyncio.create_task(edge_runtime_snapshot())
    deploy_pipeline_task = asyncio.create_task(deploy_pipeline_snapshot())

    (
        health_result,
        targets_result,
        prom_summary_result,
        argocd_result,
        pve_nodes_result,
        pve_resources_result,
        edge_runtime_result,
        deploy_pipeline_result,
    ) = await asyncio.gather(
        health_task,
        targets_task,
        prom_summary_task,
        argocd_task,
        pve_nodes_task,
        pve_resources_task,
        edge_runtime_task,
        deploy_pipeline_task,
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
        "edgeRuntime": _pack_result(edge_runtime_result),
        "deployPipeline": _pack_result(deploy_pipeline_result),
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
