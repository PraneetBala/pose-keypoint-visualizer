import * as THREE from 'three'

// ── Theme palette ────────────────────────────────────────────────────────────
const THEMES = {
  cyan:  { joint: 0x00d4ff, bone: 0x0088bb, cloud: 0x00aaff, emissive: 0x003355 },
  amber: { joint: 0xffaa00, bone: 0xcc7700, cloud: 0xff8800, emissive: 0x331a00 },
  neon:  { joint: 0x00ff88, bone: 0x008844, cloud: 0x44ff44, emissive: 0x001a0a },
  warm:  { joint: 0xff6644, bone: 0xcc3322, cloud: 0xff8866, emissive: 0x1a0a08 },
}

const JOINT_RADIUS = 0.035
const BONE_RADIUS  = 0.012

export class SkeletonRenderer {
  constructor(scene) {
    this._scene    = scene
    this._joints   = []     // THREE.Mesh[]
    this._bones    = []     // THREE.Mesh[]  (cylinders)
    this._cloud    = null   // THREE.Points
    this._labels   = []     // THREE.Sprite[]
    this._trails   = []     // THREE.Line[] per joint
    this._trailBuf = []     // ring buffer  [joint][frame] = Vector3
    this._payload  = null
    this._theme    = 'cyan'

    // Reusable geometries
    this._jointGeo = new THREE.SphereGeometry(1, 14, 10)
    this._boneGeo  = new THREE.CylinderGeometry(1, 1, 1, 8, 1)
  }

  // ── Build scene objects from payload ──────────────────────────────────────

  build(payload, state) {
    this._clear()
    this._payload = payload
    this._theme   = state.theme

    const pal = THEMES[state.theme] || THEMES.cyan
    const N   = payload.joints
    const hasAdj = payload.adjacency && payload.adjacency.length > 0

    // Joint spheres
    const jMat = new THREE.MeshStandardMaterial({
      color: pal.joint,
      emissive: new THREE.Color(pal.joint),
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.1,
    })
    for (let i = 0; i < N; i++) {
      const mesh = new THREE.Mesh(this._jointGeo, jMat.clone())
      mesh.scale.setScalar(JOINT_RADIUS * state.jointSize)
      mesh.castShadow = false
      this._scene.add(mesh)
      this._joints.push(mesh)
    }

    // Bones (cylinders between connected joints)
    if (hasAdj) {
      const bMat = new THREE.MeshStandardMaterial({
        color: pal.bone,
        emissive: new THREE.Color(pal.bone),
        emissiveIntensity: 0.3,
        roughness: 0.5,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
      })
      for (let e = 0; e < payload.adjacency.length; e++) {
        const mesh = new THREE.Mesh(this._boneGeo, bMat.clone())
        this._scene.add(mesh)
        this._bones.push(mesh)
      }
    }

    // Point cloud (always built; shown depending on mode)
    this._buildCloud(payload, pal)

    // Trail ring buffers
    this._trailBuf = Array.from({ length: N }, () => [])
    this._buildTrails(pal)

    // Labels
    if (payload.labels) {
      this._buildLabels(payload.labels)
    }

    this.update(state)
  }

