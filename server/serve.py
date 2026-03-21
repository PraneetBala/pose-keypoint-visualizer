#!/usr/bin/env python3
"""
serve.py — Development server for the pose keypoint visualizer.

Serves the Three.js viewer and exposes a /convert endpoint so the browser
can upload .npy files directly without running convert.py manually.

Usage:
  python server/serve.py
  python server/serve.py --port 8080
"""

import argparse
import io
import json
import pathlib
import sys
import tempfile
import webbrowser

# Optional numpy — only needed for /convert endpoint
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

ROOT = pathlib.Path(__file__).parent.parent
VIEWER = ROOT / "viewer"

try:
    from fastapi import FastAPI, File, Form, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False


def build_app():
    app = FastAPI(title="Pose Keypoint Visualizer")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/convert")
    async def convert_npy(
        file: UploadFile = File(...),
        adjacency: str = Form(None),
        fps: float = Form(30.0),
        labels: str = Form(None),
    ):
        if not HAS_NUMPY:
            raise HTTPException(503, "numpy not installed — run: pip install numpy")

        content = await file.read()
        try:
            arr = np.load(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(400, f"Could not load .npy file: {e}")

        if arr.ndim == 2:
            arr = arr[np.newaxis]
        if arr.ndim != 3 or arr.shape[-1] not in (2, 3):
            raise HTTPException(
                400,
                f"Expected shape (T,N,2) or (T,N,3), got {arr.shape}",
            )
        if arr.shape[-1] == 2:
            z = np.zeros((*arr.shape[:2], 1), dtype=arr.dtype)
            arr = np.concatenate([arr, z], axis=-1)

        arr = arr.astype(float)
        T, N, _ = arr.shape

        adj = None
        if adjacency:
            try:
                adj = json.loads(adjacency)
                if isinstance(adj, dict):
                    adj = adj.get("edges", adj.get("adjacency", []))
            except json.JSONDecodeError as e:
                raise HTTPException(400, f"Invalid adjacency JSON: {e}")

        label_list = None
        if labels:
            label_list = [l.strip() for l in labels.splitlines() if l.strip()]
            if len(label_list) != N:
                label_list = None

        flat = arr.reshape(-1, 3)
        root_std = float(np.std(arr[:, 0, :]))

        payload = {
            "schema_version": "1.0",
            "name": pathlib.Path(file.filename).stem,
            "fps": fps,
            "frames": T,
            "joints": N,
            "keypoints": arr.tolist(),
            "adjacency": adj,
            "labels": label_list,
            "meta": {
                "bbox_min": flat.min(axis=0).tolist(),
                "bbox_max": flat.max(axis=0).tolist(),
                "is_stationary": root_std < 0.05,
                "root_std": root_std,
            },
        }
        return JSONResponse(payload)

    # Serve the viewer as a SPA — this must come last
    app.mount("/", StaticFiles(directory=str(VIEWER / "dist"), html=True), name="viewer")
    return app


def fallback_server(port: int):
    """Simple stdlib HTTP server when FastAPI is not installed."""
    import http.server
    import os

    dist = VIEWER / "dist"
    if not dist.exists():
        sys.exit("[ERROR] viewer/dist not found. Run: cd viewer && npm run build")

    os.chdir(dist)
    handler = http.server.SimpleHTTPRequestHandler

    class QuietHandler(handler):
        def log_message(self, fmt, *args):
            pass

    import socketserver
    with socketserver.TCPServer(("", port), QuietHandler) as httpd:
        url = f"http://localhost:{port}"
        print(f"[Visualizer] Serving at {url}  (Ctrl+C to stop)")
        webbrowser.open(url)
        httpd.serve_forever()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    dist = VIEWER / "dist"
    if not dist.exists():
        print("[INFO] viewer/dist not found. Building...")
        import subprocess
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=str(VIEWER),
            shell=True,
        )
        if result.returncode != 0:
            sys.exit("[ERROR] npm build failed. Is Node.js installed?")

    if HAS_FASTAPI:
        app = build_app()
        url = f"http://localhost:{args.port}"
        print(f"[Visualizer] Serving at {url}  (Ctrl+C to stop)")
        if not args.no_browser:
            webbrowser.open(url)
        uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")
    else:
        print("[WARN] FastAPI not found — .npy upload disabled. pip install fastapi uvicorn")
        fallback_server(args.port)


if __name__ == "__main__":
    main()
