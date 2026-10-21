import * as THREE from "three";
export type AtmosphereWeather = "sunny" | "cloudy" | "rain" | "storm";
export type AtmosphereFestival =
  "normal" | "tet" | "midautumn" | "christmas" | "reunification" | "national";
export type AtmosphereSeason = "auto" | "dry" | "wet";
export interface AtmosphereState {
  timeOfDayMinutes: number;
  weather: AtmosphereWeather;
  festival: AtmosphereFestival;
  selectedDate?: string | Date;
  season?: AtmosphereSeason;
  atmosphereEnabled?: boolean;
  floodLevel?: number;
  moonPhase?: number;
  astronomy?: {
    sunAzimuthDeg?: number;
    sunElevationDeg?: number;
    moonAzimuthDeg?: number;
    moonElevationDeg?: number;
  } | null;
}
export interface AtmosphereLayerOptions {
  scene: THREE.Scene;
  sky: THREE.Color;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  moon?: THREE.DirectionalLight;
  onRoadWet: (wet: boolean) => void;
  host?: HTMLElement;
  tier?: "low" | "mid" | "high";
}
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
/** Explicit art-direction fallback, not georeferencing or a site observation. */
export function solarPosition(state: Pick<AtmosphereState, "timeOfDayMinutes" | "selectedDate">) {
  const fraction = (((state.timeOfDayMinutes % 1440) + 1440) % 1440) / 1440;
  return {
    azimuthDeg: (fraction * 360) % 360,
    elevationDeg: 72 * Math.cos(fraction * Math.PI * 2 - Math.PI) - 18,
  };
}
function enu(az: number, el: number, radius: number, target: THREE.Vector3) {
  const a = THREE.MathUtils.degToRad(az),
    e = THREE.MathUtils.degToRad(el);
  target.set(
    Math.sin(a) * Math.cos(e) * radius,
    Math.sin(e) * radius,
    -Math.cos(a) * Math.cos(e) * radius,
  );
}
function starGeometry(radius: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 === 0 ? radius : radius * 0.4;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
export function createAtmosphereLayer(options: AtmosphereLayerOptions) {
  const { scene, sky, hemisphere, sun, moon, onRoadWet, host } = options;
  const group = new THREE.Group();
  group.name = "atmosphere-layer";
  group.userData["nonPickable"] = true;
  group.userData["illustrationOnly"] = true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.add(g);
    return g;
  };
  const material = <T extends THREE.Material>(m: T): T => {
    materials.add(m);
    return m;
  };
  const red = material(
    new THREE.MeshStandardMaterial({
      color: "#bf2525",
      emissive: "#ac1919",
      emissiveIntensity: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    }),
  );
  const gold = material(
    new THREE.MeshStandardMaterial({
      color: "#ffce4f",
      emissive: "#ffc23b",
      emissiveIntensity: 0.4,
      roughness: 0.65,
      side: THREE.DoubleSide,
    }),
  );
  const green = material(new THREE.MeshStandardMaterial({ color: "#2d7352", roughness: 0.85 }));
  const lanternGeo = geometry(new THREE.SphereGeometry(0.6, 8, 6));
  const flowerGeo = geometry(new THREE.CircleGeometry(0.2, 8));
  const starGeo = geometry(starGeometry(0.8));
  const flags = geometry(new THREE.PlaneGeometry(4, 2.5));
  const decorations = new Map<AtmosphereFestival, THREE.Group>();
  const mesh = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    parent: THREE.Group,
    x: number,
    y: number,
    z = 0,
  ) => {
    const object = new THREE.Mesh(g, m);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  for (const festival of [
    "normal",
    "tet",
    "midautumn",
    "christmas",
    "reunification",
    "national",
  ] as const) {
    const decoration = new THREE.Group();
    decoration.name = `festival-decoration-${festival}`;
    // Suspended illustration to one side of the ENU home marker, never a building on its lot.
    decoration.position.set(0, 0, -28);
    decoration.userData["illustrationOnly"] = true;
    decorations.set(festival, decoration);
    group.add(decoration);
    decoration.visible = false;
    if (festival === "normal") continue;
    if (festival === "tet" || festival === "midautumn") {
      const line = new THREE.Line(
        geometry(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-18, 8, 0),
            new THREE.Vector3(18, 8, 0),
          ]),
        ),
        material(new THREE.LineBasicMaterial({ color: "#796046" })),
      );
      decoration.add(line);
      for (let x = -16; x <= 16; x += 4) {
        if (festival === "tet") {
          mesh(lanternGeo, red, decoration, x, 7).scale.set(0.8, 1.2, 0.8);
          for (let petal = 0; petal < 5; petal++)
            mesh(
              flowerGeo,
              gold,
              decoration,
              x + Math.cos((petal * Math.PI * 2) / 5) * 0.35,
              5.6 + Math.sin((petal * Math.PI * 2) / 5) * 0.35,
              0.1,
            );
        } else {
          mesh(starGeo, gold, decoration, x, 7);
          mesh(lanternGeo, red, decoration, x, 5.8).scale.setScalar(0.45);
        }
      }
    } else if (festival === "christmas") {
      const cone = geometry(new THREE.ConeGeometry(2, 4, 8));
      // Small suspended festive silhouette, not a mapped tree or surveyed prop.
      mesh(cone, green, decoration, -12, 6);
      mesh(starGeo, gold, decoration, -12, 8.6).scale.setScalar(0.65);
      for (let x = -5; x <= 14; x += 3)
        mesh(lanternGeo, x % 2 === 0 ? red : gold, decoration, x, 7).scale.setScalar(0.45);
    } else {
      for (const x of [-12, 0, 12]) {
        mesh(flags, red, decoration, x, 7);
        mesh(starGeo, gold, decoration, x, 7, 0.025).scale.setScalar(0.8);
      }
      decoration.userData["occasion"] = festival;
    }
  }
  const count = options.tier === "low" ? 180 : options.tier === "high" ? 900 : 480;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = Math.random() * 36;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
  }
  const rainGeometry = geometry(new THREE.BufferGeometry());
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rainMaterial = material(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        opacity: { value: 0.6 },
        size: { value: options.tier === "low" ? 3 : 5 },
      },
      vertexShader: `uniform float time; uniform float size; void main(){vec3 p=position;p.y=mod(p.y-time*32.0,36.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);gl_PointSize=size;}`,
      fragmentShader: `uniform float opacity; void main(){if(abs(gl_PointCoord.x-.5)>.16)discard;gl_FragColor=vec4(.68,.79,.86,opacity);}`,
    }),
  );
  const rain = new THREE.Points(rainGeometry, rainMaterial);
  rain.name = "rain-particles";
  rain.frustumCulled = false;
  group.add(rain);
  const puddleMaterial = material(
    new THREE.MeshStandardMaterial({
      color: "#6d8998",
      roughness: 0.16,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  const puddles = new THREE.InstancedMesh(
    geometry(new THREE.CircleGeometry(1.8, 12).rotateX(-Math.PI / 2)),
    puddleMaterial,
    8,
  );
  puddles.name = "simulation-puddles";
  const rings = new THREE.InstancedMesh(
    geometry(new THREE.RingGeometry(1.7, 1.85, 12).rotateX(-Math.PI / 2)),
    material(
      new THREE.MeshBasicMaterial({
        color: "#d4e3e5",
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    ),
    8,
  );
  rings.name = "simulation-water-edges";
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    dummy.position.set((i - 3.5) * 4.5, 0.055, ((i % 3) - 1) * 3.5);
    dummy.scale.set(1 + (i % 3) * 0.3, 1, 0.6 + (i % 2) * 0.25);
    dummy.updateMatrix();
    puddles.setMatrixAt(i, dummy.matrix);
    rings.setMatrixAt(i, dummy.matrix);
  }
  group.add(puddles, rings);
  const floodMaterial = material(
    new THREE.MeshStandardMaterial({
      color: "#4f90a1",
      transparent: true,
      opacity: 0.16,
      roughness: 0.2,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const flood = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(64, 54).rotateX(-Math.PI / 2)),
    floodMaterial,
  );
  flood.name = "simulation-flood-water";
  group.add(flood);
  const moonMaterial = material(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { phase: { value: 0 }, opacity: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float phase;uniform float opacity;void main(){vec2 p=vUv*2.-1.;float r=dot(p,p);if(r>1.)discard;vec3 n=vec3(p,sqrt(1.-r));float a=phase*6.2831853;vec3 light=vec3(sin(a),0.,-cos(a));float lit=max(.06,dot(n,light));gl_FragColor=vec4(vec3(.86,.9,.94)*lit,opacity);}`,
    }),
  );
  const moonVisual = new THREE.Mesh(geometry(new THREE.PlaneGeometry(4, 4)), moonMaterial);
  moonVisual.name = "moon-phase-disc";
  group.add(moonVisual);
  group.traverse((object) => {
    object.userData["nonPickable"] = true;
  });
  scene.add(group);
  const sunPosition = new THREE.Vector3(),
    moonPosition = new THREE.Vector3();
  const drySky = new THREE.Color("#b9d4de"),
    wetSky = new THREE.Color("#a1b8bf"),
    nightSky = new THREE.Color("#162335"),
    sunsetSky = new THREE.Color("#c99379");
  const fog = new THREE.FogExp2("#b9c7cd", 0.001);
  let disposed = false,
    activeRain = false,
    lastWet: boolean | undefined;
  let lastState: AtmosphereState | undefined;
  const update = (state: AtmosphereState, renderable: boolean, anchor?: THREE.Vector3) => {
    if (disposed) return;
    if (!warming) {
      lastState = { ...state };
      if (state.astronomy) lastState.astronomy = { ...state.astronomy };
    }
    const visible = state.atmosphereEnabled !== false && renderable;
    const wet = visible && (state.weather === "rain" || state.weather === "storm");
    const level = clamp(state.floodLevel ?? 0);
    const season = state.season === "wet" ? "wet" : "dry";
    const solar =
      Number.isFinite(state.astronomy?.sunAzimuthDeg) &&
      Number.isFinite(state.astronomy?.sunElevationDeg)
        ? {
            azimuthDeg: state.astronomy!.sunAzimuthDeg!,
            elevationDeg: state.astronomy!.sunElevationDeg!,
          }
        : solarPosition(state);
    const moonSolar =
      Number.isFinite(state.astronomy?.moonAzimuthDeg) &&
      Number.isFinite(state.astronomy?.moonElevationDeg)
        ? {
            azimuthDeg: state.astronomy!.moonAzimuthDeg!,
            elevationDeg: state.astronomy!.moonElevationDeg!,
          }
        : { azimuthDeg: (solar.azimuthDeg + 180) % 360, elevationDeg: -solar.elevationDeg };
    const daylight = clamp((solar.elevationDeg + 8) / 55);
    const cloud =
      state.weather === "sunny"
        ? 1
        : state.weather === "cloudy"
          ? 0.8
          : state.weather === "rain"
            ? 0.65
            : 0.5;
    if (visible) {
      sky.copy(nightSky).lerp(season === "wet" ? wetSky : drySky, daylight);
      if (solar.elevationDeg > -10 && solar.elevationDeg < 18)
        sky.lerp(sunsetSky, clamp(1 - Math.abs(solar.elevationDeg) / 18) * 0.45);
      sky.multiplyScalar(0.8 + 0.2 * cloud);
      hemisphere.color.copy(sky);
      hemisphere.groundColor.set("#626b68");
      hemisphere.intensity = THREE.MathUtils.lerp(0.9, 0.55 + 1.3 * cloud, daylight);
      enu(solar.azimuthDeg, solar.elevationDeg, 100, sunPosition);
      sun.position.copy(sunPosition);
      if (anchor) {
        sun.position.add(anchor);
        sun.target.position.copy(anchor);
        sun.target.updateMatrixWorld();
      }
      sun.intensity = Math.max(0, daylight * cloud * 3.4);
      sun.color.set(solar.elevationDeg < 15 ? "#ffc194" : "#fff0cd");
      if (moon) {
        enu(moonSolar.azimuthDeg, moonSolar.elevationDeg, 120, moonPosition);
        moon.position.copy(moonPosition);
        if (anchor) {
          moon.position.add(anchor);
          moon.target.position.copy(anchor);
          moon.target.updateMatrixWorld();
        }
        moon.intensity = moonSolar.elevationDeg > 0 ? (1 - daylight) * 0.25 : 0;
        moon.visible = moon.intensity > 0;
      }
      fog.color.copy(sky);
      fog.density = season === "wet" ? 0.0016 : 0.0007;
      scene.fog = fog;
    } else {
      sky.set("#b8c2c8");
      hemisphere.color.set("#b8c2c8");
      hemisphere.groundColor.set("#8b9295");
      hemisphere.intensity = 0.8;
      sun.intensity = 1;
      sun.color.set("#ffffff");
      sun.position.set(0, 100, 0);
      if (moon) {
        moon.intensity = 0;
        moon.visible = false;
      }
      scene.fog = null;
    }
    if (anchor) group.position.copy(anchor);
    activeRain = wet;
    rain.visible = wet;
    rainGeometry.setDrawRange(0, state.weather === "storm" ? count : Math.floor(count * 0.55));
    rainMaterial.uniforms["opacity"]!.value = state.weather === "storm" ? 0.85 : 0.55;
    puddles.visible = visible && (wet || level > 0);
    rings.visible = puddles.visible;
    flood.visible = visible && level > 0;
    flood.position.y = 0.06 + level * 1.3;
    floodMaterial.opacity = 0.12 + level * 0.2;
    const roadWet = visible && (wet || level > 0);
    if (!warming && roadWet !== lastWet) {
      onRoadWet(roadWet);
      lastWet = roadWet;
    }
    decorations.forEach((decoration, key) => {
      decoration.visible = visible && key === state.festival && key !== "normal";
    });
    enu(moonSolar.azimuthDeg, moonSolar.elevationDeg, 180, moonVisual.position);
    moonVisual.lookAt(0, 0, 0);
    moonVisual.visible = visible && moonSolar.elevationDeg > 0 && daylight < 0.45;
    moonMaterial.uniforms["phase"]!.value = clamp(state.moonPhase ?? 0.5);
    moonMaterial.uniforms["opacity"]!.value = 0.85;
    if (host) {
      host.dataset["atmosphereEnabled"] = String(state.atmosphereEnabled !== false);
      host.dataset["season"] = season;
      host.dataset["floodLevel"] = String(level);
      host.dataset["night"] = String(daylight < 0.1);
    }
  };
  const tick = (delta: number) => {
    if (!disposed && activeRain)
      rainMaterial.uniforms["time"]!.value += Math.max(0, Math.min(0.1, delta));
  };
  let warming = false;
  /** Compile each selectable variant, without warming their cartesian product. */
  const warm = (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
    const visibility = new Map<THREE.Object3D, boolean>();
    group.traverse((object) => visibility.set(object, object.visible));
    const previous = {
      fog: scene.fog,
      ownedFog: { color: fog.color.clone(), density: fog.density },
      lastState: lastState
        ? {
            ...lastState,
            ...(lastState.astronomy === undefined
              ? {}
              : { astronomy: lastState.astronomy ? { ...lastState.astronomy } : null }),
          }
        : undefined,
      sky: sky.clone(),
      hemisphere: {
        color: hemisphere.color.clone(),
        ground: hemisphere.groundColor.clone(),
        intensity: hemisphere.intensity,
      },
      sun: {
        position: sun.position.clone(),
        color: sun.color.clone(),
        intensity: sun.intensity,
        target: sun.target.position.clone(),
      },
      moon: moon
        ? {
            position: moon.position.clone(),
            visible: moon.visible,
            color: moon.color.clone(),
            intensity: moon.intensity,
            target: moon.target.position.clone(),
          }
        : undefined,
      groupPosition: group.position.clone(),
      activeRain,
      lastWet,
      rainRange: { start: rainGeometry.drawRange.start, count: rainGeometry.drawRange.count },
      rainOpacity: rainMaterial.uniforms["opacity"]!.value,
      flood: { visible: flood.visible, y: flood.position.y, opacity: floodMaterial.opacity },
      puddlesVisible: puddles.visible,
      ringsVisible: rings.visible,
      moonVisual: {
        position: moonVisual.position.clone(),
        quaternion: moonVisual.quaternion.clone(),
        visible: moonVisual.visible,
      },
      moonUniforms: {
        phase: moonMaterial.uniforms["phase"]!.value,
        opacity: moonMaterial.uniforms["opacity"]!.value,
      },
      hostDataset: host
        ? ["atmosphereEnabled", "season", "floodLevel", "night"].map(
            (key) => [key, host.dataset[key]] as const,
          )
        : [],
      camera: {
        matrixWorld: camera.matrixWorld.clone(),
        matrixWorldInverse: camera.matrixWorldInverse.clone(),
        projectionMatrix: camera.projectionMatrix.clone(),
      },
    };
    const compile = (variant: AtmosphereState) => {
      update(variant, true);
      renderer.compile(scene, camera);
    };
    warming = true;
    group.visible = true;
    try {
      // Weather and festival choices are independently selectable; do not compile every combination.
      const base = {
        ...(lastState ?? { weather: "sunny" as const, festival: "normal" as const }),
        timeOfDayMinutes: 720,
        astronomy: {
          sunAzimuthDeg: 180,
          sunElevationDeg: 55,
          moonAzimuthDeg: 0,
          moonElevationDeg: -55,
        },
      };
      const night = {
        ...base,
        timeOfDayMinutes: 0,
        moonPhase: 0.5,
        astronomy: {
          sunAzimuthDeg: 180,
          sunElevationDeg: -30,
          moonAzimuthDeg: 0,
          moonElevationDeg: 40,
        },
      };
      for (const weather of ["sunny", "cloudy", "rain", "storm"] as const)
        compile({ ...base, weather, festival: "normal", atmosphereEnabled: true, floodLevel: 0 });
      for (const festival of [
        "normal",
        "tet",
        "midautumn",
        "christmas",
        "reunification",
        "national",
      ] as const)
        compile({ ...base, weather: "sunny", festival, atmosphereEnabled: true, floodLevel: 0 });
      compile({
        ...night,
        weather: "rain",
        festival: "normal",
        atmosphereEnabled: true,
        floodLevel: 1,
      });
      compile({
        ...base,
        weather: "sunny",
        festival: "normal",
        atmosphereEnabled: true,
        floodLevel: 1,
      });
      compile({
        ...base,
        weather: "sunny",
        festival: "normal",
        atmosphereEnabled: false,
        floodLevel: 0,
      });
      // Only a second light topology is needed at night; reuse each real decorative material.
      for (const festival of [
        "tet",
        "midautumn",
        "christmas",
        "reunification",
        "national",
      ] as const)
        compile({ ...night, weather: "sunny", festival, atmosphereEnabled: true, floodLevel: 0 });
    } finally {
      scene.fog = previous.fog;
      fog.color.copy(previous.ownedFog.color);
      fog.density = previous.ownedFog.density;
      lastState = previous.lastState;
      sky.copy(previous.sky);
      hemisphere.color.copy(previous.hemisphere.color);
      hemisphere.groundColor.copy(previous.hemisphere.ground);
      hemisphere.intensity = previous.hemisphere.intensity;
      sun.position.copy(previous.sun.position);
      sun.color.copy(previous.sun.color);
      sun.intensity = previous.sun.intensity;
      sun.target.position.copy(previous.sun.target);
      sun.target.updateMatrixWorld();
      if (moon && previous.moon) {
        moon.position.copy(previous.moon.position);
        moon.visible = previous.moon.visible;
        moon.color.copy(previous.moon.color);
        moon.intensity = previous.moon.intensity;
        moon.target.position.copy(previous.moon.target);
        moon.target.updateMatrixWorld();
      }
      group.position.copy(previous.groupPosition);
      activeRain = previous.activeRain;
      lastWet = previous.lastWet;
      rainGeometry.setDrawRange(previous.rainRange.start, previous.rainRange.count);
      rainMaterial.uniforms["opacity"]!.value = previous.rainOpacity;
      flood.visible = previous.flood.visible;
      flood.position.y = previous.flood.y;
      floodMaterial.opacity = previous.flood.opacity;
      puddles.visible = previous.puddlesVisible;
      rings.visible = previous.ringsVisible;
      moonVisual.position.copy(previous.moonVisual.position);
      moonVisual.quaternion.copy(previous.moonVisual.quaternion);
      moonVisual.visible = previous.moonVisual.visible;
      moonMaterial.uniforms["phase"]!.value = previous.moonUniforms.phase;
      moonMaterial.uniforms["opacity"]!.value = previous.moonUniforms.opacity;
      if (host)
        previous.hostDataset.forEach(([key, value]) => {
          if (value === undefined) delete host.dataset[key];
          else host.dataset[key] = value;
        });
      visibility.forEach((visible, object) => (object.visible = visible));
      camera.matrixWorld.copy(previous.camera.matrixWorld);
      camera.matrixWorldInverse.copy(previous.camera.matrixWorldInverse);
      camera.projectionMatrix.copy(previous.camera.projectionMatrix);
      warming = false;
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    activeRain = false;
    scene.remove(group);
    if (scene.fog === fog) scene.fog = null;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    puddles.dispose();
    rings.dispose();
    group.clear();
  };
  const invalidateWorld = () => {
    lastWet = undefined;
  };
  return {
    group,
    update,
    tick,
    warm,
    invalidateWorld,
    markOptionChanged: () => undefined,
    dispose,
    get rainVisible() {
      return activeRain;
    },
  };
}
