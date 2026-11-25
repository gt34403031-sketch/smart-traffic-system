// Three.js 3D Smart City Scene Builder & Renderer
// Constructs roads, lanes, zebra crossings, buildings, procedural vehicles, traffic lights with countdowns, and camera controllers.

import * as THREE from 'three';
import { TrafficSimulationEngine } from './traffic-engine';
import { Vehicle, SignalColor } from './types';
import { ROAD_CONSTANTS } from './physics';

export type CameraPreset = 'ISOMETRIC' | 'TOP_DOWN' | 'STREET_LEVEL' | 'CHASE_CAM';

// Reusable vectors at module scope to eliminate GC spikes in animation loop
const _vec3 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

export class SmartCity3DScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public engine: TrafficSimulationEngine;
  public currentCameraPreset: CameraPreset = 'ISOMETRIC';
  public selectedVehicleId: string | null = null;
  public showHeatmap: boolean = false;
  
  // Object registries
  private vehicleMeshes: Map<string, THREE.Group> = new Map();
  private signalLights: Map<string, { red: THREE.Mesh; yellow: THREE.Mesh; green: THREE.Mesh; canvas: HTMLCanvasElement; sprite: THREE.Sprite }> = new Map();
  private laneOverlays: THREE.Mesh[] = [];
  private emergencyBeacons: THREE.Mesh[] = [];

  // Camera targets for smooth damping
  private camPosTarget = new THREE.Vector3(85, 75, 85);
  private camLookTarget = new THREE.Vector3(0, 0, 0);

  // Reusable materials
  private asphaltMat!: THREE.MeshStandardMaterial;
  private sidewalkMat!: THREE.MeshStandardMaterial;
  private markingMat!: THREE.MeshBasicMaterial;
  private dividerYellowMat!: THREE.MeshBasicMaterial;
  private redActiveMat!: THREE.MeshStandardMaterial;
  private redOffMat!: THREE.MeshStandardMaterial;
  private yellowActiveMat!: THREE.MeshStandardMaterial;
  private yellowOffMat!: THREE.MeshStandardMaterial;
  private greenActiveMat!: THREE.MeshStandardMaterial;
  private greenOffMat!: THREE.MeshStandardMaterial;

  constructor(
    container: HTMLElement,
    engine: TrafficSimulationEngine
  ) {
    this.engine = engine;

    // Detect software WebGL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Scene setup with atmospheric fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.0035);

    // Camera setup
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 600);
    this.camera.position.set(85, 75, 85);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.initMaterials();
    this.setupLighting();
    this.buildCityEnvironment();
    this.buildRoadsAndIntersection();
    this.buildTrafficSignals();
  }

  private initMaterials(): void {
    this.asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.85,
      metalness: 0.1,
    });

    this.sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      roughness: 0.9,
      metalness: 0.05,
    });

    this.markingMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      side: THREE.DoubleSide,
    });

    this.dividerYellowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
    });

    // Traffic signal states
    this.redActiveMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff1111,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    this.redOffMat = new THREE.MeshStandardMaterial({
      color: 0x330808,
      roughness: 0.8,
    });

    this.yellowActiveMat = new THREE.MeshStandardMaterial({
      color: 0xffbb00,
      emissive: 0xffaa00,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    this.yellowOffMat = new THREE.MeshStandardMaterial({
      color: 0x332600,
      roughness: 0.8,
    });

    this.greenActiveMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00dd66,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    this.greenOffMat = new THREE.MeshStandardMaterial({
      color: 0x042812,
      roughness: 0.8,
    });
  }

  private setupLighting(): void {
    // Balanced 3-point lighting rig (Warm key + Cool hemisphere fill + subtle backlight)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.7);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    dirLight.position.set(60, 90, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 250;
    const d = 110;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.5);
    this.scene.add(ambientLight);
  }

  private buildCityEnvironment(): void {
    // City Base Ground
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Buildings at the 4 city quadrants:
    // Quadrant 1 (North-East): Hospital & Emergency Bay
    this.buildHospital(45, -45);

    // Quadrant 2 (North-West): Educational School Campus
    this.buildSchool(-45, -45);

    // Quadrant 3 (South-East): Commercial Shopping Mall & Plaza
    this.buildShoppingMall(45, 45);

    // Quadrant 4 (South-West): Office Towers & Police/Fire Station
    this.buildCivicCenter(-45, 45);

    // Trees and Street Furniture
    this.buildFoliage();
    this.buildStreetlights();
  }

  private buildHospital(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Main Hospital Tower (Composite: Base + Tower + Helipad + Red Cross emblem)
    const baseGeo = new THREE.BoxGeometry(32, 14, 28);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 7;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Upper Glass Tower
    const towerGeo = new THREE.BoxGeometry(22, 18, 18);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.15,
      metalness: 0.8,
    });
    const tower = new THREE.Mesh(towerGeo, glassMat);
    tower.position.set(0, 23, 0);
    tower.castShadow = true;
    group.add(tower);

    // Red Cross Emblem
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6, 0.4), crossMat);
    crossV.position.set(0, 10, 14.2);
    group.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.4), crossMat);
    crossH.position.set(0, 10, 14.2);
    group.add(crossH);

    // Emergency ER Bay Canopy
    const erCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.8, 10),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 })
    );
    erCanopy.position.set(-16, 5, 4);
    group.add(erCanopy);

    this.scene.add(group);
  }

  private buildSchool(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Main brick academy pavilion
    const mainGeo = new THREE.BoxGeometry(34, 12, 22);
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.85 });
    const main = new THREE.Mesh(mainGeo, brickMat);
    main.position.y = 6;
    main.castShadow = true;
    group.add(main);

    // Clock Tower
    const towerGeo = new THREE.BoxGeometry(7, 24, 7);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(12, 12, 0);
    tower.castShadow = true;
    group.add(tower);

    // Clock Face
    const clock = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.3, 16),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    clock.rotation.x = Math.PI / 2;
    clock.position.set(12, 20, 3.6);
    group.add(clock);

    this.scene.add(group);
  }

  private buildShoppingMall(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Multi-tier commercial complex with illuminated atrium
    const mallGeo = new THREE.BoxGeometry(36, 10, 32);
    const mallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 });
    const mall = new THREE.Mesh(mallGeo, mallMat);
    mall.position.y = 5;
    mall.castShadow = true;
    group.add(mall);

    // Glass Atrium Dome
    const domeGeo = new THREE.CylinderGeometry(8, 8, 4, 16);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.2,
      metalness: 0.7,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0, 12, 0);
    group.add(dome);

    this.scene.add(group);
  }

  private buildCivicCenter(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Modern Office Glass Tower
    const officeGeo = new THREE.BoxGeometry(20, 36, 18);
    const officeMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.2,
      metalness: 0.85,
    });
    const office = new THREE.Mesh(officeGeo, officeMat);
    office.position.set(-6, 18, -6);
    office.castShadow = true;
    group.add(office);

    // Police Station Annex
    const policeGeo = new THREE.BoxGeometry(16, 8, 14);
    const policeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const police = new THREE.Mesh(policeGeo, policeMat);
    police.position.set(8, 4, 8);
    police.castShadow = true;
    group.add(police);

    // Fire Station Bay with Red Garage Doors
    const garageGeo = new THREE.BoxGeometry(4, 5, 0.2);
    const garageMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
    const door1 = new THREE.Mesh(garageGeo, garageMat);
    door1.position.set(4, 2.5, 15.1);
    group.add(door1);
    const door2 = new THREE.Mesh(garageGeo, garageMat);
    door2.position.set(9, 2.5, 15.1);
    group.add(door2);

    this.scene.add(group);
  }

  private buildFoliage(): void {
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });

    const treePositions = [
      [26, -26], [32, -26], [26, -32],
      [-26, -26], [-32, -26], [-26, -32],
      [26, 26], [32, 26], [26, 32],
      [-26, 26], [-32, 26], [-26, 32],
      [68, -26], [-68, -26], [26, -68], [26, 68]
    ];

    treePositions.forEach(([tx, tz]) => {
      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.5, 3.5, 8),
        treeTrunkMat
      );
      trunk.position.y = 1.75;
      trunk.castShadow = true;
      tree.add(trunk);

      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 5.0, 8),
        foliageMat
      );
      foliage.position.y = 5.2;
      foliage.castShadow = true;
      tree.add(foliage);

      this.scene.add(tree);
    });
  }

  private buildStreetlights(): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const lightCoords = [
      [14, -14], [-14, -14], [14, 14], [-14, 14],
      [14, -55], [-14, -55], [14, 55], [-14, 55],
      [55, -14], [-55, -14], [55, 14], [-55, 14]
    ];

    lightCoords.forEach(([lx, lz]) => {
      const pole = new THREE.Group();
      pole.position.set(lx, 0, lz);

      const vertical = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 7.5, 8),
        poleMat
      );
      vertical.position.y = 3.75;
      pole.add(vertical);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 2.0),
        poleMat
      );
      arm.position.set(0, 7.3, -0.9);
      pole.add(arm);

      const lampHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.12, 0.6),
        lampMat
      );
      lampHead.position.set(0, 7.2, -1.8);
      pole.add(lampHead);

      this.scene.add(pole);
    });
  }

  private buildRoadsAndIntersection(): void {
    const rw = ROAD_CONSTANTS.laneWidth * ROAD_CONSTANTS.lanesPerDirection * 2; // 21 meters wide
    const rl = ROAD_CONSTANTS.roadLength * 2 + rw; // ~200 meters long

    // 1. Central Intersection Box
    const centerBox = new THREE.Mesh(
      new THREE.PlaneGeometry(rw, rw),
      this.asphaltMat
    );
    centerBox.rotation.x = -Math.PI / 2;
    centerBox.position.set(0, 0.01, 0);
    centerBox.receiveShadow = true;
    this.scene.add(centerBox);

    // 2. North-South Road
    const nsRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(rw, rl),
      this.asphaltMat
    );
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.01, 0);
    nsRoad.receiveShadow = true;
    this.scene.add(nsRoad);

    // 3. East-West Road
    const ewRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(rl, rw),
      this.asphaltMat
    );
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.set(0, 0.01, 0);
    ewRoad.receiveShadow = true;
    this.scene.add(ewRoad);

    // 4. Concrete Sidewalks bordering roads
    const swWidth = 3.5;
    const cornerOffset = rw / 2 + swWidth / 2;

    // Corner curb blocks
    [
      [cornerOffset, cornerOffset],
      [-cornerOffset, cornerOffset],
      [cornerOffset, -cornerOffset],
      [-cornerOffset, -cornerOffset]
    ].forEach(([cx, cz]) => {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(swWidth, 0.25, swWidth),
        this.sidewalkMat
      );
      curb.position.set(cx, 0.12, cz);
      this.scene.add(curb);
    });

    // 5. Road Markings: Dividers, Lane dashes, Zebra Crossings, Stop lines
    this.buildRoadMarkings(rw);
  }

  private buildRoadMarkings(roadWidth: number): void {
    const halfW = roadWidth / 2;
    const stopOffset = ROAD_CONSTANTS.stopLineOffset;
    const lw = ROAD_CONSTANTS.laneWidth;

    // A. Center Yellow Double Dividers
    // North section
    const divN = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 80), this.dividerYellowMat);
    divN.rotation.x = -Math.PI / 2;
    divN.position.set(0, 0.02, -50);
    this.scene.add(divN);

    // South section
    const divS = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 80), this.dividerYellowMat);
    divS.rotation.x = -Math.PI / 2;
    divS.position.set(0, 0.02, 50);
    this.scene.add(divS);

    // East section
    const divE = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.3), this.dividerYellowMat);
    divE.rotation.x = -Math.PI / 2;
    divE.position.set(50, 0.02, 0);
    this.scene.add(divE);

    // West section
    const divW = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.3), this.dividerYellowMat);
    divW.rotation.x = -Math.PI / 2;
    divW.position.set(-50, 0.02, 0);
    this.scene.add(divW);

    // B. Dashed White Lane Lines (dividing lanes 0, 1, 2)
    [-lw, lw, -2 * lw, 2 * lw].forEach((offset) => {
      // NS dashed lanes
      for (let z = -85; z < -stopOffset - 2; z += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.0), this.markingMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(offset, 0.02, z);
        this.scene.add(dash);
      }
      for (let z = stopOffset + 2; z < 85; z += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.0), this.markingMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(offset, 0.02, z);
        this.scene.add(dash);
      }
      // EW dashed lanes
      for (let x = -85; x < -stopOffset - 2; x += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.18), this.markingMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.02, offset);
        this.scene.add(dash);
      }
      for (let x = stopOffset + 2; x < 85; x += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.18), this.markingMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.02, offset);
        this.scene.add(dash);
      }
    });

    // C. Solid Stop Lines (White, 0.6m wide across incoming lanes)
    // In Right-Hand Traffic (RHT):
    // North incoming is on West side (x < 0) at z = -stopOffset
    const stopLineN = new THREE.Mesh(new THREE.PlaneGeometry(halfW, 0.6), this.markingMat);
    stopLineN.rotation.x = -Math.PI / 2;
    stopLineN.position.set(-halfW / 2, 0.022, -stopOffset);
    this.scene.add(stopLineN);

    // South incoming is on East side (x > 0) at z = stopOffset
    const stopLineS = new THREE.Mesh(new THREE.PlaneGeometry(halfW, 0.6), this.markingMat);
    stopLineS.rotation.x = -Math.PI / 2;
    stopLineS.position.set(halfW / 2, 0.022, stopOffset);
    this.scene.add(stopLineS);

    // East incoming is on North side (z < 0) at x = stopOffset
    const stopLineE = new THREE.Mesh(new THREE.PlaneGeometry(0.6, halfW), this.markingMat);
    stopLineE.rotation.x = -Math.PI / 2;
    stopLineE.position.set(stopOffset, 0.022, -halfW / 2);
    this.scene.add(stopLineE);

    // West incoming is on South side (z > 0) at x = -stopOffset
    const stopLineW = new THREE.Mesh(new THREE.PlaneGeometry(0.6, halfW), this.markingMat);
    stopLineW.rotation.x = -Math.PI / 2;
    stopLineW.position.set(-stopOffset, 0.022, halfW / 2);
    this.scene.add(stopLineW);

    // D. Zebra Crossings (Pedestrian crosswalk stripes)
    this.buildZebraCrossing(0, -stopOffset - 2.5, roadWidth, true);
    this.buildZebraCrossing(0, stopOffset + 2.5, roadWidth, true);
    this.buildZebraCrossing(-stopOffset - 2.5, 0, roadWidth, false);
    this.buildZebraCrossing(stopOffset + 2.5, 0, roadWidth, false);

    // E. 3D Directional Overhead Gantries, Pavement Typography & Compass Rose
    this.buildDirectionalSignsAndCompass();
  }

  private createTextCanvas(text: string, subtitle?: string, bgColor: string = '#090d16', textColor: string = '#38bdf8'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 16);
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0284c7';
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, subtitle ? 48 : 64);

    if (subtitle) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(subtitle, 256, 92);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildDirectionalSignsAndCompass(): void {
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });

    // 1. Overhead Gantry Signs for all 4 approaches
    const gantries = [
      { dir: 'NORTH', title: '▲ NORTH APPROACH', sub: 'TO TECH PARK / DOWNTOWN', x: -5.25, z: -38, rotY: 0 },
      { dir: 'SOUTH', title: '▲ SOUTH APPROACH', sub: 'TO HIGHWAY / RESIDENTIAL', x: 5.25, z: 38, rotY: Math.PI },
      { dir: 'EAST', title: '▲ EAST APPROACH', sub: 'TO COMMERCIAL MALL / AIRPORT', x: 38, z: -5.25, rotY: -Math.PI / 2 },
      { dir: 'WEST', title: '▲ WEST APPROACH', sub: 'TO MEDICAL / UNIVERSITY', x: -38, z: 5.25, rotY: Math.PI / 2 },
    ];

    gantries.forEach((g) => {
      const gantry = new THREE.Group();
      gantry.position.set(g.x, 0, g.z);
      gantry.rotation.y = g.rotY;

      // Vertical support posts
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8.0, 12), gantryMat);
      p1.position.set(-6.0, 4.0, 0);
      gantry.add(p1);

      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8.0, 12), gantryMat);
      p2.position.set(6.0, 4.0, 0);
      gantry.add(p2);

      // Horizontal overhead beam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.3, 0.3), gantryMat);
      beam.position.set(0, 7.8, 0);
      gantry.add(beam);

      // Backlit Gantry Signboard
      const signTex = this.createTextCanvas(g.title, g.sub);
      const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.2), signMat);
      sign.position.set(0, 6.4, 0.05);
      gantry.add(sign);

      this.scene.add(gantry);
    });

    // 2. Large Bold Painted Pavement Lettering on Asphalt
    const pavementLabels = [
      { text: 'NORTH', x: -5.25, z: -24, rotZ: 0 },
      { text: 'SOUTH', x: 5.25, z: 24, rotZ: Math.PI },
      { text: 'EAST', x: 24, z: -5.25, rotZ: -Math.PI / 2 },
      { text: 'WEST', x: -24, z: 5.25, rotZ: Math.PI / 2 },
    ];

    pavementLabels.forEach((lbl) => {
      const tex = this.createTextCanvas(lbl.text, undefined, 'transparent', '#f1f5f9');
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.8), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = lbl.rotZ;
      plane.position.set(lbl.x, 0.023, lbl.z);
      this.scene.add(plane);
    });

    // 3. Central 3D Navigational Compass Rose
    const compassGroup = new THREE.Group();
    compassGroup.position.set(-22, 0.15, -22); // corner plaza position

    const dialRing = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 4.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide })
    );
    dialRing.rotation.x = -Math.PI / 2;
    compassGroup.add(dialRing);

    // North Arrow (Bright Cyan)
    const arrowGeo = new THREE.ConeGeometry(0.8, 3.2, 4);
    const arrowN = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    arrowN.rotation.x = Math.PI / 2;
    arrowN.position.set(0, 0.02, -1.8);
    compassGroup.add(arrowN);

    // South Arrow (Slate)
    const arrowS = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x64748b }));
    arrowS.rotation.x = -Math.PI / 2;
    arrowS.position.set(0, 0.02, 1.8);
    compassGroup.add(arrowS);

    // Cardinal Text Badges (N, S, E, W)
    const cardinalBadges = [
      { letter: 'N', x: 0, z: -4.8, col: '#38bdf8' },
      { letter: 'S', x: 0, z: 4.8, col: '#94a3b8' },
      { letter: 'E', x: 4.8, z: 0, col: '#94a3b8' },
      { letter: 'W', x: -4.8, z: 0, col: '#94a3b8' },
    ];

    cardinalBadges.forEach((b) => {
      const tex = this.createTextCanvas(b.letter, undefined, 'rgba(15,23,42,0.9)', b.col);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
      badge.rotation.x = -Math.PI / 2;
      badge.position.set(b.x, 0.03, b.z);
      compassGroup.add(badge);
    });

    this.scene.add(compassGroup);
  }

  private buildZebraCrossing(
    centerX: number,
    centerZ: number,
    width: number,
    isHorizontal: boolean
  ): void {
    const stripesCount = 14;
    const stripeW = 0.5;
    const stripeL = 3.0;
    const step = width / (stripesCount + 1);

    for (let i = 1; i <= stripesCount; i++) {
      const offset = -width / 2 + i * step;
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(isHorizontal ? stripeW : stripeL, isHorizontal ? stripeL : stripeW),
        this.markingMat
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(
        isHorizontal ? centerX + offset : centerX,
        0.021,
        isHorizontal ? centerZ : centerZ + offset
      );
      this.scene.add(stripe);
    }
  }

  private buildTrafficSignals(): void {
    // 4 Traffic Light Poles positioned directly opposite incoming drivers
    const poleConfigs = [
      { id: 'SIGNAL_NORTH', x: -12.5, z: -12.5, heading: 0 },
      { id: 'SIGNAL_SOUTH', x: 12.5, z: 12.5, heading: Math.PI },
      { id: 'SIGNAL_EAST', x: 12.5, z: -12.5, heading: -Math.PI / 2 },
      { id: 'SIGNAL_WEST', x: -12.5, z: 12.5, heading: Math.PI / 2 },
    ];

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });

    poleConfigs.forEach((cfg) => {
      const group = new THREE.Group();
      group.position.set(cfg.x, 0, cfg.z);
      group.rotation.y = cfg.heading;

      // Vertical Pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 6.5, 12),
        poleMat
      );
      pole.position.y = 3.25;
      group.add(pole);

      // Horizontal Mast Arm extending over lanes
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 5.5),
        poleMat
      );
      arm.position.set(0, 6.2, -2.75);
      group.add(arm);

      // Signal Housing Box
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 2.2, 0.4),
        housingMat
      );
      housing.position.set(0, 5.4, -4.5);
      group.add(housing);

      // 3 Signal Lamps (Red, Yellow, Green)
      const lampGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
      lampGeo.rotateX(Math.PI / 2);

      const redMesh = new THREE.Mesh(lampGeo, this.redOffMat);
      redMesh.position.set(0, 6.0, -4.3);
      group.add(redMesh);

      const yellowMesh = new THREE.Mesh(lampGeo, this.yellowOffMat);
      yellowMesh.position.set(0, 5.4, -4.3);
      group.add(yellowMesh);

      const greenMesh = new THREE.Mesh(lampGeo, this.greenOffMat);
      greenMesh.position.set(0, 4.8, -4.3);
      group.add(greenMesh);

      // Floating 3D Countdown Sprite
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 7.3, -4.5);
      sprite.scale.set(2.4, 1.2, 1);
      group.add(sprite);

      this.signalLights.set(cfg.id, {
        red: redMesh,
        yellow: yellowMesh,
        green: greenMesh,
        canvas,
        sprite,
      });

      this.scene.add(group);
    });
  }

  public updateSignalVisuals(): void {
    const int = this.engine.intersections.get('INT-01');
    if (!int) return;

    const currentPhase = int.phases[int.currentPhaseIndex];
    const isNSActive = currentPhase.activeDirections.includes('NORTH');
    const state = int.phaseState;
    const remaining = Math.ceil(currentPhase.timeRemaining);

    // North & South signals
    const nsColor: SignalColor =
      isNSActive ? (state === 'GREEN' ? 'GREEN' : state === 'YELLOW' ? 'YELLOW' : 'RED') : 'RED';
    
    // East & West signals
    const ewColor: SignalColor =
      !isNSActive ? (state === 'GREEN' ? 'GREEN' : state === 'YELLOW' ? 'YELLOW' : 'RED') : 'RED';

    this.applySignalState('SIGNAL_NORTH', nsColor, isNSActive ? remaining : 0);
    this.applySignalState('SIGNAL_SOUTH', nsColor, isNSActive ? remaining : 0);
    this.applySignalState('SIGNAL_EAST', ewColor, !isNSActive ? remaining : 0);
    this.applySignalState('SIGNAL_WEST', ewColor, !isNSActive ? remaining : 0);
  }

  private applySignalState(signalId: string, color: SignalColor, countdown: number): void {
    const sig = this.signalLights.get(signalId);
    if (!sig) return;

    sig.red.material = color === 'RED' ? this.redActiveMat : this.redOffMat;
    sig.yellow.material = color === 'YELLOW' ? this.yellowActiveMat : this.yellowOffMat;
    sig.green.material = color === 'GREEN' ? this.greenActiveMat : this.greenOffMat;

    // Draw countdown timer text onto canvas sprite
    const ctx = sig.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 64);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(4, 4, 120, 56, 8);
      ctx.fill();

      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (color === 'GREEN') {
        ctx.fillStyle = '#00ff88';
        ctx.fillText(`${countdown}s`, 64, 32);
      } else if (color === 'YELLOW') {
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(`${countdown}s`, 64, 32);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillText(countdown > 0 ? `${countdown}s` : 'WAIT', 64, 32);
      }

      (sig.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }
  }

  public updateVehicleMeshes(): void {
    const activeVehicles = this.engine.vehicles;
    const currentMeshIds = new Set(this.vehicleMeshes.keys());

    // 1. Remove meshes for completed vehicles
    for (const id of currentMeshIds) {
      if (!activeVehicles.has(id)) {
        const mesh = this.vehicleMeshes.get(id);
        if (mesh) this.scene.remove(mesh);
        this.vehicleMeshes.delete(id);
      }
    }

    // 2. Add or update active vehicle meshes
    for (const [id, v] of activeVehicles.entries()) {
      let group = this.vehicleMeshes.get(id);
      if (!group) {
        group = this.createProceduralVehicleMesh(v);
        this.vehicleMeshes.set(id, group);
        this.scene.add(group);
      }

      // Smooth position interpolation
      group.position.set(v.worldX, v.worldY, v.worldZ);
      group.rotation.y = v.heading;

      // Animate emergency flashing beacon
      if (v.isEmergency) {
        const beacon = group.getObjectByName('BEACON');
        if (beacon) {
          const t = Date.now() * 0.012;
          const flash = Math.sin(t) > 0;
          (beacon as THREE.Mesh).material = flash ? this.redActiveMat : this.greenActiveMat;
        }
      }
    }
  }

  /**
   * Constructs a 3-12 part procedural vehicle model (Group) based on vehicle category.
   * Adheres to the composite procedural model directive.
   */
  private createProceduralVehicleMesh(v: Vehicle): THREE.Group {
    const group = new THREE.Group();
    group.name = v.id;

    const paintColor = new THREE.Color(v.color);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: paintColor,
      roughness: 0.35,
      metalness: 0.6,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.1,
      metalness: 0.9,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x171717,
      roughness: 0.9,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.9,
      roughness: 0.2,
    });

    if (v.type === 'BUS') {
      // 1. Bus Chassis
      const body = new THREE.Mesh(new THREE.BoxGeometry(v.width, 2.6, v.length), bodyMat);
      body.position.y = 1.6;
      body.castShadow = true;
      group.add(body);

      // 2. Passenger Glass Bands
      const glass = new THREE.Mesh(new THREE.BoxGeometry(v.width + 0.05, 1.1, v.length - 1.2), glassMat);
      glass.position.y = 2.0;
      group.add(glass);

      // 3. 6 Wheels
      [-1, 1].forEach((side) => {
        [-3.8, 0, 3.8].forEach((zPos) => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12), tireMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * (v.width / 2), 0.48, zPos);
          group.add(wheel);
        });
      });
    } else if (v.type === 'TRUCK') {
      // 1. Cab
      const cab = new THREE.Mesh(new THREE.BoxGeometry(v.width, 2.4, 3.2), bodyMat);
      cab.position.set(0, 1.5, -v.length / 2 + 1.8);
      cab.castShadow = true;
      group.add(cab);

      // 2. Cargo Container
      const containerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
      const container = new THREE.Mesh(new THREE.BoxGeometry(v.width - 0.1, 2.6, v.length - 3.6), containerMat);
      container.position.set(0, 1.8, 1.6);
      container.castShadow = true;
      group.add(container);

      // Wheels
      [-1, 1].forEach((side) => {
        [-v.length / 2 + 1.6, 2.0, 4.0].forEach((zPos) => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), tireMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * (v.width / 2), 0.5, zPos);
          group.add(wheel);
        });
      });
    } else if (v.type === 'MOTORCYCLE') {
      // 1. Frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.8), bodyMat);
      frame.position.y = 0.6;
      group.add(frame);

      // 2. Front & Rear Wheels
      const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.15, 12), tireMat);
      w1.rotation.z = Math.PI / 2;
      w1.position.set(0, 0.32, -0.7);
      group.add(w1);

      const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.15, 12), tireMat);
      w2.rotation.z = Math.PI / 2;
      w2.position.set(0, 0.32, 0.7);
      group.add(w2);
    } else {
      // Standard Passenger Car or Ambulance / Police Cruiser
      // 1. Lower Body Chassis
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(v.width, 0.75, v.length), bodyMat);
      chassis.position.y = 0.65;
      chassis.castShadow = true;
      group.add(chassis);

      // 2. Cabin / Greenhouse
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(v.width - 0.25, 0.65, v.length * 0.55), glassMat);
      cabin.position.set(0, 1.25, -0.15);
      cabin.castShadow = true;
      group.add(cabin);

      // 3. 4 Wheels with Rims
      [-1, 1].forEach((side) => {
        [-v.length * 0.3, v.length * 0.3].forEach((zPos) => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 16), tireMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * (v.width / 2 + 0.05), 0.36, zPos);
          group.add(wheel);

          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 8), rimMat);
          rim.rotation.z = Math.PI / 2;
          rim.position.set(side * (v.width / 2 + 0.06), 0.36, zPos);
          group.add(rim);
        });
      });

      // 4. Headlights & Taillights
      const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });

      [-0.6, 0.6].forEach((xPos) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.08), headlightMat);
        hl.position.set(xPos, 0.65, -v.length / 2 - 0.02);
        group.add(hl);

        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.08), taillightMat);
        tl.position.set(xPos, 0.65, v.length / 2 + 0.02);
        group.add(tl);
      });

      // 5. Emergency Beacon Bar for Ambulance / Police
      if (v.isEmergency) {
        const lightBar = new THREE.Mesh(
          new THREE.BoxGeometry(v.width * 0.6, 0.18, 0.3),
          this.redActiveMat
        );
        lightBar.name = 'BEACON';
        lightBar.position.set(0, 1.65, -0.15);
        group.add(lightBar);
      }
    }

    return group;
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.currentCameraPreset = preset;
    switch (preset) {
      case 'ISOMETRIC':
        this.camPosTarget.set(80, 70, 80);
        this.camLookTarget.set(0, 0, 0);
        break;
      case 'TOP_DOWN':
        this.camPosTarget.set(0, 115, 0.1);
        this.camLookTarget.set(0, 0, 0);
        break;
      case 'STREET_LEVEL':
        this.camPosTarget.set(0, 4.5, -42);
        this.camLookTarget.set(0, 2.0, 0);
        break;
      case 'CHASE_CAM':
        // Will track selected vehicle in updateCamera()
        break;
    }
  }

  public updateCamera(dt: number): void {
    if (this.currentCameraPreset === 'CHASE_CAM') {
      // Find selected vehicle or first active vehicle
      let targetVeh: Vehicle | undefined;
      if (this.selectedVehicleId) {
        targetVeh = this.engine.vehicles.get(this.selectedVehicleId);
      }
      if (!targetVeh) {
        targetVeh = Array.from(this.engine.vehicles.values())[0];
      }

      if (targetVeh) {
        const distBehind = 14.0;
        const height = 6.0;
        const angle = targetVeh.heading;

        // Position camera behind vehicle relative to its heading
        const cx = targetVeh.worldX - Math.sin(angle) * distBehind;
        const cz = targetVeh.worldZ - Math.cos(angle) * distBehind;

        this.camPosTarget.set(cx, targetVeh.worldY + height, cz);
        this.camLookTarget.set(targetVeh.worldX, targetVeh.worldY + 1.5, targetVeh.worldZ);
      }
    }

    // Smooth exponential damping
    const lambda = 4.5;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.camPosTarget.x, lambda, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.camPosTarget.y, lambda, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.camPosTarget.z, lambda, dt);

    _targetLook.x = THREE.MathUtils.damp(_targetLook.x, this.camLookTarget.x, lambda, dt);
    _targetLook.y = THREE.MathUtils.damp(_targetLook.y, this.camLookTarget.y, lambda, dt);
    _targetLook.z = THREE.MathUtils.damp(_targetLook.z, this.camLookTarget.z, lambda, dt);

    this.camera.lookAt(_targetLook);
  }

  public render(dt: number): void {
    this.updateCamera(dt);
    this.updateSignalVisuals();
    this.updateVehicleMeshes();
    this.renderer.render(this.scene, this.camera);
  }

  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}
