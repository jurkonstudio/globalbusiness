// Empty 3D globe (three.js from cdnjs). Drag to rotate. Regions will be added later.
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
let loading;

export function loadThree() {
  if (window.THREE) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = THREE_URL; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return loading;
}

export async function mountGlobe(el) {
  try { await loadThree(); } catch { el.textContent = 'Could not load 3D engine.'; return; }
  const THREE = window.THREE;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch { el.textContent = 'WebGL is not supported on this device.'; return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100);
  camera.position.z = 3.2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(renderer.domElement);

  const globe = new THREE.Group();
  scene.add(globe);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x0f1b33 })));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.04, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.1, side: THREE.BackSide })));

  // Latitude / longitude grid
  const mat = new THREE.LineBasicMaterial({ color: 0x2b4474 });
  const ring = (fn) => {
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(fn((i / 96) * Math.PI * 2));
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  };
  for (let lat = -75; lat <= 75; lat += 15) {
    const phi = (lat * Math.PI) / 180, r = Math.cos(phi) * 1.003, y = Math.sin(phi) * 1.003;
    ring((a) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  for (let lon = 0; lon < 180; lon += 15) {
    const t = (lon * Math.PI) / 180;
    ring((a) => new THREE.Vector3(Math.cos(a) * Math.cos(t) * 1.003, Math.sin(a) * 1.003, Math.cos(a) * Math.sin(t) * 1.003));
  }

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Drag to rotate · No regions yet';
  el.appendChild(hint);

  let dragging = false, lx = 0, ly = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    globe.rotation.y += (e.clientX - lx) * 0.006;
    globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x + (e.clientY - ly) * 0.006));
    lx = e.clientX; ly = e.clientY;
  });
  const stop = () => { dragging = false; };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);

  new ResizeObserver(() => {
    if (!el.clientWidth || !el.clientHeight) return;
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
  }).observe(el);

  (function loop() {
    if (!el.isConnected) { renderer.dispose(); return; }   // page changed
    if (!dragging) globe.rotation.y += 0.0025;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
}
