from __future__ import annotations

import argparse
import socket
import sys
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

from clusterlab.config import load_settings


def port_is_busy(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def main() -> None:
    app_root = Path(__file__).resolve().parent.parent
    load_dotenv(app_root / ".env")
    settings = load_settings(root=app_root)
    parser = argparse.ArgumentParser(description="Start the ClusterLab local server.")
    parser.add_argument("--host", default=settings.host, help=f"Bind address (default: {settings.host})")
    parser.add_argument("--port", type=int, default=settings.port, help=f"Listen port (default: {settings.port})")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload on code changes (can be unstable on Windows/Google Drive)",
    )
    args = parser.parse_args()

    if port_is_busy(args.host, args.port):
        print(
            f"Port {args.port} is already in use on {args.host}.\n"
            "A previous ClusterLab server may still be running.\n"
            "Try:\n"
            f"  clusterlab --port {args.port + 1}\n"
            "Or stop the old process in Task Manager / close the old terminal, then retry.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    uvicorn.run(
        "app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
