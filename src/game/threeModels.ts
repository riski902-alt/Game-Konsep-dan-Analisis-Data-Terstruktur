import * as THREE from 'three';

export interface HovercraftRig {
  group: THREE.Group;
  hullGroup: THREE.Group;
  leftFlame: THREE.Mesh;
  rightFlame: THREE.Mesh;
  nameSprite: THREE.Mesh;
  currentName: string;
}

export interface TargetGateRig {
  group: THREE.Group;
  hitProxy: THREE.Mesh;
  crystal: THREE.Mesh;
  frameMat: THREE.MeshStandardMaterial;
  optionIndex: number;
  baseX: number;
  baseZ: number;
}

export function createGridFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0F1A32';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle circuit lines
  ctx.strokeStyle = 'rgba(66, 106, 155, 0.42)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Major glowing track lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 512);
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();

  // Forward chevron pulse marker
  ctx.fillStyle = 'rgba(110, 231, 183, 0.22)';
  ctx.beginPath();
  ctx.moveTo(256, 160);
  ctx.lineTo(300, 210);
  ctx.lineTo(282, 210);
  ctx.lineTo(256, 182);
  ctx.lineTo(230, 210);
  ctx.lineTo(212, 210);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 48);
  texture.anisotropy = maxAnisotropy;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(6, 12, 24, 0.75)');
  grad.addColorStop(0.6, 'rgba(6, 12, 24, 0.32)');
  grad.addColorStop(1, 'rgba(6, 12, 24, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNameplateTexture(
  name: string,
  accentHex: string,
  subtitle = ''
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 128);

  // Sleek dark navy nameplate
  ctx.fillStyle = 'rgba(20, 33, 61, 0.92)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(16, 18, 480, subtitle ? 94 : 78, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const truncated = name.length > 22 ? `${name.slice(0, 20)}…` : name;
  ctx.fillText(truncated, 256, subtitle ? 48 : 57);

  if (subtitle) {
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.fillText(subtitle, 256, 86);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Membangun kendaraan 3D Cyber-Hovercraft multi-komponen (9 bagian berbeda,
 * variasi roughness/metalness, dan contact shadow di dasar y=0).
 */
export function createHovercraftModel(
  accentColorHex: string,
  playerName: string,
  shadowTex: THREE.CanvasTexture
): HovercraftRig {
  const root = new THREE.Group();
  const hullGroup = new THREE.Group();
  hullGroup.position.y = 0.55;
  root.add(hullGroup);

  const primaryHullMat = new THREE.MeshStandardMaterial({
    color: 0x1e355e,
    roughness: 0.34,
    metalness: 0.72,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentColorHex),
    emissive: new THREE.Color(accentColorHex),
    emissiveIntensity: 0.24,
    roughness: 0.25,
    metalness: 0.65,
  });

  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x164e63,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.15,
  });

  const nacelleMat = new THREE.MeshStandardMaterial({
    color: 0x2c4875,
    roughness: 0.68,
    metalness: 0.42,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.22,
    metalness: 0.88,
  });

  // 1. Primary Silhouette: Beveled Delta Fuselage
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 1.55);
  hullShape.lineTo(0.78, -1.1);
  hullShape.lineTo(0.35, -1.35);
  hullShape.lineTo(-0.35, -1.35);
  hullShape.lineTo(-0.78, -1.1);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  hullGeo.rotateX(-Math.PI / 2);
  const hullMesh = new THREE.Mesh(hullGeo, primaryHullMat);
  hullMesh.position.y = -0.1;
  hullMesh.castShadow = true;
  hullGroup.add(hullMesh);

  // 2. Secondary Read: Sculpted Glass Canopy
  const canopyGeo = new THREE.SphereGeometry(0.42, 18, 14);
  canopyGeo.scale(0.85, 0.55, 1.65);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(0, 0.32, -0.05);
  hullGroup.add(canopyMesh);

  // 3 & 4. Secondary Read: Twin Side Thruster Nacelles
  const nacelleGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.65, 14);
  nacelleGeo.rotateX(Math.PI / 2);
  const leftNacelle = new THREE.Mesh(nacelleGeo, nacelleMat);
  leftNacelle.position.set(-0.82, 0.05, 0.28);
  hullGroup.add(leftNacelle);

  const rightNacelle = new THREE.Mesh(nacelleGeo, nacelleMat);
  rightNacelle.position.set(0.82, 0.05, 0.28);
  hullGroup.add(rightNacelle);

  // 5 & 6. Swept Stabilizer Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.4);
  wingShape.lineTo(0.72, -0.45);
  wingShape.lineTo(0.65, -0.75);
  wingShape.lineTo(0, -0.35);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  wingGeo.rotateX(-Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, accentMat);
  rightWing.position.set(0.75, 0.06, 0.25);
  rightWing.rotation.z = -0.18;
  hullGroup.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, accentMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.75, 0.06, 0.25);
  leftWing.rotation.z = 0.18;
  hullGroup.add(leftWing);

  // 7. Accent Detail: Forward Twin Laser Cannons
  const cannonGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.72, 10);
  cannonGeo.rotateX(Math.PI / 2);
  const leftCannon = new THREE.Mesh(cannonGeo, goldTrimMat);
  leftCannon.position.set(-0.34, 0.12, -1.15);
  hullGroup.add(leftCannon);

  const rightCannon = new THREE.Mesh(cannonGeo, goldTrimMat);
  rightCannon.position.set(0.34, 0.12, -1.15);
  hullGroup.add(rightCannon);

  // 8. Accent Detail: Glowing Engine Exhaust Cores
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x6ee7b7,
    transparent: true,
    opacity: 0.9,
  });
  const flameGeo = new THREE.ConeGeometry(0.16, 0.65, 10);
  flameGeo.rotateX(Math.PI / 2);

  const leftFlame = new THREE.Mesh(flameGeo, flameMat);
  leftFlame.position.set(-0.82, 0.05, 1.38);
  hullGroup.add(leftFlame);

  const rightFlame = new THREE.Mesh(flameGeo, flameMat);
  rightFlame.position.set(0.82, 0.05, 1.38);
  hullGroup.add(rightFlame);

  // 9. Grounded Contact Shadow Disc at y = 0.02
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 3.2),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  root.add(shadowPlane);

  // Floating 3D Nameplate above craft
  const nameTex = createNameplateTexture(playerName, accentColorHex);
  const nameMat = new THREE.MeshBasicMaterial({
    map: nameTex,
    transparent: true,
    depthWrite: false,
  });
  const nameSprite = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), nameMat);
  nameSprite.position.set(0, 1.95, 0);
  root.add(nameSprite);

  return {
    group: root,
    hullGroup,
    leftFlame,
    rightFlame,
    nameSprite,
    currentName: playerName,
  };
}

