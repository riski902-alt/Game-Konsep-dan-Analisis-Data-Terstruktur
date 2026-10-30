import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  PlayerProgress,
  PublicQuestion,
} from '../types/game.ts';
import {
  buildChampionsPodiumStage,
  createContactShadowTexture,
  createDataVaultCore,
  createGridFloorTexture,
  createHovercraftModel,
  createNameplateTexture,
  createTargetGateModel,
  type HovercraftRig,
  type TargetGateRig,
} from '../game/threeModels.ts';
import { soundFX } from '../utils/audio.ts';

export type SceneMode = 'title' | 'playing' | 'paused' | 'gameover';

export interface CyberArenaCanvasHandle {
  fireAtOption: (optionIndex: number) => void;
  triggerAlignedShot: () => void;
  setMobileSteer: (dir: -1 | 0 | 1) => void;
  triggerFeedbackBurst: (isCorrect: boolean) => void;
}

interface CyberArenaCanvasProps {
  sceneMode: SceneMode;
  playerName: string;
  playerId: string;
  playerColor: string;
  activeQuestion: PublicQuestion | null;
  lockedPGKIndices: number[];
  otherPlayers: PlayerProgress[];
  topWinners: PlayerProgress[];
  onGateShotOrClicked: (optionIndex: number) => void;
  onPlayerMove?: (posX: number, posZ: number) => void;
}

const GATE_POSITIONS_4 = [-6.6, -2.2, 2.2, 6.6];
const GATE_ACCENTS = ['#38BDF8', '#6EE7B7', '#FBBF24', '#86C8A2'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Module-scope reusable scratch objects (Zero-GC render loop)
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.5, -10);
const _dummyObj = new THREE.Object3D();
const _raycaster = new THREE.Raycaster();
const _pointerNDC = new THREE.Vector2();

interface LaserBolt {
  mesh: THREE.Mesh;
  targetX: number;
  targetZ: number;
  optionIndex: number | null;
  notifyOnHit: boolean;
  active: boolean;
}

interface ParticleState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

export const CyberArenaCanvas = forwardRef<
  CyberArenaCanvasHandle,
  CyberArenaCanvasProps
