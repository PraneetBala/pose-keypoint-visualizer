import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'postprocessing'
import { RenderPass } from 'postprocessing'
import { BloomEffect, EffectPass } from 'postprocessing'

import { GroundPlane } from './ground.js'
import { SkeletonRenderer } from './skeleton.js'
import { CameraController } from './camera.js'
import { setupUI } from './ui.js'
import { loadJSON, loadNPY } from './loader.js'

// ── Scene setup ─────────────────────────────────────────────────────────────

const container = document.getElementById('canvas-container')

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x080b14)
scene.fog = new THREE.FogExp2(0x080b14, 0.018)

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500)
camera.position.set(4, 3, 6)

const orbitControls = new OrbitControls(camera, renderer.domElement)
orbitControls.enableDamping = true
orbitControls.dampingFactor = 0.06
orbitControls.minDistance = 0.5
orbitControls.maxDistance = 80
orbitControls.target.set(0, 1, 0)

// Ambient + directional lighting (even in dark scene, helps with depth)
const ambient = new THREE.AmbientLight(0x0a1020, 2)
scene.add(ambient)
const dirLight = new THREE.DirectionalLight(0x203050, 1)
dirLight.position.set(5, 10, 5)
scene.add(dirLight)

// ── Post-processing ──────────────────────────────────────────────────────────

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const bloomEffect = new BloomEffect({ luminanceThreshold: 0.15, intensity: 0.8, radius: 0.7 })
const effectPass = new EffectPass(camera, bloomEffect)
composer.addPass(effectPass)

// ── Sub-systems ──────────────────────────────────────────────────────────────

const ground = new GroundPlane(scene)
const skeletonRenderer = new SkeletonRenderer(scene)
const camController = new CameraController(camera, orbitControls)

// ── App state ────────────────────────────────────────────────────────────────

export const state = {
  data: null,           // loaded payload
  currentFrame: 0,
  playing: false,
  lastTime: 0,
  // Data is always a point cloud. showEdges draws connections between points
  // defined by the adjacency matrix (if provided). No adjacency → pure cloud.
  showEdges: true,
  theme: 'cyan',
  showGround: true,
  showLabels: false,
  showTrail: false,
  trailLength: 8,
  jointSize: 1.0,
  boneWidth: 1.0,
  bloomIntensity: 0.8,
  camMode: 'auto',      // 'auto' | 'orbit' | 'follow'
}

// ── Data loading ─────────────────────────────────────────────────────────────

export async function loadData(payload) {
  state.data = payload
  state.currentFrame = 0
  state.playing = false

  skeletonRenderer.build(payload, state)
  camController.fitToData(payload, state)
  ground.alignToData(payload)

  updateInfoBadge(payload)
  document.getElementById('drop-overlay').classList.add('hidden')
  document.getElementById('panel').classList.add('visible')
  document.getElementById('reopen-btn').classList.add('visible')

  const pb = document.getElementById('playback')
  if (payload.frames > 1) {
    pb.classList.add('visible')
    const tl = document.getElementById('timeline')
    tl.max = payload.frames - 1
    tl.value = 0
  } else {
    pb.classList.remove('visible')
  }
  updateFrameInfo()
}

function updateInfoBadge(payload) {
  const badge = document.getElementById('info-badge')
  badge.classList.add('visible')
  const hasAdj = payload.adjacency && payload.adjacency.length > 0
  const edgeCount = hasAdj ? payload.adjacency.length : 0
  badge.innerHTML = `
    <span>${payload.name || 'Unnamed'}</span><br/>
    ${payload.frames} frames · ${payload.joints} points · ${payload.fps} fps<br/>
    ${hasAdj ? `<span>${edgeCount} edges</span> from adjacency` : 'Point cloud — no adjacency'}<br/>
    ${payload.meta.is_stationary ? 'Stationary' : 'Moving'}`
}

function updateFrameInfo() {
  if (!state.data) return
  const f = state.currentFrame
  const total = state.data.frames
  const secs = (f / state.data.fps).toFixed(2)
  document.getElementById('frame-info').textContent = `${f} / ${total - 1} · ${secs}s`
  document.getElementById('timeline').value = f
}

// ── Animation loop ───────────────────────────────────────────────────────────

function tick(timestamp) {
  requestAnimationFrame(tick)

  if (state.data && state.data.frames > 1 && state.playing) {
    const elapsed = timestamp - state.lastTime
    const frameMs = 1000 / state.data.fps
    if (elapsed >= frameMs) {
      state.lastTime = timestamp - (elapsed % frameMs)
      state.currentFrame = (state.currentFrame + 1) % state.data.frames
      updateFrameInfo()
    }
  }

  if (state.data) {
    skeletonRenderer.update(state)
    camController.update(state)
  }

  ground.setVisible(state.showGround)
  orbitControls.update()
  composer.render()
}

requestAnimationFrame(tick)

// ── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})

// ── UI wiring ────────────────────────────────────────────────────────────────

setupUI({ state, loadData, bloomEffect, skeletonRenderer, ground, camController, orbitControls, camera })
