// ski-viewer.js — CarvteX Interactive 3D Ski Story
// Features:
// - Progress loading indicator (#skiLoader) + conditional mobile/saveData handling
// - Scroll-driven 3-step camera & rotation choreography (binding -> steel_edges -> base,sidewall)
// - Interactive 3-step quick-switcher pills (.ski-step-btn)
// - Pointer drag-to-inspect micro-orbit (springing back smoothly to the active step pose)
// - Responsive mobile framing (PAN_FRACTION = 0 on narrow screens so the ski stays centered)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

(function () {
  var section = document.getElementById('skiStory');
  var canvas = document.getElementById('skiCanvas');
  var loaderEl = document.getElementById('skiLoader');
  var loaderPctEl = document.getElementById('skiLoaderPct');
  if (!section || !canvas) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  if (!hasWebGL() || saveData) {
    section.classList.add('no-webgl');
    return;
  }

  var steps = Array.prototype.slice.call(section.querySelectorAll('.ski-step'));
  var stepButtons = Array.prototype.slice.call(section.querySelectorAll('.ski-step-btn'));

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) {
    section.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'CarvteX 3D síléc modell — húzd az egeret a forgatáshoz, vagy görgess a részletekért');

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  var baseCameraDistance = 2.6;
  var targetCameraZ = baseCameraDistance;
  var currentCameraZ = baseCameraDistance;
  // Soft studio environment so the PBR topsheet/edge materials pick up
  // glossy highlights instead of rendering as flat matte gray.
  camera.position.set(0, 0.25, baseCameraDistance);
  camera.lookAt(0, 0, 0);

  var pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0a1420, 1.05));
  var key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(2.2, 3, 3);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x1e9be0, 1.35);
  rim.position.set(-3, 1, -2.5);
  scene.add(rim);

  var rig = new THREE.Group();
  scene.add(rig);

  // part base name (the mesh's immediate parent node name in the glb,
  // e.g. "topsheet", "steel_edges", "binding") -> array of materials
  // belonging to it.
  var partMaterials = {};
  var modelLoaded = false;
  var model = null;
  var modelRadius = null;

  // This model's length already runs along its own local X axis and its
  // topsheet logo sits at the +X tip (verified against the UV data), which
  // lands on screen-right by default — no rotation correction needed here,
  // unlike the earlier model. A small rightward pan still keeps it clear of
  // the text column on the left on desktop (>=860px); on mobile (<860px) we
  // center the ski so it never clips off the right edge.
  function getPanFraction() {
    return window.innerWidth >= 860 ? 0.12 : 0;
  }

  function fitModelToView() {
    if (!model || modelRadius === null) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var aspect = w / h;
    var vFov = (camera.fov * Math.PI) / 180;
    var visibleHeight = 2 * baseCameraDistance * Math.tan(vFov / 2);
    var visibleWidth = visibleHeight * aspect;
    var isMobile = window.innerWidth < 860;
    var panFraction = isMobile ? 0 : 0.12;
    // On mobile (<860px), lift the model upward into the top half of the screen
    // so the lower text card doesn't cover it. On desktop, keep centered vertically and pan right.
    var fill = isMobile ? 1.30 : 1.65;
    var panOffset = visibleWidth * panFraction;
    var availableWidth = (visibleWidth / 2 - panOffset) * 2;
    var scale = (Math.min(availableWidth, visibleHeight) * fill) / (modelRadius * 2);
    model.scale.setScalar(scale);
    rig.position.x = panOffset;
    rig.position.y = isMobile ? visibleHeight * 0.17 : 0;
  }

  var loader = new GLTFLoader();
  // The .glb is meshopt-compressed (gltf-transform --compress meshopt) to
  // keep it under a few MB instead of 30+ - the decoder must be wired up
  // before load() or GLTFLoader throws on the compressed buffer views.
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    '/assets/CarvteX_3D.glb',
    function (gltf) {
      model = gltf.scene;
      rig.add(model);

      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);
      modelRadius = size.length() / 2;
      fitModelToView();

      // Named "container" nodes that map to our scroll steps. The ski-group
      // meshes (base, steel_edges, ...) carry their mesh directly on the
      // named node itself, while the binding is one flat parent with ~70
      // small named sub-parts underneath it - so we walk up from each mesh
      // until we hit one of these known names, which naturally groups all
      // binding sub-parts together under "binding".
      var KNOWN_PARTS = ['base', 'steel_edges', 'sidewall', 'topsheet', 'tip_guard', 'tail_protector', 'binding'];
      model.traverse(function (node) {
        if (!node.isMesh) return;
        var partName = '';
        var cur = node;
        while (cur) {
          if (cur.name && KNOWN_PARTS.indexOf(cur.name) !== -1) {
            partName = cur.name;
            break;
          }
          cur = cur.parent;
        }
        if (!partName) return;
        // Tag the mesh itself so a raycast hit can be traced back to a
        // part name directly, for click-to-select.
        node.userData.partName = partName;
        if (!partMaterials[partName]) partMaterials[partName] = [];
        var mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(function (m) {
          if (!m || partMaterials[partName].indexOf(m) !== -1) return;
          m.transparent = true;
          m.needsUpdate = true;
          partMaterials[partName].push(m);
        });
      });

      modelLoaded = true;
      section.setAttribute('data-model-ready', 'true');
      if (loaderEl) loaderEl.setAttribute('aria-hidden', 'true');
      applyHighlight(activeHighlight);
      renderFrame();
    },
    function (xhr) {
      if (loaderPctEl && xhr && xhr.total > 0) {
        var pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
        loaderPctEl.textContent = pct + '%';
      }
    },
    function (err) {
      console.error('CarvteX 3D model failed to load:', err);
      section.classList.add('no-webgl');
      if (loaderEl) loaderEl.setAttribute('aria-hidden', 'true');
    }
  );

  function applyHighlight(partSpec) {
    // Keep everything fully solid at all times and use only the emissive glow
    // to call out the active part so contours stay sharp.
    var activeNames = partSpec === 'all' ? null : partSpec.split(',');
    Object.keys(partMaterials).forEach(function (name) {
      var isActive = !activeNames || activeNames.indexOf(name) !== -1;
      partMaterials[name].forEach(function (m) {
        m.opacity = 1;
        if (m.emissive) {
          if (isActive && activeNames) {
            m.emissive.setHex(0x1e9be0);
            m.emissiveIntensity = 0.42;
          } else {
            m.emissiveIntensity = 0;
          }
        }
      });
    });
  }

  function resize() {
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    if (
      canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(h * renderer.getPixelRatio())
    ) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function renderFrame() {
    resize();
    renderer.render(scene, camera);
  }

  // The story opens on the binding view (elevated, tip toward camera).
  var activePart = 'binding';
  var activeHighlight = 'binding';
  // Mirrors activePart onto the section so CSS can target the part-specific
  // annotation arrows (see .ski-annotation in styles.css) without any JS
  // driving their visibility directly.
  section.setAttribute('data-active-part', activePart);

  var targetRotY = -0.75;
  var currentRotY = -0.75;
  var targetRotX = 0.7;
  var currentRotX = 0.7;

  // Interactive user drag offset (springs smoothly back when released)
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragMoved = false;
  var userOffsetY = 0;
  var userOffsetX = 0;
  var running = false;

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);

    if (!isDragging) {
      userOffsetY *= 0.92;
      userOffsetX *= 0.92;
    }

    var goalY = targetRotY + userOffsetY;
    var goalX = targetRotX + userOffsetX;

    currentRotY += (goalY - currentRotY) * 0.08;
    currentRotX += (goalX - currentRotX) * 0.08;
    currentCameraZ += (targetCameraZ - currentCameraZ) * 0.08;

    rig.rotation.y = currentRotY;
    rig.rotation.x = currentRotX;
    camera.position.z = currentCameraZ;

    renderFrame();
  }

  window.addEventListener('resize', function () {
    fitModelToView();
    renderFrame();
  });

  // Click-to-select: tapping a part of the ski in the 3D view jumps the
  // page to that part's story step, instead of only being reachable by
  // scrolling.
  var partToStep = {};
  steps.forEach(function (stepEl) {
    (stepEl.getAttribute('data-part') || '').split(',').forEach(function (p) {
      p = p.trim();
      if (p) partToStep[p] = stepEl;
    });
  });

  // Step quick-navigation buttons
  function syncStepButtons(part) {
    stepButtons.forEach(function (btn) {
      var isMatch = btn.getAttribute('data-target-part') === part;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
  }

  stepButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetPart = btn.getAttribute('data-target-part');
      var stepEl = steps.find(function (s) {
        return s.getAttribute('data-part') === targetPart;
      });
      if (stepEl) {
        stepEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      }
    });
  });

  // Pointer drag-to-inspect + click-to-select raycaster
  var raycaster = new THREE.Raycaster();
  var pointerNDC = new THREE.Vector2();

  function selectAtPoint(clientX, clientY) {
    if (!modelLoaded || !model) return;
    var rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    var hits = raycaster.intersectObject(model, true);
    if (!hits.length) return;
    var obj = hits[0].object;
    var partName = '';
    while (obj) {
      if (obj.userData && obj.userData.partName) {
        partName = obj.userData.partName;
        break;
      }
      obj = obj.parent;
    }
    var targetStep = partName && partToStep[partName];
    if (targetStep) {
      targetStep.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
    }
  }

  canvas.style.cursor = 'grab';

  canvas.addEventListener('pointerdown', function (e) {
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener(
    'pointermove',
    function (e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragMoved = true;
      }
      userOffsetY = Math.max(-0.85, Math.min(0.85, dx * 0.005));
      userOffsetX = Math.max(-0.55, Math.min(0.55, dy * 0.004));
      if (prefersReduced) {
        rig.rotation.y = targetRotY + userOffsetY;
        rig.rotation.x = targetRotX + userOffsetX;
        renderFrame();
      }
    },
    { passive: true }
  );

  window.addEventListener('pointerup', function (e) {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    if (!dragMoved) {
      selectAtPoint(e.clientX, e.clientY);
    }
  });

  // Two separate axes are in play:
  // - rotation.y (yaw) spins the ski like a turntable around the vertical axis.
  // - rotation.x is a PITCH/tilt axis (verified live):
  //     x = 0           -> side/edge-profile silhouette
  //     x = +Math.PI/2  -> clean top-down view of the TOPSHEET
  //     x = -Math.PI/2  -> clean top-down view of the BASE ("talp felfelé")
  // Story order: binding -> steel_edges -> base,sidewall
  var STEP_POSES = {
    binding: { y: -0.75, x: 0.7, z: 2.45 },
    steel_edges: { y: -0.75, x: 0.7 - Math.PI / 2, z: 2.55 },
    'base,sidewall': { y: 0, x: -Math.PI / 2, z: 2.65 }
  };

  function activateStep(stepEl) {
    steps.forEach(function (s) {
      s.classList.remove('active');
    });
    stepEl.classList.add('active');
    activePart = stepEl.getAttribute('data-part') || 'all';
    section.setAttribute('data-active-part', activePart);
    syncStepButtons(activePart);

    var pose = Object.prototype.hasOwnProperty.call(STEP_POSES, activePart)
      ? STEP_POSES[activePart]
      : { y: 0, x: -0.18, z: 2.6 };
    targetRotY = pose.y;
    targetRotX = pose.x;
    targetCameraZ = pose.z;

    // data-highlight lets a step glow a narrower part than the one driving its
    // pose/click-target (data-part) - the base step uses this so the sidewall
    // glows without tinting the entire base surface blue.
    activeHighlight = stepEl.getAttribute('data-highlight') || activePart;
    if (modelLoaded) applyHighlight(activeHighlight);
    if (prefersReduced) {
      rig.rotation.y = targetRotY;
      rig.rotation.x = targetRotX;
      camera.position.z = targetCameraZ;
      renderFrame();
    }
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.45) {
          activateStep(entry.target);
        }
      });
    },
    { threshold: [0.45] }
  );
  steps.forEach(function (s) {
    io.observe(s);
  });

  // Only run the continuous rotation loop while the story section is on screen,
  // and never under reduced motion.
  var sectionIO = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (prefersReduced) {
          if (entry.isIntersecting) renderFrame();
          return;
        }
        running = entry.isIntersecting;
        if (running) requestAnimationFrame(animate);
      });
    },
    { threshold: 0.01 }
  );
  sectionIO.observe(section);

  renderFrame();
})();
