/**
 * CASCADING FAILURES // Poly Bridge 3D Interactive WebGL Engine
 * =============================================================
 * Pure WebGL, zero-dependency, flat-shaded low-poly 3D graphics pipeline.
 * Features:
 * - 3D Orbit Camera (Perspective & Orthographic / Isometric)
 * - Complete Procedural 3D Models in the style of Poly Bridge 3:
 *   * 🏙️ Full Procedural City Blocks (Skyscrapers, office towers, apartments, houses, warehouses, parks)
 *   * 🏥 Hospitals (multi-wing towers, rooftop helipad with 'H', red cross emblems, ambulance bays)
 *   * 🌉 Bridges (Poly Bridge triangular truss framework, pin joints, road deck, piers, snapping stress)
 *   * ⚡ Substations (step-down transformers, cooling fins, ceramic insulator stacks, transmission gantries)
 *   * 🩺 Clinics (triage buildings with pitched roofs and medical markings)
 *   * 🚇 Transit Hubs (curved canopy metro stations)
 *   * 🛣️ Road Networks (asphalt ribbons, dashed lane markings, intersection pads, traffic signals)
 *   * 🚗 Animated Low-Poly Traffic (delivery trucks, cars, and ambulances with flashing emergency beacons)
 *   * 🌊 River Canyon & Deep Water (sunken river channel with ZERO Z-fighting, stone cliffs, floating plinth)
 *   * 💥 3D Shockwave Blast Dome (translucent expanding dome around failure epicenter)
 *   * 🎯 3D Selection Marker (pulsing bobbing marker over active asset)
 * - Interactive 3D Raycasting / Asset Selection & Hover Tooltips
 * - Camera Presets: 3D Orbit, Isometric 30°, Top-Down Plan, Focus on Bridge, Focus on Hospital, Focus on Substation
 */

