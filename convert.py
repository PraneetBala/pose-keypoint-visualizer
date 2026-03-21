#!/usr/bin/env python3
"""
convert.py — Convert .npy keypoint files to the visualizer JSON format.

Usage:
  python convert.py data.npy --adj adjacency.json --fps 30 --labels labels.txt --out output.json
  python convert.py data.npy                          # point cloud, no skeleton
  python convert.py data.json                         # validate/normalise an existing JSON
"""

import argparse
import json
import sys
import pathlib
import numpy as np


SCHEMA_VERSION = "1.0"


def load_npy(path: pathlib.Path) -> np.ndarray:
    arr = np.load(path)
    if arr.ndim == 2:          # (N, 3) → single frame
        arr = arr[np.newaxis]  # → (1, N, 3)
    if arr.ndim != 3 or arr.shape[-1] not in (2, 3):
        sys.exit(
            f"[ERROR] Expected shape (T, N, 2) or (T, N, 3), got {arr.shape}"
        )
    if arr.shape[-1] == 2:     # 2D → pad Z with zeros
        z = np.zeros((*arr.shape[:2], 1), dtype=arr.dtype)
        arr = np.concatenate([arr, z], axis=-1)
    return arr.astype(float)


def load_adjacency(path: pathlib.Path) -> list:
    with open(path) as f:
        adj = json.load(f)
    # Accept either [[i,j], ...] or {"edges": [[i,j], ...]}
    if isinstance(adj, dict):
        adj = adj.get("edges", adj.get("adjacency", []))
    if not isinstance(adj, list):
        sys.exit("[ERROR] Adjacency must be a list of [i, j] pairs.")
    return adj


def load_labels(path: pathlib.Path) -> list:
    lines = pathlib.Path(path).read_text().splitlines()
    return [l.strip() for l in lines if l.strip()]


def build_payload(arr: np.ndarray, adj=None, fps=30, labels=None, name="") -> dict:
    T, N, _ = arr.shape
    if adj is not None:
        for edge in adj:
            if len(edge) != 2 or not (0 <= edge[0] < N and 0 <= edge[1] < N):
                sys.exit(
                    f"[ERROR] Adjacency edge {edge} is out of range for {N} joints."
                )
    if labels is not None and len(labels) != N:
        print(
            f"[WARN] labels length ({len(labels)}) != joint count ({N}). Ignoring labels.",
            file=sys.stderr,
        )
        labels = None

    # Compute bounding box for the viewer's camera initialisation
    flat = arr.reshape(-1, 3)
    bbox_min = flat.min(axis=0).tolist()
    bbox_max = flat.max(axis=0).tolist()

    # Detect stationary vs moving (std of root joint across time)
    root_std = float(np.std(arr[:, 0, :]))  # joint 0 as root heuristic

    return {
        "schema_version": SCHEMA_VERSION,
        "name": name,
        "fps": fps,
        "frames": T,
        "joints": N,
        "keypoints": arr.tolist(),
        "adjacency": adj,           # None → point cloud mode
        "labels": labels,
        "meta": {
            "bbox_min": bbox_min,
            "bbox_max": bbox_max,
            "is_stationary": root_std < 0.05,
            "root_std": root_std,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Convert pose data to visualizer JSON.")
    parser.add_argument("input", help=".npy or .json file")
    parser.add_argument("--adj", "--adjacency", dest="adj",
                        help="Adjacency JSON file ([[i,j], ...])")
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--labels", help="Text file with one joint label per line")
    parser.add_argument("--out", "-o", help="Output .json path (default: <input>.json)")
    args = parser.parse_args()

    src = pathlib.Path(args.input)
    if not src.exists():
        sys.exit(f"[ERROR] File not found: {src}")

    if src.suffix == ".npy":
        arr = load_npy(src)
    elif src.suffix == ".json":
        with open(src) as f:
            raw = json.load(f)
        arr = np.array(raw["keypoints"])
        if arr.ndim == 2:
            arr = arr[np.newaxis]
        arr = arr.astype(float)
        # Carry over existing fields unless overridden
        if args.adj is None and raw.get("adjacency") is not None:
            adj = raw["adjacency"]
        else:
            adj = load_adjacency(args.adj) if args.adj else None
        labels = raw.get("labels")
        payload = build_payload(arr, adj, args.fps, labels, name=src.stem)
        out = pathlib.Path(args.out) if args.out else src.with_suffix(".out.json")
        out.write_text(json.dumps(payload, indent=2))
        print(f"[OK] Wrote {out}  ({arr.shape[0]} frames, {arr.shape[1]} joints)")
        return

    adj = load_adjacency(args.adj) if args.adj else None
    labels = load_labels(args.labels) if args.labels else None
    payload = build_payload(arr, adj, args.fps, labels, name=src.stem)

    out = pathlib.Path(args.out) if args.out else src.with_suffix(".json")
    out.write_text(json.dumps(payload, indent=2))
    print(f"[OK] Wrote {out}  ({arr.shape[0]} frames, {arr.shape[1]} joints)")


if __name__ == "__main__":
    main()
