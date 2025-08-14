const errBox = document.getElementById("errBox");
function showError(msg, timeout = 5000) {
  console.error(msg);
  errBox.textContent = String(msg);
  errBox.style.display = "block";
  setTimeout(() => (errBox.style.display = "none"), timeout);
}

const dropWrap = document.getElementById("dropWrap");
const uploadBtn = document.getElementById("uploadBtn");
const exampleBtn = document.getElementById("exampleBtn");
const clearBtn = document.getElementById("clearBtn");
const scanBtn = document.getElementById("scanBtn");
const uploadAgain = document.getElementById("uploadAgain");
const previewBox = document.getElementById("previewBox");
const fileInput = document.getElementById("fileInput");

const controlsPanel = document.getElementById("controls");
const rightCluster = document.getElementById("rightCluster");
const shapeSel = document.getElementById("shapeSel");
const depthRange = document.getElementById("depthRange");
const curveRange = document.getElementById("curveRange");
const orbitCheck = document.getElementById("orbitCheck");
const rotSpeedEl = document.getElementById("rotSpeed");
const zoomRange = document.getElementById("zoomRange");
const resetBtn = document.getElementById("resetBtn");
const rotLeft = document.getElementById("rotLeft"),
  rotRight = document.getElementById("rotRight"),
  tiltUp = document.getElementById("tiltUp"),
  tiltDown = document.getElementById("tiltDown");
const exportBtn = document.getElementById("exportBtn"),
  backBtn = document.getElementById("backBtn");

let renderer, scene, camera, controls;
let mainMesh = null;
let imageTexture = null;
let uploadedImage = null;
let orbitEnabled = true;
let rotSpeed = parseFloat(rotSpeedEl.value) || 0.0038;

// --- Drag & Drop ---
let dragCount = 0;
["dragenter", "dragover"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    dragCount++;
    dropWrap.classList.add("dragging");
  })
);
["dragleave", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) dropWrap.classList.remove("dragging");
  })
);
window.addEventListener("drop", (e) => {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)
    handleFile(e.dataTransfer.files[0]);
});

uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files) handleFile(e.target.files[0]);
});

exampleBtn.addEventListener("click", () => {
  // Use a visually appealing, high-quality image for 3D
  fetch(
    "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=1600&q=80"
  )
    .then((r) => r.blob())
    .then((blob) => {
      const reader = new FileReader();
      reader.onload = (ev) => loadImageFromDataURL(ev.target.result);
      reader.onerror = () => showError("Failed to load example image.");
      reader.readAsDataURL(blob);
    })
    .catch(() =>
      showError("Example image blocked by CORS; please upload a local image.")
    );
});

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/"))
    return showError("Please upload a valid image file (jpg/png).");
  const reader = new FileReader();
  reader.onload = (ev) => loadImageFromDataURL(ev.target.result);
  reader.onerror = (e) => showError("FileReader failed: " + e);
  reader.readAsDataURL(file);
}
function loadImageFromDataURL(dataURL) {
  const img = new Image();
  img.onload = () => {
    uploadedImage = img;
    previewImage(dataURL);
    scanBtn.disabled = false;
    clearBtn.style.display = "inline-block";
  };
  img.onerror = () =>
    showError("Failed to load the image data (unsupported or corrupted).");
  img.src = dataURL;
}
function previewImage(src) {
  previewBox.innerHTML = "";
  const im = document.createElement("img");
  im.src = src;
  im.alt = "preview";
  previewBox.appendChild(im);
}

// --- Three.js Init ---
function initThree() {
  if (renderer) return;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 0, parseFloat(zoomRange.value) || 6);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  document.getElementById("stage").appendChild(renderer.domElement);

  // Robust OrbitControls attach (fix for CDN loading)
  if (
    typeof THREE.OrbitControls === "undefined" &&
    typeof window.OrbitControls === "function"
  ) {
    THREE.OrbitControls = window.OrbitControls;
  }
  if (typeof THREE.OrbitControls !== "function") {
    // Hide the error instead of showing it
    // showError(
    //   "OrbitControls not found or not loaded — controls will be disabled. Make sure examples/OrbitControls.js loaded."
    // );
  } else {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.screenSpacePanning = true;
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 0.5);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(6, 10, 6);
  dir.castShadow = true;
  scene.add(dir);

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x061829,
    metalness: 0.6,
    roughness: 0.12,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.65;
  floor.receiveShadow = true;
  scene.add(floor);

  window.addEventListener("resize", onResize);
  animate();
}
function onResize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function makeTextureFromImage(img) {
  try {
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  } catch (e) {
    showError("Failed to create texture from image: " + e);
    return null;
  }
}

