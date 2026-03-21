import { loadJSON, loadNPY, loadJSONFromURL, buildExample } from './loader.js'

let _pendingNpyFile = null

export function setupUI({ state, loadData, bloomEffect, skeletonRenderer, ground, camController, orbitControls, camera }) {

  // ── Drop zone ──────────────────────────────────────────────────────────────

  const dropZone = document.getElementById('drop-zone')
  const overlay  = document.getElementById('drop-overlay')

  overlay.addEventListener('dragover', e => {
    e.preventDefault()
    dropZone.classList.add('drag-over')
  })
  overlay.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
  overlay.addEventListener('drop', async e => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const files = [...e.dataTransfer.files]
    await handleDroppedFiles(files)
  })

  // Also allow drag-drop directly onto the canvas when a scene is loaded
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', async e => {
    e.preventDefault()
    if (!state.data) return  // let overlay handle it
    const files = [...e.dataTransfer.files]
    await handleDroppedFiles(files)
  })

  function updateEdgesNote(payload) {
  const hasAdj = payload.adjacency && payload.adjacency.length > 0
  const note = document.getElementById('ctrl-edges-note')
  const toggle = document.getElementById('ctrl-edges')
  if (hasAdj) {
    note.style.color = '#2a6040'
    note.textContent = `${payload.adjacency.length} edges loaded`
    toggle.disabled = false
  } else {
    note.style.color = '#2a4060'
    note.textContent = 'no adjacency — showing point cloud'
    toggle.disabled = true
    toggle.checked = false
    state.showEdges = false
  }
}

async function handleDroppedFiles(files) {
    const jsonFile = files.find(f => f.name.endsWith('.json'))
    const npyFile  = files.find(f => f.name.endsWith('.npy'))
    const adjFile  = files.find(f => f.name.endsWith('.json') && f !== jsonFile)

    showSpinner(true)
    try {
      if (jsonFile) {
        const payload = await loadJSON(jsonFile)
        await loadData(payload)
        updateEdgesNote(payload)
      } else if (npyFile) {
        // Check if server is running
        const adj = adjFile ?? null
        try {
          const payload = await loadNPY(npyFile, adj)
          await loadData(payload)
          updateEdgesNote(payload)
        } catch (err) {
          if (err.message.includes('fetch')) {
            showNPYModal(npyFile)
          } else {
            alert(`Error loading NPY: ${err.message}`)
          }
        }
      }
    } finally {
      showSpinner(false)
    }
  }

  // ── File buttons ───────────────────────────────────────────────────────────

  document.getElementById('open-json-btn').addEventListener('click', () => {
    document.getElementById('file-json').click()
  })
  document.getElementById('file-json').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    showSpinner(true)
    try {
      const payload = await loadJSON(file)
      await loadData(payload)
      updateEdgesNote(payload)
    } catch (err) {
      alert(`Failed to load JSON: ${err.message}`)
    } finally {
      showSpinner(false)
    }
  })

  document.getElementById('open-npy-btn').addEventListener('click', () => {
    document.getElementById('file-npy').click()
  })
  document.getElementById('file-npy').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    _pendingNpyFile = file
    showSpinner(true)
    try {
      const payload = await loadNPY(file)
      await loadData(payload)
      updateEdgesNote(payload)
    } catch (err) {
      if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
        showNPYModal(file)
      } else {
        alert(`Failed to load NPY: ${err.message}`)
      }
    } finally {
      showSpinner(false)
    }
  })

  document.getElementById('load-example-btn').addEventListener('click', async () => {
    showSpinner(true)
    await new Promise(r => setTimeout(r, 50)) // let spinner render
    try {
      const payload = buildExample()
      await loadData(payload)
      updateEdgesNote(payload)
    } finally {
      showSpinner(false)
    }
  })

  document.getElementById('reopen-btn').addEventListener('click', () => {
    overlay.classList.remove('hidden')
  })

  // ── NPY server instructions modal ─────────────────────────────────────────

  function showNPYModal(file) {
    const msg = `To load .npy files, start the Python server:\n\n  pip install fastapi uvicorn numpy\n  python server/serve.py\n\nThen reload this page and try again.\n\nThe server provides the /convert endpoint that reads .npy via numpy.`
    alert(msg)
  }

  // ── Playback controls ──────────────────────────────────────────────────────

  const playBtn  = document.getElementById('play-btn')
  const timeline = document.getElementById('timeline')

  playBtn.addEventListener('click', () => {
    if (!state.data || state.data.frames <= 1) return
    state.playing = !state.playing
    state.lastTime = performance.now()
    playBtn.textContent = state.playing ? '⏸' : '▶'
  })

  timeline.addEventListener('input', e => {
    state.currentFrame = parseInt(e.target.value)
    state.playing = false
    playBtn.textContent = '▶'
  })

  // ── Panel controls ─────────────────────────────────────────────────────────

  // Edges toggle — draws lines between points defined by the adjacency matrix.
  // Has no effect when no adjacency was provided (data is always a point cloud).
  document.getElementById('ctrl-edges').addEventListener('change', e => {
    state.showEdges = e.target.checked
  })

  document.getElementById('ctrl-theme').addEventListener('change', e => {
    state.theme = e.target.value
    ground.setTheme(e.target.value)
  })

  document.getElementById('ctrl-joint-size').addEventListener('input', e => {
    state.jointSize = parseFloat(e.target.value)
  })

  document.getElementById('ctrl-bone-width').addEventListener('input', e => {
    state.boneWidth = parseFloat(e.target.value)
  })

  document.getElementById('ctrl-bloom').addEventListener('input', e => {
    const v = parseFloat(e.target.value)
    state.bloomIntensity = v
    bloomEffect.intensity = v
  })

  document.getElementById('ctrl-ground').addEventListener('change', e => {
    state.showGround = e.target.checked
  })

  document.getElementById('ctrl-labels').addEventListener('change', e => {
    state.showLabels = e.target.checked
  })

  document.getElementById('ctrl-trail').addEventListener('change', e => {
    state.showTrail = e.target.checked
  })

  document.getElementById('ctrl-trail-len').addEventListener('input', e => {
    state.trailLength = parseInt(e.target.value)
  })

  document.getElementById('ctrl-cam').addEventListener('change', e => {
    state.camMode = e.target.value
    camController.setMode(e.target.value)
  })

  document.getElementById('ctrl-reset-cam').addEventListener('click', () => {
    camController.reset()
  })

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (!state.data) return
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        playBtn.click()
        break
      case 'ArrowRight':
        e.preventDefault()
        state.playing = false
        playBtn.textContent = '▶'
        state.currentFrame = Math.min(state.data.frames - 1, state.currentFrame + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        state.playing = false
        playBtn.textContent = '▶'
        state.currentFrame = Math.max(0, state.currentFrame - 1)
        break
      case 'KeyG':
        state.showGround = !state.showGround
        document.getElementById('ctrl-ground').checked = state.showGround
        break
      case 'KeyL':
        state.showLabels = !state.showLabels
        document.getElementById('ctrl-labels').checked = state.showLabels
        break
      case 'KeyT':
        state.showTrail = !state.showTrail
        document.getElementById('ctrl-trail').checked = state.showTrail
        break
      case 'KeyR':
        camController.reset()
        break
    }
  })
}

function showSpinner(v) {
  const s = document.getElementById('spinner')
  s.classList.toggle('visible', v)
}
