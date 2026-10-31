# Nguồn của Demo 1

- Model, layout, đạo cụ, âm thanh tổng hợp: tạo bằng code cho bản demo, không lấy từ ảnh hoặc bản đồ địa điểm thật.
- Không chứa Google Maps/Street View, dữ liệu OSM/Overture/Open Buildings hoặc ảnh người dùng. Credit các bộ dữ liệu sẽ được bổ sung khi thực sự sử dụng.
- Three.js và OrbitControls: MIT, https://github.com/mrdoob/three.js.
- React, Zustand, TanStack và các thư viện UI: theo giấy phép của từng dependency. Không thay đổi giấy phép nguồn.
- Font UI của app Lovable vẫn là Be Vietnam Pro và Lora từ Google Fonts; bản HTML portable dùng font hệ thống khi không có sẵn. Google Fonts không phải Google Maps và không được dùng làm nguồn model.

## P9 — Tác nhân và âm thanh

Mọi hình tác nhân (xe máy/ô tô/bus/ba gác/xe đạp/người/hàng rong/chó/mèo/gà), đèn xe và fixture P9 đều procedural/tổng hợp được tạo trong mã dự án; không asset bên ngoài, ảnh người, biển số, nội dung Google hoặc bản thu phố thật. WebAudio noise/tone/loop tự tổng hợp, không file loop/asset audio mới để phân phối. Không dependency mới; dùng lại Three.js MIT và `BufferGeometryUtils.mergeGeometries` trong gói đã khóa. Clip local do người xem chọn chỉ ở phiên, không phải asset phát hành; file audio-local bị gitignore. Không sao chép âm thanh bên thứ ba hoặc yêu cầu micro.

## P10 — kỷ niệm tổng hợp

Ba ghim mẫu, nhật ký demo, ảnh metadata/12 MP và UI bằng chứng được tạo bằng mã từ hình/màu giả lập, không dựa khu thật/ảnh cá nhân. Sentinel đều tổng hợp. Pin dùng hình học Three.js hiện hữu; không ảnh Google, nhạc/model/asset tải về hay dependency mới; giữ giấy phép thư viện sẵn có.

P10 giữ đúng ba liên kết Google Fonts của main cho Be Vietnam Pro và Lora; các harness P10 chỉ abort request tới `fonts.googleapis.com`/`fonts.gstatic.com`, không cho phép host ngoài. Không đóng gói/copy tệp font; Google Fonts không phải Google Maps và không phải nguồn model.

## M2 — Công cụ coverage (dev-only)

Không thêm dependency runtime. Các package mới để đo coverage, giữ guard 24 giờ và kiểm lifecycle/native:

| Package                 | Version  | License      |
| ----------------------- | -------- | ------------ |
| `@bcoe/v8-coverage`     | `1.0.2`  | MIT          |
| `@vitest/coverage-v8`   | `4.1.11` | MIT          |
| `ast-v8-to-istanbul`    | `1.0.7`  | MIT          |
| `html-escaper`          | `2.0.2`  | MIT          |
| `istanbul-lib-coverage` | `3.2.2`  | BSD-3-Clause |
| `istanbul-lib-report`   | `3.0.1`  | BSD-3-Clause |
| `istanbul-reports`      | `3.2.0`  | BSD-3-Clause |
| `js-tokens`             | `10.0.0` | MIT          |
| `magicast`              | `0.5.5`  | MIT          |
| `make-dir`              | `4.0.0`  | MIT          |

Nguồn và thời gian phát hành đã kiểm từ npm registry, ghi trong `docs/assets/qa/codex/m2/dependency-review.json`. Gitleaks CLI 8.30.1 dùng giấy phép MIT từ dự án gitleaks/gitleaks, không vào dependency hoặc bundle app.

M2 giữ công thức scalar clamp/lerp tương đương `three/src/math/MathUtils.js` (MIT) trong camera pose thuần để vỏ không import Three.js. Hàm dựng Vector3 vẫn ở engine lazy. Không thêm asset/runtime dependency cho thay đổi này.

## M3 — Font cục bộ

Be Vietnam Pro (Copyright 2021 The Be Vietnam Pro Project Authors) và Lora (Copyright 2011 The Lora Project Authors, Reserved Font Name Lora), SIL Open Font License1.1. Giữ nguyên file WOFF2 từ nguồn phân phối Google Fonts, chỉ chọn subset Vietnamese/Latin và face đã dùng; không sửa tên hoặc glyph. OFL nguyên văn và bảng SHA256/URL nguồn nằm ở `src/assets/fonts/`. Google Fonts không phải Maps và không dùng làm nguồn hình học.

Ứng dụng bỏ stylesheet/preconnect Google Fonts và dùng URL asset do Vite phát sinh. Các phép kiểm production và axe ban đầu đã chạy với font cục bộ; ma trận tích hợp cuối vẫn pending.

### Kiểm a11y M3

axe-core 4.14.0 (MPL-2.0), công cụ dev để kiểm WCAG trong browser; không vào bundle runtime. Metadata công khai phát hành 05/10/2026, không có dependency/install script. Tarball đã kiểm integrity và không có install script/native; bằng chứng ở docs/assets/qa/codex/m3/dependency-review.json.

### M5 — Open Buildings Temporal và pipeline

[Google Research Open Buildings 2.5D Temporal v1](https://sites.research.google/gr/open-buildings/temporal/) được dùng theo CC-BY-4.0, có dữ liệu Copernicus Sentinel-2. Catalogue hiện có 2016–2023, độ phân giải hiệu dụng 4 m dù raster phát hành 0,5 m. building_height là mét trên nền đất; dùng cùng building_presence như ngưỡng xếp hạng, không phải xác suất. Không dùng Google Maps/Street View làm nguồn model. Chỉ code và fixture tự tạo đã được kiểm; chưa mở tile khu thật.

Dependency chỉ thuộc package pipeline, không vào browser bundle. Tarball khớp integrity, mọi version qua 24 giờ, không native OS binary hay install script. LERC/zstd có WebAssembly portable; không cài driver/native addon.

| Package | Version | Giấy phép |
| --- | --- | --- |
| @petamoriken/float16 | 3.9.3 | MIT |
| geotiff | 3.0.5 | MIT |
| lerc | 3.0.0 | Apache-2.0 |
| mgrs | 1.0.0 | MIT |
| pako | 2.2.0 | (MIT AND Zlib) |
| parse-headers | 2.0.6 | MIT |
| proj4 | 2.22.0 | MIT |
| quick-lru | 6.1.2 | MIT |
| web-worker | 1.5.0 | Apache-2.0 |
| wkt-parser | 1.6.0 | MIT |
| xml-utils | 1.10.2 | CC0-1.0 |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause |

Chi tiết: `docs/assets/qa/codex/m5/dependency-review.json`.

### Công cụ QA riêng, không vào build Lovable

Lighthouse 13.5.0 và chrome-launcher 1.2.2 (Apache-2.0) chỉ thuộc toolchain QA. Wrangler 4.151.3 (MIT OR Apache-2.0), Miniflare 5.20261019.1-beta (MIT) và Workerd 1.20261019.1 (Apache-2.0) dùng để dry-run và kiểm native Worker cục bộ/CI. Toolchain này cài với guard 24 giờ và --ignore-scripts; Workerd có script postinstall trong metadata nhưng không chạy script đó. Native executable nằm ngoài dependency app; không đăng nhập hay deploy. Version, giấy phép và hash lock được ghi ở docs/assets/qa/codex/m3/qa-toolchain.json.
