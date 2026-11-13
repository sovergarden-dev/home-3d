import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import enrichmentDocument from "@/world/data/homeNeighborhood.enrichment.json";
import schemaDocument from "@/world/enrichment/homeNeighborhood.enrichment.schema.json";
import {
  HOME_ENRICHMENT,
  HOME_ENRICHMENT_RESULT,
  homeEnrichmentBase,
} from "@/world/enrichment/homeEnrichment";
import {
  convertOverpassResponse,
  filterAllowedTags,
  OSM_TAG_ALLOWLIST,
  OVERPASS_QUERY_TEMPLATE,
} from "@/world/enrichment/osmSnapshot";
import { ENRICHMENT_REQUIRED_KEYS, parseEnrichmentLayer } from "@/world/enrichment/parse";
import { FORBIDDEN_KEY_PATTERN, G1_PACKAGE_SHA256 } from "@/world/enrichment/schema";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";

// Pinned literal on purpose (see g1-pin.test.ts): the layer must stay locked to this package.
const G1 = "cd4f0146fd3399d0995111bd19a46751c86e0347a56d3e2a770a4832852a7ce3";
const dataDir = path.resolve(__dirname, "../world/data");
const layerText = readFileSync(path.join(dataDir, "homeNeighborhood.enrichment.json"), "utf8");
const layerJson = JSON.parse(layerText) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const clone = () => JSON.parse(layerText) as Loose;

/** Every key the committed layer may contain (schema keys only, no raw OSM tags). */
const ALLOWED_KEYS = new Set([
  ...ENRICHMENT_REQUIRED_KEYS,
  "namespace",
  "kind",
  "revision",
  "licence",
  "observedAt",
  "source",
  "endpoint",
  "fetchedAt",
  "osmBaseTimestamp",
  "queryTemplate",
  "querySha256",
  "bbox",
  "frame",
  "originRef",
  "halfSizeMetres",
  "tagAllowlist",
  "attribution",
  "generatedBy",
  "buildingId",
  "levels",
  "roofType",
  "value",
  "provenance",
  "origin",
  "sourceNamespace",
  "estimated",
  "localId",
  "position",
  "height",
  "archetype",
  "seed",
  "homeExclusionRadius",
  "homeDominanceRadius",
  "homeMaxNeighbourLevels",
  "density",
  "denseRadius",
  "midRadius",
  "midFactor",
  "farFactor",
  "streetTreeSpacing",
  "primary",
  "secondary",
  "residential",
  "alley",
  "service",
  "unknown",
  "poleSpacing",
  "vendorCartsPer100m",
  "parkedMotorbikesPer100m",
  "massing",
  "levelsWeights",
  "roofWeights",
  "corrugated",
  "flat",
  "terrace_tum",
  "balconyProbability",
  "shopProbabilityOnPrimary",
  "floorHeight",
  "life",
  "motorbikeToCarRatio",
  "pedestriansPer100m",
]);

function walk(value: unknown, visit: (key: string | null, child: unknown) => void) {
  if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
  else if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      visit(key, child);
      walk(child, visit);
    }
  else visit(null, value);
}