function createGateBadgeTexture(
  letter: string,
  optionText: string,
  accentHex: string,
  locked: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = locked ? 'rgba(20, 56, 52, 0.96)' : 'rgba(20, 33, 61, 0.94)';
  ctx.strokeStyle = locked ? '#FBBF24' : accentHex;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(12, 12, 488, 296, 24);
  ctx.fill();
  ctx.stroke();

  // Top letter emblem
  ctx.fillStyle = locked ? '#FBBF24' : accentHex;
  ctx.beginPath();
  ctx.roundRect(206, 28, 100, 64, 14);
  ctx.fill();

  ctx.fillStyle = '#14213D';
  ctx.font = 'bold 42px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 256, 61);

  // Wrapped option preview text
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  const words = optionText.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const testLine = current ? `${current} ${w}` : w;
    if (ctx.measureText(testLine).width > 430 && current) {
      lines.push(current);
      current = w;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);

  const visibleLines = lines.slice(0, 4);
  const startY = 135 + (4 - visibleLines.length) * 14;
  visibleLines.forEach((line, i) => {
    const text =
      i === 3 && lines.length > 4 ? `${line.slice(0, 26)}…` : line;
    ctx.fillText(text, 256, startY + i * 36);
  });

  if (locked) {
    ctx.fillStyle = '#6EE7B7';
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.fillText('TERKUNCI ✓', 256, 282);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Membangun Gerbang Target 3D multi-komponen (5 bagian: Pedestal, 2 Pilar,
 * Kristal Energi Berputar, dan Panel Hologram Jawaban).
 */
export function createTargetGateModel(params: {
  optionIndex: number;
  letter: string;
  optionText: string;
  accentHex: string;
  locked: boolean;
  posX: number;
  posZ: number;
  maxAnisotropy: number;
}): TargetGateRig {
  const {
    optionIndex,
    letter,
    optionText,
    accentHex,
    locked,
    posX,
    posZ,
    maxAnisotropy,
  } = params;

  const group = new THREE.Group();
  group.position.set(posX, 0, posZ);

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1e355e,
    roughness: 0.55,
    metalness: 0.6,
  });

  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(locked ? '#FBBF24' : accentHex),
    emissive: new THREE.Color(locked ? '#FBBF24' : accentHex),
    emissiveIntensity: locked ? 0.55 : 0.25,
    roughness: 0.22,
    metalness: 0.78,
  });

  // 1. Grounded Pedestal
  const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.65, 0.28, 16),
    pillarMat
  );
  baseMesh.position.y = 0.14;
  group.add(baseMesh);

  // 2 & 3. Left & Right Arch Pillars
  const pillarGeo = new THREE.CylinderGeometry(0.12, 0.15, 3.1, 10);
  const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
  leftPillar.position.set(-1.55, 1.65, 0);
  group.add(leftPillar);

  const rightPillar = new THREE.Mesh(pillarGeo, frameMat);
  rightPillar.position.set(1.55, 1.65, 0);
  group.add(rightPillar);

  // 4. Floating Octahedron Energy Crystal above gate
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    frameMat
  );
  crystal.position.set(0, 3.65, 0);
  group.add(crystal);

  // 5. High-Contrast Holographic Answer Plaque
  const badgeTex = createGateBadgeTexture(
    letter,
    optionText,
    accentHex,
    locked,
    maxAnisotropy
  );
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.88),
    new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
    })
  );
  signMesh.position.set(0, 1.9, 0.08);
  group.add(signMesh);

  // Simplified invisible collision/raycast box
  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(3.25, 3.6, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.position.set(0, 1.9, 0);
  hitProxy.userData = { optionIndex };
  group.add(hitProxy);

  return {
    group,
    hitProxy,
    crystal,
    frameMat,
    optionIndex,
    baseX: posX,
    baseZ: posZ,
  };
}