>(function CyberArenaCanvas(props, ref) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest React props/callbacks in refs so WebGL scene never tears down on HUD updates
  const propsRef = useRef(props);
  propsRef.current = props;

  const actionsRef = useRef<{
    fireAtOption: (idx: number, notify: boolean) => void;
    shootAligned: () => void;
    setSteer: (dir: -1 | 0 | 1) => void;
    burst: (isCorrect: boolean) => void;
  }>({
    fireAtOption: () => {},
    shootAligned: () => {},
    setSteer: () => {},
    burst: () => {},
  });

  useImperativeHandle(ref, () => ({
    fireAtOption: (optionIndex: number) => {
      actionsRef.current.fireAtOption(optionIndex, true);
    },
    triggerAlignedShot: () => {
      actionsRef.current.shootAligned();
    },
    setMobileSteer: (dir: -1 | 0 | 1) => {
      actionsRef.current.setSteer(dir);
    },
    triggerFeedbackBurst: (isCorrect: boolean) => {
      actionsRef.current.burst(isCorrect);
    },
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string (never user agent)
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    const canvasEl = renderer.domElement;
    canvasEl.setAttribute('data-testid', 'arena-3d-canvas');
    canvasEl.className = 'block w-full h-full outline-none';
    container.innerHTML = '';
    container.appendChild(canvasEl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14213d);
    scene.fog = new THREE.FogExp2(0x14213d, 0.0145);

    // 2. Studio PBR Environment Reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.1,
      240
    );
    camera.position.set(5.5, 4.2, 10.5);
    camera.lookAt(0, 1.2, -4);

    // 3. Balanced Warm/Cool 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x14213d, 1.15);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4d6, 2.2);
    keyLight.position.set(14, 24, 16);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 70;
      const d = 16;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6ee7b7, 1.0);
    rimLight.position.set(-14, 10, -24);
    scene.add(rimLight);

    // 4. Outdoor Cyber-Archipelago Terrain & Track Surface (Zero Indoor Box)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createGridFloorTexture(maxAniso);
    const shadowTex = createContactShadowTexture();

    // Extended surrounding cyber-sea plane
    const seaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 320),
      new THREE.MeshStandardMaterial({
        color: 0x0d172c,
        roughness: 0.35,
        metalness: 0.55,
      })
    );
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.set(0, -0.06, -60);
    scene.add(seaMesh);

    // Central Hover-Track Runway (offset +0.06 on Y so no coplanar Z-fighting)
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      roughness: 0.42,
      metalness: 0.35,
    });
    const trackMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 260), trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(0, 0, -70);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Track side energy guard rails (composite glowing curbs)
    const railGeo = new THREE.BoxGeometry(0.28, 0.32, 220);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.7,
    });
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-10.8, 0.16, -60);
    scene.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(10.8, 0.16, -60);
    scene.add(rightRail);

    // Natural Outdoor Perimeter: InstancedMesh Archipelago Crystal Cliffs
    const spireCount = 52;
    const spireGeo = new THREE.ConeGeometry(2.4, 9.5, 6);
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.3,
      flatShading: true,
    });
    const spireInstanced = new THREE.InstancedMesh(spireGeo, spireMat, spireCount);
    const tintPalette = [
      new THREE.Color(0x284b7a),
      new THREE.Color(0x1f3a60),
      new THREE.Color(0x36628a),
      new THREE.Color(0x2d5e5e),
    ];

    for (let i = 0; i < spireCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const x = side * (16 + ((i * 7) % 18));
      const z = 12 - row * 7.2;
      const scaleY = 0.65 + ((i * 13) % 10) * 0.11;
      const scaleXZ = 0.8 + ((i * 5) % 7) * 0.12;

      _dummyObj.position.set(x, (9.5 * scaleY) / 2 - 0.5, z);
      _dummyObj.rotation.set(0, (i * 1.1) % Math.PI, 0);
      _dummyObj.scale.set(scaleXZ, scaleY, scaleXZ);
      _dummyObj.updateMatrix();
      spireInstanced.setMatrixAt(i, _dummyObj.matrix);
      spireInstanced.setColorAt(i, tintPalette[i % tintPalette.length]);
    }
    spireInstanced.instanceMatrix.needsUpdate = true;
    if (spireInstanced.instanceColor) spireInstanced.instanceColor.needsUpdate = true;
    spireInstanced.computeBoundingSphere();
    scene.add(spireInstanced);

    // Tall Distant Horizon Landmark: Cyber Knowledge Citadel Spire
    const citadelGroup = new THREE.Group();
    citadelGroup.position.set(0, 0, -96);
    const towerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 5.5, 22, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.5, metalness: 0.6 })
    );
    towerBase.position.y = 11;
    citadelGroup.add(towerBase);

    const towerCrown = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.4, 0),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.8,
      })
    );
    towerCrown.position.y = 26;
    citadelGroup.add(towerCrown);

    const towerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 0.22, 10, 36),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    towerHalo.position.y = 26;
    citadelGroup.add(towerHalo);
    scene.add(citadelGroup);

    // 5. Hero Player Hovercraft
    const heroCraft = createHovercraftModel(
      propsRef.current.playerColor || '#38BDF8',
      propsRef.current.playerName || 'Siswa SMP',
      shadowTex
    );
    heroCraft.group.position.set(0, 0, 2);
    scene.add(heroCraft.group);

    // Co-player Hovercrafts Map
    const peerCrafts = new Map<string, HovercraftRig>();

    // Dynamic Question Objects (Gates / Vault)
    const gatesGroup = new THREE.Group();
    scene.add(gatesGroup);
    let activeGates: TargetGateRig[] = [];
    let activeVault: ReturnType<typeof createDataVaultCore> | null = null;
    let podiumGroup: THREE.Group | null = null;
    let renderedQuestionKey = '';
    let renderedPodiumKey = '';

    // 6. Zero-GC Pooled Laser Projectiles (Pool of 12)
    const laserPool: LaserBolt[] = [];
    const laserGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(laserGeo, laserMat);
      m.visible = false;
      scene.add(m);
      laserPool.push({
        mesh: m,
        targetX: 0,
        targetZ: -15,
        optionIndex: null,
        notifyOnHit: false,
        active: false,
      });
    }

    // 7. Zero-GC Pooled Explosion & Celebration Particles (InstancedMesh of 84)
    const PARTICLE_CAP = 84;
    const particleGeo = new THREE.OctahedronGeometry(0.18, 0);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInstanced = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_CAP
    );
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particleStates: ParticleState[] = Array.from(
      { length: PARTICLE_CAP },
      () => ({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 1,
      })
    );
    let particleCursor = 0;

    function spawnParticleBurst(
      x: number,
      y: number,
      z: number,
      hexColor: number,
      count = 22
    ) {
      const col = new THREE.Color(hexColor);
      for (let i = 0; i < count; i++) {
        const idx = particleCursor % PARTICLE_CAP;
        particleCursor += 1;
        const st = particleStates[idx];
        st.active = true;
        st.x = x;
        st.y = y;
        st.z = z;
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 6.5;
        st.vx = Math.cos(angle) * speed;
        st.vy = 1.5 + Math.random() * 5.5;
        st.vz = Math.sin(angle) * speed;
        st.maxLife = 0.55 + Math.random() * 0.35;
        st.life = st.maxLife;
        st.scale = 0.8 + Math.random() * 0.9;
        particleInstanced.setColorAt(idx, col);
      }
      if (particleInstanced.instanceColor) {
        particleInstanced.instanceColor.needsUpdate = true;
      }
    }

    // Confetti Pool for Podium Victory
    const CONFETTI_CAP = 72;
    const confettiGeo = new THREE.PlaneGeometry(0.22, 0.12);
    const confettiMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const confettiMesh = new THREE.InstancedMesh(
      confettiGeo,
      confettiMat,
      CONFETTI_CAP
    );
    confettiMesh.frustumCulled = false;
    confettiMesh.visible = false;
    scene.add(confettiMesh);

    const confettiColors = [
      new THREE.Color(0xfbbf24),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0x6ee7b7),
      new THREE.Color(0xf8fafc),
    ];
    for (let i = 0; i < CONFETTI_CAP; i++) {
      confettiMesh.setColorAt(i, confettiColors[i % confettiColors.length]);
    }
    if (confettiMesh.instanceColor) confettiMesh.instanceColor.needsUpdate = true;

    // Input & Simulation State
    const keysHeld = new Set<string>();
    let mobileSteerDir: -1 | 0 | 1 = 0;
    let speedBoostTimer = 0;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let lastMoveSentAt = 0;

    function rebuildQuestion3DStage() {
      const { activeQuestion, lockedPGKIndices, sceneMode } = propsRef.current;
      const key =
        sceneMode === 'gameover'
          ? 'gameover'
          : activeQuestion
            ? `${activeQuestion.id}:${lockedPGKIndices.join(',')}`
            : 'idle';

      if (key === renderedQuestionKey) return;
      renderedQuestionKey = key;

      while (gatesGroup.children.length > 0) {
        gatesGroup.remove(gatesGroup.children[0]);
      }
      activeGates = [];
      activeVault = null;

      if (sceneMode === 'gameover') return;

      if (!activeQuestion) {
        // Decorative showcase gates on title screen
        for (let i = 0; i < 4; i++) {
          const gate = createTargetGateModel({
            optionIndex: i,
            letter: LETTERS[i],
            optionText: `Gerbang Tantangan ${LETTERS[i]}`,
            accentHex: GATE_ACCENTS[i],
            locked: false,
            posX: GATE_POSITIONS_4[i],
            posZ: -16,
            maxAnisotropy: maxAniso,
          });
          gatesGroup.add(gate.group);
          activeGates.push(gate);
        }
        return;
      }

      if (
        activeQuestion.category === 'pilihan_ganda' ||
        activeQuestion.category === 'pilihan_ganda_kompleks'
      ) {
        const count = activeQuestion.options.length;
        const span = Math.min(14, (count - 1) * 4.4);
        for (let i = 0; i < count; i++) {
          const posX =
            count === 1 ? 0 : -span / 2 + (i / (count - 1)) * span;
          const isLocked =
            activeQuestion.category === 'pilihan_ganda_kompleks' &&
            lockedPGKIndices.includes(i);

          const gate = createTargetGateModel({
            optionIndex: i,
            letter: LETTERS[i] || String(i + 1),
            optionText: activeQuestion.options[i],
            accentHex: GATE_ACCENTS[i % GATE_ACCENTS.length],
            locked: isLocked,
            posX,
            posZ: -15.5,
            maxAnisotropy: maxAniso,
          });
          gatesGroup.add(gate.group);
          activeGates.push(gate);
        }
      } else {
        // Menjodohkan / Isian -> 3D Gyroscopic Data Vault Core
        activeVault = createDataVaultCore();
        gatesGroup.add(activeVault.group);
      }
    }

    function rebuildPodiumIfNeeded() {
      const { sceneMode, topWinners } = propsRef.current;
      if (sceneMode !== 'gameover') {
        if (podiumGroup) {
          podiumGroup.visible = false;
        }
        confettiMesh.visible = false;
        return;
      }

      const key = topWinners
        .slice(0, 3)
        .map((w) => `${w.playerId}:${w.score}:${w.displayName}`)
        .join('|');

      if (!podiumGroup || key !== renderedPodiumKey) {
        if (podiumGroup) {
          scene.remove(podiumGroup);
        }
        podiumGroup = buildChampionsPodiumStage(
          [topWinners[0], topWinners[1], topWinners[2]],
          shadowTex
        );
        scene.add(podiumGroup);
        renderedPodiumKey = key;
      }
      podiumGroup.visible = true;
      confettiMesh.visible = true;
    }

    function launchLaserAtOption(optionIndex: number, notifyOnHit: boolean) {
      soundFX.playLaser();
      const gate = activeGates.find((g) => g.optionIndex === optionIndex);
      const targetX = gate ? gate.baseX : heroCraft.group.position.x;
      const targetZ = gate ? gate.baseZ : -16;

      // Gently nudge craft toward selected lane so visual and interaction match
      heroCraft.group.position.x = THREE.MathUtils.lerp(
        heroCraft.group.position.x,
        targetX,
        0.55
      );

      const freeBolt = laserPool.find((b) => !b.active) || laserPool[0];
      freeBolt.active = true;
      freeBolt.mesh.visible = true;
      freeBolt.mesh.position.set(
        heroCraft.group.position.x,
        0.72,
        heroCraft.group.position.z - 1.2
      );
      freeBolt.targetX = targetX;
      freeBolt.targetZ = targetZ;
      freeBolt.optionIndex = optionIndex;
      freeBolt.notifyOnHit = false;

      if (notifyOnHit) {
        propsRef.current.onGateShotOrClicked(optionIndex);
      }
    }

    function shootClosestAlignedGate() {
      if (propsRef.current.sceneMode !== 'playing') return;
      if (activeGates.length === 0) return;

      let closest = activeGates[0];
      let minDist = Math.abs(heroCraft.group.position.x - closest.baseX);
      for (const g of activeGates) {
        const d = Math.abs(heroCraft.group.position.x - g.baseX);
        if (d < minDist) {
          minDist = d;
          closest = g;
        }
      }
      launchLaserAtOption(closest.optionIndex, true);
    }

    actionsRef.current = {
      fireAtOption: (idx, notify) => launchLaserAtOption(idx, notify),
      shootAligned: shootClosestAlignedGate,
      setSteer: (dir) => {
        mobileSteerDir = dir;
      },
      burst: (isCorrect) => {
        if (isCorrect) {
          speedBoostTimer = 0.85;
          hitstopTimer = 0.045;
          cameraTrauma = 0.35;
          spawnParticleBurst(
            heroCraft.group.position.x,
            2.1,
            -14.5,
            0xfbbf24,
            28
          );
        } else {
          cameraTrauma = 0.25;
          spawnParticleBurst(
            heroCraft.group.position.x,
            1.6,
            -12.5,
            0xf87171,
            16
          );
        }
      },
    };

    // Keyboard & Pointer Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (!e.repeat && e.code === 'Space' && propsRef.current.sceneMode === 'playing') {
        e.preventDefault();
        shootClosestAlignedGate();
      }
      keysHeld.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const clearHeldInputs = () => {
      keysHeld.clear();
      mobileSteerDir = 0;
    };

    const onCanvasClick = (e: MouseEvent) => {
      if (propsRef.current.sceneMode !== 'playing') return;
      if (activeGates.length === 0) return;

      const rect = canvasEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNDC, camera);
      const proxies = activeGates.map((g) => g.hitProxy);
      const hits = _raycaster.intersectObjects(proxies, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.optionIndex;
        if (typeof idx === 'number') {
          launchLaserAtOption(idx, true);
        }
      }
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldInputs);
    window.addEventListener('resize', onResize);
    canvasEl.addEventListener('click', onCanvasClick);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 8. Frame Loop with Software-WebGL `afterDraw` Fence Sync Guard
    const startPerfMs = performance.now();
    let prevPerfMs = startPerfMs;
    let frameId = 0;
    let unmounted = false;

    function afterDraw(cb: () => void) {
      if (unmounted) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (unmounted) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (unmounted) return;
      const nowPerfMs = performance.now();
      const rawDt = Math.max(0.001, (nowPerfMs - prevPerfMs) / 1000);
      prevPerfMs = nowPerfMs;
      const dt = Math.min(rawDt, 0.05);
      const elapsed = (nowPerfMs - startPerfMs) / 1000;

      const currentProps = propsRef.current;
      rebuildQuestion3DStage();
      rebuildPodiumIfNeeded();

      // Update player nameplate if automatic identity changed
      if (
        currentProps.playerName &&
        currentProps.playerName !== heroCraft.currentName
      ) {
        heroCraft.currentName = currentProps.playerName;
        const newTex = createNameplateTexture(
          currentProps.playerName,
          currentProps.playerColor || '#38BDF8'
        );
        (heroCraft.nameSprite.material as THREE.MeshBasicMaterial).map?.dispose();
        (heroCraft.nameSprite.material as THREE.MeshBasicMaterial).map = newTex;
      }

      // Sync other multiplayer hovercrafts
      const activePeerIds = new Set<string>();
      for (const peer of currentProps.otherPlayers) {
        if (peer.playerId === currentProps.playerId) continue;
        activePeerIds.add(peer.playerId);
        let rig = peerCrafts.get(peer.playerId);
        if (!rig) {
          rig = createHovercraftModel(
            peer.avatarColor || '#6EE7B7',
            peer.displayName,
            shadowTex
          );
          rig.group.position.set(peer.posX || 2.5, 0, -2.5);
          scene.add(rig.group);
          peerCrafts.set(peer.playerId, rig);
        }
        const dampAlpha = 1 - Math.exp(-8 * dt);
        rig.group.position.x = THREE.MathUtils.lerp(
          rig.group.position.x,
          peer.posX,
          dampAlpha
        );
        rig.hullGroup.position.y =
          0.55 + Math.sin(elapsed * 3.2 + peer.rank) * 0.08;
        rig.nameSprite.lookAt(camera.position);
      }
      for (const [id, rig] of peerCrafts.entries()) {
        if (!activePeerIds.has(id)) {
          scene.remove(rig.group);
          peerCrafts.delete(id);
        }
      }

      // Hitstop handling: render/shake continue in real dt, physics pause briefly
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }
      const simDt =
        currentProps.sceneMode === 'paused' || hitstopTimer > 0 ? 0 : dt;

      // Scroll track texture for forward speed sensation
      const scrollSpeed =
        currentProps.sceneMode === 'playing'
          ? speedBoostTimer > 0
            ? 5.2
            : 2.1
          : 0.7;
      floorTex.offset.y -= scrollSpeed * simDt;
      if (speedBoostTimer > 0) {
        speedBoostTimer = Math.max(0, speedBoostTimer - dt);
      }

      // Player steering in 'playing'
      let steer: number = mobileSteerDir;
      if (keysHeld.has('ArrowLeft') || keysHeld.has('KeyA')) steer -= 1;
      if (keysHeld.has('ArrowRight') || keysHeld.has('KeyD')) steer += 1;
      steer = Math.max(-1, Math.min(1, steer));

      if (currentProps.sceneMode === 'playing' && simDt > 0) {
        heroCraft.group.position.x = THREE.MathUtils.clamp(
          heroCraft.group.position.x + steer * 11.5 * simDt,
          -8.2,
          8.2
        );
        if (
          steer !== 0 &&
          currentProps.onPlayerMove &&
          performance.now() - lastMoveSentAt > 90
        ) {
          lastMoveSentAt = performance.now();
          currentProps.onPlayerMove(
            Number(heroCraft.group.position.x.toFixed(2)),
            Number(heroCraft.group.position.z.toFixed(2))
          );
        }
      }

      // Hovercraft bob, bank roll & thruster pulse
      const bankAlpha = 1 - Math.exp(-10 * dt);
      heroCraft.hullGroup.rotation.z = THREE.MathUtils.lerp(
        heroCraft.hullGroup.rotation.z,
        -steer * 0.28,
        bankAlpha
      );
      heroCraft.hullGroup.position.y =
        0.56 + Math.sin(elapsed * 3.8) * 0.07;
      const flameScale =
        (speedBoostTimer > 0 ? 1.65 : 1.0) + Math.sin(elapsed * 24) * 0.14;
      heroCraft.leftFlame.scale.set(1, 1, flameScale);
      heroCraft.rightFlame.scale.set(1, 1, flameScale);
      heroCraft.nameSprite.lookAt(camera.position);

      // Animate target crystals & vault rings
      for (let i = 0; i < activeGates.length; i++) {
        const g = activeGates[i];
        g.crystal.rotation.y = elapsed * 1.4 + i;
        g.crystal.position.y = 3.65 + Math.sin(elapsed * 2.5 + i) * 0.12;
      }
      if (activeVault) {
        activeVault.ringOuter.rotation.x = elapsed * 0.8;
        activeVault.ringOuter.rotation.y = elapsed * 0.6;
        activeVault.ringInner.rotation.y = -elapsed * 1.1;
        activeVault.ringInner.rotation.z = elapsed * 0.7;
        activeVault.coreMesh.rotation.y = elapsed * 1.5;
      }
      towerCrown.rotation.y = elapsed * 0.5;
      towerHalo.rotation.x = Math.PI / 2 + Math.sin(elapsed * 0.7) * 0.25;

      // Advance Laser Projectiles
      for (const bolt of laserPool) {
        if (!bolt.active) continue;
        const step = 95 * dt;
        bolt.mesh.position.z -= step;
        bolt.mesh.position.x = THREE.MathUtils.lerp(
          bolt.mesh.position.x,
          bolt.targetX,
          1 - Math.exp(-14 * dt)
        );
        if (bolt.mesh.position.z <= bolt.targetZ) {
          bolt.active = false;
          bolt.mesh.visible = false;
          spawnParticleBurst(
            bolt.targetX,
            1.9,
            bolt.targetZ,
            0x38bdf8,
            14
          );
          if (bolt.notifyOnHit && bolt.optionIndex !== null) {
            currentProps.onGateShotOrClicked(bolt.optionIndex);
          }
        }
      }

      // Advance Pooled Burst Particles
      for (let i = 0; i < PARTICLE_CAP; i++) {
        const p = particleStates[i];
        if (!p.active) {
          _dummyObj.position.set(0, -100, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleInstanced.setMatrixAt(i, _dummyObj.matrix);
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt;

        const ratio = Math.max(0.05, p.life / p.maxLife);
        _dummyObj.position.set(p.x, p.y, p.z);
        _dummyObj.rotation.set(elapsed * 4, elapsed * 3, 0);
        _dummyObj.scale.setScalar(p.scale * ratio);
        _dummyObj.updateMatrix();
        particleInstanced.setMatrixAt(i, _dummyObj.matrix);
      }
      particleInstanced.instanceMatrix.needsUpdate = true;

      // Confetti & Rotating 3D Trophies on Podium Screen
      if (currentProps.sceneMode === 'gameover' && podiumGroup) {
        heroCraft.group.visible = false;
        podiumGroup.traverse((obj) => {
          if (obj.userData.isTrophy) {
            obj.rotation.y = elapsed * 1.1;
          }
        });
        for (let i = 0; i < CONFETTI_CAP; i++) {
          const fallY = 7.5 - ((elapsed * 1.8 + i * 0.37) % 7.5);
          const cx = Math.sin(elapsed * 1.4 + i) * 6.5;
          const cz = -56 + Math.cos(elapsed * 0.9 + i * 1.7) * 4.2;
          _dummyObj.position.set(cx, fallY, cz);
          _dummyObj.rotation.set(elapsed * 2 + i, elapsed * 3, i);
          _dummyObj.scale.setScalar(1);
          _dummyObj.updateMatrix();
          confettiMesh.setMatrixAt(i, _dummyObj.matrix);
        }
        confettiMesh.instanceMatrix.needsUpdate = true;
      } else {
        heroCraft.group.visible = true;
      }

      // Exponentially Damped Camera Choreography
      const camAlpha = 1 - Math.exp(-5.5 * dt);
      if (currentProps.sceneMode === 'title') {
        // Asymmetric framing: hovercraft showcased on right half while left negative space holds SVG emblem
        const orbitX = 3.2 + Math.sin(elapsed * 0.45) * 1.1;
        _camTargetPos.set(orbitX - 2.6, 3.2, 8.8);
        _camLookAt.set(-1.6, 1.35, -6.5);
      } else if (currentProps.sceneMode === 'gameover') {
        _camTargetPos.set(
          Math.sin(elapsed * 0.35) * 1.6,
          4.35,
          -45.2
        );
        _camLookAt.set(0, 2.25, -56);
      } else {
        // Playing / Paused Chase Camera
        _camTargetPos.set(
          heroCraft.group.position.x * 0.48,
          5.35,
          10.8
        );
        _camLookAt.set(
          heroCraft.group.position.x * 0.32,
          1.95,
          -14.5
        );
      }

      camera.position.lerp(_camTargetPos, camAlpha);
      _currentLookAt.lerp(_camLookAt, camAlpha);

      // Trauma-based camera shake
      if (cameraTrauma > 0) {
        const shake = cameraTrauma * cameraTrauma;
        camera.position.x += (Math.random() - 0.5) * shake * 0.6;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
        cameraTrauma = Math.max(0, cameraTrauma - dt * 1.8);
      }

      // Subtle FOV kick during speed boost
      const targetFov = speedBoostTimer > 0 ? 68 : 62;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, camAlpha);
        camera.updateProjectionMatrix();
      }

      camera.lookAt(_currentLookAt);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      unmounted = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      window.removeEventListener('resize', onResize);
      canvasEl.removeEventListener('click', onCanvasClick);
      floorTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 w-full h-full bg-[#14213D]"
      aria-hidden="true"
    />
  );
});