function disposeMesh(m) {
  if (!m) return;
  try {
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
      else m.material.dispose();
    }
    scene.remove(m);
  } catch (e) {
    console.warn("disposeMesh error", e);
  }
}

function buildMainMesh() {
  if (!uploadedImage) return showError("No image loaded.");
  // Only allow local images for mesh
  if (uploadedImage.src.startsWith("http")) {
    showError(
      "Remote images cannot be used for 3D mesh due to browser security."
    );
    return;
  }
  initThree();

  disposeMesh(mainMesh);
  mainMesh = null;

  // make or update texture
  if (imageTexture) {
    try {
      imageTexture.dispose && imageTexture.dispose();
    } catch (e) {}
    imageTexture = null;
  }
  imageTexture = makeTextureFromImage(uploadedImage);
  if (!imageTexture) return;

  const shape = shapeSel.value;
  const h = 3.2;
  const aspect = uploadedImage.width / uploadedImage.height;
  const w = Math.max(2.0, Math.min(6.2, h * aspect));

  const mat = new THREE.MeshStandardMaterial({
    map: imageTexture,
    roughness: 0.7, // Higher roughness for matte look
    metalness: 0.05, // Lower metalness for less gloss
    side: THREE.DoubleSide,
  });
  mat.map = imageTexture;

  if (shape === "plane") {
    const segW = Math.ceil(w * 40),
      segH = Math.ceil(h * 40);
    const geo = new THREE.PlaneGeometry(w, h, segW, segH);
    mainMesh = new THREE.Mesh(geo, mat);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    scene.add(mainMesh);
    applyParallax();
  } else if (shape === "curved") {
    const theta = Math.PI * parseFloat(curveRange.value);
    const radius = w / Math.max(0.0001, theta);
    const geo = new THREE.CylinderGeometry(
      radius,
      radius,
      h,
      96,
      1,
      true,
      -theta / 2,
      theta
    );
    mainMesh = new THREE.Mesh(geo, mat);
    mainMesh.castShadow = true;
    scene.add(mainMesh);
  } else if (shape === "cube") {
    const mats = [];
    for (let i = 0; i < 6; i++) {
      const m = mat.clone();
      m.map = imageTexture;
      if (i !== 4) m.color = new THREE.Color(0xffffff).multiplyScalar(0.9);
      mats.push(m);
    }
    const geo = new THREE.BoxGeometry(h, h, h);
    mainMesh = new THREE.Mesh(geo, mats);
    mainMesh.castShadow = true;
    scene.add(mainMesh);
  } else if (shape === "sphere") {
    const geo = new THREE.SphereGeometry(h * 0.82, 64, 48);
    mainMesh = new THREE.Mesh(geo, mat);
    mainMesh.castShadow = true;
    scene.add(mainMesh);
  } else if (shape === "torus") {
    const geo = new THREE.TorusGeometry(h * 0.7, 0.4, 64, 120);
    mainMesh = new THREE.Mesh(geo, mat);
    mainMesh.castShadow = true;
    scene.add(mainMesh);
  }

  // scale-in pop
  if (mainMesh) {
    mainMesh.scale.set(0.001, 0.001, 0.001);
    let s = 0;
    (function step() {
      s += 0.06;
      const v = Math.min(1, s);
      mainMesh.scale.set(v, v, v);
      if (v < 1) requestAnimationFrame(step);
    })();
  }

  // ensure camera & controls see it
  try {
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
    if (camera) camera.position.set(0, 0, parseFloat(zoomRange.value) || 6);
  } catch (e) {
    showError("Unexpected error setting camera/controls: " + e);
  }
}

