/**
 * loader.js — Handles JSON and NPY file loading.
 *
 * NPY files require a server running (python server/serve.py).
 * JSON files are handled entirely client-side.
 */

// ── JSON ─────────────────────────────────────────────────────────────────────

export async function loadJSON(file) {
  const text = await file.text()
  const payload = JSON.parse(text)
  return normalise(payload)
}

export async function loadJSONFromURL(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  return normalise(payload)
}

// ── NPY via server ────────────────────────────────────────────────────────────

export async function loadNPY(npyFile, adjJSON = null, fps = 30) {
  const form = new FormData()
  form.append('file', npyFile)
  form.append('fps', fps)
  if (adjJSON) {
    const adjText = await adjJSON.text()
    form.append('adjacency', adjText)
  }

  const res = await fetch('/convert', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Server error: ${err}`)
  }
  return res.json()
}

// ── Normalise payload ─────────────────────────────────────────────────────────

function normalise(payload) {
  // Ensure keypoints is (T, N, 3)
  let kp = payload.keypoints
  if (!Array.isArray(kp)) throw new Error('keypoints must be an array')

  // Single frame: [[x,y,z], ...]
  if (typeof kp[0][0] === 'number') kp = [kp]

  // Pad 2D to 3D
  if (kp[0][0].length === 2) {
    kp = kp.map(frame => frame.map(([x, y]) => [x, y, 0]))
  }

  const T = kp.length
  const N = kp[0].length

  const adj = payload.adjacency ?? null
  const fps = payload.fps ?? 30

  // Compute meta if missing
  let meta = payload.meta
  if (!meta) {
    const flat = kp.flat()
    const xs = flat.map(p => p[0])
    const ys = flat.map(p => p[1])
    const zs = flat.map(p => p[2])
    const rootPts = kp.map(f => f[0])
    const rootStd = std(rootPts.flatMap(p => p))
    meta = {
      bbox_min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
      bbox_max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
      is_stationary: rootStd < 0.05,
      root_std: rootStd,
    }
  }

  return {
    schema_version: payload.schema_version ?? '1.0',
    name: payload.name ?? 'unnamed',
    fps,
    frames: T,
    joints: N,
    keypoints: kp,
    adjacency: adj,
    labels: payload.labels ?? null,
    meta,
  }
}

function std(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// ── Built-in example data ─────────────────────────────────────────────────────

export function buildExample() {
  // 17-joint COCO skeleton doing a slow walk cycle (60 frames)
  const COCO_ADJ = [
    [0,1],[0,2],[1,3],[2,4],           // head
    [5,6],[5,7],[7,9],[6,8],[8,10],    // arms
    [5,11],[6,12],[11,12],             // torso
    [11,13],[13,15],[12,14],[14,16],   // legs
  ]
  const COCO_LABELS = [
    'nose','l_eye','r_eye','l_ear','r_ear',
    'l_shoulder','r_shoulder','l_elbow','r_elbow','l_wrist','r_wrist',
    'l_hip','r_hip','l_knee','r_knee','l_ankle','r_ankle',
  ]

  const T = 90
  const frames = []
  for (let t = 0; t < T; t++) {
    const phase = (t / T) * Math.PI * 2
    const walk  = t / T    // 0→1 forward progress

    // Base skeleton in T-pose, then animate limbs
    const joints = [
      // Head cluster
      [0, 1.72, 0],          // 0  nose
      [-0.06, 1.76, 0],      // 1  l_eye
      [ 0.06, 1.76, 0],      // 2  r_eye
      [-0.10, 1.74, 0],      // 3  l_ear
      [ 0.10, 1.74, 0],      // 4  r_ear
      // Shoulders
      [-0.22, 1.48, 0],      // 5  l_shoulder
      [ 0.22, 1.48, 0],      // 6  r_shoulder
      // Elbows — swing opposite to legs
      [-0.35, 1.15 + 0.08 * Math.sin(phase + Math.PI), 0.08 * Math.sin(phase + Math.PI)],
      [ 0.35, 1.15 + 0.08 * Math.sin(phase), 0.08 * Math.sin(phase)],
      // Wrists
      [-0.40, 0.90 + 0.14 * Math.sin(phase + Math.PI), 0.14 * Math.sin(phase + Math.PI)],
      [ 0.40, 0.90 + 0.14 * Math.sin(phase), 0.14 * Math.sin(phase)],
      // Hips
      [-0.12, 0.95, 0],      // 11 l_hip
      [ 0.12, 0.95, 0],      // 12 r_hip
      // Knees — walking motion
      [-0.13, 0.52 + 0.14 * Math.sin(phase), 0.10 * Math.sin(phase)],
      [ 0.13, 0.52 - 0.14 * Math.sin(phase), -0.10 * Math.sin(phase)],
      // Ankles
      [-0.14, 0.04 + 0.06 * Math.max(0, Math.sin(phase)), 0.18 * Math.sin(phase)],
      [ 0.14, 0.04 + 0.06 * Math.max(0, -Math.sin(phase)), -0.18 * Math.sin(phase)],
    ]

    // Translate the whole figure forward as it walks
    const fwdZ = walk * 2.5 - 1.25
    frames.push(joints.map(([x, y, z]) => [x, y, z + fwdZ]))
  }

  const flat = frames.flat()
  const xs = flat.map(p => p[0])
  const ys = flat.map(p => p[1])
  const zs = flat.map(p => p[2])

  return {
    schema_version: '1.0',
    name: 'COCO Walk Example',
    fps: 30,
    frames: T,
    joints: 17,
    keypoints: frames,
    adjacency: COCO_ADJ,
    labels: COCO_LABELS,
    meta: {
      bbox_min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
      bbox_max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
      is_stationary: false,
      root_std: 0.5,
    },
  }
}