  _buildCloud(payload, pal) {
    const N = payload.joints
    const positions = new Float32Array(N * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      color: pal.cloud,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    })
    this._cloud = new THREE.Points(geo, mat)
    this._scene.add(this._cloud)
  }

  _buildTrails(pal) {
    const N = this._payload.joints
    for (let i = 0; i < N; i++) {
      const geo = new THREE.BufferGeometry()
      // Pre-allocate max trail length
      const positions = new Float32Array(30 * 3)
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setDrawRange(0, 0)
      const mat = new THREE.LineBasicMaterial({
        color: pal.joint,
        transparent: true,
        opacity: 0.25,
        linewidth: 1,
      })
      const line = new THREE.Line(geo, mat)
      line.frustumCulled = false
      line.visible = false
      this._scene.add(line)
      this._trails.push(line)
    }
  }

  _buildLabels(labels) {
    // CSS2D would be ideal but adds complexity — use sprite-based text instead
    // We'll render them as small colored discs with the label text baked in via canvas
    for (let i = 0; i < labels.length; i++) {
      const sprite = this._makeTextSprite(labels[i])
      sprite.visible = false
      this._scene.add(sprite)
      this._labels.push(sprite)
    }
  }

  _makeTextSprite(text) {
    const canvas = document.createElement('canvas')
    canvas.width = 128; canvas.height = 32
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.clearRect(0, 0, 128, 32)
    ctx.font = 'bold 18px monospace'
    ctx.fillStyle = '#80d4ff'
    ctx.textAlign = 'left'
    ctx.fillText(text, 4, 22)
    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(0.5, 0.125, 1)
    return sprite
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(state) {
    if (!this._payload) return

    const { data, currentFrame, showEdges, showLabels, showTrail, trailLength,
            jointSize, boneWidth, theme } = state
    const kp  = data.keypoints[currentFrame]   // [ [x,y,z], ... ]
    const adj = data.adjacency
    const hasAdj = adj && adj.length > 0
    const N   = data.joints

    // Update theme colors lazily
    if (theme !== this._theme) {
      this._applyTheme(theme)
      this._theme = theme
    }

    // ── Points are ALWAYS visible — this is fundamentally a point cloud ──────
    const cloudPos = this._cloud.geometry.attributes.position.array
    for (let i = 0; i < N; i++) {
      const [x, y, z] = kp[i]

      // Sphere joints sit at each point
      this._joints[i].position.set(x, y, z)
      this._joints[i].scale.setScalar(JOINT_RADIUS * jointSize)
      this._joints[i].visible = true

      // Raw GL points buffer (used when spheres are too small / zoomed out)
      cloudPos[i * 3]     = x
      cloudPos[i * 3 + 1] = y
      cloudPos[i * 3 + 2] = z
    }
    this._cloud.geometry.attributes.position.needsUpdate = true
    this._cloud.visible = true

    // ── Edges are ADDITIVE — drawn only when adjacency is provided ────────────
    // showEdges can be toggled by the user, but defaults to true when adj exists
    const drawEdges = hasAdj && showEdges
    if (hasAdj) {
      for (let e = 0; e < adj.length; e++) {
        const bone = this._bones[e]
        if (!bone) continue
        const [i, j] = adj[e]
        const a = new THREE.Vector3(...kp[i])
        const b = new THREE.Vector3(...kp[j])
        this._placeBone(bone, a, b, boneWidth)
        bone.visible = drawEdges
      }
    }

    // Trails
    if (showTrail && data.frames > 1) {
      this._updateTrails(currentFrame, trailLength, N, data)
    }
    this._trails.forEach(t => { t.visible = showTrail && data.frames > 1 })

    // Labels
    this._labels.forEach((sprite, i) => {
      if (i < kp.length) {
        sprite.position.set(kp[i][0], kp[i][1] + 0.12, kp[i][2])
      }
      sprite.visible = showLabels && !!data.labels
    })
  }

  _placeBone(mesh, a, b, widthScale) {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    if (len < 0.0001) { mesh.visible = false; return }

    mesh.position.copy(a).addScaledVector(dir, 0.5)

    const up = new THREE.Vector3(0, 1, 0)
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())
    mesh.quaternion.copy(quat)
    mesh.scale.set(BONE_RADIUS * widthScale, len, BONE_RADIUS * widthScale)
  }

  _updateTrails(currentFrame, trailLength, N, data) {
    for (let i = 0; i < N; i++) {
      const buf = this._trailBuf[i]
      const kp = data.keypoints[currentFrame][i]
      buf.push(new THREE.Vector3(...kp))
      if (buf.length > trailLength) buf.shift()

      const geo = this._trails[i].geometry
      const pos = geo.attributes.position.array
      for (let k = 0; k < buf.length; k++) {
        pos[k * 3]     = buf[k].x
        pos[k * 3 + 1] = buf[k].y
        pos[k * 3 + 2] = buf[k].z
      }
      geo.attributes.position.needsUpdate = true
      geo.setDrawRange(0, buf.length)
    }
  }

  _applyTheme(theme) {
    const pal = THEMES[theme] || THEMES.cyan
    this._joints.forEach(m => {
      m.material.color.set(pal.joint)
      m.material.emissive.set(pal.joint)
    })
    this._bones.forEach(m => {
      m.material.color.set(pal.bone)
      m.material.emissive.set(pal.bone)
    })
    if (this._cloud) this._cloud.material.color.set(pal.cloud)
    this._trails.forEach(t => t.material.color.set(pal.joint))
  }

  _clear() {
    ;[...this._joints, ...this._bones, ...this._labels, ...this._trails].forEach(o => {
      this._scene.remove(o)
      o.geometry?.dispose()
      o.material?.dispose()
    })
    if (this._cloud) {
      this._scene.remove(this._cloud)
      this._cloud.geometry.dispose()
      this._cloud.material.dispose()
      this._cloud = null
    }
    this._joints = []
    this._bones  = []
    this._labels = []
    this._trails = []
    this._trailBuf = []
  }

  // Expose for UI sliders
  setJointSize(s)  { this._joints.forEach(m => m.scale.setScalar(JOINT_RADIUS * s)) }
  setBoneWidth(s)  { this._bones.forEach(m => {
    m.scale.x = BONE_RADIUS * s
    m.scale.z = BONE_RADIUS * s
  })}
  setCloudSize(s)  { if (this._cloud) this._cloud.material.size = 0.06 * s }
}
