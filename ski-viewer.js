// ski-viewer.js — CarvteX Interactive 3D Ski Story (Mountain-to-Workshop Journey)
// Features:
// - Seamless environment transition: starts on the snowy Alpine mountain peak (step: "mountain")
//   with 3D snowfall + outdoor sunlight, then glides into the dark service workshop
//   (binding -> steel_edges -> base,sidewall) as the visitor scrolls.
// - Works on both index.html (4 steps including mountain) and szolgaltatasok.html (3 or 4 steps).
// - Progress loading indicator (#skiLoader) + conditional mobile/saveData handling
// - Interactive step quick-switcher pills (.ski-step-btn)
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
  renderer.toneMappingExposure = 1.18;

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'CarvteX 3D síléc modell — húzd az egeret a forgatáshoz, vagy görgess a hegyről a szervizműhelybe');

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 25);
  var baseCameraDistance = 2.6;
  var targetCameraZ = baseCameraDistance;
  var currentCameraZ = baseCameraDistance;
  camera.position.set(0, 0.25, baseCameraDistance);
  camera.lookAt(0, 0, 0);

  // Soft studio environment so the PBR topsheet/edge materials pick up
  // glossy highlights instead of rendering as flat matte gray.
  var pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

  // Dynamic lighting that morphs from Alpine outdoor sun ("mountain") to
  // focused indoor workshop bench lighting ("binding" / "steel_edges" / "base,sidewall").
  var hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x102236, 1.35);
  scene.add(hemiLight);

  var key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(2.2, 3.2, 3.0);
  scene.add(key);

  var rim = new THREE.DirectionalLight(0x1e9be0, 1.35);
  rim.position.set(-3, 1, -2.5);
  scene.add(rim);

  // 3D Alpine Snowfall particle system inside the ski viewer:
  // Visible while on the mountain peak, fades out smoothly as the ski enters the workshop!
  function createSnowTexture() {
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(215, 240, 255, 0.85)');
    grad.addColorStop(0.75, 'rgba(30, 155, 224, 0.25)');
    grad.addColorStop(1, 'rgba(30, 155, 224, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  var snowCount = isMobile ? 140 : 260;
  var snowPositions = new Float32Array(snowCount * 3);
  var snowVelocities = new Float32Array(snowCount * 3);
  var snowSpreadX = 5.5;
  var snowSpreadY = 3.6;
  var snowSpreadZ = 4.0;

  for (var i = 0; i < snowCount; i++) {
    var i3 = i * 3;
    snowPositions[i3] = (Math.random() - 0.5) * snowSpreadX;
    snowPositions[i3 + 1] = (Math.random() - 0.5) * snowSpreadY;
    snowPositions[i3 + 2] = (Math.random() - 0.5) * snowSpreadZ;
    snowVelocities[i3] = -(0.006 + Math.random() * 0.012); // diagonal alpine wind
    snowVelocities[i3 + 1] = -(0.008 + Math.random() * 0.016);
    snowVelocities[i3 + 2] = (Math.random() - 0.5) * 0.005;
  }

  var snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  var snowMat = new THREE.PointsMaterial({
    size: isMobile ? 0.075 : 0.065,
    map: createSnowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  var snowPoints = new THREE.Points(snowGeo, snowMat);
  scene.add(snowPoints);

  var rig = new THREE.Group();
  scene.add(rig);

  var partMaterials = {};
  var modelLoaded = false;
  var model = null;
  var modelRadius = null;

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
    var panFraction = getPanFraction();
    var fill = panFraction === 0 ? 1.45 : 1.65;
    var panOffset = visibleWidth * panFraction;
    var availableWidth = (visibleWidth / 2 - panOffset) * 2;
    var scale = (Math.min(availableWidth, visibleHeight) * fill) / (modelRadius * 2);
    model.scale.setScalar(scale);
    rig.position.x = panOffset;
  }

  var loader = new GLTFLoader();
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
    // When on the mountain ("mountain" or "all"), no single part glows blue —
    // the ski is shown in its natural outdoor look before entering the workshop.
    var isNatural = !partSpec || partSpec === 'all' || partSpec === 'mountain';
    var activeNames = isNatural ? null : partSpec.split(',');
    Object.keys(partMaterials).forEach(function (name) {
      var isActive = activeNames && activeNames.indexOf(name) !== -1;
      partMaterials[name].forEach(function (m) {
        m.opacity = 1;
        if (m.emissive) {
          if (isActive) {
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

  // Step poses:
  // - mountain: Dynamic downhill carving angle on the snowy slope
  // - binding: Elevated 3/4 workshop bench inspection angle
  // - steel_edges: Pitched 90° so the sharpened steel edge faces the camera
  // - base,sidewall: Top-down flat view of the base & wax structure
  var STEP_POSES = {
    mountain: { y: -0.38, x: 0.32, z: 2.5, env: 'mountain' },
    binding: { y: -0.75, x: 0.7, z: 2.45, env: 'workshop' },
    steel_edges: { y: -0.75, x: 0.7 - Math.PI / 2, z: 2.55, env: 'workshop' },
    'base,sidewall': { y: 0, x: -Math.PI / 2, z: 2.65, env: 'workshop' }
  };

  // Determine initial step from the first .ski-step in the DOM
  var firstStepEl = steps[0];
  var initialPart = (firstStepEl && firstStepEl.getAttribute('data-part')) || 'binding';
  var initialPose = STEP_POSES[initialPart] || STEP_POSES.binding;

  var activePart = initialPart;
  var activeHighlight = (firstStepEl && firstStepEl.getAttribute('data-highlight')) || activePart;
  var activeEnv = initialPose.env;

  section.setAttribute('data-active-part', activePart);
  section.setAttribute('data-env', activeEnv);

  var targetRotY = initialPose.y;
  var currentRotY = initialPose.y;
  var targetRotX = initialPose.x;
  var currentRotX = initialPose.x;
  targetCameraZ = initialPose.z;
  currentCameraZ = initialPose.z;

  var targetSnowOpacity = activeEnv === 'mountain' ? 0.82 : 0.0;
  var currentSnowOpacity = targetSnowOpacity;
  snowMat.opacity = currentSnowOpacity;

  // Continuous scroll progress for smooth mountain -> workshop crossfade
  var targetWorkshopMix = activeEnv === 'mountain' ? 0 : 1;
  var currentWorkshopMix = targetWorkshopMix;

  function updateScrollProgress() {
    if (!steps.length) return;
    var hasMountainStep = steps[0].getAttribute('data-part') === 'mountain';
    if (!hasMountainStep) {
      targetWorkshopMix = 1;
      section.style.setProperty('--workshop-mix', '1');
      return;
    }
    var rect = section.getBoundingClientRect();
    var stepH = steps[0].offsetHeight || window.innerHeight * 0.65;
    // As the user scrolls through the first step (mountain -> binding),
    // mix goes smoothly from 0.0 (100% Alpine mountain) to 1.0 (100% Service workshop).
    var scrolled = -rect.top;
    var mix = Math.max(0, Math.min(1, scrolled / (stepH * 0.85)));
    targetWorkshopMix = mix;
    section.style.setProperty('--workshop-mix', mix.toFixed(3));
  }

  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress();

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
    currentWorkshopMix += (targetWorkshopMix - currentWorkshopMix) * 0.1;

    rig.rotation.y = currentRotY;
    rig.rotation.x = currentRotX;
    camera.position.z = currentCameraZ;

    // Morph lighting between crisp Alpine daylight (mix=0) and dramatic workshop spot (mix=1)
    hemiLight.intensity = 1.45 - currentWorkshopMix * 0.45;
    key.intensity = 2.9 - currentWorkshopMix * 0.4;
    rim.intensity = 0.85 + currentWorkshopMix * 0.65;

    // Update 3D snowfall while visible
    var desiredSnow = (1 - currentWorkshopMix) * 0.85;
    currentSnowOpacity += (desiredSnow - currentSnowOpacity) * 0.1;
    snowMat.opacity = currentSnowOpacity;
    snowPoints.visible = currentSnowOpacity > 0.01;

    if (snowPoints.visible) {
      var posAttr = snowGeo.attributes.position;
      var arr = posAttr.array;
      for (var i = 0; i < snowCount; i++) {
        var i3 = i * 3;
        arr[i3] += snowVelocities[i3];
        arr[i3 + 1] += snowVelocities[i3 + 1];
        arr[i3 + 2] += snowVelocities[i3 + 2];
        if (arr[i3 + 1] < -snowSpreadY / 2) {
          arr[i3 + 1] = snowSpreadY / 2;
          arr[i3] = (Math.random() - 0.5) * snowSpreadX;
        }
        if (arr[i3] < -snowSpreadX / 2) arr[i3] = snowSpreadX / 2;
      }
      posAttr.needsUpdate = true;
    }

    renderFrame();
  }

  window.addEventListener('resize', function () {
    fitModelToView();
    updateScrollProgress();
    renderFrame();
  });

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
      : { y: 0, x: -0.18, z: 2.6, env: 'workshop' };
    targetRotY = pose.y;
    targetRotX = pose.x;
    targetCameraZ = pose.z;
    activeEnv = pose.env || 'workshop';
    section.setAttribute('data-env', activeEnv);

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
        if (entry.isIntersecting && entry.intersectionRatio > 0.42) {
          activateStep(entry.target);
        }
      });
    },
    { threshold: [0.42] }
  );
  steps.forEach(function (s) {
    io.observe(s);
  });

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
