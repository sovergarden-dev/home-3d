import type { DistrictData } from "../districtModel";

/**
 * Realistic Vietnamese urban street block fixture adhering to H6.
 * Features:
 * - Curved primary avenue with sidewalks
 * - Angled alleyway (hẻm) branching off with varying width (3.5m - 4.5m)
 * - True tube house footprints (narrow frontage, deep lot)
 * - Corner angled buildings at intersections
 * - Center home lot ([minX: -2.5, maxX: 2.5, minZ: -9, maxZ: 9]) kept EMPTY with perimeter barrier
 * - Varied floor counts (1 to 5), tum rooftops, awnings, and balconies
 * - Confidence ratings distinguishing verified vs inferred structures
 */

export const REALISTIC_DISTRICT_FIXTURE: DistrictData = {
  id: "h6-realistic-street-fixture",
  name: "Phố đô thị mẫu H6",
  isFictionalDemo: true,
  bounds: [-90, -110, 90, 110],
  homeLot: {
    minX: -2.5,
    maxX: 2.5,
    minZ: -9,
    maxZ: 9,
    empty: true,
  },
  roads: [
    // Primary street (Trục đường chính - hơi cong nhẹ, rộng 11m + vỉa hè 2m)
    {
      id: "road-main-street",
      name: "Đường chính",
      kind: "primary",
      points: [
        [-85, -16],
        [-40, -13],
        [0, -10],
        [45, -7],
        [85, -5],
      ],
      width: 11,
      sidewalkWidth: 2.2,
      surface: "asphalt",
    },
    // Secondary street (Đường song song phía sau)
    {
      id: "road-back-street",
      name: "Đường nhánh sau",
      kind: "secondary",
      points: [
        [-80, 42],
        [-20, 38],
        [30, 35],
        [80, 33],
      ],
      width: 8,
      sidewalkWidth: 1.5,
      surface: "asphalt",
    },
    // Main connecting alley (Hẻm thông cắt xiên, rộng 4.2m)
    {
      id: "road-alley-1",
      name: "Hẻm 1",
      kind: "alley",
      points: [
        [24, -8],
        [22, 10],
        [18, 36],
      ],
      width: 4.2,
      sidewalkWidth: 0.6,
      surface: "concrete",
    },
    // Dead-end branch alley (Hẻm cụt)
    {
      id: "road-alley-deadend",
      name: "Hẻm cụt",
      kind: "alley",
      points: [
        [-32, -12],
        [-34, 8],
        [-38, 20],
      ],
      width: 3.6,
      sidewalkWidth: 0,
      surface: "concrete",
    },
  ],
  buildings: [
    // --- THE EMPTY HOME LOT (Lô nhà của Chief - giữ trống hoàn toàn) ---
    {
      id: "b-home-lot",
      name: "Lô nhà mình (đất trống)",
      polygon: [
        [-2.5, -9],
        [2.5, -9],
        [2.5, 9],
        [-2.5, 9],
      ],
      floors: 0,
      height: 0,
      roofType: "flat",
      wallColor: "#8a9689",
      shop: false,
      confidence: "verified",
      isHomeLot: true,
    },

    // --- CĂN SÁT BÊN TRÁI (Nhà số 12 - 3 tầng, sân thượng tum, ban công) ---
    {
      id: "b-neighbor-left",
      name: "Nhà số 12 (liền kề trái)",
      polygon: [
        [-7.2, -9.2],
        [-2.6, -9.1],
        [-2.6, 8.8],
        [-7.2, 8.9],
      ],
      floors: 3,
      height: 11.5,
      roofType: "terrace_tum",
      wallColor: "#e3dbcb",
      shop: false,
      balconies: true,
      confidence: "verified",
      facadeStyle: "tube_modern",
    },

    // --- CĂN SÁT BÊN PHẢI (Nhà số 16 - 4 tầng, tiệm tạp hoá tầng trệt) ---
    {
      id: "b-neighbor-right",
      name: "Nhà số 16 (liền kề phải)",
      polygon: [
        [2.6, -9.0],
        [7.5, -8.8],
        [7.5, 9.2],
        [2.6, 9.0],
      ],
      floors: 4,
      height: 14.8,
      roofType: "terrace_tum",
      wallColor: "#dfcaa8",
      shop: true,
      balconies: true,
      confidence: "verified",
      facadeStyle: "shophouse",
    },

    // --- DÃY NHÀ MẶT TIỀN PHÍA BÊN TRÁI ĐƯỜNG CHÍNH ---
    {
      id: "b-left-2",
      polygon: [
        [-12.4, -9.5],
        [-7.3, -9.3],
        [-7.3, 8.8],
        [-12.4, 8.6],
      ],
      floors: 3,
      height: 11.2,
      roofType: "terrace_tum",
      wallColor: "#d5c5b5",
      shop: false,
      balconies: true,
      confidence: "source_only",
    },
    {
      id: "b-left-3",
      polygon: [
        [-17.6, -9.8],
        [-12.5, -9.6],
        [-12.5, 8.5],
        [-17.6, 8.3],
      ],
      floors: 2,
      height: 7.8,
      roofType: "gabled",
      roofColor: "#a84b39",
      wallColor: "#eae2d3",
      shop: true,
      confidence: "source_only",
    },
    {
      id: "b-left-4",
      polygon: [
        [-23.0, -10.2],
        [-17.7, -9.9],
        [-17.7, 8.2],
        [-23.0, 8.0],
      ],
      floors: 4,
      height: 14.5,
      roofType: "terrace_tum",
      wallColor: "#c8d6cb",
      shop: false,
      balconies: true,
      confidence: "inferred",
    },
    // Nhà vát góc đầu hẻm cụt
    {
      id: "b-corner-alley-left",
      name: "Căn góc đầu hẻm cụt",
      polygon: [
        [-30.0, -10.8],
        [-23.1, -10.3],
        [-23.1, 7.8],
        [-28.5, 7.5],
        [-30.0, 1.0], // vát cạnh
      ],
      floors: 3,
      height: 11.4,
      roofType: "terrace_tum",
      wallColor: "#d8b89d",
      shop: true,
      balconies: true,
      confidence: "verified",
    },

    // --- DÃY NHÀ MẶT TIỀN PHÍA BÊN PHẢI ĐƯỜNG CHÍNH ---
    {
      id: "b-right-2",
      polygon: [
        [7.6, -8.7],
        [13.0, -8.5],
        [13.0, 9.4],
        [7.6, 9.2],
      ],
      floors: 3,
      height: 11.2,
      roofType: "flat",
      wallColor: "#d0ded2",
      shop: false,
      balconies: true,
      confidence: "source_only",
    },
    {
      id: "b-right-3",
      polygon: [
        [13.1, -8.4],
        [18.2, -8.1],
        [18.2, 9.6],
        [13.1, 9.4],
      ],
      floors: 2,
      height: 8.0,
      roofType: "corrugated",
      roofColor: "#6e7b87",
      wallColor: "#e8dcce",
      shop: true,
      confidence: "source_only",
    },
    // Quán cà phê góc ngã ba đầu hẻm 1 (Landmark dễ nhận)
    {
      id: "b-cafe-corner",
      name: "Quán Cà Phê Góc Ngã Ba",
      polygon: [
        [18.3, -8.0],
        [22.8, -7.8],
        [21.5, 0.5], // vát góc theo hẻm
        [18.3, 9.7],
      ],
      floors: 3,
      height: 11.8,
      roofType: "terrace_tum",
      wallColor: "#c2a688",
      shop: true,
      balconies: true,
      confidence: "verified",
      facadeStyle: "french_colonial",
    },

    // --- DÃY NHÀ ĐỐI DIỆN TRỤC ĐƯỜNG CHÍNH (Phía Nam đường chính) ---
    {
      id: "b-opp-1",
      polygon: [
        [-5.5, -23.0],
        [0.5, -23.2],
        [0.5, -38.5],
        [-5.5, -38.2],
      ],
      floors: 2,
      height: 8.2,
      roofType: "gabled",
      roofColor: "#9b4837",
      wallColor: "#ebd8bf",
      shop: false,
      confidence: "verified",
    },
    {
      id: "b-opp-2",
      polygon: [
        [0.6, -23.3],
        [6.8, -23.5],
        [6.8, -38.8],
        [0.6, -38.6],
      ],
      floors: 3,
      height: 11.5,
      roofType: "terrace_tum",
      wallColor: "#d2dfd8",
      shop: true,
      balconies: true,
      confidence: "source_only",
    },
    {
      id: "b-opp-3",
      polygon: [
        [-12.0, -22.7],
        [-5.6, -22.9],
        [-5.6, -38.1],
        [-12.0, -37.8],
      ],
      floors: 4,
      height: 15.0,
      roofType: "terrace_tum",
      wallColor: "#dacfc2",
      shop: false,
      balconies: true,
      confidence: "source_only",
    },
    {
      id: "b-opp-4",
      polygon: [
        [6.9, -23.6],
        [14.2, -23.9],
        [14.2, -39.2],
        [6.9, -38.9],
      ],
      floors: 3,
      height: 11.0,
      roofType: "corrugated",
      roofColor: "#758491",
      wallColor: "#e7decb",
      shop: true,
      confidence: "inferred",
    },

    // --- CÔNG TRÌNH TRONG HẺM VÀ PHÍA SAU ---
    {
      id: "b-alley-inner-1",
      polygon: [
        [27.0, -6.5],
        [35.0, -6.0],
        [34.5, 12.0],
        [26.5, 11.5],
      ],
      floors: 3,
      height: 11.2,
      roofType: "terrace_tum",
      wallColor: "#d8cdbf",
      shop: false,
      balconies: true,
      confidence: "source_only",
    },
    {
      id: "b-alley-inner-2",
      polygon: [
        [26.4, 13.0],
        [34.2, 13.5],
        [33.8, 30.0],
        [26.0, 29.5],
      ],
      floors: 2,
      height: 7.9,
      roofType: "flat",
      wallColor: "#cedacf",
      shop: false,
      confidence: "inferred",
    },
  ],
  trees: [
    { x: -14, z: -13.5, kind: "shade_tree" },
    { x: -1, z: -12.8, kind: "shade_tree" },
    { x: 12, z: -11.6, kind: "shade_tree" },
    { x: 28, z: -10.2, kind: "shade_tree" },
    { x: -10, z: -19.5, kind: "shade_tree" },
    { x: 4, z: -20.2, kind: "shade_tree" },
    { x: 16, z: -20.8, kind: "shade_tree" },
    { x: 23.5, z: 14.0, kind: "potted_plant" },
    { x: 23.2, z: 22.0, kind: "potted_plant" },
  ],
  props: [
    { x: -15, z: -13.2, kind: "street_light" },
    { x: 14, z: -11.4, kind: "street_light" },
    { x: 22.2, z: -8.8, kind: "electric_pole" },
    { x: -31.5, z: -12.5, kind: "electric_pole" },
  ],
};
