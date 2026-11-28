import type { RoadClass } from "./schema";

export interface LocalizedLabel {
  readonly vi: string;
  readonly en: string;
}

export const ROAD_DISPLAY_NAMES: Record<string, LocalizedLabel> = {
  "road-main": { vi: "Đường chính", en: "Main Street" },
  "road-back": { vi: "Đường sau", en: "Back Lane" },
  "road-alley": { vi: "Hẻm bên", en: "Side Alley" },
  "road-deadend": { vi: "Hẻm cụt", en: "Cul-de-sac" },
  // Châu Văn Liêm (axis north-south through 58 Châu Văn Liêm × Trần Hưng Đạo)
  "road-osm-300m-primary-way-32575864-1047ada6fe": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-466671834-d059a29bb9": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-466671836-ff4216d06e": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-326848001-b1ab121f47": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-466671837-35de416ee8": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-1539068826-4fcded68d1": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-722622674-a77fde5389": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-722622675-f090e1d84a": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-1486203687-e187516186": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-977120849-34142450ee": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  "road-osm-300m-primary-way-977120850-105ad9f6cb": {
    vi: "Đ. Châu Văn Liêm",
    en: "Chau Van Liem St",
  },
  // Trần Hưng Đạo (east-west main avenue)
  "road-osm-300m-primary-way-720034787-5f2878ec44": {
    vi: "Đ. Trần Hưng Đạo",
    en: "Tran Hung Dao St",
  },
  "road-osm-300m-primary-way-706575585-0162a47d57": {
    vi: "Đ. Trần Hưng Đạo",
    en: "Tran Hung Dao St",
  },
  "road-osm-300m-primary-way-1291979755-2ead3441d2": {
    vi: "Đ. Trần Hưng Đạo",
    en: "Tran Hung Dao St",
  },
  "road-osm-300m-primary-way-676486360-f7ebbdf44f": {
    vi: "Đ. Trần Hưng Đạo",
    en: "Tran Hung Dao St",
  },
  // Lương Nhữ Học (parallel north-south east of Lưu Xuân Tín)
  "road-osm-300m-primary-way-189017031-2cb8008b34": {
    vi: "Đ. Lương Nhữ Học",
    en: "Luong Nhu Hoc St",
  },
  // Lưu Xuân Tín (south off Trần Hưng Đạo)
  "road-osm-300m-primary-way-595379979-2098e73d82": {
    vi: "Đ. Lưu Xuân Tín",
    en: "Luu Xuan Tin St",
  },
  // Nguyễn Trãi (parallel east-west north of Trần Hưng Đạo)
  "road-osm-300m-primary-way-720251504-9e31e7c6b1": { vi: "Đ. Nguyễn Trãi", en: "Nguyen Trai St" },
  "road-osm-300m-primary-way-720037080-08530979b1": { vi: "Đ. Nguyễn Trãi", en: "Nguyen Trai St" },
  "road-osm-300m-primary-way-720251506-8017895477": { vi: "Đ. Nguyễn Trãi", en: "Nguyen Trai St" },
};