class PolyBridge3D {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!this.gl) {
      console.error('WebGL not supported on this browser/hardware.');
      return;
    }

    this.onSelectNode = options.onSelectNode || (() => {});
    this.onHoverNode = options.onHoverNode || (() => {});
    this.onBackgroundClick = options.onBackgroundClick || (() => {});

    // Camera & Orbit State with enhanced depth buffer precision
    this.camera = {
      isOrtho: false,
      fov: 42 * Math.PI / 180,
      distance: 820,
      target: [500, 0, 480],
      theta: Math.PI / 4 + 0.18, // Azimuth
      phi: Math.PI / 4 + 0.12,   // Elevation
      near: 15,                  // Increased near-plane for maximum depth resolution (zero Z-fighting)
      far: 3500
    };

    // The framing the diorama opens with; resetCamera() glides back to it.
    this.defaultCamera = {
      distance: this.camera.distance,
      target: [...this.camera.target],
      theta: this.camera.theta,
      phi: this.camera.phi
    };

    // Camera transition animation
    this.cameraTargetAnim = null;

    this.mouse = {
      isDragging: false,
      isPanning: false,
      lastX: 0,
      lastY: 0,
      hasMoved: false
    };

    // Scene & Geometry Buffers
    this.cityData = null;
    this.simulationResult = null;
    this.currentStep = 0;
    this.selectedNodeId = 'T-01'; // Default focus
    this.interactiveObjects = []; // for raycasting
    this.vehicles = [];
    this.animationFrameId = null;
    this.time = 0;

    // Themes: Washi & Poly Bridge Daylight / Moonlit Night
    this.themes = {
      light: {
        clearColor: [0.965, 0.955, 0.935, 1.0], // Washi sand #f7f4ee
        sunColor: [0.98, 0.96, 0.92],
        ambientColor: [0.42, 0.42, 0.40],
        lightDir: [0.45, 0.85, 0.35]
      },
      dark: {
        clearColor: [0.078, 0.086, 0.102, 1.0], // Ink night #141619
        sunColor: [0.62, 0.68, 0.82],            // Cool moonlight
        ambientColor: [0.20, 0.21, 0.26],
        lightDir: [-0.35, 0.80, 0.45]
      }
    };
    const startsDark = (typeof document !== 'undefined') &&
      document.documentElement && document.documentElement.classList.contains('dark');
    this.theme = startsDark ? this.themes.dark : this.themes.light;

    this.initGL();
    this.initVehicleGeometries();
    this.setupEvents();
    this.startLoop();
  }

  /** Switch the diorama lighting between 'light' (daylight) and 'dark' (moonlit). */
  setTheme(mode) {
    this.theme = this.themes[mode === 'dark' ? 'dark' : 'light'];
  }

  // -------------------------------------------------------------
  // 1. WebGL Initialization & Shaders
  // -------------------------------------------------------------
  initGL() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec3 aColor;

      uniform mat4 uProjectionMatrix;
      uniform mat4 uViewMatrix;
      uniform mat4 uModelMatrix;

      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec3 vWorldPos;

      void main() {
        vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
        gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        vNormal = mat3(uModelMatrix) * aNormal;
        vColor = aColor;
        vWorldPos = worldPos.xyz;
      }
    `;

    const fsSource = `
      precision mediump float;

      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec3 vWorldPos;

      uniform vec3 uLightDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbientColor;
      uniform float uAlpha;

      void main() {
        vec3 normal = normalize(vNormal);
        // Poly Bridge crisp flat-shading diffuse
        float diff = max(dot(normal, normalize(uLightDir)), 0.0);
        vec3 lighting = uAmbientColor + uSunColor * diff;
        
        // Edge contour hint for low-poly tactile feel
        float edge = clamp(dot(normal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
        vec3 col = vColor * lighting + (edge * 0.035);

        gl_FragColor = vec4(col, uAlpha);
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(this.program));
    }

    this.attribs = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor')
    };

    this.uniforms = {
      projection: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
      view: gl.getUniformLocation(this.program, 'uViewMatrix'),
      model: gl.getUniformLocation(this.program, 'uModelMatrix'),
      lightDir: gl.getUniformLocation(this.program, 'uLightDir'),
      sunColor: gl.getUniformLocation(this.program, 'uSunColor'),
      ambientColor: gl.getUniformLocation(this.program, 'uAmbientColor'),
      alpha: gl.getUniformLocation(this.program, 'uAlpha')
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  // -------------------------------------------------------------
  // 2. Math & Matrix Utilities
  // -------------------------------------------------------------
  mat4Create() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  mat4Perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  mat4Ortho(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
    ]);
  }

  mat4LookAt(eye, center, up) {
    const z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let len = 1 / Math.hypot(z0, z1, z2);
    const zx = z0 * len, zy = z1 * len, zz = z2 * len;

    const x0 = up[1] * zz - up[2] * zy, x1 = up[2] * zx - up[0] * zz, x2 = up[0] * zy - up[1] * zx;
    len = 1 / Math.hypot(x0, x1, x2);
    const xx = x0 * len, xy = x1 * len, xz = x2 * len;

    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1
    ]);
  }

  mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      const a0 = a[i], a1 = a[i + 4], a2 = a[i + 8], a3 = a[i + 12];
      out[i] = a0 * b[0] + a1 * b[1] + a2 * b[2] + a3 * b[3];
      out[i + 4] = a0 * b[4] + a1 * b[5] + a2 * b[6] + a3 * b[7];
      out[i + 8] = a0 * b[8] + a1 * b[9] + a2 * b[10] + a3 * b[11];
      out[i + 12] = a0 * b[12] + a1 * b[13] + a2 * b[14] + a3 * b[15];
    }
    return out;
  }

  mat4Translation(x, y, z) {
    const m = this.mat4Create();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }

  mat4Scaling(sx, sy, sz) {
    const m = this.mat4Create();
    m[0] = sx; m[5] = sy; m[10] = sz;
    return m;
  }

  mat4RotationY(angle) {
    const m = this.mat4Create();
    const c = Math.cos(angle), s = Math.sin(angle);
    m[0] = c;  m[2] = s;
    m[8] = -s; m[10] = c;
    return m;
  }

  mat4RotationZ(angle) {
    const m = this.mat4Create();
    const c = Math.cos(angle), s = Math.sin(angle);
    m[0] = c; m[1] = s;
    m[4] = -s; m[5] = c;
    return m;
  }

  // -------------------------------------------------------------
  // 3. Procedural Low-Poly 3D Geometry Generators
  // -------------------------------------------------------------
  createBox(width, height, depth, color = [0.8, 0.8, 0.8]) {
    const hw = width / 2, hh = height / 2, hd = depth / 2;
    const r = color[0], g = color[1], b = color[2];

    const positions = [
      // Front
      -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,
      -hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd,
      // Back
       hw, -hh, -hd,  -hw, -hh, -hd,  -hw,  hh, -hd,
       hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd,
      // Top
      -hw,  hh,  hd,   hw,  hh,  hd,   hw,  hh, -hd,
      -hw,  hh,  hd,   hw,  hh, -hd,  -hw,  hh, -hd,
      // Bottom
      -hw, -hh, -hd,   hw, -hh, -hd,   hw, -hh,  hd,
      -hw, -hh, -hd,   hw, -hh,  hd,  -hw, -hh,  hd,
      // Right
       hw, -hh,  hd,   hw, -hh, -hd,   hw,  hh, -hd,
       hw, -hh,  hd,   hw,  hh, -hd,   hw,  hh,  hd,
      // Left
      -hw, -hh, -hd,  -hw, -hh,  hd,  -hw,  hh,  hd,
      -hw, -hh, -hd,  -hw,  hh,  hd,  -hw,  hh, -hd
    ];

    const normals = [
      // Front
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // Back
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      // Top
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      // Bottom
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      // Right
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      // Left
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
    ];

    const colors = [];
    for (let i = 0; i < 36; i++) {
      colors.push(r, g, b);
    }

    return { positions, normals, colors };
  }

  createCylinder(radius, height, segments = 8, color = [0.7, 0.7, 0.7]) {
    const positions = [];
    const normals = [];
    const colors = [];
    const hh = height / 2;
    const r = color[0], g = color[1], b = color[2];

    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * 2 * Math.PI;
      const theta2 = ((i + 1) / segments) * 2 * Math.PI;

      const x1 = radius * Math.cos(theta1), z1 = radius * Math.sin(theta1);
      const x2 = radius * Math.cos(theta2), z2 = radius * Math.sin(theta2);

      // Per-vertex radial normals (rather than one flat normal shared by the whole facet) so
      // shading interpolates smoothly across each side segment. With a single flat normal per
      // facet, low-segment cylinders (fuel tanks, trunks, insulators, pins) would flip abruptly
      // between lit and unlit facets at grazing view angles.
      const n1x = x1 / radius, n1z = z1 / radius;
      const n2x = x2 / radius, n2z = z2 / radius;

      // Side wall winding: with gl.cullFace(BACK) and the default CCW front face, these
      // triangles need their outward normal (Edge1 x Edge2) pointing away from the axis. The
      // previous vertex order wound them the other way, so backface culling silently dropped
      // every side facet whose camera-facing side happened to be the culled one — at a large
      // radius and a grazing view angle (e.g. the industrial fuel tanks) that reads as a
      // flickering, torn "crumpled ribbon" instead of a solid cylinder wall.
      positions.push(
        x1, -hh, z1,   x2,  hh, z2,   x2, -hh, z2,
        x1, -hh, z1,   x1,  hh, z1,   x2,  hh, z2
      );
      normals.push(
        n1x, 0, n1z,   n2x, 0, n2z,   n2x, 0, n2z,
        n1x, 0, n1z,   n1x, 0, n1z,   n2x, 0, n2z
      );
      for (let k = 0; k < 6; k++) {
        colors.push(r, g, b);
      }

      // Top cap
      positions.push(0, hh, 0,   x1, hh, z1,   x2, hh, z2);
      for (let k = 0; k < 3; k++) {
        normals.push(0, 1, 0);
        colors.push(r * 1.08, g * 1.08, b * 1.08);
      }

      // Bottom cap
      positions.push(0, -hh, 0,   x2, -hh, z2,   x1, -hh, z1);
      for (let k = 0; k < 3; k++) {
        normals.push(0, -1, 0);
        colors.push(r * 0.82, g * 0.82, b * 0.82);
      }
    }
    return { positions, normals, colors };
  }

  createPyramid(baseSize, height, color = [0.8, 0.3, 0.2]) {
    const hs = baseSize / 2;
    const r = color[0], g = color[1], b = color[2];
    const positions = [
      // 4 triangular sides meeting at apex (0, height, 0)
      -hs, 0,  hs,   hs, 0,  hs,   0, height, 0,
       hs, 0,  hs,   hs, 0, -hs,   0, height, 0,
       hs, 0, -hs,  -hs, 0, -hs,   0, height, 0,
      -hs, 0, -hs,  -hs, 0,  hs,   0, height, 0,
      // Bottom square base
      -hs, 0, -hs,   hs, 0, -hs,   hs, 0,  hs,
      -hs, 0, -hs,   hs, 0,  hs,  -hs, 0,  hs
    ];
    const normals = [];
    const colors = [];
    for (let i = 0; i < 4; i++) {
      const shade = 0.9 + (i % 2) * 0.15;
      for (let k = 0; k < 3; k++) {
        normals.push(0, 0.7, 0.7);
        colors.push(r * shade, g * shade, b * shade);
      }
    }
    for (let k = 0; k < 6; k++) {
      normals.push(0, -1, 0);
      colors.push(r * 0.7, g * 0.7, b * 0.7);
    }
    return { positions, normals, colors };
  }

  mergeGeometries(geos) {
    const positions = [];
    const normals = [];
    const colors = [];

    // NOTE: no `push(...arr)` here — spreading a large array into arguments blows the call
    // stack once a merged mesh reaches ~100k floats (the city blocks now exceed that).
    const append = (dst, src) => {
      for (let i = 0, n = src.length; i < n; i++) dst.push(src[i]);
    };
    geos.forEach(g => {
      if (!g) return;
      append(positions, g.positions);
      append(normals, g.normals);
      append(colors, g.colors);
    });

    return { positions, normals, colors };
  }

  transformGeometry(geo, matrix) {
    const positions = [];
    const normals = [];
    const colors = [...geo.colors];

    for (let i = 0; i < geo.positions.length; i += 3) {
      const x = geo.positions[i], y = geo.positions[i + 1], z = geo.positions[i + 2];
      const px = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      const py = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      const pz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      positions.push(px, py, pz);

      const nx = geo.normals[i], ny = geo.normals[i + 1], nz = geo.normals[i + 2];
      const tnx = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
      const tny = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
      const tnz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
      const nlen = Math.hypot(tnx, tny, tnz) || 1;
      normals.push(tnx / nlen, tny / nlen, tnz / nlen);
    }
    return { positions, normals, colors };
  }

  // -------------------------------------------------------------
  // 4. City Block Fillers (Makes Space Between Roads Full & Dense)
  // -------------------------------------------------------------
  buildCityBlocksMesh(cityData) {
    const parts = [];
    const rows = 7, cols = 8;
    const xStart = 120, xEnd = 880, yStart = 160, yEnd = 820;
    const dx = (xEnd - xStart) / (cols - 1);
    const dy = (yEnd - yStart) / (rows - 1);

    // Identify landmark locations to avoid overlapping buildings
    const landmarks = this.getLandmarkNodes(cityData);

    // Loop over each grid cell block between roads
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        // Skip the river canyon corridor between column 2 and column 3
        if (c === 2) continue;

        const x0 = xStart + c * dx;
        const x1 = xStart + (c + 1) * dx;
        const z0 = yStart + r * dy;
        const z1 = yStart + (r + 1) * dy;

        const blockW = (x1 - x0) - 16;
        const blockD = (z1 - z0) - 16;
        const midX = (x0 + x1) / 2;
        const midZ = (z0 + z1) / 2;

        // 1. Raised Concrete Sidewalk / Curb Foundation Slab
        parts.push(this.transformGeometry(
          this.createBox(blockW, 1.4, blockD, [0.86, 0.84, 0.80]),
          this.mat4Translation(midX, 0.7, midZ)
        ));

        // Landmarks sitting inside this block (a block can host more than one, e.g. the
        // Downtown Power Station and the Central Power Hub share the block east of the
        // North Bridge).
        const landmarksHere = landmarks.filter(lm =>
          lm.x >= x0 && lm.x <= x1 && lm.y >= z0 && lm.y <= z1
        );

        if (landmarksHere.length) {
          // Landmark Block: parking apron + landscaped perimeter. Accessory props (a corner
          // townhome and trees) only go into corners that are clear of every landmark's
          // footprint so nothing renders inside a hospital / substation model.
          const isPower = landmarksHere.some(lm => lm.domain === 'power');
          const apronColor = isPower ? [0.45, 0.46, 0.48] : [0.32, 0.35, 0.38];
          parts.push(this.transformGeometry(
            this.createBox(blockW - 8, 0.4, blockD - 8, apronColor),
            this.mat4Translation(midX, 1.5, midZ)
          ));

          const clearOf = (px, pz, need) => landmarksHere.every(lm => {
            const d = Math.max(Math.abs(lm.x - px), Math.abs(lm.y - pz));
            return d >= this.landmarkFootprintRadius(lm) + need;
          });
          const cornerSlots = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
            .map(([sx, sz]) => [midX + sx * blockW * 0.36, midZ + sz * blockD * 0.36]);

          // Corner 3-story townhome in the first corner with enough room
          let townhomePlaced = false;
          const seed = r * 17 + c * 5 + 7;
          const { walls: wallPalette, roofs: roofPalette } = this.cottagePalettes;
          cornerSlots.forEach(([px, pz]) => {
            if (!townhomePlaced && clearOf(px, pz, 10)) {
              const pal = Math.floor(this.hash01(seed, 1) * wallPalette.length);
              this.addTownhouse(
                parts, px, pz, Math.PI / 4,
                wallPalette[pal], roofPalette[(pal + 1) % roofPalette.length], 0.9, 1.9
              );
              townhomePlaced = true;
            } else if (clearOf(px, pz, 7)) {
              // Landscaping tree
              parts.push(this.transformGeometry(
                this.createCylinder(1.2, 7, 6, [0.45, 0.35, 0.25]),
                this.mat4Translation(px, 4.5, pz)
              ));
              parts.push(this.transformGeometry(
                this.createPyramid(12, 14, [0.24, 0.44, 0.32]),
                this.mat4Translation(px, 8.0, pz)
              ));
            }
          });

          continue; // Let the landmark model(s) occupy the block
        }

        // 2. City District Specific Dense Architecture
        const isDowntown = (c >= 3 && c <= 4 && r >= 2 && r <= 4);
        const isIndustrial = (r <= 1);
        const isResidential = (c >= 5);
        const isPark = (r === 2 && c === 4) || (r === 4 && c === 1);
        // Two signature skyscrapers on the free downtown blocks flanking Central Hospital
        const isGlassSpire = (r === 3 && c === 4);
        const isDecoTower = (r === 4 && c === 3);

        if (isGlassSpire || isDecoTower) {
          // 🌆 SIGNATURE SKYSCRAPERS
          // Granite plaza with perimeter trees
          parts.push(this.transformGeometry(
            this.createBox(blockW - 6, 0.5, blockD - 6, [0.60, 0.61, 0.64]),
            this.mat4Translation(midX, 1.65, midZ)
          ));
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
            parts.push(this.transformGeometry(
              this.createCylinder(1.0, 6, 6, [0.45, 0.35, 0.25]),
              this.mat4Translation(midX + sx * blockW * 0.40, 4.9, midZ + sz * blockD * 0.40)
            ));
            parts.push(this.transformGeometry(
              this.createPyramid(9, 11, [0.24, 0.44, 0.32]),
              this.mat4Translation(midX + sx * blockW * 0.40, 7.9, midZ + sz * blockD * 0.40)
            ));
          });

          if (isGlassSpire) {
            // Tower A: slender blue-glass spire with a stepped crown and a needle mast
            const steel = [0.20, 0.30, 0.42];
            const steelHi = [0.26, 0.37, 0.50];
            const glass = [0.32, 0.64, 0.88];
            const shaftH = 130;
            const shaftW = blockW * 0.40, shaftD = blockD * 0.40;

            parts.push(this.transformGeometry(
              this.createBox(blockW * 0.62, 10, blockD * 0.62, steelHi),
              this.mat4Translation(midX, 1.4 + 5, midZ)
            ));
            parts.push(this.transformGeometry(
              this.createBox(shaftW, shaftH, shaftD, steel),
              this.mat4Translation(midX, 1.4 + shaftH / 2, midZ)
            ));
            for (let y = 18; y < shaftH - 4; y += 12) {
              parts.push(this.transformGeometry(
                this.createBox(shaftW + 1.2, 2.6, shaftD + 1.2, glass),
                this.mat4Translation(midX, 1.4 + y, midZ)
              ));
            }
            // Crown setback
            const crownH = 22;
            parts.push(this.transformGeometry(
              this.createBox(shaftW * 0.68, crownH, shaftD * 0.68, steelHi),
              this.mat4Translation(midX, 1.4 + shaftH + crownH / 2, midZ)
            ));
            parts.push(this.transformGeometry(
              this.createBox(shaftW * 0.72, 3, shaftD * 0.72, glass),
              this.mat4Translation(midX, 1.4 + shaftH + crownH * 0.55, midZ)
            ));
            // Needle mast + aviation beacon
            const mastH = 42;
            const mastBase = 1.4 + shaftH + crownH;
            parts.push(this.transformGeometry(
              this.createCylinder(1.3, mastH, 6, [0.62, 0.64, 0.68]),
              this.mat4Translation(midX, mastBase + mastH / 2, midZ)
            ));
            parts.push(this.transformGeometry(
              this.createBox(2.6, 2.6, 2.6, [0.96, 0.28, 0.24]),
              this.mat4Translation(midX, mastBase + mastH + 1.3, midZ)
            ));
          } else {
            // Tower B: stepped art-deco sandstone tower with a copper cap and antenna
            const tiers = [
              { w: 0.62, h: 55, col: [0.86, 0.80, 0.68] },
              { w: 0.48, h: 45, col: [0.82, 0.76, 0.64] },
              { w: 0.34, h: 38, col: [0.78, 0.72, 0.60] }
            ];
            const windowCol = [0.22, 0.26, 0.32];
            let base = 1.4;
            tiers.forEach(t => {
              const tw = blockW * t.w, td = blockD * t.w;
              parts.push(this.transformGeometry(
                this.createBox(tw, t.h, td, t.col),
                this.mat4Translation(midX, base + t.h / 2, midZ)
              ));
              for (let y = 6; y < t.h - 4; y += 9) {
                parts.push(this.transformGeometry(
                  this.createBox(tw + 0.8, 2.2, td + 0.8, windowCol),
                  this.mat4Translation(midX, base + y, midZ)
                ));
              }
              base += t.h;
            });
            // Copper pyramid cap + antenna
            const capBase = blockW * tiers[2].w;
            parts.push(this.transformGeometry(
              this.createPyramid(capBase, 16, [0.55, 0.42, 0.30]),
              this.mat4Translation(midX, base, midZ)
            ));
            parts.push(this.transformGeometry(
              this.createCylinder(0.9, 26, 6, [0.42, 0.44, 0.48]),
              this.mat4Translation(midX, base + 16 + 13, midZ)
            ));
            parts.push(this.transformGeometry(
              this.createBox(2.2, 2.2, 2.2, [0.96, 0.28, 0.24]),
              this.mat4Translation(midX, base + 16 + 26 + 1.1, midZ)
            ));
          }
        } else if (isPark) {
          // 🌲 Central City Park Block (Green lawn, central pond, paths, cherry blossom & pine trees)
          parts.push(this.transformGeometry(
            this.createBox(blockW - 4, 0.5, blockD - 4, [0.30, 0.52, 0.35]),
            this.mat4Translation(midX, 1.5, midZ)
          ));
          // Central pond
          parts.push(this.transformGeometry(
            this.createCylinder(16, 0.6, 12, [0.45, 0.66, 0.72]),
            this.mat4Translation(midX, 1.6, midZ)
          ));
          // Trees & Park Benches
          [[-24, -24], [24, -24], [-24, 24], [24, 24], [0, 26], [0, -26]].forEach(([px, pz], idx) => {
            const treeColor = (idx % 2 === 0) ? [0.92, 0.68, 0.72] : [0.22, 0.42, 0.28];
            parts.push(this.transformGeometry(
              this.createCylinder(1.2, 7, 6, [0.45, 0.35, 0.25]),
              this.mat4Translation(midX + px, 4.5, midZ + pz)
            ));
            parts.push(this.transformGeometry(
              this.createPyramid(12, 14, treeColor),
              this.mat4Translation(midX + px, 8.0, midZ + pz)
            ));
          });
        } else if (isDowntown) {
          // 🏙️ DOWNTOWN HIGH-RISE DISTRICT (Skyscrapers, office towers, commercial centers)
          // Tower 1: Major modern skyscraper (stepped geometry with glass ribbons and helipad/antenna)
          const towerHeight = 45 + ((r * 7 + c * 11) % 25);
          const towerCol = ((r + c) % 2 === 0) ? [0.22, 0.32, 0.42] : [0.88, 0.86, 0.82];
          const glassCol = [0.18, 0.48, 0.72];

          // Tower podium base
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.55, 16, blockD * 0.55, towerCol),
            this.mat4Translation(midX - blockW * 0.18, 9.4, midZ - blockD * 0.18)
          ));
          // Tower shaft
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.42, towerHeight, blockD * 0.42, towerCol),
            this.mat4Translation(midX - blockW * 0.18, 1.4 + towerHeight / 2, midZ - blockD * 0.18)
          ));
          // Glass window band
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.44, 4, blockD * 0.44, glassCol),
            this.mat4Translation(midX - blockW * 0.18, 1.4 + towerHeight * 0.6, midZ - blockD * 0.18)
          ));
          // Rooftop HVAC unit & antenna
          parts.push(this.transformGeometry(
            this.createBox(12, 4, 12, [0.4, 0.42, 0.46]),
            this.mat4Translation(midX - blockW * 0.18, 1.4 + towerHeight + 2, midZ - blockD * 0.18)
          ));
          parts.push(this.transformGeometry(
            this.createCylinder(0.8, 14, 6, [0.3, 0.32, 0.36]),
            this.mat4Translation(midX - blockW * 0.18, 1.4 + towerHeight + 11, midZ - blockD * 0.18)
          ));

          // Building 2: Mid-rise Commercial Banking / Retail Plaza
          const midRiseH = 24 + ((r * 5 + c * 3) % 12);
          const midCol = [0.78, 0.42, 0.28]; // Terracotta / Akagane
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.42, midRiseH, blockD * 0.48, midCol),
            this.mat4Translation(midX + blockW * 0.22, 1.4 + midRiseH / 2, midZ + blockD * 0.18)
          ));
          // Commercial ground awning
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.44, 1.8, 5, [0.88, 0.65, 0.22]),
            this.mat4Translation(midX + blockW * 0.22, 4.5, midZ + blockD * 0.42)
          ));

          // Building 3: Corner Boutique Store
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.32, 14, blockD * 0.32, [0.24, 0.38, 0.32]),
            this.mat4Translation(midX + blockW * 0.24, 8.4, midZ - blockD * 0.26)
          ));
        } else if (isIndustrial) {
          // 🏘️ NORTH DISTRICT (Townhome terraces beside the fuel depot & container yard)
          // Row of three 3-story townhomes on a lawn, doors facing the street
          {
            const seed = r * 11 + c * 3 + 53;
            const { walls: wallPalette, roofs: roofPalette } = this.cottagePalettes;
            parts.push(this.transformGeometry(
              this.createBox(blockW * 0.5 - 4, 0.4, blockD - 6, [0.44, 0.60, 0.38]),
              this.mat4Translation(midX - blockW * 0.22, 1.5, midZ)
            ));
            [-0.31, 0, 0.31].forEach((fz, i) => {
              const pal = Math.floor(this.hash01(seed, i + 1) * wallPalette.length);
              const scale = 0.95 + this.hash01(seed, i + 11) * 0.15;
              this.addTownhouse(
                parts, midX - blockW * 0.24, midZ + blockD * fz, -Math.PI / 2,
                wallPalette[pal], roofPalette[(pal + i) % roofPalette.length], scale
              );
            });
            this.addGardenTree(parts, midX - blockW * 0.42, midZ - blockD * 0.16, seed, 1);
            this.addGardenTree(parts, midX - blockW * 0.42, midZ + blockD * 0.16, seed, 2);
          }

          // Cylindrical Fuel Storage Tanks
          [-blockD * 0.25, blockD * 0.25].forEach((tz, i) => {
            parts.push(this.transformGeometry(
              this.createCylinder(12, 18, 10, [0.82, 0.84, 0.88]),
              this.mat4Translation(midX + blockW * 0.28, 10.4, midZ + tz)
            ));
          });

          // Stacked colorful shipping containers (Red, Blue, Yellow, Green)
          const contColors = [
            [0.85, 0.25, 0.2], [0.2, 0.45, 0.75], [0.9, 0.7, 0.15], [0.25, 0.55, 0.35]
          ];
          [[-4, 0], [4, 0], [0, 4.5]].forEach(([cx, cy], i) => {
            parts.push(this.transformGeometry(
              this.createBox(16, 4.5, 7, contColors[i % contColors.length]),
              this.mat4Translation(midX + blockW * 0.06 + cx, 3.6 + cy, midZ)
            ));
          });
        } else if (isResidential) {
          // 🏡 EAST RESIDENTIAL DISTRICT (Apartments, pitched-roof homes, gardens)
          // 4-story Apartment Complex
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.45, 20, blockD * 0.75, [0.88, 0.84, 0.78]),
            this.mat4Translation(midX - blockW * 0.2, 11.4, midZ)
          ));
          // Balconies
          for (let f of [6, 12, 18]) {
            parts.push(this.transformGeometry(
              this.createBox(blockW * 0.48, 1.2, 2.5, [0.35, 0.45, 0.35]),
              this.mat4Translation(midX - blockW * 0.2, f, midZ + blockD * 0.38)
            ));
          }

          // Two Suburban Pitched-Roof Homes
          [-blockD * 0.24, blockD * 0.24].forEach((hz, i) => {
            const wallCol = (i === 0) ? [0.92, 0.90, 0.84] : [0.82, 0.85, 0.88];
            const pitchRoof = (i === 0) ? [0.78, 0.34, 0.24] : [0.32, 0.35, 0.40];
            parts.push(this.transformGeometry(
              this.createBox(24, 11, 24, wallCol),
              this.mat4Translation(midX + blockW * 0.24, 6.9, midZ + hz)
            ));
            parts.push(this.transformGeometry(
              this.createPyramid(28, 8, pitchRoof),
              this.mat4Translation(midX + blockW * 0.24, 12.4, midZ + hz)
            ));
            // Backyard Tree
            parts.push(this.transformGeometry(
              this.createPyramid(10, 12, [0.24, 0.44, 0.32]),
              this.mat4Translation(midX + blockW * 0.38, 7.4, midZ + hz + 10)
            ));
          });
        } else {
          // 🏘️ MIXED-USE URBAN & RIVERFRONT DISTRICT
          // A terrace of little cottages with gardens on the west half of the block, plus one
          // terracotta corner shop so the streetscape keeps some variety.
          const seed = r * 13 + c * 7 + 101;
          const { walls: wallPalette, roofs: roofPalette } = this.cottagePalettes;

          // Lawn strip + footpath down the middle of the housing half
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.5 - 4, 0.4, blockD - 6, [0.44, 0.60, 0.38]),
            this.mat4Translation(midX - blockW * 0.25, 1.5, midZ)
          ));
          parts.push(this.transformGeometry(
            this.createBox(3.5, 0.3, blockD - 10, [0.74, 0.72, 0.68]),
            this.mat4Translation(midX - blockW * 0.10, 1.75, midZ)
          ));
          [-0.32, 0, 0.32].forEach((fz, i) => {
            const yaw = -Math.PI / 2 + (this.hash01(seed, i + 1) - 0.5) * 0.4; // doors face the footpath
            const pal = Math.floor(this.hash01(seed, i + 10) * wallPalette.length);
            const scale = 0.9 + this.hash01(seed, i + 20) * 0.3;
            this.addCottage(
              parts, midX - blockW * 0.30, midZ + blockD * fz, yaw,
              wallPalette[pal], roofPalette[(pal + i) % roofPalette.length], scale
            );
          });
          // Garden trees between the houses
          [-0.16, 0.16].forEach((fz, i) => {
            this.addGardenTree(parts, midX - blockW * 0.42, midZ + blockD * fz, seed, i);
          });

          // East half: two individual detached homes with their own lawn and a garden tree
          parts.push(this.transformGeometry(
            this.createBox(blockW * 0.5 - 4, 0.4, blockD - 6, [0.44, 0.60, 0.38]),
            this.mat4Translation(midX + blockW * 0.25, 1.5, midZ)
          ));
          [-0.24, 0.24].forEach((fz, i) => {
            const yaw = Math.PI / 2 + (this.hash01(seed, i + 31) - 0.5) * 0.4; // doors face the footpath
            const pal = Math.floor(this.hash01(seed, i + 41) * wallPalette.length);
            const scale = 1.0 + this.hash01(seed, i + 51) * 0.3;
            this.addCottage(
              parts, midX + blockW * 0.26, midZ + blockD * fz, yaw,
              wallPalette[pal], roofPalette[(pal + i + 2) % roofPalette.length], scale
            );
          });
          this.addGardenTree(parts, midX + blockW * 0.40, midZ, seed, 7);
        }
      }
    }

    return this.mergeGeometries(parts);
  }

  // -------------------------------------------------------------
  // 4b. Shared cottage generator (used by the suburb ring and the in-grid housing blocks)
  // -------------------------------------------------------------
  /** Hospitals, clinics and power assets: the nodes that get a dedicated landmark model. */
  getLandmarkNodes(cityData) {
    return (cityData?.nodes || []).filter(n =>
      n.type === 'hospital' || n.type === 'clinic' || n.domain === 'power'
    );
  }

  /** Half-width of a landmark model's ground footprint (matches the mesh builders' scales). */
  landmarkFootprintRadius(lm) {
    if (lm.type === 'hospital') return 34;
    if (lm.type === 'clinic') return 22;
    return 22; // substations / power hubs: 36 x 1.1 base plus fence posts
  }

  hash01(seed, k) {
    // Small deterministic hash so procedural layouts are stable between rebuilds
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  get cottagePalettes() {
    return {
      walls: [
        [0.94, 0.91, 0.84], [0.86, 0.88, 0.90], [0.92, 0.84, 0.72], [0.80, 0.86, 0.80], [0.95, 0.88, 0.80]
      ],
      roofs: [
        [0.72, 0.32, 0.24], [0.34, 0.37, 0.42], [0.46, 0.34, 0.26], [0.30, 0.45, 0.38], [0.62, 0.40, 0.30]
      ]
    };
  }

  /** Push a little pitched-roof cottage (walls, roof, chimney, door, porch step) into `parts`. */
  addCottage(parts, cx, cz, rot, wallCol, roofCol, scale = 1.0, groundY = 1.4) {
    const w = 13 * scale, h = 7 * scale, d = 11 * scale;
    const frame = this.mat4Multiply(this.mat4Translation(cx, 0, cz), this.mat4RotationY(rot));
    const place = (geo, lx, ly, lz) => this.transformGeometry(
      this.transformGeometry(geo, this.mat4Translation(lx, ly, lz)),
      frame
    );
    parts.push(place(this.createBox(w, h, d, wallCol), 0, groundY + h / 2, 0));
    parts.push(place(this.createPyramid(Math.max(w, d) * 1.18, 5.5 * scale, roofCol), 0, groundY + h, 0));
    parts.push(place(this.createBox(1.6, 4, 1.6, [0.55, 0.50, 0.46]), w * 0.28, groundY + h + 1.8, d * 0.15));
    parts.push(place(this.createBox(2.6, 3.6, 0.6, [0.40, 0.28, 0.20]), 0, groundY + 1.8, d / 2 + 0.2));
    parts.push(place(this.createBox(4.5, 0.6, 2.2, [0.80, 0.78, 0.74]), 0, groundY + 0.3, d / 2 + 1.2));
  }

  /** Push a 3-story townhome (stacked floors with window bands, pitched roof, chimney, door, stoop). */
  addTownhouse(parts, cx, cz, rot, wallCol, roofCol, scale = 1.0, groundY = 1.4) {
    const w = 15 * scale, d = 13 * scale, floorH = 6.5 * scale, floors = 3;
    const h = floorH * floors;
    const trim = [wallCol[0] * 0.78, wallCol[1] * 0.78, wallCol[2] * 0.78];
    const glass = [0.30, 0.42, 0.55];
    const frame = this.mat4Multiply(this.mat4Translation(cx, 0, cz), this.mat4RotationY(rot));
    const place = (geo, lx, ly, lz) => this.transformGeometry(
      this.transformGeometry(geo, this.mat4Translation(lx, ly, lz)),
      frame
    );
    // Walls
    parts.push(place(this.createBox(w, h, d, wallCol), 0, groundY + h / 2, 0));
    // Floor-separator bands + windows on the front (+Z) and back faces
    for (let f = 0; f < floors; f++) {
      const y0 = groundY + f * floorH;
      if (f > 0) parts.push(place(this.createBox(w + 0.6, 0.5, d + 0.6, trim), 0, y0, 0));
      [-w * 0.26, w * 0.26].forEach(wx => {
        if (f === 0 && wx < 0) return; // ground floor: door takes the left slot
        parts.push(place(this.createBox(3.2 * scale, 3.4 * scale, 0.5, glass), wx, y0 + floorH * 0.55, d / 2 + 0.05));
        parts.push(place(this.createBox(3.2 * scale, 3.4 * scale, 0.5, glass), wx, y0 + floorH * 0.55, -d / 2 - 0.05));
      });
    }
    // Pitched roof + chimney
    parts.push(place(this.createPyramid(Math.max(w, d) * 1.16, 5.5 * scale, roofCol), 0, groundY + h, 0));
    parts.push(place(this.createBox(1.8, 4.5, 1.8, [0.55, 0.50, 0.46]), w * 0.3, groundY + h + 2.0, -d * 0.15));
    // Door + stoop
    parts.push(place(this.createBox(2.8, 4.0, 0.6, [0.40, 0.28, 0.20]), -w * 0.26, groundY + 2.0, d / 2 + 0.2));
    parts.push(place(this.createBox(5, 0.8, 2.6, [0.80, 0.78, 0.74]), -w * 0.26, groundY + 0.4, d / 2 + 1.4));
  }

  /** Small garden tree (trunk + conical canopy) with seeded size/colour variation. */
  addGardenTree(parts, x, z, seed, k, groundY = 1.4) {
    const th = 8 + this.hash01(seed, k + 40) * 5;
    parts.push(this.transformGeometry(
      this.createCylinder(0.9, 5, 6, [0.45, 0.35, 0.25]),
      this.mat4Translation(x, groundY + 2.5, z)
    ));
    parts.push(this.transformGeometry(
      this.createPyramid(7 + this.hash01(seed, k + 50) * 3, th, [0.24 + this.hash01(seed, k + 60) * 0.08, 0.44, 0.32]),
      this.mat4Translation(x, groundY + 4.5, z)
    ));
  }

  // 🏡 OUTER SUBURB RING
  // Fills the empty land just beyond the road grid (X 120..880 / Z 160..820) with plots of little
  // pitched-roof cottages, and wires them up with a suburban ring lane: spur roads run out from
  // every perimeter intersection to the lane, and each plot gets a driveway onto it.
  // Purely decorative — no graph nodes, so vehicles stay on the simulated network.
  buildSuburbRingMesh(cityData) {
    const parts = [];
    const landmarks = this.getLandmarkNodes(cityData);
    const rows = 7, cols = 8;
    const xStart = 120, xEnd = 880, yStart = 160, yEnd = 820;
    const dx = (xEnd - xStart) / (cols - 1);
    const dy = (yEnd - yStart) / (rows - 1);
    const laneOffset = 40;       // ring lane centreline, measured out from the outermost grid road
    const plotOffset = 100;      // plot centre, measured out from the outermost grid road
    const plotSize = 84;
    const riverX0 = 326, riverX1 = 454; // canyon + margin: nothing may straddle it
    const asphalt = [0.22, 0.24, 0.28];
    const { walls: wallPalette, roofs: roofPalette } = this.cottagePalettes;

    const laneW = xStart - laneOffset, laneE = xEnd + laneOffset;
    const laneN = yStart - laneOffset, laneS = yEnd + laneOffset;

    // ---- 1. Roads: ring lane + spurs ------------------------------------------------------
    const pad = (x, z) => parts.push(this.transformGeometry(
      this.createBox(12, 1.88, 12, asphalt), this.mat4Translation(x, 0.34, z)
    ));
    const lane = (x0, z0, x1, z1) => parts.push(this.buildRoadSegmentMesh({ x: x0, y: z0 }, { x: x1, y: z1 }));

    // Junction points along each side of the ring (grid column/row lines that touch the lane)
    const colXs = [];
    for (let c = 0; c < cols; c++) colXs.push(xStart + c * dx);
    const rowZs = [];
    for (let r = 0; r < rows; r++) rowZs.push(yStart + r * dy);
    const overRiver = (x) => x > riverX0 && x < riverX1;

    // West & east lanes (full height, corners included)
    [laneW, laneE].forEach(lx => {
      const pts = [laneN, ...rowZs, laneS];
      for (let i = 0; i < pts.length - 1; i++) lane(lx, pts[i], lx, pts[i + 1]);
      pts.forEach(z => pad(lx, z));
    });
    // North & south lanes, broken where they would cross the river canyon
    [laneN, laneS].forEach(lz => {
      const pts = [laneW, ...colXs.filter(x => !overRiver(x)), laneE];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a < riverX0 && b > riverX1) {
          // Dead-end stubs up to the riverbank instead of a segment over the water
          lane(a, lz, riverX0 - 4, lz);
          lane(riverX1 + 4, lz, b, lz);
          pad(riverX0 - 4, lz);
          pad(riverX1 + 4, lz);
        } else {
          lane(a, lz, b, lz);
        }
      }
      pts.forEach(x => { if (x !== laneW && x !== laneE) pad(x, lz); });
    });
    // Spurs from every perimeter intersection out to the ring lane
    rowZs.forEach(z => {
      lane(xStart, z, laneW, z);
      lane(xEnd, z, laneE, z);
    });
    colXs.forEach(x => {
      if (overRiver(x)) return;
      lane(x, yStart, x, laneN);
      lane(x, yEnd, x, laneS);
    });

    // ---- 2. Plots ------------------------------------------------------------------------
    // Each plot has a heading `a` such that local +X points toward the ring lane.
    const plots = [];
    const colZs = [yStart - 70];
    for (let r = 0; r < rows - 1; r++) colZs.push(yStart + (r + 0.5) * dy);
    colZs.push(yEnd + 70);
    colZs.forEach((z, i) => {
      plots.push({ x: xStart - plotOffset, z, a: 0, seed: i * 7 + 1 });
      plots.push({ x: xEnd + plotOffset, z, a: Math.PI, seed: i * 7 + 3 });
    });
    for (let c = 0; c < cols - 1; c++) {
      const x = xStart + (c + 0.5) * dx;
      if (x + plotSize / 2 > riverX0 && x - plotSize / 2 < riverX1) continue;
      plots.push({ x, z: yStart - plotOffset, a: Math.PI / 2, seed: c * 5 + 11 });
      plots.push({ x, z: yEnd + plotOffset, a: -Math.PI / 2, seed: c * 5 + 13 });
    }

    plots.forEach(p => {
      const ca = Math.cos(p.a), sa = Math.sin(p.a);
      const toWorld = (lx, lz) => [p.x + lx * ca - lz * sa, p.z + lx * sa + lz * ca];
      const placeLocal = (geo, lx, ly, lz) => {
        const [wx, wz] = toWorld(lx, lz);
        return this.transformGeometry(
          geo,
          this.mat4Multiply(this.mat4Translation(wx, ly, wz), this.mat4RotationY(p.a))
        );
      };

      // Curb slab + lawn
      parts.push(this.transformGeometry(
        this.createBox(plotSize, 1.4, plotSize, [0.86, 0.84, 0.80]),
        this.mat4Translation(p.x, 0.7, p.z)
      ));
      parts.push(this.transformGeometry(
        this.createBox(plotSize - 4, 0.4, plotSize - 4, [0.44, 0.60, 0.38]),
        this.mat4Translation(p.x, 1.5, p.z)
      ));
      // Driveway: from inside the lawn out to the edge of the ring lane (local +X)
      const driveLen = (plotOffset - laneOffset - 4) + 10;
      parts.push(placeLocal(this.createBox(driveLen, 1.9, 4.5, [0.70, 0.68, 0.64]), driveLen / 2 - 10, 0.95, 0));

      // A plot that hosts a landmark node (e.g. the North Power Station) keeps its slab,
      // lawn and driveway but gets no cottages — the landmark model occupies it.
      const occupants = landmarks.filter(lm =>
        Math.abs(lm.x - p.x) <= plotSize / 2 && Math.abs(lm.y - p.z) <= plotSize / 2
      );
      const clearOfOccupants = (wx, wz, need) => occupants.every(lm =>
        Math.max(Math.abs(lm.x - wx), Math.abs(lm.y - wz)) >= this.landmarkFootprintRadius(lm) + need
      );

      // Two or three cottages per plot, slight yaw for a hand-placed feel; the driveway runs
      // along local Z = 0 so houses sit either side of it.
      const count = occupants.length ? 0 : 2 + (this.hash01(p.seed, 0) > 0.6 ? 1 : 0);
      const slots = [
        [-plotSize * 0.20, -plotSize * 0.24],
        [-plotSize * 0.20, plotSize * 0.24],
        [plotSize * 0.20, -plotSize * 0.26]
      ];
      for (let i = 0; i < count; i++) {
        const [lx, lz] = slots[i];
        const [wx, wz] = toWorld(lx, lz);
        const yaw = p.a + (this.hash01(p.seed, i + 1) - 0.5) * 0.5;
        const pal = Math.floor(this.hash01(p.seed, i + 10) * wallPalette.length);
        const scale = 0.85 + this.hash01(p.seed, i + 20) * 0.35;
        this.addCottage(parts, wx, wz, yaw, wallPalette[pal], roofPalette[(pal + i) % roofPalette.length], scale);
      }

      // Garden trees on the free corners
      const treeSpots = [[plotSize * 0.22, plotSize * 0.30], [-plotSize * 0.38, plotSize * 0.02], [plotSize * 0.36, -plotSize * 0.38]];
      treeSpots.forEach(([lx, lz], i) => {
        if (this.hash01(p.seed, i + 30) < 0.35) return;
        const [wx, wz] = toWorld(lx, lz);
        if (!clearOfOccupants(wx, wz, 7)) return;
        this.addGardenTree(parts, wx, wz, p.seed, i);
      });
    });

    return this.mergeGeometries(parts);
  }

  // 🏥 3D HOSPITAL (Metropolis General & Regional Trauma Centers)
  buildHospitalMesh(x, z, scale = 1.0, isFailed = false, isDegraded = false) {
    const parts = [];
    const white = isFailed ? [0.45, 0.45, 0.45] : (isDegraded ? [0.82, 0.78, 0.72] : [0.94, 0.95, 0.97]);
    const blueGlass = isFailed ? [0.25, 0.28, 0.3] : (isDegraded ? [0.65, 0.45, 0.2] : [0.18, 0.52, 0.82]);
    const red = isFailed ? [0.55, 0.15, 0.15] : [0.95, 0.22, 0.22];
    const yellowPad = isFailed ? [0.4, 0.35, 0.2] : [0.96, 0.82, 0.18];
    const darkSteel = [0.28, 0.30, 0.34];

    // Main 4-story hospital medical tower (Top face at Y = 34.0 * scale)
    parts.push(this.transformGeometry(
      this.createBox(38 * scale, 34 * scale, 38 * scale, white),
      this.mat4Translation(0, 17 * scale, 0)
    ));

    // Secondary emergency ICU wing (East, Top face at Y = 20.0 * scale)
    parts.push(this.transformGeometry(
      this.createBox(26 * scale, 20 * scale, 30 * scale, white),
      this.mat4Translation(28 * scale, 10 * scale, 0)
    ));

    // Pediatric / Diagnostic wing (West, Top face at Y = 16.0 * scale)
    parts.push(this.transformGeometry(
      this.createBox(24 * scale, 16 * scale, 28 * scale, white),
      this.mat4Translation(-26 * scale, 8 * scale, 2 * scale)
    ));

    // Glazed window ribbon bands
    for (let floorY of [12, 20, 28]) {
      parts.push(this.transformGeometry(
        this.createBox(39 * scale, 3.6 * scale, 39 * scale, blueGlass),
        this.mat4Translation(0, floorY * scale, 0)
      ));
    }

    // Rooftop HVAC Plant Unit (North-East corner of roof)
    parts.push(this.transformGeometry(
      this.createBox(10 * scale, 3 * scale, 8 * scale, [0.35, 0.38, 0.42]),
      this.mat4Translation(-10 * scale, 35.5 * scale, -10 * scale)
    ));

    // Rooftop Helipad Pedestal / Sub-base (Y in [34.0, 35.0] * scale)
    parts.push(this.transformGeometry(
      this.createCylinder(14.6 * scale, 1.0 * scale, 16, darkSteel),
      this.mat4Translation(0, 34.5 * scale, 0)
    ));

    // Rooftop Helipad Yellow Landing Disc (Y in [35.0, 35.8] * scale)
    parts.push(this.transformGeometry(
      this.createCylinder(13.5 * scale, 0.8 * scale, 16, yellowPad),
      this.mat4Translation(0, 35.4 * scale, 0)
    ));

    // Non-Overlapping "H" Helipad Landing Cross Markings (Y in [35.8, 36.1] * scale, proud of disc)
    // Left vertical stroke (X in [-4.9, -2.7] * scale, Z in [-4.0, 4.0] * scale)
    parts.push(this.transformGeometry(
      this.createBox(2.2 * scale, 0.3 * scale, 8.0 * scale, red),
      this.mat4Translation(-3.8 * scale, 35.95 * scale, 0)
    ));
    // Right vertical stroke (X in [2.7, 4.9] * scale, Z in [-4.0, 4.0] * scale)
    parts.push(this.transformGeometry(
      this.createBox(2.2 * scale, 0.3 * scale, 8.0 * scale, red),
      this.mat4Translation(3.8 * scale, 35.95 * scale, 0)
    ));
    // Center horizontal crossbar (X in [-2.7, 2.7] * scale, Z in [-1.1, 1.1] * scale) - ZERO overlap with vertical strokes!
    parts.push(this.transformGeometry(
      this.createBox(5.4 * scale, 0.3 * scale, 2.2 * scale, red),
      this.mat4Translation(0, 35.95 * scale, 0)
    ));

    // Non-Overlapping 3D Red Cross (+) on Main South Facade
    // Vertical stem: X in [-1.8, 1.8], Y in [16, 28], Z in [19.0, 20.2]
    parts.push(this.transformGeometry(
      this.createBox(3.6 * scale, 12 * scale, 1.2 * scale, red),
      this.mat4Translation(0, 22 * scale, 19.6 * scale)
    ));
    // Left arm: X in [-6.0, -1.8], Y in [20.2, 23.8], Z in [19.0, 20.2]
    parts.push(this.transformGeometry(
      this.createBox(4.2 * scale, 3.6 * scale, 1.2 * scale, red),
      this.mat4Translation(-3.9 * scale, 22 * scale, 19.6 * scale)
    ));
    // Right arm: X in [1.8, 6.0], Y in [20.2, 23.8], Z in [19.0, 20.2]
    parts.push(this.transformGeometry(
      this.createBox(4.2 * scale, 3.6 * scale, 1.2 * scale, red),
      this.mat4Translation(3.9 * scale, 22 * scale, 19.6 * scale)
    ));

    // Emergency Ambulance Drive-in Bay
    parts.push(this.transformGeometry(
      this.createBox(20 * scale, 7 * scale, 14 * scale, [0.3, 0.32, 0.36]),
      this.mat4Translation(28 * scale, 3.5 * scale, 18 * scale)
    ));

    // Red triage access ramp stripe
    parts.push(this.transformGeometry(
      this.createBox(18 * scale, 0.6 * scale, 6 * scale, [0.85, 0.25, 0.2]),
      this.mat4Translation(28 * scale, 0.4 * scale, 24 * scale)
    ));

    // Rooftop Antenna Mast Mount Collar (Y in [34.0, 35.2] * scale)
    parts.push(this.transformGeometry(
      this.createBox(3.0 * scale, 1.2 * scale, 3.0 * scale, darkSteel),
      this.mat4Translation(12 * scale, 34.6 * scale, -10 * scale)
    ));

    // Communications Mast Tower (Y in [35.2, 53.2] * scale)
    parts.push(this.transformGeometry(
      this.createCylinder(0.8 * scale, 18 * scale, 6, [0.45, 0.50, 0.55]),
      this.mat4Translation(12 * scale, 44.2 * scale, -10 * scale)
    ));

    // Red Aviation Warning Beacon on Antenna Tip (Y in [53.2, 54.6] * scale)
    parts.push(this.transformGeometry(
      this.createBox(1.4 * scale, 1.4 * scale, 1.4 * scale, [0.96, 0.18, 0.18]),
      this.mat4Translation(12 * scale, 53.9 * scale, -10 * scale)
    ));

    return this.transformGeometry(
      this.mergeGeometries(parts),
      this.mat4Translation(x, 0, z)
    );
  }

  // 🩺 3D CLINIC (Urgent Care & Triage Centers)
  buildClinicMesh(x, z, scale = 1.0, isFailed = false, isDegraded = false) {
    const parts = [];
    const wallCol = isFailed ? [0.45, 0.45, 0.45] : (isDegraded ? [0.82, 0.78, 0.7] : [0.90, 0.92, 0.94]);
    const roofCol = isFailed ? [0.35, 0.35, 0.35] : [0.82, 0.32, 0.24];
    const red = [0.95, 0.2, 0.2];

    // Single story clinical facility
    parts.push(this.transformGeometry(
      this.createBox(24 * scale, 11 * scale, 20 * scale, wallCol),
      this.mat4Translation(0, 5.5 * scale, 0)
    ));

    // Pitched Hip Roof
    parts.push(this.transformGeometry(
      this.createPyramid(28 * scale, 7 * scale, roofCol),
      this.mat4Translation(0, 11 * scale, 0)
    ));

    // Red Cross Sign (Non-overlapping geometry)
    parts.push(this.transformGeometry(
      this.createBox(2.2 * scale, 7 * scale, 0.8 * scale, red),
      this.mat4Translation(0, 7 * scale, 10.4 * scale)
    ));
    parts.push(this.transformGeometry(
      this.createBox(2.4 * scale, 2.2 * scale, 0.8 * scale, red),
      this.mat4Translation(-2.3 * scale, 7 * scale, 10.4 * scale)
    ));
    parts.push(this.transformGeometry(
      this.createBox(2.4 * scale, 2.2 * scale, 0.8 * scale, red),
      this.mat4Translation(2.3 * scale, 7 * scale, 10.4 * scale)
    ));

    // Entrance Canopy
    parts.push(this.transformGeometry(
      this.createBox(10 * scale, 1.2 * scale, 6 * scale, [0.3, 0.35, 0.4]),
      this.mat4Translation(0, 8 * scale, 13 * scale)
    ));

    return this.transformGeometry(
      this.mergeGeometries(parts),
      this.mat4Translation(x, 0, z)
    );
  }

  // ⚡ 3D POWER SUBSTATION (Transformers & High-Voltage Gantries)
  buildSubstationMesh(x, z, scale = 1.0, isFailed = false, isDegraded = false) {
    const parts = [];
    const steelDark = [0.28, 0.30, 0.36];
    const transformerCol = isFailed ? [0.22, 0.18, 0.18] : (isDegraded ? [0.7, 0.4, 0.2] : [0.42, 0.46, 0.52]);
    const insulatorCol = isFailed ? [0.3, 0.3, 0.3] : [0.88, 0.58, 0.22];
    const glowAmber = isFailed ? [0.25, 0.1, 0.1] : (isDegraded ? [0.95, 0.4, 0.1] : [0.96, 0.72, 0.15]);

    // Concrete Equipment Foundation Pad
    parts.push(this.transformGeometry(
      this.createBox(36 * scale, 2.5 * scale, 36 * scale, [0.38, 0.40, 0.44]),
      this.mat4Translation(0, 1.25 * scale, 0)
    ));

    // 2 Step-Down Transformer Units with Cooling Radiator Fins
    [-8, 8].forEach(tx => {
      parts.push(this.transformGeometry(
        this.createBox(13 * scale, 15 * scale, 12 * scale, transformerCol),
        this.mat4Translation(tx * scale, 8.5 * scale, -5 * scale)
      ));

      // Ceramic High Voltage Insulator Bushings (3 per transformer)
      for (let i = -1; i <= 1; i++) {
        parts.push(this.transformGeometry(
          this.createCylinder(1.6 * scale, 7 * scale, 6, insulatorCol),
          this.mat4Translation((tx + i * 4) * scale, 18.5 * scale, -5 * scale)
        ));
      }
    });

    // Transmission Lattice Gantry Tower
    parts.push(this.transformGeometry(
      this.createBox(2.2 * scale, 28 * scale, 2.2 * scale, steelDark),
      this.mat4Translation(-12 * scale, 14 * scale, 10 * scale)
    ));
    parts.push(this.transformGeometry(
      this.createBox(2.2 * scale, 28 * scale, 2.2 * scale, steelDark),
      this.mat4Translation(12 * scale, 14 * scale, 10 * scale)
    ));
    parts.push(this.transformGeometry(
      this.createBox(28 * scale, 2.4 * scale, 2.4 * scale, steelDark),
      this.mat4Translation(0, 27 * scale, 10 * scale)
    ));

    // Glowing Power Terminal Arcs / Bus Bars
    parts.push(this.transformGeometry(
      this.createCylinder(2.2 * scale, 4 * scale, 8, glowAmber),
      this.mat4Translation(0, 29.5 * scale, 10 * scale)
    ));

    // Security Perimeter Fence Posts
    for (let angle = 0; angle < 4; angle++) {
      const fx = (angle === 0 || angle === 3 ? -16 : 16) * scale;
      const fz = (angle < 2 ? -16 : 16) * scale;
      parts.push(this.transformGeometry(
        this.createCylinder(0.8 * scale, 8 * scale, 4, [0.5, 0.52, 0.56]),
        this.mat4Translation(fx, 4 * scale, fz)
      ));
    }

    return this.transformGeometry(
      this.mergeGeometries(parts),
      this.mat4Translation(x, 0, z)
    );
  }

  // 🚇 3D METRO / TRANSIT HUB (Grand Concourse / Metro Central)
  buildMetroHubMesh(x, z, scale = 1.0, isFailed = false) {
    const parts = [];
    const canopyCol = isFailed ? [0.4, 0.35, 0.35] : [0.22, 0.42, 0.32]; // Deep Moss
    const woodCol = [0.72, 0.58, 0.42];

    // Station Concourse Platform
    parts.push(this.transformGeometry(
      this.createBox(32 * scale, 3 * scale, 24 * scale, [0.35, 0.38, 0.42]),
      this.mat4Translation(0, 1.5 * scale, 0)
    ));

    // Curved Barrel Vault Canopy
    parts.push(this.transformGeometry(
      this.createCylinder(14 * scale, 22 * scale, 10, canopyCol),
      this.mat4Multiply(
        this.mat4Translation(0, 10 * scale, 0),
        this.mat4Scaling(1.0, 0.6, 1.0)
      )
    ));

    // Glulam Wooden Structural Ribs
    [-8, 0, 8].forEach(rz => {
      parts.push(this.transformGeometry(
        this.createBox(24 * scale, 1.5 * scale, 1.5 * scale, woodCol),
        this.mat4Translation(0, 12 * scale, rz * scale)
      ));
    });

    return this.transformGeometry(
      this.mergeGeometries(parts),
      this.mat4Translation(x, 0, z)
    );
  }

  // 🌉 3D POLY BRIDGE TRUSS BRIDGE (Triangular Chords, Joint Pins & FEA Stress Sag)
  buildTrussBridgeMesh(u, v, stressRatio = 0.0, isFailed = false, spanCollapsed = isFailed) {
    const parts = [];
    const dx = v.x - u.x;
    const dz = v.y - u.y; // note y in 2D maps to z in 3D
    const spanLen = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);

    // Color based on Poly Bridge FEA stress heat mechanics:
    let trussColor = [0.24, 0.42, 0.30]; // Pale Moss / Steel Nominal
    let roadColor = [0.24, 0.26, 0.30];
    let buckleDrop = 0;

    if (isFailed) {
      trussColor = [0.92, 0.18, 0.18]; // Snapped Red
      // Only a span whose own structure gave way sags; a crossing closed because its
      // abutment junction failed stays geometrically intact but still reads as out.
      if (spanCollapsed) buckleDrop = -14;
    } else if (stressRatio > 1.05) {
      trussColor = [0.92, 0.36, 0.14]; // Critical Terracotta / Red-Orange
      buckleDrop = -4;
    } else if (stressRatio > 0.8) {
      trussColor = [0.92, 0.68, 0.18]; // Raw Ochre / Amber Stress
    }

    const midX = (u.x + v.x) / 2;
    const midZ = (u.y + v.y) / 2;

    // Concrete Abutment Piers firmly anchored into the riverbed (Y in [-14, 0.0] at riverbanks)
    // Placed at -spanLen/2 and +spanLen/2 in local space, top face stops flush at Y = 0.0 beneath bridge deck & junction pads
    parts.push(this.transformGeometry(
      this.createBox(12, 14, 14, [0.55, 0.52, 0.48]),
      this.mat4Translation(-spanLen / 2, -7, 0)
    ));
    parts.push(this.transformGeometry(
      this.createBox(12, 14, 14, [0.55, 0.52, 0.48]),
      this.mat4Translation(spanLen / 2, -7, 0)
    ));

    // Wooden & Steel Road Deck Surface (Top face at Y = 1.40, smooth transition with road at 1.20)
    const deckGeo = this.createBox(spanLen, 1.4, 12, roadColor);

    // Wooden plank decking stripe
    const woodStripe = this.createBox(spanLen, 0.3, 10, [0.72, 0.58, 0.42]);

    // Poly Bridge Triangular Truss Members (/\/\/\)
    const segments = 4;
    const segLen = spanLen / segments;
    const trussHeight = 18;
    const pinColor = [0.88, 0.90, 0.94]; // Steel circular pin joints

    for (let i = 0; i < segments; i++) {
      const x0 = -spanLen / 2 + i * segLen;
      const x1 = x0 + segLen;
      const peakX = (x0 + x1) / 2;

      const strutLen = Math.hypot(segLen / 2, trussHeight);

      // Left & Right side trusses
      [-6.2, 6.2].forEach(sideZ => {
        // Lower horizontal chord
        parts.push(this.transformGeometry(
          this.createBox(segLen, 2.2, 2.0, trussColor),
          this.mat4Translation(peakX, 2 + buckleDrop, sideZ)
        ));

        // Upper horizontal chord
        parts.push(this.transformGeometry(
          this.createBox(segLen, 2.2, 2.0, trussColor),
          this.mat4Translation(peakX, trussHeight + 2 + buckleDrop * 1.4, sideZ)
        ));

        // Diagonal struts (/\) — tilted to actually span from the lower chord up to the peak
        // and back down, instead of sitting flat (which left them as an unaligned box pile
        // that visually mangled into a crumpled mass as the camera moved around the bridge).
        const strutAngle = Math.atan2(trussHeight, segLen / 2);
        parts.push(this.transformGeometry(
          this.transformGeometry(this.createBox(strutLen, 1.8, 1.8, trussColor), this.mat4RotationZ(strutAngle)),
          this.mat4Translation((x0 + peakX) / 2, (trussHeight / 2) + 2 + buckleDrop, sideZ)
        ));
        parts.push(this.transformGeometry(
          this.transformGeometry(this.createBox(strutLen, 1.8, 1.8, trussColor), this.mat4RotationZ(-strutAngle)),
          this.mat4Translation((peakX + x1) / 2, (trussHeight / 2) + 2 + buckleDrop, sideZ)
        ));

        // Joint Pins (Signature Poly Bridge circular nodes)
        parts.push(this.transformGeometry(
          this.createCylinder(2.5, 3.0, 8, pinColor),
          this.mat4Translation(x0, 2 + buckleDrop, sideZ)
        ));
        parts.push(this.transformGeometry(
          this.createCylinder(2.5, 3.0, 8, pinColor),
          this.mat4Translation(peakX, trussHeight + 2 + buckleDrop * 1.4, sideZ)
        ));
      });
    }

    parts.push(this.transformGeometry(
      deckGeo,
      this.mat4Translation(0, 0.7 + buckleDrop, 0)
    ));
    parts.push(this.transformGeometry(
      woodStripe,
      this.mat4Translation(0, 1.55 + buckleDrop, 0)
    ));

    // Rotate entire bridge to match road angle
    const mRotate = this.mat4RotationY(-angle);
    const mTrans = this.mat4Translation(midX, 0.0, midZ);
    const mFinal = this.mat4Multiply(mTrans, mRotate);

    return this.transformGeometry(this.mergeGeometries(parts), mFinal);
  }

  // 🛣️ 3D ROAD NETWORK SEGMENT
  buildRoadSegmentMesh(u, v, isFailed = false, isAmbulanceRoute = false) {
    const dx = v.x - u.x;
    const dz = v.y - u.y;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const midX = (u.x + v.x) / 2;
    const midZ = (u.y + v.y) / 2;

    const asphalt = isFailed ? [0.42, 0.22, 0.22] : [0.22, 0.24, 0.28];
    const roadWidth = isAmbulanceRoute ? 10 : 8;

    // Inset road so endpoints terminate cleanly inside the enlarged 14.4 junction pad
    // Guaranteed to enclose corners even for tilted road angles (4.0 units away from center)
    const roadLen = Math.max(2, len - 8.0);
    const roadGeo = this.createBox(roadLen, 1.2, roadWidth, asphalt);

    const parts = [roadGeo];

    // White dashed centerline (recessed by margin to stay clear of junction pads)
    const margin = 9.0;
    const usableLen = len - 2 * margin;
    if (usableLen > 14) {
      const dashCount = Math.max(1, Math.floor(usableLen / 22));
      const segStep = usableLen / dashCount;
      for (let k = 0; k < dashCount; k++) {
        const dxCenter = -len / 2 + margin + (k + 0.5) * segStep;
        parts.push(this.transformGeometry(
          this.createBox(Math.min(7.0, segStep * 0.45), 0.12, 0.75, isAmbulanceRoute ? [0.95, 0.3, 0.2] : [0.92, 0.92, 0.92]),
          this.mat4Translation(dxCenter, 0.67, 0)
        ));
      }
    }

    const mRotate = this.mat4RotationY(-angle);
    const mTrans = this.mat4Translation(midX, 0.6, midZ);
    return this.transformGeometry(this.mergeGeometries(parts), this.mat4Multiply(mTrans, mRotate));
  }

  // 🔘 3D ROAD INTERSECTION JUNCTION & POLY BRIDGE STRUCTURAL JOINT
  buildJunctionMesh(x, z, isFailed = false, isDegraded = false) {
    const parts = [];
    const asphalt = isFailed ? [0.42, 0.22, 0.22] : (isDegraded ? [0.32, 0.28, 0.24] : [0.22, 0.24, 0.28]);
    const pinSteel = [0.35, 0.38, 0.42];
    const statusColor = isFailed ? [0.94, 0.22, 0.22] : (isDegraded ? [0.96, 0.68, 0.18] : [0.26, 0.62, 0.56]);

    // 1. Deepened Junction Cross-Pad (14.4 x 1.88 x 14.4)
    // Extends down to Y = -0.60 and up to Y = 1.28 (height 1.88 centered at Y = 0.34).
    // Embeds cleanly into the terrain plinth, completely enclosing incoming road ends and corners.
    // Zero Z-fighting with ground plinth or road bottom faces.
    parts.push(this.transformGeometry(
      this.createBox(14.4, 1.88, 14.4, asphalt),
      this.mat4Translation(0, 0.34, 0)
    ));

    // 2. Poly Bridge Signature Joint Pin Collar (Steel Washer)
    // Sits on top of pad: Y in [1.26, 1.48] (height 0.22 centered at Y = 1.37)
    parts.push(this.transformGeometry(
      this.createCylinder(2.8, 0.22, 12, pinSteel),
      this.mat4Translation(0, 1.37, 0)
    ));

    // 3. Central Status Beacon / Node Core
    // Sits in center of joint pin: Y in [1.46, 1.66] (height 0.20 centered at Y = 1.56)
    parts.push(this.transformGeometry(
      this.createCylinder(1.7, 0.20, 10, statusColor),
      this.mat4Translation(0, 1.56, 0)
    ));

    return this.transformGeometry(
      this.mergeGeometries(parts),
      this.mat4Translation(x, 0, z)
    );
  }

  // 🌊 3D RIVER CANYON & GLITCH-FREE WATER
  // Note: West and East ground plates are split so there is zero overlapping geometry in the river canyon!
  buildTerrainMesh() {
    const parts = [];

    // Terrain extents. The road grid spans X 120..880 / Z 160..820; the plates extend well
    // past it so the outer suburb ring (see buildSuburbRingMesh) has ground to sit on.
    const zMin = -60, zMax = 1060;
    const zLen = zMax - zMin, zMid = (zMin + zMax) / 2;
    const westX0 = -120, eastX1 = 1120;

    // 1. West Bank Ground Plinth (Spans X: -120 to 336, top face at Y = 0.0)
    parts.push(this.transformGeometry(
      this.createBox(336 - westX0, 16, zLen, [0.93, 0.91, 0.86]),
      this.mat4Translation((westX0 + 336) / 2, -8, zMid)
    ));
    parts.push(this.transformGeometry(
      this.createBox(336 - westX0 + 4, 8, zLen + 10, [0.78, 0.74, 0.68]),
      this.mat4Translation((westX0 + 336) / 2, -18, zMid)
    ));

    // 2. East Bank Ground Plinth (Spans X: 444 to 1120, top face at Y = 0.0)
    parts.push(this.transformGeometry(
      this.createBox(eastX1 - 444, 16, zLen, [0.93, 0.91, 0.86]),
      this.mat4Translation((444 + eastX1) / 2, -8, zMid)
    ));
    parts.push(this.transformGeometry(
      this.createBox(eastX1 - 444 + 4, 8, zLen + 10, [0.78, 0.74, 0.68]),
      this.mat4Translation((444 + eastX1) / 2, -18, zMid)
    ));

    // 3. Deep River Canyon Trench Bed (Bottom at Y = -10.0, zero coplanar collision)
    parts.push(this.transformGeometry(
      this.createBox(112, 6, zLen + 4, [0.38, 0.44, 0.46]),
      this.mat4Translation(390, -13, zMid)
    ));

    // 4. Canyon River Cliffs / Stone Banks (From Y = -10.0 up to Y = 0.5)
    parts.push(this.transformGeometry(
      this.createBox(8, 11, zLen, [0.62, 0.58, 0.52]),
      this.mat4Translation(334, -4.5, zMid)
    ));
    parts.push(this.transformGeometry(
      this.createBox(8, 11, zLen, [0.62, 0.58, 0.52]),
      this.mat4Translation(446, -4.5, zMid)
    ));

    // 5. Sunken River Water Surface (Top face at Y = -2.0, completely sunken below canyon rim)
    // Absolute zero Z-fighting when scrolling or zooming!
    parts.push(this.transformGeometry(
      this.createBox(104, 3.0, zLen, [0.46, 0.66, 0.72]), // Water #cbdad5 tone
      this.mat4Translation(390, -3.5, zMid)
    ));

    // 6. River Boulders / Stepping Stones (Protruding slightly at Y = -1.2)
    [
      [380, 240], [400, 380], [375, 520], [395, 680], [380, 800]
    ].forEach(([rx, rz], idx) => {
      parts.push(this.transformGeometry(
        this.createCylinder(7 + (idx % 3) * 2, 4, 6, [0.52, 0.50, 0.46]),
        this.mat4Translation(rx, -1.2, rz)
      ));
    });

    return this.mergeGeometries(parts);
  }

  // -------------------------------------------------------------
  // 5. Dynamic Low-Poly Vehicle Models
  // -------------------------------------------------------------
  initVehicleGeometries() {
    // Ambulance Geometry
    const ambParts = [];
    ambParts.push(this.createBox(9, 5, 4.5, [0.96, 0.96, 0.96])); // White body
    ambParts.push(this.transformGeometry(this.createBox(4, 3.5, 4.4, [0.2, 0.5, 0.75]), this.mat4Translation(2, 0.5, 0))); // Cab window
    ambParts.push(this.transformGeometry(this.createBox(6, 1.2, 4.6, [0.9, 0.2, 0.2]), this.mat4Translation(-1, 0, 0))); // Red stripe
    ambParts.push(this.transformGeometry(this.createBox(1.5, 1.5, 1.5, [0.95, 0.1, 0.1]), this.mat4Translation(0, 3.2, 0))); // Roof siren
    const ambGeo = this.mergeGeometries(ambParts);

    // Commuter Car Geometry
    const carParts = [];
    carParts.push(this.createBox(8, 3.5, 4.2, [0.22, 0.45, 0.65]));
    carParts.push(this.transformGeometry(this.createBox(4.5, 2.5, 4.0, [0.75, 0.85, 0.95]), this.mat4Translation(-0.5, 2.5, 0)));
    const carGeo = this.mergeGeometries(carParts);

    // Delivery Truck Geometry
    const truckParts = [];
    truckParts.push(this.createBox(12, 6, 5, [0.90, 0.65, 0.18])); // Cargo box
    truckParts.push(this.transformGeometry(this.createBox(4, 4.5, 4.8, [0.3, 0.35, 0.4]), this.mat4Translation(7, -0.5, 0))); // Cab
    const truckGeo = this.mergeGeometries(truckParts);

    this.vboAmbulance = this.createGLBuffer(ambGeo);
    this.countAmbulance = ambGeo.positions.length / 3;

    this.vboCar = this.createGLBuffer(carGeo);
    this.countCar = carGeo.positions.length / 3;

    this.vboTruck = this.createGLBuffer(truckGeo);
    this.countTruck = truckGeo.positions.length / 3;

    // Selection Marker Geometry (Floating inverted cone / diamond)
    const markerGeo = this.createPyramid(10, 16, [0.92, 0.36, 0.14]); // Terracotta
    this.vboMarker = this.createGLBuffer(markerGeo);
    this.countMarker = markerGeo.positions.length / 3;
  }

  createGLBuffer(geo) {
    const gl = this.gl;
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);

    const norm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, norm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);

    const col = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, col);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.colors), gl.STATIC_DRAW);

    return { pos, norm, col };
  }

  // -------------------------------------------------------------
  // 6. Scene Rebuilding & State Synchronization
  // -------------------------------------------------------------
  updateScene(cityData, simulationResult, currentStep = 0) {
    this.cityData = cityData;
    this.simulationResult = simulationResult;
    this.currentStep = currentStep;

    if (!cityData || !this.gl) return;

    const geos = [];
    this.interactiveObjects = [];

    // 1. Glitch-free Terrain & River Canyon
    geos.push(this.buildTerrainMesh());

    // 2. Full Procedural City Blocks (fills all spaces between roads)
    geos.push(this.buildCityBlocksMesh(cityData));

    // 2b. Outer suburb ring: little houses on the empty plots beyond the road grid
    geos.push(this.buildSuburbRingMesh(cityData));

    // Evaluate step states
    const failedNodes = new Set();
    const degradedNodes = new Set();
    const failedEdges = new Set();

    if (simulationResult && simulationResult.steps) {
      for (let i = 0; i <= currentStep && i < simulationResult.steps.length; i++) {
        const s = simulationResult.steps[i];
        (s.newly_failed_nodes || []).forEach(id => failedNodes.add(id));
        (s.newly_degraded_nodes || []).forEach(id => {
          if (!failedNodes.has(id)) degradedNodes.add(id);
        });
        (s.newly_failed_edges || []).forEach(id => failedEdges.add(id));
      }
    }

    // Keep the current closed-edge set around outside this build pass so traffic routing can
    // stop vehicles at closed roads/broken bridges instead of only affecting the mesh colors.
    const closedEdges = new Set(failedEdges);
    this.failedEdgeIds = closedEdges;

    // 3. Roads and Poly Bridge Trusses
    cityData.edges.forEach(edge => {
      const u = cityData.nodes.find(n => n.id === edge.source);
      const v = cityData.nodes.find(n => n.id === edge.target);
      if (!u || !v) return;

      const spanCollapsed = failedEdges.has(edge.id);
      // The engine rates span collapse purely on seismic magnitude, separately from the node
      // cascade, so a crossing whose abutment junction has failed is out of service even though
      // its span never structurally gave way. Without this the two uncollapsed spans stayed
      // amber while their own bridge junctions were already rendered red.
      const abutmentDown = [u, v].some(n => n.type === 'bridge' && failedNodes.has(n.id));
      const isFailed = spanCollapsed || abutmentDown;
      if (isFailed) closedEdges.add(edge.id);
      const stressRatio = edge.load / Math.max(1, edge.capacity);
      const isAmbulanceRoute = edge.type === 'ambulance_route';

      // BUGFIX: previously also matched any edge whose endpoints merely straddled the river's
      // x-band ("crossesRiver"), which isn't limited to actual bridges — several ordinary road
      // segments (rows 0,1,5,6) and diagonal power lines span that same band and were wrongly
      // rendered as green diagonal Poly Bridge trusses floating out of place. Only the 3 edges
      // the data model actually tags as bridges (Bridge Span R3/R4/R5) should get a truss mesh.
      if (edge.type === 'bridge' || (edge.name && edge.name.includes('Bridge'))) {
        geos.push(this.buildTrussBridgeMesh(u, v, stressRatio, isFailed, spanCollapsed));
      } else if (edge.domain === 'road' || isAmbulanceRoute) {
        geos.push(this.buildRoadSegmentMesh(u, v, isFailed, isAmbulanceRoute));
      }
    });

    // 4. Nodes (Hospitals, Substations, Clinics, Metro Hubs, Intersections)
    cityData.nodes.forEach(node => {
      const isFailed = failedNodes.has(node.id);
      const isDegraded = degradedNodes.has(node.id);

      let geo = null;
      let hitRadius = 20;

      if (node.type === 'hospital') {
        geo = this.buildHospitalMesh(node.x, node.y, 1.15, isFailed, isDegraded);
        hitRadius = 34;
      } else if (node.type === 'clinic') {
        geo = this.buildClinicMesh(node.x, node.y, 1.1, isFailed, isDegraded);
        hitRadius = 22;
      } else if (node.domain === 'power') {
        geo = this.buildSubstationMesh(node.x, node.y, 1.1, isFailed, isDegraded);
        hitRadius = 28;
      } else if (node.id === 'road_3_4' || node.name.includes('Metro')) {
        geo = this.buildMetroHubMesh(node.x, node.y, 1.1, isFailed);
        hitRadius = 24;
      } else if (node.type === 'bridge') {
        geo = this.buildJunctionMesh(node.x, node.y, isFailed, isDegraded);
        hitRadius = 22;
      } else {
        // Standard intersection junction & Poly Bridge joint pin
        geo = this.buildJunctionMesh(node.x, node.y, isFailed, isDegraded);
      }

      if (geo) geos.push(geo);

      // Register for 3D raycasting
      this.interactiveObjects.push({
        id: node.id,
        node: node,
        x: node.x,
        y: 8,
        z: node.y,
        radius: hitRadius
      });
    });

    // 5. Vehicles
    if (this.vehicles.length === 0) {
      this.initVehicles();
    }

    const merged = this.mergeGeometries(geos);
    this.uploadBuffers(merged);
  }

  initVehicles() {
    this.vehicles = [];
    if (!this.cityData) return;

    const roadEdges = this.cityData.edges.filter(e => e.domain === 'road' || e.type === 'ambulance_route');
    if (!roadEdges.length) return;

    // Adjacency so a vehicle reaching the end of its edge can keep driving onto a connected
    // edge instead of bouncing back and forth on the same block forever.
    this.roadAdjacency = new Map();
    const addAdj = (fromId, edge, toNode) => {
      if (!this.roadAdjacency.has(fromId)) this.roadAdjacency.set(fromId, []);
      this.roadAdjacency.get(fromId).push({ edge, to: toNode });
    };
    roadEdges.forEach(edge => {
      const u = this.cityData.nodes.find(n => n.id === edge.source);
      const v = this.cityData.nodes.find(n => n.id === edge.target);
      if (!u || !v) return;
      addAdj(u.id, edge, v);
      addAdj(v.id, edge, u);
    });

    const VEHICLE_COUNT = 70; // denser traffic than before (was 22)
    for (let i = 0; i < VEHICLE_COUNT; i++) {
      // Spread starting edges evenly across the *entire* road network instead of always the
      // first few entries in roadEdges — otherwise every vehicle clusters in one corner.
      const edge = roadEdges[Math.floor((i * roadEdges.length) / VEHICLE_COUNT) % roadEdges.length];
      const uNode = this.cityData.nodes.find(n => n.id === edge.source);
      const vNode = this.cityData.nodes.find(n => n.id === edge.target);
      if (!uNode || !vNode) continue;

      const forward = i % 2 === 0;
      const type = (i % 9 === 0) ? 'ambulance' : ((i % 4 === 0) ? 'truck' : 'car');
      this.vehicles.push({
        u: forward ? uNode : vNode,
        v: forward ? vNode : uNode,
        edge,
        // Golden-ratio stride keeps starting offsets well spread instead of clumping/syncing up.
        t: (i * 0.6180339887) % 1.0,
        speed: (type === 'ambulance' ? 0.0035 : (type === 'truck' ? 0.0018 : 0.0026)),
        type
      });
    }
  }

  // Called when a vehicle reaches the end of its current edge — routes it onto a connected
  // road so it keeps travelling across the city instead of resetting to the same start point.
  advanceVehicleToNextEdge(veh) {
    const options = (this.roadAdjacency && this.roadAdjacency.get(veh.v.id)) || [];
    // Never route traffic onto a closed road or a bridge that has failed — those edges are
    // impassable, so vehicles must treat them the same as a dead end.
    const passable = options.filter(o => !(this.failedEdgeIds && this.failedEdgeIds.has(o.edge.id)));
    if (!passable.length) {
      // Dead end (or every connecting road out is closed): turn around and retrace.
      const prevU = veh.u;
      veh.u = veh.v;
      veh.v = prevU;
      return;
    }
    // Prefer continuing onward rather than immediately doubling back, when another road exists.
    const forwardOptions = passable.filter(o => o.to.id !== veh.u.id);
    const pool = forwardOptions.length ? forwardOptions : passable;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    veh.u = veh.v;
    veh.v = pick.to;
    veh.edge = pick.edge;
  }

  uploadBuffers(geo) {
    const gl = this.gl;
    if (!geo.positions.length) return;

    if (!this.vboPos) this.vboPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);

    if (!this.vboNorm) this.vboNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNorm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);

    if (!this.vboCol) this.vboCol = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCol);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.colors), gl.STATIC_DRAW);

    this.vertexCount = geo.positions.length / 3;
  }

  // -------------------------------------------------------------
  // 7. Animation Loop & Rendering
  // -------------------------------------------------------------
  startLoop() {
    const loop = (timestamp) => {
      this.time = timestamp * 0.001;
      this.updateCameraAnimation();
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  updateCameraAnimation() {
    if (!this.cameraTargetAnim) return;
    const anim = this.cameraTargetAnim;
    const t = Math.min(1.0, (this.time - anim.startTime) / anim.duration);
    const ease = t * t * (3 - 2 * t); // smoothstep

    this.camera.target[0] = anim.startTarget[0] + (anim.endTarget[0] - anim.startTarget[0]) * ease;
    this.camera.target[1] = anim.startTarget[1] + (anim.endTarget[1] - anim.startTarget[1]) * ease;
    this.camera.target[2] = anim.startTarget[2] + (anim.endTarget[2] - anim.startTarget[2]) * ease;

    this.camera.distance = anim.startDist + (anim.endDist - anim.startDist) * ease;
    this.camera.theta = anim.startTheta + (anim.endTheta - anim.startTheta) * ease;
    this.camera.phi = anim.startPhi + (anim.endPhi - anim.startPhi) * ease;

    if (t >= 1.0) {
      this.cameraTargetAnim = null;
    }
  }

  render() {
    const gl = this.gl;
    if (!gl || !this.vertexCount) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    const clr = this.theme.clearColor;
    gl.clearColor(clr[0], clr[1], clr[2], clr[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    // Camera view calculation
    const eyeX = this.camera.target[0] + this.camera.distance * Math.sin(this.camera.phi) * Math.cos(this.camera.theta);
    const eyeY = this.camera.target[1] + this.camera.distance * Math.cos(this.camera.phi);
    const eyeZ = this.camera.target[2] + this.camera.distance * Math.sin(this.camera.phi) * Math.sin(this.camera.theta);

    const aspect = width / height;
    let projMatrix;
    if (this.camera.isOrtho) {
      const s = this.camera.distance * 0.55;
      projMatrix = this.mat4Ortho(-s * aspect, s * aspect, -s, s, this.camera.near, this.camera.far);
    } else {
      projMatrix = this.mat4Perspective(this.camera.fov, aspect, this.camera.near, this.camera.far);
    }

    const viewMatrix = this.mat4LookAt([eyeX, eyeY, eyeZ], this.camera.target, [0, 1, 0]);
    const modelMatrix = this.mat4Create();

    gl.uniformMatrix4fv(this.uniforms.projection, false, projMatrix);
    gl.uniformMatrix4fv(this.uniforms.view, false, viewMatrix);
    gl.uniformMatrix4fv(this.uniforms.model, false, modelMatrix);

    gl.uniform3fv(this.uniforms.lightDir, this.theme.lightDir);
    gl.uniform3fv(this.uniforms.sunColor, this.theme.sunColor);
    gl.uniform3fv(this.uniforms.ambientColor, this.theme.ambientColor);
    gl.uniform1f(this.uniforms.alpha, 1.0);

    // 1. Draw City Infrastructure Mesh
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    gl.enableVertexAttribArray(this.attribs.position);
    gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNorm);
    gl.enableVertexAttribArray(this.attribs.normal);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCol);
    gl.enableVertexAttribArray(this.attribs.color);
    gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    // 2. Draw Animated Traffic
    this.renderVehicles(viewMatrix, projMatrix);

    // 3. Draw Selected Node 3D Pulsing Marker
    this.renderSelectedMarker();

    // 4. Render 3D Shockwave Dome if active
    if (this.simulationResult?.initiating_node_id && this.currentStep > 0) {
      this.renderShockwaveDome();
    }
  }

  renderVehicles(viewMatrix, projMatrix) {
    const gl = this.gl;
    if (!this.vehicles.length) return;

    this.vehicles.forEach(veh => {
      const edgeClosed = veh.edge && this.failedEdgeIds && this.failedEdgeIds.has(veh.edge.id);
      if (edgeClosed) {
        // The bridge/road this vehicle is on just failed — stop it short of the closure
        // (queued traffic) instead of letting it drive through the break.
        veh.t = Math.min(veh.t + veh.speed, 0.85);
      } else {
        veh.t += veh.speed;
        if (veh.t >= 1.0) {
          veh.t -= 1.0;
          this.advanceVehicleToNextEdge(veh);
        }
      }

      const vx = veh.u.x + (veh.v.x - veh.u.x) * veh.t;
      const vz = veh.u.y + (veh.v.y - veh.u.y) * veh.t;
      const angle = Math.atan2(veh.v.y - veh.u.y, veh.v.x - veh.u.x);

      const mTrans = this.mat4Translation(vx, 3.2, vz);
      const mRot = this.mat4RotationY(-angle);
      const mModel = this.mat4Multiply(mTrans, mRot);

      gl.uniformMatrix4fv(this.uniforms.model, false, mModel);

      let vbo = this.vboCar;
      let count = this.countCar;
      if (veh.type === 'ambulance') {
        vbo = this.vboAmbulance;
        count = this.countAmbulance;
      } else if (veh.type === 'truck') {
        vbo = this.vboTruck;
        count = this.countTruck;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.pos);
      gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.norm);
      gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.col);
      gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, count);
    });
  }

  renderSelectedMarker() {
    const gl = this.gl;
    if (!this.selectedNodeId || !this.vboMarker) return;

    const idMap = { 'T-01': 'road_3_2', 'H-01': 'hosp_central', 'E-01': 'sub_downtown', 'T-02': 'road_3_4' };
    const targetId = idMap[this.selectedNodeId] || this.selectedNodeId;
    const node = this.cityData?.nodes?.find(n => n.id === targetId);
    if (!node) return;

    // Dynamic marker clearance based on building height to prevent clipping into rooftops
    let baseHeight = 26;
    if (node.type === 'hospital') {
      baseHeight = 84; // Hospital tower is 39, helipad 41.5, antenna apex 62.8 -> marker tip floats at 65-71
    } else if (node.domain === 'power') {
      baseHeight = 54; // Power substation gantry is ~34
    } else if (node.type === 'clinic') {
      baseHeight = 42; // Clinic roof is ~20
    } else if (node.id === 'road_3_4' || (node.name && node.name.includes('Metro'))) {
      baseHeight = 42;
    } else if (node.type === 'bridge') {
      baseHeight = 42;
    }

    // Bobbing height
    const floatY = baseHeight + Math.sin(this.time * 5) * 3;
    const mTrans = this.mat4Translation(node.x, floatY, node.y);
    const mRot = this.mat4RotationY(this.time * 2);
    // Flipping only Y (to point the pyramid downward) mirrors the mesh and inverts its winding,
    // which made backface culling tear it apart into a broken/flickering shape as the camera
    // moved. The pyramid's square base is symmetric about the X axis too, so also flipping X
    // yields the identical downward-pointing silhouette while keeping the winding (and the
    // determinant) positive, so culling renders it correctly again.
    const mScale = this.mat4Scaling(-1.0, -1.0, 1.0); // point downward, winding-safe
    const mModel = this.mat4Multiply(mTrans, this.mat4Multiply(mRot, mScale));

    gl.uniformMatrix4fv(this.uniforms.model, false, mModel);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboMarker.pos);
    gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboMarker.norm);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboMarker.col);
    gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.countMarker);
  }

  renderShockwaveDome() {
    const gl = this.gl;
    const initNode = this.cityData?.nodes?.find(n => n.id === this.simulationResult.initiating_node_id);
    if (!initNode) return;

    const radius = 60 + (this.currentStep * 50) + (Math.sin(this.time * 4) * 8);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);

    const domeGeo = this.createCylinder(radius, 6, 24, [0.92, 0.36, 0.14]);
    const mTrans = this.mat4Translation(initNode.x, 3, initNode.y);

    if (!this.vboDomePos) this.vboDomePos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboDomePos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(domeGeo.positions), gl.DYNAMIC_DRAW);

    gl.uniformMatrix4fv(this.uniforms.model, false, mTrans);
    gl.uniform1f(this.uniforms.alpha, 0.45);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboDomePos);
    gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, domeGeo.positions.length / 3);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // -------------------------------------------------------------
  // 8. Mouse Orbit & Raycasting Interaction
  // -------------------------------------------------------------
  setupEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      this.mouse.isDragging = true;
      this.mouse.isPanning = (e.button === 2 || e.shiftKey);
      this.mouse.lastX = e.clientX;
      this.mouse.lastY = e.clientY;
      this.mouse.hasMoved = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.mouse.isDragging) {
        this.handleMouseHover(e);
        return;
      }

      const dx = e.clientX - this.mouse.lastX;
      const dy = e.clientY - this.mouse.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.mouse.hasMoved = true;
      }

      this.mouse.lastX = e.clientX;
      this.mouse.lastY = e.clientY;

      if (this.mouse.isPanning) {
        const panSpeed = this.camera.distance * 0.0012;
        const forwardX = Math.cos(this.camera.theta);
        const forwardZ = Math.sin(this.camera.theta);
        const rightX = -forwardZ;
        const rightZ = forwardX;

        this.camera.target[0] -= (rightX * dx + forwardX * dy) * panSpeed;
        this.camera.target[2] -= (rightZ * dx + forwardZ * dy) * panSpeed;
      } else {
        this.camera.theta -= dx * 0.0055;
        this.camera.phi = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, this.camera.phi - dy * 0.0055));
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.92 : 1.08;
      this.camera.distance = Math.max(160, Math.min(2400, this.camera.distance * zoomFactor));
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('click', (e) => {
      if (this.mouse.hasMoved) return; // ignore drag releases
      const hit = this.raycast(e.clientX, e.clientY);
      if (hit) {
        this.selectedNodeId = hit.node.id;
        this.onSelectNode(hit.node);
      } else {
        // Clicked empty ground/sky — let the UI close any open inspector popup.
        this.onBackgroundClick();
      }
    });
  }

  handleMouseHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      this.onHoverNode(null);
      return;
    }

    const hit = this.raycast(e.clientX, e.clientY);
    if (hit) {
      this.canvas.style.cursor = 'pointer';
      this.onHoverNode(hit.node, { x: e.clientX, y: e.clientY });
    } else {
      this.canvas.style.cursor = 'grab';
      this.onHoverNode(null);
    }
  }

  raycast(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    let nearest = null;
    let minDist = 42; // Screen pixels tolerance

    this.interactiveObjects.forEach(obj => {
      const screenPos = this.worldToScreen(obj.x, obj.y, obj.z, rect.width, rect.height);
      if (!screenPos) return;
      const d = Math.hypot(screenPos.x - (clientX - rect.left), screenPos.y - (clientY - rect.top));
      if (d < minDist) {
        minDist = d;
        nearest = obj;
      }
    });

    return nearest;
  }

  worldToScreen(wx, wy, wz, screenW, screenH) {
    const eyeX = this.camera.target[0] + this.camera.distance * Math.sin(this.camera.phi) * Math.cos(this.camera.theta);
    const eyeY = this.camera.target[1] + this.camera.distance * Math.cos(this.camera.phi);
    const eyeZ = this.camera.target[2] + this.camera.distance * Math.sin(this.camera.phi) * Math.sin(this.camera.theta);

    const aspect = screenW / screenH;
    const proj = this.camera.isOrtho
      ? this.mat4Ortho(-this.camera.distance * 0.55 * aspect, this.camera.distance * 0.55 * aspect, -this.camera.distance * 0.55, this.camera.distance * 0.55, this.camera.near, this.camera.far)
      : this.mat4Perspective(this.camera.fov, aspect, this.camera.near, this.camera.far);

    const view = this.mat4LookAt([eyeX, eyeY, eyeZ], this.camera.target, [0, 1, 0]);
    const pv = this.mat4Multiply(proj, view);

    const x = pv[0] * wx + pv[4] * wy + pv[8] * wz + pv[12];
    const y = pv[1] * wx + pv[5] * wy + pv[9] * wz + pv[13];
    const w = pv[3] * wx + pv[7] * wy + pv[11] * wz + pv[15];

    if (w <= 0.01) return null;

    const ndcX = x / w;
    const ndcY = y / w;

    return {
      x: ((ndcX + 1) / 2) * screenW,
      y: ((-ndcY + 1) / 2) * screenH
    };
  }

  // -------------------------------------------------------------
  // 9. Camera Presets & Smooth Navigation
  // -------------------------------------------------------------
  setPresetView(preset) {
    let targetTheta = this.camera.theta;
    let targetPhi = this.camera.phi;
    let targetDist = this.camera.distance;
    let targetPos = [...this.camera.target];
    let isOrtho = false;

    if (preset === 'orbit') {
      targetTheta = Math.PI / 4 + 0.18;
      targetPhi = Math.PI / 4 + 0.12;
      targetDist = 820;
      targetPos = [500, 0, 480];
    } else if (preset === 'iso') {
      targetTheta = Math.PI / 6; // 30 deg
      targetPhi = 0.615; // 35.26 deg true isometric
      targetDist = 760;
      targetPos = [500, 0, 480];
    } else if (preset === 'topdown') {
      isOrtho = true;
      targetTheta = 0.001;
      targetPhi = 0.05; // Straight top down
      targetDist = 920;
      targetPos = [500, 0, 500];
    }

    this.camera.isOrtho = isOrtho;
    this.smoothTransitionCamera(targetPos, targetDist, targetTheta, targetPhi);
  }

  /** Glide back to the exact framing the diorama opened with: city centred, orbit angle. */
  resetCamera() {
    const d = this.defaultCamera;
    // Orbit drags accumulate azimuth without bound; unwind whole turns first so the glide
    // takes the short way round instead of spinning back through every turn.
    const twoPi = Math.PI * 2;
    this.camera.theta -= twoPi * Math.round((this.camera.theta - d.theta) / twoPi);
    this.camera.isOrtho = false;
    this.smoothTransitionCamera([...d.target], d.distance, d.theta, d.phi);
  }

  focusOnNode(nodeId) {
    const idMap = { 'T-01': 'road_3_2', 'H-01': 'hosp_central', 'E-01': 'sub_downtown', 'T-02': 'road_3_4' };
    const targetId = idMap[nodeId] || nodeId;
    const node = this.cityData?.nodes?.find(n => n.id === targetId);
    if (!node) return;

    this.selectedNodeId = node.id;
    const targetPos = [node.x, 15, node.y];
    const targetDist = 380;
    this.smoothTransitionCamera(targetPos, targetDist, this.camera.theta, Math.PI / 4 + 0.1);
  }

  smoothTransitionCamera(endTarget, endDist, endTheta, endPhi, duration = 0.8) {
    this.cameraTargetAnim = {
      startTime: this.time,
      duration: duration,
      startTarget: [...this.camera.target],
      endTarget: endTarget,
      startDist: this.camera.distance,
      endDist: endDist,
      startTheta: this.camera.theta,
      endTheta: endTheta,
      startPhi: this.camera.phi,
      endPhi: endPhi
    };
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

// Global attachment for vanilla JS browser usage
if (typeof window !== 'undefined') {
  window.PolyBridge3D = PolyBridge3D;
}

// ES module export for bundlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PolyBridge3D };
}
