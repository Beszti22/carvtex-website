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

  // part base name -> array of materials belonging to it (both Left/Right skis)
  var partMaterials = {};
  var modelLoaded = false;
  var model = null;
  var modelSize = null;

  // The source model's length runs along its own local Y axis (the pair-
  // offset between the two skis runs along local X). Left as-is, the ski
  // stands up tall and thin on a wide screen. Rotate it a quarter turn
  // around Z so the length reads left-to-right — the Z axis (camera-facing
  // thickness/topsheet) is untouched by this. The topsheet texture's logo
  // end is at local Y = +0.825 (verified against the UV data), which with a
  // +90° rotation lands on screen-left — right under the text column. Use
  // -90° instead so the branded tip lands on screen-right, in the clear.
  var MODEL_Z_CORRECTION = -Math.PI / 2;
  // The text column sits over the left ~40% of the canvas, so bias the
  // model rightward within the frame instead of centering it dead-center.
  var PAN_FRACTION = 0.14;

  function fitModelToView() {
    if (!model || !modelSize) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var aspect = w / h;
    var vFov = (camera.fov * Math.PI) / 180;
    var visibleHeight = 2 * cameraDistance * Math.tan(vFov / 2);
    var visibleWidth = visibleHeight * aspect;
    var fill = 0.72;
    var scale = Math.min((visibleWidth * fill) / modelSize.x, (visibleHeight * fill) / modelSize.y);
    model.scale.setScalar(scale);
    rig.position.x = visibleWidth * PAN_FRACTION;
  }

  var loader = new GLTFLoader();
  loader.load(
    '/assets/CarvteX_3D.glb',
    function (gltf) {
      model = gltf.scene;
      rig.add(model);
      model.rotation.z = MODEL_Z_CORRECTION;

      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);
      modelSize = size;
      fitModelToView();

      model.traverse(function (node) {
        if (!node.isMesh) return;
        var parentName = (node.parent && node.parent.name) || '';
        var partName = parentName.replace(/_Left$|_Right$/, '');
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

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          var idx = steps.indexOf(entry.target);
          steps.forEach(function (s) {
            s.classList.remove('active');
          });
          entry.target.classList.add('active');
          activePart = entry.target.getAttribute('data-part') || 'all';
          targetRotY = idx * 0.85;
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
