import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

(function () {
  var section = document.getElementById('skiStory');
  var canvas = document.getElementById('skiCanvas');
  if (!section || !canvas) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  if (!hasWebGL()) {
    section.classList.add('no-webgl');
    return;
  }

  var steps = Array.prototype.slice.call(section.querySelectorAll('.ski-step'));

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
  renderer.toneMappingExposure = 1.1;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  var cameraDistance = 2.6;
  camera.position.set(0, 0.25, cameraDistance);
  camera.lookAt(0, 0, 0);

  // Soft studio environment so the PBR topsheet/edge materials pick up
  // glossy highlights instead of rendering as flat matte gray.
  var pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0a1420, 1.0));
  var key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.2, 3, 3);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x1e9be0, 1.1);
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
  // the text column on the left.
  var PAN_FRACTION = 0.08;

  function fitModelToView() {
    if (!model || modelRadius === null) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var aspect = w / h;
    var vFov = (camera.fov * Math.PI) / 180;
    var visibleHeight = 2 * cameraDistance * Math.tan(vFov / 2);
    var visibleWidth = visibleHeight * aspect;
    var fill = 1.35;
    var panOffset = visibleWidth * PAN_FRACTION;
    // The pan shifts the model off-center, so the tighter edge (right side,
    // since we pan right) sets how much horizontal room is actually free —
    // use that instead of the full visibleWidth, or the panned model clips
    // past the right edge of the canvas.
    var availableWidth = (visibleWidth / 2 - panOffset) * 2;
    // Scale off the model's bounding-SPHERE radius rather than its raw X/Y
    // box extents. The box extents only describe a good fit at the model's
    // rest orientation (length along local X, filling the screen
    // horizontally) - but each story step now rotates the rig onto a
    // different face (yaw for the nose-on binding view, roll for the
    // edge/base views). After a 90° yaw the long length axis points into
    // depth instead of across the screen, and a box-based scale (tuned to
    // make that long axis fill the frame) rendered the model as a tiny
    // sliver in the corner. A sphere's apparent size is rotation-invariant,
    // so this keeps the model consistently framed at every step.
    var scale = (Math.min(availableWidth, visibleHeight) * fill) / (modelRadius * 2);
    model.scale.setScalar(scale);
    rig.position.x = panOffset;
  }

  var loader = new GLTFLoader();
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
      applyHighlight(activePart);
      renderFrame();
    },
    undefined,
    function (err) {
      console.error('CarvteX 3D model failed to load:', err);
      section.classList.add('no-webgl');
    }
  );

  function applyHighlight(partSpec) {
    // Previously this dimmed every non-active part to 20% opacity, which
    // read as the whole ski going washed-out/see-through whenever a single
    // part (e.g. the binding) was highlighted - most of the visible surface
    // belongs to parts other than the one being called out, so the ski as
    // a whole looked faded and its contours disappeared. Keep everything
    // fully solid at all times and use only the emissive glow to call out
    // the active part.
    var activeNames = partSpec === 'all' ? null : partSpec.split(',');
    Object.keys(partMaterials).forEach(function (name) {
      var isActive = !activeNames || activeNames.indexOf(name) !== -1;
      partMaterials[name].forEach(function (m) {
        m.opacity = 1;
        if (m.emissive) {
          if (isActive && activeNames) {
            m.emissive.setHex(0x1e9be0);
            m.emissiveIntensity = 0.35;
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
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function renderFrame() {
    resize();
    renderer.render(scene, camera);
  }

  // The story now opens on the binding view (elevated, tip toward camera)
  // instead of a generic intro angle, so the resting pose before any step's
  // intersection threshold fires should already match it - otherwise the
  // ski visibly snaps into place the instant scrolling starts.
  var activePart = 'binding';
  var targetRotY = -0.75;
  var currentRotY = -0.75;
  var targetRotX = 0.7;
  var currentRotX = 0.7;
  var running = false;

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    currentRotY += (targetRotY - currentRotY) * 0.07;
    currentRotX += (targetRotX - currentRotX) * 0.07;
    rig.rotation.y = currentRotY;
    rig.rotation.x = currentRotX;
    renderFrame();
  }

  function startLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', function () {
    fitModelToView();
    renderFrame();
  });

  // Click-to-select: tapping a part of the ski in the 3D view jumps the
  // page to that part's story step, instead of only being reachable by
  // scrolling. Each step's own IntersectionObserver (further down) still
  // owns rotation/highlight/text, so this only needs to scroll the right
  // step into view and the rest follows automatically.
  var partToStep = {};
  steps.forEach(function (stepEl) {
    (stepEl.getAttribute('data-part') || '').split(',').forEach(function (p) {
      p = p.trim();
      if (p) partToStep[p] = stepEl;
    });
  });

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

  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', function (e) {
    selectAtPoint(e.clientX, e.clientY);
  });

  // Two separate axes are in play:
  // - rotation.y (yaw) spins the ski like a turntable around the vertical
  //   axis. At yaw 0 the model's length runs along local X, screen-horizontal.
  // - rotation.x is a PITCH/tilt axis (verified live):
  //     x = 0           -> side/edge-profile silhouette (the steel edge
  //                         faces the camera, length stays horizontal) -
  //                         the "élén áll" (standing on its edge) look.
  //     x = +Math.PI/2  -> clean top-down view of the TOPSHEET, full flat
  //                         view with the logo and binding both readable.
  //     x = -Math.PI/2  -> clean top-down view of the BASE (the correct
  //                         "talp felfelé" view - distinct dark surface,
  //                         binding plate visible from underneath)
  //     x = Math.PI     -> looks almost identical to x = 0 (NOT a base
  //                         view - a flipped flat object seen edge-on
  //                         looks the same either way)
  // Each step below sets both explicitly, using the verified angles above.
  // Story order: binding (opening/"foundation" view) -> edge (sharpening)
  // -> base (waxing/maintenance) - matching the order the steps appear in
  // the markup.
  var STEP_ROTATIONS = {
    // Elevated 3/4 angle with a partial yaw and pitch - like a product shot
    // of the ski leaning toward the camera, tip prominent and nearest the
    // viewer, topsheet and binding both readable. This is the opening pose
    // (see activePart/targetRotY/targetRotX above).
    binding: { y: -0.75, x: 0.7 },
    // Side/edge-profile view - the thin steel edge faces the camera
    // square-on, length stays horizontal, as if the ski is standing on its
    // edge.
    steel_edges: { y: 0, x: 0 },
    // Pitch -90° - clean top-down view of the base surface, facing up
    // toward the camera rather than viewed from underneath.
    'base,sidewall': { y: 0, x: -Math.PI / 2 }
  };

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          steps.forEach(function (s) {
            s.classList.remove('active');
          });
          entry.target.classList.add('active');
          activePart = entry.target.getAttribute('data-part') || 'all';
          var rot = Object.prototype.hasOwnProperty.call(STEP_ROTATIONS, activePart)
            ? STEP_ROTATIONS[activePart]
            : { y: 0, x: -0.18 };
          targetRotY = rot.y;
          targetRotX = rot.x;
          if (modelLoaded) applyHighlight(activePart);
          if (prefersReduced) renderFrame();
        }
      });
    },
    { threshold: [0.5] }
  );
  steps.forEach(function (s) {
    io.observe(s);
  });

  // Only run the continuous rotation loop while the story section is on screen,
  // and never under reduced motion (we still update highlight + a single static
  // render per step change above).
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