function applyParallax() {
  if (!mainMesh) return;
  if (!mainMesh.geometry || mainMesh.geometry.type !== "PlaneGeometry") return;
  // Only allow parallax for local images
  if (uploadedImage.src.startsWith("http")) {
    showError(
      "Parallax effect is disabled for remote images due to browser security."
    );
    return;
  }
  const geo = mainMesh.geometry;
  const pos = geo.attributes.position;
  const uSeg = geo.parameters.widthSegments + 1;
  const vSeg = geo.parameters.heightSegments + 1;
  const cvs = document.createElement("canvas");
  cvs.width = uSeg;
  cvs.height = vSeg;
  const ctx = cvs.getContext("2d");

  const imgAspect = uploadedImage.width / uploadedImage.height;
  const geoAspect = geo.parameters.width / geo.parameters.height;
  let sx = 0,
    sy = 0,
    sw = uploadedImage.width,
    sh = uploadedImage.height;
  if (imgAspect > geoAspect) {
    const targetW = sh * geoAspect;
    sx = (sw - targetW) / 2;
    sw = targetW;
  } else {
    const targetH = sw / geoAspect;
    sy = (sh - targetH) / 2;
    sh = targetH;
  }
  ctx.drawImage(uploadedImage, sx, sy, sw, sh, 0, 0, cvs.width, cvs.height);
  const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
  const intensity = parseFloat(depthRange.value) || 0;

  for (let y = 0; y < vSeg; y++) {
    for (let x = 0; x < uSeg; x++) {
      const i = (y * cvs.width + x) * 4;
      const r = data[i] / 255,
        g = data[i + 1] / 255,
        b = data[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nx = (x / (uSeg - 1)) * 2 - 1,
        ny = (y / (vSeg - 1)) * 2 - 1;
      const mask = 1 - Math.min(1, nx * nx + ny * ny);
      const z = (lum - 0.5) * intensity * 1.4 * mask;
      const idx = (y * uSeg + x) * 3;
      pos.array[idx + 2] = z;
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function animate() {
  requestAnimationFrame(animate);
  if (mainMesh && orbitEnabled) {
    mainMesh.rotation.y += rotSpeed;
  }
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}
animate();

scanBtn.addEventListener("click", () => {
  if (!uploadedImage) return showError("Upload an image first.");
  dropWrap.style.opacity = 0;
  setTimeout(() => (dropWrap.style.display = "none"), 300);
  controlsPanel.style.display = "flex";
  rightCluster.style.display = "flex";
  uploadAgain.style.display = "inline-block";
  backBtn.style.display = "inline-block";
  initThree();
  buildMainMesh();
});

clearBtn.addEventListener("click", () => {
  uploadedImage = null;
  imageTexture = null;
  scanBtn.disabled = true;
  clearBtn.style.display = "none";
  previewBox.innerHTML = '<div style="opacity:.36">Preview</div>';
});

uploadAgain.addEventListener("click", goBackToUpload);
backBtn.addEventListener("click", goBackToUpload);

function goBackToUpload() {
  dropWrap.style.display = "flex";
  setTimeout(() => {
    dropWrap.style.opacity = "1";
  }, 20);
  disposeMesh(mainMesh);
  mainMesh = null;
  if (renderer) {
    try {
      renderer.domElement.remove();
    } catch (e) {}
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
  }
  document.getElementById("stage").innerHTML = "";
  controlsPanel.style.display = "none";
  rightCluster.style.display = "none";
  uploadAgain.style.display = "none";
  backBtn.style.display = "none";
  previewBox.innerHTML = '<div style="opacity:.36">Preview</div>';
  scanBtn.disabled = true;
  clearBtn.style.display = "none";
  fileInput.value = "";
}

shapeSel.addEventListener("change", () => {
  if (!uploadedImage) return;
  buildMainMesh();
});
depthRange.addEventListener("input", () => applyParallax());
curveRange.addEventListener("input", () => {
  if (shapeSel.value === "curved") buildMainMesh();
});
orbitCheck.addEventListener(
  "change",
  () => (orbitEnabled = orbitCheck.checked)
);
rotSpeedEl.addEventListener(
  "input",
  () => (rotSpeed = parseFloat(rotSpeedEl.value) || 0)
);
zoomRange.addEventListener("input", () => {
  if (camera) camera.position.set(0, 0, parseFloat(zoomRange.value));
});
resetBtn.addEventListener("click", () => {
  if (controls) {
    controls.reset();
    camera.position.set(0, 0, parseFloat(zoomRange.value));
  }
});

rotLeft.addEventListener("click", () => quickRotate(-Math.PI / 8));
rotRight.addEventListener("click", () => quickRotate(Math.PI / 8));
tiltUp.addEventListener("click", () => quickTilt(-Math.PI / 12));
tiltDown.addEventListener("click", () => quickTilt(Math.PI / 12));

function quickRotate(delta) {
  if (!mainMesh) return;
  const s = mainMesh.rotation.y,
    target = s + delta;
  const start = performance.now();
  (function step(now) {
    const t = Math.min(1, (now - start) / 300);
    mainMesh.rotation.y = s + (target - s) * t;
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}
function quickTilt(delta) {
  if (!mainMesh) return;
  const s = mainMesh.rotation.x,
    target = s + delta;
  const start = performance.now();
  (function step(now) {
    const t = Math.min(1, (now - start) / 300);
    mainMesh.rotation.x = s + (target - s) * t;
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}

exportBtn.addEventListener("click", () => {
  if (!renderer) return showError("3D not initialized yet.");
  renderer.domElement.toBlob((blob) => {
    if (!blob) return showError("Export failed.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spectrazone_capture.png";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }, "image/png");
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.key === "r") rotLeft.click();
  if (e.key === "R") rotRight.click();
});

// --- Mouse controls for drag, pan, zoom ---
let isDragging = false;
let lastX = 0,
  lastY = 0;
let isRightDragging = false;

function getMouseButton(e) {
  return e.button;
}

document.getElementById("stage").addEventListener("mousedown", function (e) {
  if (!mainMesh || !renderer) return;
  if (getMouseButton(e) === 0) {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  } else if (getMouseButton(e) === 2) {
    isRightDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

window.addEventListener("mousemove", function (e) {
  if (!mainMesh || !renderer) return;
  if (isDragging) {
    const dx = (e.clientX - lastX) * 0.01;
    const dy = (e.clientY - lastY) * 0.01;
    mainMesh.rotation.y += dx;
    mainMesh.rotation.x += dy;
    lastX = e.clientX;
    lastY = e.clientY;
  } else if (isRightDragging && controls) {
    const dx = (e.clientX - lastX) * 0.5;
    const dy = (e.clientY - lastY) * 0.5;
    controls.pan(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

window.addEventListener("mouseup", function (e) {
  isDragging = false;
  isRightDragging = false;
});

document.getElementById("stage").addEventListener(
  "wheel",
  function (e) {
    if (!camera) return;
    e.preventDefault();
    let delta = e.deltaY > 0 ? 1 : -1;
    let newZoom = Math.max(2, Math.min(18, camera.position.z + delta));
    camera.position.set(0, 0, newZoom);
    zoomRange.value = newZoom;
  },
  { passive: false }
);

document.getElementById("stage").addEventListener("contextmenu", function (e) {
  e.preventDefault();
});

// Touch support for mobile pinch/zoom/rotate/pan
let lastTouchDist = null;
let lastTouchMid = null;
document.getElementById("stage").addEventListener("touchstart", function (e) {
  if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    lastTouchMid = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    };
  }
});
document.getElementById("stage").addEventListener("touchmove", function (e) {
  if (e.touches.length === 2 && camera) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const mid = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    };
    // Pinch zoom
    let zoomDelta = (lastTouchDist - dist) * 0.05;
    let newZoom = Math.max(2, Math.min(18, camera.position.z + zoomDelta));
    camera.position.set(0, 0, newZoom);
    zoomRange.value = newZoom;
    lastTouchDist = dist;
    // Pan
    if (controls && lastTouchMid) {
      controls.pan(mid.x - lastTouchMid.x, mid.y - lastTouchMid.y);
      lastTouchMid = mid;
    }
  }
});
document.getElementById("stage").addEventListener("touchend", function (e) {
  lastTouchDist = null;
  lastTouchMid = null;
});