/**
 * Membangun Inti Brankas Data 3D (6 komponen) untuk kategori Isian & Menjodohkan.
 */
export function createDataVaultCore(): {
  group: THREE.Group;
  ringOuter: THREE.Mesh;
  ringInner: THREE.Mesh;
  coreMesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.position.set(0, 0, -15);

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x1e355e,
    roughness: 0.6,
    metalness: 0.55,
  });
  const ringGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.2,
    roughness: 0.22,
    metalness: 0.88,
  });
  const ringBlueMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.3,
    roughness: 0.18,
    metalness: 0.75,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x6ee7b7,
    emissive: 0x6ee7b7,
    emissiveIntensity: 0.45,
    roughness: 0.15,
    metalness: 0.35,
  });

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 0.45, 20),
    pedestalMat
  );
  base.position.y = 0.225;
  group.add(base);

  const ringOuter = new THREE.Mesh(
    new THREE.TorusGeometry(1.95, 0.11, 14, 42),
    ringGoldMat
  );
  ringOuter.position.y = 2.6;
  group.add(ringOuter);

  const ringInner = new THREE.Mesh(
    new THREE.TorusGeometry(1.42, 0.09, 12, 36),
    ringBlueMat
  );
  ringInner.position.y = 2.6;
  group.add(ringInner);

  const coreMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.78, 0),
    coreMat
  );
  coreMesh.position.y = 2.6;
  group.add(coreMesh);

  return { group, ringOuter, ringInner, coreMesh };
}

/**
 * Membangun Piala 3D (Emas, Perak, atau Perunggu) menggunakan LatheGeometry + pegangan Torus + mahkota.
 */
