// hero-3d.js — CarvteX 3D Alpine Snowfall & Depth Parallax Field
// Renders a lightweight 3-layer 3D snow/ice crystal field in the hero section
// that responds to pointer movement (3D camera parallax) and scroll velocity
// (downhill speed warp). Pauses automatically when scrolled out of view.

import * as THREE from 'three';

(function () {
  'use strict';

  var canvas = document.getElementById('heroSnowCanvas');
  var hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  var saveData = navigator.connection && navigator.connection.saveData;
  if (saveData) return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power'
    });
  } catch (e) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 50);
  camera.position.set(0, 0, 12);

  // Generate a soft radial snow/ice particle texture procedurally in memory
  // (zero external HTTP requests).
  function createSnowTexture() {
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(215, 240, 255, 0.85)');
    grad.addColorStop(0.7, 'rgba(30, 155, 224, 0.25)');
    grad.addColorStop(1, 'rgba(30, 155, 224, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(c);
    return tex;
  }

  var snowTex = createSnowTexture();
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  var count = isMobile ? 220 : 440;

  var positions = new Float32Array(count * 3);
  var velocities = new Float32Array(count * 3);
  var phases = new Float32Array(count);

  var spreadX = 26;
  var spreadY = 16;
  var spreadZ = 18;

  for (var i = 0; i < count; i++) {
    var i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * spreadX;
    positions[i3 + 1] = (Math.random() - 0.5) * spreadY;
    positions[i3 + 2] = (Math.random() - 0.5) * spreadZ;

    // Wind + fall speed
    velocities[i3] = (Math.random() - 0.35) * 0.012;
    velocities[i3 + 1] = -(0.014 + Math.random() * 0.026);
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.008;
    phases[i] = Math.random() * Math.PI * 2;
  }

  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  var material = new THREE.PointsMaterial({
    size: isMobile ? 0.26 : 0.22,
    map: snowTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  var points = new THREE.Points(geometry, material);
  scene.add(points);

  // Subtle 3D wireframe mountain horizon grid lines in deep background
  var pointerX = 0;
  var pointerY = 0;
  var targetCamX = 0;
  var targetCamY = 0;
  var lastScrollY = window.pageYOffset || 0;
  var scrollBoost = 0;
  var running = false;
  var clock = new THREE.Clock();

  function resize() {
    var w = hero.clientWidth || 1;
    var h = hero.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);

  hero.addEventListener(
    'pointermove',
    function (e) {
      var rect = hero.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      targetCamX = pointerX * 0.85;
      targetCamY = -pointerY * 0.55;
    },
    { passive: true }
  );

  window.addEventListener(
    'scroll',
    function () {
      var y = window.pageYOffset || 0;
      var dy = y - lastScrollY;
      lastScrollY = y;
      scrollBoost = Math.max(-0.18, Math.min(0.28, dy * 0.004));
    },
    { passive: true }
  );

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);

    var elapsed = clock.getElapsedTime();
    var posAttr = geometry.attributes.position;
    var arr = posAttr.array;

    scrollBoost *= 0.92;

    for (var i = 0; i < count; i++) {
      var i3 = i * 3;
      var sway = Math.sin(elapsed * 0.9 + phases[i]) * 0.006;

      arr[i3] += velocities[i3] + sway;
      arr[i3 + 1] += velocities[i3 + 1] + scrollBoost;
      arr[i3 + 2] += velocities[i3 + 2];

      if (arr[i3 + 1] < -spreadY / 2) {
        arr[i3 + 1] = spreadY / 2;
        arr[i3] = (Math.random() - 0.5) * spreadX;
      } else if (arr[i3 + 1] > spreadY / 2) {
        arr[i3 + 1] = -spreadY / 2;
      }

      if (arr[i3] > spreadX / 2) arr[i3] = -spreadX / 2;
      if (arr[i3] < -spreadX / 2) arr[i3] = spreadX / 2;
    }

    posAttr.needsUpdate = true;

    camera.position.x += (targetCamX - camera.position.x) * 0.05;
    camera.position.y += (targetCamY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          running = entry.isIntersecting;
          if (running) {
            clock.start();
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.05 }
    );
    io.observe(hero);
  } else {
    running = true;
    requestAnimationFrame(animate);
  }
})();
