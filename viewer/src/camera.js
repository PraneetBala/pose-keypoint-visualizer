import * as THREE from 'three'

const _bbox = new THREE.Box3()
const _center = new THREE.Vector3()
const _size = new THREE.Vector3()
const _target = new THREE.Vector3()
const _camTarget = new THREE.Vector3()

export class CameraController {
  constructor(camera, orbitControls) {
    this._cam     = camera
    this._orbit   = orbitControls
    this._mode    = 'auto'
    this._payload = null

    // Cached fit parameters
    this._fitCenter = new THREE.Vector3()
    this._fitDist   = 6

    // Smooth follow
    this._followPos = new THREE.Vector3()
    this._followTgt = new THREE.Vector3()
  }

  fitToData(payload, state) {
    this._payload = payload

    // Compute bounding box over ALL frames
    const allPts = payload.keypoints.flat()
    _bbox.makeEmpty()
    for (const [x, y, z] of allPts) {
      _bbox.expandByPoint(new THREE.Vector3(x, y, z))
    }
    _bbox.getCenter(_center)
    _bbox.getSize(_size)

    const diag = _size.length()
    const fovRad = (this._cam.fov * Math.PI) / 180
    const dist = Math.max((diag / 2) / Math.tan(fovRad / 2) * 1.4, 1.5)

    this._fitCenter.copy(_center)
    this._fitDist = dist

    // Place camera
    this._cam.position.set(
      _center.x + dist * 0.6,
      _center.y + dist * 0.5,
      _center.z + dist * 0.8,
    )
    this._orbit.target.copy(_center)
    this._orbit.update()

    // Auto-detect mode
    if (state.camMode === 'auto') {
      this._mode = payload.meta.is_stationary ? 'orbit' : 'follow'
    } else {
      this._mode = state.camMode
    }

    this._followPos.copy(this._cam.position)
    this._followTgt.copy(_center)
  }

  reset() {
    const c = this._fitCenter
    const d = this._fitDist
    this._cam.position.set(c.x + d * 0.6, c.y + d * 0.5, c.z + d * 0.8)
    this._orbit.target.copy(c)
    this._orbit.update()
  }

  setMode(mode) {
    this._mode = mode
    if (mode === 'orbit' || mode === 'auto') {
      this._orbit.enabled = true
    }
  }

  update(state) {
    if (!this._payload || state.data.frames <= 1) return
    if (this._mode !== 'follow' && state.camMode !== 'follow') return

    // Follow root joint (joint 0) with smooth lerp
    const kp = state.data.keypoints[state.currentFrame]
    const root = new THREE.Vector3(...kp[0])

    // Compute centroid of all joints for a better follow target
    _target.set(0, 0, 0)
    for (const [x, y, z] of kp) _target.x += x, _target.y += y, _target.z += z
    _target.divideScalar(kp.length)

    this._followTgt.lerp(_target, 0.08)
    this._orbit.target.copy(this._followTgt)

    // Keep camera offset relative to root, don't override user pan/zoom
    // Just smoothly update the orbit target
    this._orbit.update()
  }
}