export function create3DTrophyModel(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();

  const palette =
    tier === 1
      ? { color: 0xfbbf24, emissive: 0x78350f, roughness: 0.16, metalness: 0.92 }
      : tier === 2
        ? { color: 0xe2e8f0, emissive: 0x334155, roughness: 0.2, metalness: 0.88 }
        : { color: 0xd97706, emissive: 0x451a03, roughness: 0.26, metalness: 0.84 };

  const cupMat = new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: 0.18,
    roughness: palette.roughness,
    metalness: palette.metalness,
  });

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x14213d,
    roughness: 0.55,
    metalness: 0.4,
  });

  // Base plinth
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.54, 0.26, 20),
    pedestalMat
  );
  plinth.position.y = 0.13;
  group.add(plinth);

  // Sculpted cup profile via LatheGeometry
  const points = [
    new THREE.Vector2(0.0, 0.26),
    new THREE.Vector2(0.32, 0.26),
    new THREE.Vector2(0.14, 0.42),
    new THREE.Vector2(0.12, 0.68),
    new THREE.Vector2(0.38, 0.92),
    new THREE.Vector2(0.48, 1.38),
    new THREE.Vector2(0.42, 1.38),
    new THREE.Vector2(0.28, 0.95),
    new THREE.Vector2(0.0, 0.88),
  ];
  const cupGeo = new THREE.LatheGeometry(points, 24);
  const cupMesh = new THREE.Mesh(cupGeo, cupMat);
  group.add(cupMesh);

  // Left & Right Trophy Handles
  const handleGeo = new THREE.TorusGeometry(0.22, 0.045, 10, 20, Math.PI * 1.15);
  const leftHandle = new THREE.Mesh(handleGeo, cupMat);
  leftHandle.position.set(-0.38, 1.12, 0);
  leftHandle.rotation.z = Math.PI * 0.45;
  group.add(leftHandle);

  const rightHandle = new THREE.Mesh(handleGeo, cupMat);
  rightHandle.position.set(0.38, 1.12, 0);
  rightHandle.rotation.z = -Math.PI * 0.45;
  rightHandle.scale.x = -1;
  group.add(rightHandle);

  // Star Jewel Crown
  const jewel = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    cupMat
  );
  jewel.position.y = 1.62;
  group.add(jewel);

  return group;
}

export interface PodiumPlayerEntry {
  displayName: string;
  score: number;
  avatarColor: string;
}

export function buildChampionsPodiumStage(
  topThree: (PodiumPlayerEntry | undefined)[],
  shadowTex: THREE.CanvasTexture
): THREE.Group {
  const stage = new THREE.Group();
  stage.position.set(0, 0, -56);

  // Circular ceremonial platform
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(9.5, 10.2, 0.35, 36),
    new THREE.MeshStandardMaterial({
      color: 0x192b4d,
      roughness: 0.45,
      metalness: 0.55,
    })
  );
  deck.position.y = 0.175;
  stage.add(deck);

  const trimRing = new THREE.Mesh(
    new THREE.TorusGeometry(9.6, 0.08, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  trimRing.rotation.x = Math.PI / 2;
  trimRing.position.y = 0.36;
  stage.add(trimRing);

  const configs: {
    rank: 1 | 2 | 3;
    x: number;
    height: number;
    color: number;
    hex: string;
    player?: PodiumPlayerEntry;
  }[] = [
    { rank: 1, x: 0, height: 2.65, color: 0xfbbf24, hex: '#FBBF24', player: topThree[0] },
    { rank: 2, x: -3.7, height: 1.95, color: 0xcbd5e1, hex: '#E2E8F0', player: topThree[1] },
    { rank: 3, x: 3.7, height: 1.45, color: 0xd97706, hex: '#F59E0B', player: topThree[2] },
  ];

  for (const cfg of configs) {
    const colGroup = new THREE.Group();
    colGroup.position.set(cfg.x, 0.35, 0);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.5, cfg.height, 24),
      new THREE.MeshStandardMaterial({
        color: 0x1e355e,
        roughness: 0.4,
        metalness: 0.65,
      })
    );
    pillar.position.y = cfg.height / 2;
    colGroup.add(pillar);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.42, 1.42, 0.12, 24),
      new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.25,
        metalness: 0.85,
      })
    );
    cap.position.y = cfg.height + 0.06;
    colGroup.add(cap);

    // 3D Trophy perched atop podium
    const trophy = create3DTrophyModel(cfg.rank);
    trophy.position.set(0, cfg.height + 0.12, 0.35);
    trophy.userData.isTrophy = true;
    colGroup.add(trophy);

    if (cfg.player) {
      const miniCraft = createHovercraftModel(
        cfg.player.avatarColor,
        cfg.player.displayName,
        shadowTex
      );
      miniCraft.group.scale.setScalar(0.68);
      miniCraft.group.position.set(0, cfg.height + 1.85, -0.35);

      // Update nameplate to include score
      const plateTex = createNameplateTexture(
        `#${cfg.rank} ${cfg.player.displayName}`,
        cfg.hex,
        `${cfg.player.score} Poin`
      );
      (miniCraft.nameSprite.material as THREE.MeshBasicMaterial).map?.dispose();
      (miniCraft.nameSprite.material as THREE.MeshBasicMaterial).map = plateTex;
      colGroup.add(miniCraft.group);
    }

    stage.add(colGroup);
  }

  return stage;
}
