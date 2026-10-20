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
  var cameraDistance = 3.3;
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
  var modelSize = null;

  // This model's length already runs along its own local X axis and its
  // topsheet logo sits at the +X tip (verified against the UV data), which
  // lands on screen-right by default — no rotation correction needed here,
  // unlike the earlier model. A small rightward pan still keeps it clear of
  // the text column on the left.
  var PAN_FRACTION = 0.08;

  function fitModelToView() {
    if (!model || !modelSize) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var aspect = w / h;
    var vFov = (camera.fov * Math.PI) / 180;
    var visibleHeight = 2 * cameraDistance * Math.tan(vFov / 2);
    var visibleWidth = visibleHeight * aspect;
    var fill = 0.72;
    var panOffset = visibleWidth * PAN_FRACTION;
    // The pan shifts the model off-center, so the tighter edge (right side,
    // since we pan right) sets how much horizontal room is actually free —
    // use that instead of the full visibleWidth, or the panned model clips
    // past the right edge of the canvas.
    var availableWidth = (visibleWidth / 2 - panOffset) * 2;
    var scale = Math.min((availableWidth * fill) / modelSize.x, (visibleHeight * fill) / modelSize.y);
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
      modelSize = size;
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
    var activeNames = partSpec === 'all' ? null : partSpec.split(',');
    Object.keys(partMaterials).forEach(function (name) {
      var isActive = !activeNames || activeNames.indexOf(name) !== -1;
      partMaterials[name].forEach(function (m) {
        m.opacity = isActive ? 1 : 0.2;
        if (m.emissive) {
          if (isActive && activeNames) {
            m.emissive.setHex(0x1e9be0);
            m.emissiveIntensity = 0.3;
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

  var activePart = 'all';
  var targetRotY = 0;
  var currentRotY = 0;
  var targetRotX = -0.18;
  var currentRotX = -0.18;
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

  // Rotating around the vertical (Y) axis turns the ski like a turntable:
  // 0° shows the topsheet/binding face (the default hero angle), ~90° shows
  // it edge-on, and ~180° swings all the way around to the base. Pick the
  // angle per step so the part being described is actually what's facing
  // the camera, instead of an arbitrary incremental spin.
  var STEP_ROTATIONS = {
    all: 0,
    topsheet: 0.4,
    steel_edges: Math.PI / 2,
    'base,sidewall': Math.PI,
    // A full turn back past base/sidewall's 180°, so it keeps spinning the
    // same direction instead of snapping backward, and lands back on the
    // topsheet/binding face.
    binding: Math.PI * 2
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
          targetRotY = Object.prototype.hasOwnProperty.call(STEP_ROTATIONS, activePart)
            ? STEP_ROTATIONS[activePart]
            : 0;
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
