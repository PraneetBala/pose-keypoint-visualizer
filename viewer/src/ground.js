import * as THREE from 'three'
import groundVert from '../shaders/ground.vert?raw'
import groundFrag from '../shaders/ground.frag?raw'

const THEMES = {
  cyan:  { c1: [0.04, 0.06, 0.10], c2: [0.06, 0.09, 0.15], line: [0.08, 0.16, 0.28] },
  amber: { c1: [0.07, 0.05, 0.03], c2: [0.10, 0.07, 0.04], line: [0.28, 0.16, 0.04] },
  neon:  { c1: [0.02, 0.02, 0.06], c2: [0.04, 0.02, 0.08], line: [0.20, 0.05, 0.40] },
  warm:  { c1: [0.07, 0.04, 0.04], c2: [0.10, 0.06, 0.05], line: [0.30, 0.10, 0.06] },
}

export class GroundPlane {
  constructor(scene) {
    this._scene = scene
    this._mesh = null
    this._uniforms = null
    this._build()
  }

  _build() {
    const geo = new THREE.PlaneGeometry(200, 200, 1, 1)
    geo.rotateX(-Math.PI / 2)

    this._uniforms = {
      uColor1:    { value: new THREE.Color().setRGB(...THEMES.cyan.c1) },
      uColor2:    { value: new THREE.Color().setRGB(...THEMES.cyan.c2) },
      uLineColor: { value: new THREE.Color().setRGB(...THEMES.cyan.line) },
      uScale:     { value: 1.0 },
      uFadeStart: { value: 12.0 },
      uFadeEnd:   { value: 35.0 },
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader: groundVert,
      fragmentShader: groundFrag,
      uniforms: this._uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    this._mesh = new THREE.Mesh(geo, mat)
    this._mesh.position.y = 0
    this._mesh.renderOrder = -1
    this._scene.add(this._mesh)
  }

  alignToData(payload) {
    if (!payload?.meta) return
    const minY = payload.meta.bbox_min[1]
    this._mesh.position.y = minY - 0.01
  }

  setTheme(theme) {
    const t = THEMES[theme] || THEMES.cyan
    this._uniforms.uColor1.value.setRGB(...t.c1)
    this._uniforms.uColor2.value.setRGB(...t.c2)
    this._uniforms.uLineColor.value.setRGB(...t.line)
  }

  setVisible(v) {
    this._mesh.visible = v
  }

  setScale(s) {
    this._uniforms.uScale.value = s
  }
}
