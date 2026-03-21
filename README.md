# Pose Keypoint Visualizer

A visually rich 3D viewer for human and animal pose keypoints.
Supports **skeletons**, **point clouds**, animated sequences, and live `.npy` upload.

![preview](docs/preview.png)

---

## Features

- **Drag & drop** `.json` or `.npy` files directly onto the browser
- **Skeleton mode** — provide an adjacency list and joints are connected with glowing bones
- **Point cloud mode** — no adjacency needed; renders joints as a floating point cloud
- **Animated playback** — scrub timeline, play/pause, step frame-by-frame
- **Checkerboard ground plane** — infinite shader-based grid, fades at horizon
- **Camera auto-mode** — stationary skeletons → orbit, moving skeletons → follow root
- **Motion trails** — ghost of previous N frames per joint
- **Post-processing** — ACES tonemapping + Unreal Bloom via `postprocessing`
- **Themes** — Cyan, Amber, Neon, Warm
- **Joint labels** — render joint names as sprite overlays
- **Python converter** — turn any `.npy` file into the visualizer's JSON format

---

## Quick Start

### 1. Install dependencies

**Node.js (viewer):**
```bash
cd viewer
npm install
```

**Python (converter + server):**
```bash
pip install -r requirements.txt
```

### 2. Load a JSON file (no server needed)

```bash
cd viewer
npm run dev       # opens http://localhost:5173
```

Drag any `.json` pose file onto the browser window, or click **Open JSON**.

### 3. Load an NPY file (requires Python server)

```bash
# Terminal 1 — Python server (handles NPY → JSON conversion)
python server/serve.py

# Terminal 2 — Vite dev server (optional, for live reload)
cd viewer && npm run dev
```

Open `http://localhost:8000` and drag your `.npy` file onto the page.

---

## Converting your data

```bash
# .npy with skeleton
python convert.py path/to/keypoints.npy \
  --adj examples/adjacency_coco17.json \
  --fps 30 \
  --out output.json

# .npy as point cloud (no adjacency)
python convert.py path/to/keypoints.npy --out output.json

# Validate / normalise an existing JSON
python convert.py existing.json --out normalised.json
```

### Expected `.npy` shapes

| Shape | Meaning |
|---|---|
| `(N, 3)` | Single frame, N joints, XYZ |
| `(N, 2)` | Single frame, N joints, XY (Z padded to 0) |
| `(T, N, 3)` | T frames, N joints, XYZ |
| `(T, N, 2)` | T frames, N joints, XY |

---

## JSON format

```jsonc
{
  "schema_version": "1.0",
  "name": "my_sequence",
  "fps": 30,
  "frames": 90,
  "joints": 17,
  "keypoints": [           // shape: [T, N, 3]
    [[x, y, z], ...],      // frame 0
    ...
  ],
  "adjacency": [           // optional — omit for point cloud mode
    [0, 1], [1, 2], ...    // list of [joint_i, joint_j] pairs
  ],
  "labels": ["nose", ...], // optional — one string per joint
  "meta": {                // auto-computed by convert.py
    "bbox_min": [x, y, z],
    "bbox_max": [x, y, z],
    "is_stationary": false,
    "root_std": 0.42
  }
}
```

---

## Adjacency files

Pre-built adjacency files are in `examples/`:

| File | Description |
|---|---|
| `adjacency_coco17.json` | COCO 17-joint human skeleton |
| `adjacency_macaque.json` | Macaque 17-joint skeleton |

You can also pass a raw edge list array: `[[0,1],[1,2],...]`

---

## Generating example data

```bash
python examples/generate_examples.py
```

This creates:
- `examples/coco_walk.npy` — 90-frame walking cycle
- `examples/tpose_static.npy` — single T-pose frame
- `examples/point_cloud_sphere.npy` — animated point cloud (no skeleton)

Then convert:
```bash
python convert.py examples/coco_walk.npy \
  --adj examples/adjacency_coco17.json \
  --out examples/coco_walk.json
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Step one frame |
| `G` | Toggle ground plane |
| `L` | Toggle labels |
| `T` | Toggle motion trail |
| `R` | Reset camera |

---

## Production build

```bash
cd viewer
npm run build     # outputs to viewer/dist/

# Serve with Python (no Node required)
python server/serve.py
# → http://localhost:8000
```

---

## Project structure

```
pose-keypoint-visualizer/
├── convert.py               CLI converter (.npy / .json → visualizer JSON)
├── requirements.txt
├── server/
│   └── serve.py             FastAPI dev server + /convert endpoint
├── viewer/
│   ├── index.html           Single-page app shell
│   ├── vite.config.js
│   ├── package.json
│   ├── src/
│   │   ├── main.js          Three.js scene, renderer, animation loop
│   │   ├── skeleton.js      Joint/bone/cloud/trail rendering
│   │   ├── ground.js        Checkerboard shader plane
│   │   ├── camera.js        Auto-fit + follow-root camera
│   │   ├── loader.js        JSON/NPY loading + built-in example
│   │   └── ui.js            Panel, playback, drag-drop, keyboard
│   └── shaders/
│       ├── ground.vert
│       └── ground.frag
└── examples/
    ├── generate_examples.py
    ├── adjacency_coco17.json
    └── adjacency_macaque.json
```

---

## License

MIT
