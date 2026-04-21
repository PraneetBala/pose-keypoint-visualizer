#!/usr/bin/env python3
"""
generate_examples.py — Creates example .npy files you can load into the visualizer.
Run from the repo root:  python examples/generate_examples.py
"""
import pathlib
import numpy as np

OUT = pathlib.Path(__file__).parent


def coco_walk(T=90, fps=30):
    """17-joint COCO walking skeleton (T frames)."""
    frames = []
    for t in range(T):
        phase = (t / T) * 2 * np.pi
        fwd   = t / T * 2.5 - 1.25
        joints = np.array([
            [0,    1.72, fwd],          # 0  nose
            [-0.06, 1.76, fwd],         # 1  l_eye
            [ 0.06, 1.76, fwd],         # 2  r_eye
            [-0.10, 1.74, fwd],         # 3  l_ear
            [ 0.10, 1.74, fwd],         # 4  r_ear
            [-0.22, 1.48, fwd],         # 5  l_shoulder
            [ 0.22, 1.48, fwd],         # 6  r_shoulder
            [-0.35, 1.15 + 0.08*np.sin(phase+np.pi), fwd + 0.08*np.sin(phase+np.pi)],
            [ 0.35, 1.15 + 0.08*np.sin(phase),       fwd + 0.08*np.sin(phase)],
            [-0.40, 0.90 + 0.14*np.sin(phase+np.pi), fwd + 0.14*np.sin(phase+np.pi)],
            [ 0.40, 0.90 + 0.14*np.sin(phase),       fwd + 0.14*np.sin(phase)],
            [-0.12, 0.95, fwd],         # 11 l_hip
            [ 0.12, 0.95, fwd],         # 12 r_hip
            [-0.13, 0.52 + 0.14*np.sin(phase),  fwd + 0.10*np.sin(phase)],
            [ 0.13, 0.52 - 0.14*np.sin(phase),  fwd - 0.10*np.sin(phase)],
            [-0.14, 0.04 + 0.06*np.maximum(0, np.sin(phase)),  fwd + 0.18*np.sin(phase)],
            [ 0.14, 0.04 + 0.06*np.maximum(0, -np.sin(phase)), fwd - 0.18*np.sin(phase)],
        ])
        frames.append(joints)
    return np.stack(frames)  # (T, 17, 3)


def stationary_pose():
    """Single static T-pose frame."""
    joints = np.array([
        [0,    1.72, 0],
        [-0.06, 1.76, 0],
        [ 0.06, 1.76, 0],
        [-0.10, 1.74, 0],
        [ 0.10, 1.74, 0],
        [-0.22, 1.48, 0],
        [ 0.22, 1.48, 0],
        [-0.50, 1.10, 0],
        [ 0.50, 1.10, 0],
        [-0.70, 0.72, 0],
        [ 0.70, 0.72, 0],
        [-0.14, 0.88, 0],
        [ 0.14, 0.88, 0],
        [-0.16, 0.44, 0],
        [ 0.16, 0.44, 0],
        [-0.18, 0.02, 0],
        [ 0.18, 0.02, 0],
    ])
    return joints  # (17, 3) — single frame


def point_cloud_sphere(N=64, T=60):
    """Random point cloud on a deforming sphere — no adjacency needed."""
    rng = np.random.default_rng(42)
    frames = []
    for t in range(T):
        phase = t / T * 2 * np.pi
        # Points on a sphere with slight breathing deformation
        phi   = rng.uniform(0, np.pi,     N)
        theta = rng.uniform(0, 2*np.pi,   N)
        r = 0.6 + 0.08 * np.sin(phase)   # breathing radius
        x = r * np.sin(phi) * np.cos(theta)
        y = r * np.cos(phi) + 1.0        # raise above ground
        z = r * np.sin(phi) * np.sin(theta)
        frames.append(np.stack([x, y, z], axis=-1))
    return np.stack(frames)  # (T, N, 3)


if __name__ == "__main__":
    walk = coco_walk()
    np.save(OUT / "coco_walk.npy", walk)
    print(f"[OK] coco_walk.npy  {walk.shape}")

    pose = stationary_pose()
    np.save(OUT / "tpose_static.npy", pose)
    print(f"[OK] tpose_static.npy  {pose.shape}")

    cloud = point_cloud_sphere()
    np.save(OUT / "point_cloud_sphere.npy", cloud)
    print(f"[OK] point_cloud_sphere.npy  {cloud.shape}")

    print("\nConvert to JSON with:")
    print("  python convert.py examples/coco_walk.npy --adj examples/adjacency_coco17.json --out examples/coco_walk.json")
    print("  python convert.py examples/tpose_static.npy --adj examples/adjacency_coco17.json --out examples/tpose_static.json")
    print("  python convert.py examples/point_cloud_sphere.npy --out examples/point_cloud_sphere.json")