describe("surroundings snapshot: G1 lock and header", () => {
  it("is bound to the pinned G1 package hash and loads fail-closed", () => {
    const packageText = readFileSync(path.join(dataDir, "homeNeighborhood.json"), "utf8");
    const sha = createHash("sha256")
      .update(JSON.stringify(JSON.parse(packageText)))
      .digest("hex");
    expect(sha).toBe(G1);
    expect(G1_PACKAGE_SHA256).toBe(G1);
    expect(layerJson["basePackageSha256"]).toBe(G1);
    expect(HOME_ENRICHMENT_RESULT).toEqual({ ok: true, layer: expect.any(Object) });
    expect(HOME_ENRICHMENT?.verificationStatus).toBe("REAL_WORLD_NOT_VERIFIED");

    const foreign = clone();
    foreign["basePackageSha256"] = "0".repeat(64);
    expect(parseEnrichmentLayer(foreign, homeEnrichmentBase())).toEqual({
      ok: false,
      errorCode: "LAYER_BASE_HASH_MISMATCH",
    });
    expect(parseEnrichmentLayer(clone(), { ...homeEnrichmentBase(), sha256: "unbound" })).toEqual({
      ok: false,
      errorCode: "LAYER_BASE_HASH_MISMATCH",
    });
  });

  it("records source, fetch time, the exact query template and the ODbL attribution", () => {
    const layer = HOME_ENRICHMENT!;
    expect(layer.licence).toBe("ODbL-1.0");
    expect(layer.attribution).toContain("© OpenStreetMap contributors");
    expect(layer.snapshot.source).toBe("OpenStreetMap via Overpass API");
    expect(layer.snapshot.endpoint).toMatch(/^https:\/\/[a-z0-9.-]+\/.*interpreter$/);
    expect(Number.isFinite(Date.parse(layer.snapshot.fetchedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(layer.snapshot.osmBaseTimestamp))).toBe(true);
    expect(layer.snapshot.queryTemplate).toBe(OVERPASS_QUERY_TEMPLATE);
    expect(layer.snapshot.querySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(layer.snapshot.attribution).toContain("© OpenStreetMap contributors");
    expect(layer.snapshot.attribution).toContain("ODbL");
    expect(layer.snapshot.bbox).toEqual({
      frame: "ENU_METRES_FROM_GEOREF_ORIGIN",
      originRef: "src/world/data/homeNeighborhood.georef.json#origin",
      halfSizeMetres: 300,
    });
    expect(layer.snapshot.tagAllowlist).toEqual([...OSM_TAG_ALLOWLIST]);
    expect(layer.sources).toEqual([
      expect.objectContaining({
        namespace: "osm-300m-enrichment",
        kind: "osm",
        licence: "ODbL-1.0",
        revision: `overpass-osm-base-${layer.snapshot.osmBaseTimestamp}`,
      }),
    ]);
  });

  it("keeps the JSON schema draft in sync with the validator", () => {
    expect([...schemaDocument.required].sort()).toEqual([...ENRICHMENT_REQUIRED_KEYS].sort());
    expect(schemaDocument.properties.basePackageSha256.const).toBe(G1);
    expect(Object.keys(schemaDocument.properties).sort()).toEqual(
      [...ENRICHMENT_REQUIRED_KEYS].sort(),
    );
  });
});

describe("surroundings snapshot: privacy and tag allowlist (Aegis conditions 1–2)", () => {
  it("contains no disallowed tag or key anywhere in the committed snapshot", () => {
    const unexpected: string[] = [];
    walk(enrichmentDocument, (key) => {
      if (key === null) return;
      if (FORBIDDEN_KEY_PATTERN.test(key) || !ALLOWED_KEYS.has(key)) unexpected.push(key);
    });
    expect(unexpected).toEqual([]);
    for (const tag of ["name", "name:vi", "addr:street", "addr:housenumber", "phone"]) {
      expect(FORBIDDEN_KEY_PATTERN.test(tag)).toBe(true);
      expect(layerText).not.toContain(`"${tag}"`);
    }
    for (const tag of ["contact:phone", "website", "email", "operator", "brand"])
      expect(FORBIDDEN_KEY_PATTERN.test(tag)).toBe(true);
  });

  it("writes no geographic coordinate, map link or Google-derived source", () => {
    const georef = JSON.parse(
      readFileSync(path.join(dataDir, "homeNeighborhood.georef.json"), "utf8"),
    ) as { origin: { latitude: number; longitude: number } };
    expect(layerText).not.toContain(georef.origin.latitude.toFixed(4));
    expect(layerText).not.toContain(georef.origin.longitude.toFixed(4));
    expect(layerText).not.toMatch(/google|goo\.gl|maps\.app|street\s*view/i);
    // No literal bbox: lat/lon need >= 4 decimals; every number in the layer has at most 2.
    expect(layerText).not.toMatch(/\d+\.\d{3,}/);
    walk(enrichmentDocument, (key, value) => {
      if (key === null && typeof value === "number")
        expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-6);
    });
    // Positions are local ENU metres inside the snapshot square, not degrees.
    for (const fact of HOME_ENRICHMENT!.pointFacts) {
      expect(Math.abs(fact.position[0])).toBeLessThanOrEqual(300);
      expect(Math.abs(fact.position[1])).toBeLessThanOrEqual(300);
    }
  });

  it("strips names, addresses and contact tags before mapping any OSM element", () => {
    const leaky = {
      name: "Leaky Shop",
      "name:vi": "Tên riêng",
      "addr:street": "Private Street",
      "addr:housenumber": "99",
      phone: "+84 000",
      "contact:phone": "+84 111",
      website: "https://example.invalid",
      email: "someone@example.invalid",
      operator: "Someone",
      natural: "tree",
      height: "7",
      leaf_type: "broadleaved",
    };
    expect(filterAllowedTags(leaky)).toEqual({
      natural: "tree",
      height: "7",
      leaf_type: "broadleaved",
    });
    // Synthetic origin (not a real place) and a synthetic node ~11 m north-east of it.
    const origin = { latitude: 0.5, longitude: 0.5 };
    const result = convertOverpassResponse(
      {
        elements: [
          { type: "node", id: 42, lat: 0.5001, lon: 0.5001, tags: leaky },
          { type: "node", id: 43, lat: 0.5001, lon: 0.5001, tags: { name: "No kind" } },
          {
            type: "way",
            id: 7,
            tags: { building: "yes", "building:levels": "3", name: "Leaky", "addr:street": "x" },
          },
        ],
      },
      origin,
      ["building-osm-300m-primary-way-7-abcdef0123"],
    );
    const text = JSON.stringify(result);
    for (const value of Object.values(leaky).filter(
      (v) => !["tree", "7", "broadleaved"].includes(v),
    ))
      expect(text).not.toContain(value);
    expect(text).not.toMatch(/"(name|addr:[a-z]+|phone|website|email|operator|lat|lon)"/);
    expect(result.pointFacts).toEqual([
      {
        localId: "tree-osm-node-42",
        kind: "tree",
        position: [expect.closeTo(11.13, 0) as number, expect.closeTo(-11.06, 0) as number],
        height: { value: 7, provenance: expect.any(Object) },
        archetype: "broadleaf",
        provenance: { origin: "osm", sourceNamespace: "osm-300m-enrichment", estimated: false },
      },
    ]);
    expect(result.buildingFacts).toEqual([
      {
        buildingId: "building-osm-300m-primary-way-7-abcdef0123",
        levels: { value: 3, provenance: expect.any(Object) },
      },
    ]);
  });

  it("rejects layers carrying forbidden keys, Google sources or out-of-contract facts", () => {
    const base = homeEnrichmentBase();
    const cases: Array<[string, (layer: Loose) => void]> = [
      ["LAYER_FORBIDDEN_KEY", (l) => (l["pointFacts"][0]["name"] = "x")],
      ["LAYER_FORBIDDEN_KEY", (l) => (l["snapshot"]["addr:street"] = "x")],
      ["LAYER_FORBIDDEN_KEY", (l) => (l["lat"] = 1)],
      ["LAYER_FORBIDDEN_SOURCE", (l) => (l["sources"][0]["revision"] = "google-streetview")],
      ["LAYER_ATTRIBUTION_MISSING", (l) => (l["attribution"] = ["someone"])],
      ["LAYER_VERIFICATION_STATUS", (l) => (l["verificationStatus"] = "VERIFIED")],
      ["LAYER_UNKNOWN_KEY", (l) => (l["extra"] = true)],
      ["POINT_OUTSIDE_PACKAGE_BOUNDS", (l) => (l["pointFacts"][0]["position"] = [5000, 0])],
      ["POINT_UNKNOWN_KEY", (l) => (l["pointFacts"][0]["tags"] = {})],
      [
        "PROVENANCE_ESTIMATED_NOT_ALLOWED",
        (l) =>
          (l["pointFacts"][0]["provenance"] = { origin: "estimated_procedural", estimated: true }),
      ],
      [
        "BUILDING_FACT_UNKNOWN_BUILDING",
        (l) => (l["buildingFacts"] = [{ buildingId: "building-x" }]),
      ],
      [
        "SNAPSHOT_QUERY_HAS_COORDINATES",
        (l) => (l["snapshot"]["queryTemplate"] = "{{bbox}} 1.23456"),
      ],
      ["LAYER_NON_FINITE_NUMBER", (l) => (l["generator"]["poleSpacing"] = Number.NaN)],
    ];
    expect(HOME_ENRICHMENT!.pointFacts.length).toBeGreaterThan(0);
    for (const [code, mutate] of cases) {
      const layer = clone();
      mutate(layer);
      expect(parseEnrichmentLayer(layer, base)).toEqual({ ok: false, errorCode: code });
    }
  });

  it("never lets HOME_NEIGHBORHOOD and the snapshot disagree on building identity", () => {
    const ids = new Set(HOME_NEIGHBORHOOD.buildings.map((building) => building.localId));
    for (const fact of HOME_ENRICHMENT!.buildingFacts) expect(ids.has(fact.buildingId)).toBe(true);
  });
});