export const BUILDING_DISPLAY_NAMES: Record<string, LocalizedLabel> = {
  "building-neighbour-west": { vi: "Nhà ống 3 tầng", en: "3F Townhouse" },
  "building-neighbour-east": { vi: "Nhà phố 4 tầng", en: "4F Townhouse" },
  "building-corner-oblique": { vi: "Nhà góc mái ngói", en: "Corner Gabled House" },
  "building-courtyard": { vi: "Khu nhà sân trong", en: "Courtyard Block" },
  "building-multipolygon": { vi: "Cụm nhà xưởng nhỏ", en: "Workshop Cluster" },
  "building-focal-home": {
    vi: "Nhà của tôi · 58 Châu Văn Liêm",
    en: "My house · 58 Chau Van Liem",
  },
  "building-focal-north-orange": {
    vi: "62 Châu Văn Liêm",
    en: "62 Chau Van Liem",
  },
  "building-focal-north-awning": {
    vi: "64 Châu Văn Liêm",
    en: "64 Chau Van Liem",
  },
  "building-focal-corner-ne": {
    vi: "Góc Đông Bắc Châu Văn Liêm × Trần Hưng Đạo",
    en: "NE Corner Chau Van Liem & Tran Hung Dao",
  },
  "building-focal-corner-se-teal": {
    vi: "Chung cư góc Đông Nam",
    en: "SE Corner Apartment",
  },
  "building-focal-corner-se-red": {
    vi: "Nhà góc Đông Nam Trần Hưng Đạo",
    en: "SE Corner Tran Hung Dao Building",
  },
  "building-focal-corner-sw": {
    vi: "Nhà góc Tây Nam Trần Hưng Đạo",
    en: "SW Corner Tran Hung Dao Building",
  },
  "building-focal-corner-nw": {
    vi: "Khối góc Tây Bắc ngã tư",
    en: "NW Intersection Corner Block",
  },
  "building-focal-south-838e6ff5": {
    vi: "Nhà mặt tiền Trần Hưng Đạo",
    en: "Tran Hung Dao Frontage House",
  },
  "building-focal-south-2ce8d238": {
    vi: "Nhà góc gần 58 Châu Văn Liêm",
    en: "Adjacent Shopfront Building",
  },
  "building-focal-north-66871f17": {
    vi: "Nhà phố dãy Châu Văn Liêm",
    en: "Chau Van Liem Row House",
  },
  "building-focal-east-a093f2f1": {
    vi: "Nhà phố sau dãy mặt tiền",
    en: "Inner Block Townhouse",
  },
  "building-focal-east-c10f630e": {
    vi: "Nhà khu Trần Hưng Đạo",
    en: "Tran Hung Dao Block House",
  },
  "building-focal-north-d017af94": {
    vi: "Nhà dãy Châu Văn Liêm",
    en: "Chau Van Liem Block House",
  },
  "building-focal-north-0c10a948": {
    vi: "Nhà dãy Châu Văn Liêm",
    en: "Chau Van Liem Block House",
  },
};

export const FOCAL_BUILDING_SUBTITLES: Record<string, LocalizedLabel> = {
  "building-focal-home": {
    vi: "Đèn trang trí Sáng Sáng · cụm tâm điểm",
    en: "Sang Sang Lighting Shop · focal landmark",
  },
  "building-focal-north-orange": {
    vi: "Nhà liền kề mái hiên cam",
    en: "Adjacent orange-fascia shopfront",
  },
  "building-focal-north-awning": {
    vi: "Cửa hàng mái bạt sọc xanh trắng",
    en: "Blue-and-white striped awning storefront",
  },
  "building-focal-corner-ne": {
    vi: "Ô góc rào tôn · mái xanh sọc ngã tư",
    en: "Corner kiosk with corrugated enclosure",
  },
  "building-focal-corner-se-teal": {
    vi: "Tòa 5 tầng góc ngã tư",
    en: "5-storey teal intersection corner block",
  },
};

export function resolveRoadDisplayName(
  localId: string,
  roadClass: RoadClass | undefined,
  lang: "vi" | "en",
): string {
  const mapped = ROAD_DISPLAY_NAMES[localId];
  if (mapped) return mapped[lang];
  if (roadClass === "alley") return lang === "vi" ? "Hẻm nội bộ" : "Alley";
  if (roadClass === "service") return lang === "vi" ? "Đường nội khu" : "Service lane";
  return lang === "vi" ? "Đường khu phố" : "Neighborhood street";
}

export function resolveBuildingDisplayName(localId: string, lang: "vi" | "en"): string {
  const mapped = BUILDING_DISPLAY_NAMES[localId];
  if (mapped) return mapped[lang];
  if (localId.startsWith("building-focal-")) {
    return lang === "vi" ? "Công trình cụm tâm" : "Focal block building";
  }
  return lang === "vi" ? "Nhà khu Chợ Lớn" : "Cho Lon building";
}
