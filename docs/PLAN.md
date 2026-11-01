# Phố Nhà Mình — Siêu kế hoạch web app map 3D

> **SNAPSHOT LỊCH SỬ — 13/10/2026.** Chỉ đạo hiện hành, phân vai và cổng làm việc: [CODEX_HANDOFF.md](CODEX_HANDOFF.md). Các trạng thái trong snapshot không phải trạng thái nghiệm thu hiện tại; xem [CODEX_LOG.md](CODEX_LOG.md).

> **Cập nhật Demo 1:** P1.1 đã merge và chủ dự án xác nhận Publish. Sau đó được cho phép làm một demo 3D hư cấu xuyên pha trước, tinh chỉnh sau. Xem DECISIONS.md/BACKLOG.md. Không coi P2–P13 đã hoàn tất. Yêu cầu repo private cũ trong snapshot dưới đây bị quyết định giữ public thay thế; bảo vệ dữ liệu thật vẫn giữ nguyên.

> Notion AI lập 13/10/2026. Bản đồ 3D khu phố quanh nhà, nhà mình làm tâm. Không ghi secret, API key, token, toạ độ hay địa chỉ nhà vào tài liệu này, Notion hay repo.

## Cập nhật 13/10/2026 — sau khi có vỏ UI

- **P1 xong**: Lovable đã dựng vỏ và sync GitHub (`sovergarden-dev/home-3d`: TanStack Start, bun, React 19, zustand, vitest); bản publish chạy được. Repo giữ **public** theo quyết định mới; chỉ mã nguồn/demo, không dữ liệu thật hoặc cấu hình riêng.
- **Vùng phủ (P0)**: Google Earth không có toà nhà 3D ở khu nhà; Street View có, ảnh 06/2024 (còn nhà cũ). ⇒ Phố mình là lớp chính; Phố thật v1 chỉ mở Google Maps (Street View, vệ tinh) qua đường link (D3).
- **D10 — một tâm cố định**: bản đồ luôn lấy nhà mình làm tâm; bỏ bộ chọn địa điểm "Góc phố".
- **D11 — lô nhà để trống**: nhà cũ đã phá để xây lại. Dựng phố xung quanh trước, không dựng lại nhà cũ; nhà mới thêm sau (P6 khi có file kiến trúc sư, P11 khi xây xong).
- **OSM trong bán kính 300 m**: khoảng 290 nhà, 130 đoạn đường, 200 số nhà, 86 cửa hàng; chỉ 2 nhà có số tầng, không nhà nào có chiều cao; lô nhà mình không có trong OSM. ⇒ Chiều cao lấy từ khảo sát số tầng, Open Buildings bù chỗ thiếu; ranh lô lấy từ bản vẽ (P0).
- **Điều khoản Google**: không nhìn Street View, ảnh vệ tinh hay Google Earth để vẽ lại nhà, đường (cấm tạo nội dung từ nội dung Google Maps, mục 3.2.3(c)); không hiện Street View cùng màn hình với bản đồ không phải Google (mục 3.2.3(e)). Tư liệu dựng phố = video, ảnh bạn tự chụp và dữ liệu mở.
- **Riêng tư**: link Lovable ai có cũng vào; Secrets của Lovable nằm trong Lovable Cloud (đang tắt). ⇒ Bản Lovable chỉ chạy demo; bản riêng tư chạy trên Cloudflare Workers của Syringa, sau Cloudflare Access (D5, D7, P2).
- **P1.1** (Notion AI viết patch, Hermes áp): bỏ bộ chọn địa điểm; sửa lỗi mobile (sheet che nút bản đồ); thêm `AGENTS.md`, `docs/PLAN.md`.
- **Thứ tự mới**: P1.1 → P2 → P3 → P4 → P5 → P7 → P8 → P9 → P10 → P12 → P13. P6 khi có file kiến trúc sư; P11 khi nhà xây xong.

## 0. Tóm tắt 30 giây

- **Hai lớp thế giới, cùng một hệ toạ độ**
  - **Phố mình**: phố voxel/diorama tự dựng từ dữ liệu mở (OpenStreetMap, Overture, Google Open Buildings) cộng khảo sát và ảnh bạn tự chụp. Sở hữu 100 %, tuỳ biến thoải mái, chạy mượt cả trên điện thoại.
  - **Phố thật**: mở Google Maps chính chủ (Street View, ảnh vệ tinh) đúng chỗ và hướng đang xem, qua đường link, không cần key. Khu nhà chưa có 3D photorealistic; khi Google phủ tới thì xét lại (P7).
- **Nhà mình**: tâm cố định của bản đồ. Nhà cũ đã phá để xây lại nên v1 để lô trống → "nhà tương lai" từ file của kiến trúc sư → nhà thật quét từ ảnh khi xây xong.
- **Phân vai**: Lovable dựng vỏ UI (xong) → GitHub → Notion AI viết patch hoặc giao pha cho Hermes qua trang "Bảng giao việc Hermes và Cue" → Hermes áp, chạy kiểm tra, mở PR → Notion AI review, xác nhận → Syringa merge, bấm Publish.
- **Thước đo**: mượt (≥ 55 fps trên điện thoại tốt), chính xác (toạ độ thật, nắng thật, âm lịch Việt), riêng tư (mặc định private).

## 1. Đánh giá ý tưởng

Ý tưởng tốt và làm được. Cần chỉnh 4 điểm trước khi bắt đầu:

1. **Dữ liệu Google chỉ để xem, không để dựng.** Chính sách Map Tiles API cấm pre-fetch, lưu, cache, trích xuất dữ liệu và mọi mục đích ngoài hiển thị. Được đặt model 3D của mình lên Photorealistic 3D Tiles, miễn model không bị trích xuất, trace hay suy ra (bằng tay hay bằng máy) từ 3D Tiles. Đọc và ghi lại số đo (chiều cao, khoảng cách) từ ảnh 3D bằng chương trình cũng bị coi là phái sinh. ⇒ Phố voxel phải dựng từ dữ liệu mở và khảo sát của bạn. Street View, ảnh vệ tinh, Google Earth cũng vậy: không nhìn để vẽ lại nhà, đường. Google chỉ là lớp "nhìn thật" mở riêng.
2. **Các web trong ảnh mẫu là phố voxel dựng tay/procedural**, không phải dữ liệu Google đổi sang voxel. Độ "xịn" đến từ art direction: bảng màu, ánh sáng, đạo cụ đặc trưng Sài Gòn, âm thanh, chuyển động.
3. **Lovable chỉ nên dựng vỏ UI.** Lovable mạnh ở giao diện React; 3D, hiệu năng và pipeline dữ liệu để Hermes làm. Dự án Lovable mới dùng TanStack Start (SSR) chạy trên Cloudflare Workers, nên engine 3D phải chạy phía client. Lovable bắt buộc commit `.env`, nên toạ độ nhà và key không được nằm trong `.env`.
4. **Riêng tư.** Web lấy nhà làm tâm là công khai vị trí nhà, lại đang xây (hay vắng người, có vật tư). Link Lovable mặc định ai có link cũng vào được; giới hạn người xem cần gói Business. ⇒ Mặc định private: bản Lovable chỉ chạy demo, bản riêng tư chạy sau Cloudflare Access (D5); bản public (nếu có) ẩn nhãn "Nhà mình", ẩn lô nhà và nhật ký xây nhà, xoá EXIF/GPS trong ảnh, không công bố mặt bằng nội thất.

Tin tốt:

- Street View chính thức trở lại Việt Nam từ 06/2025, có cả ảnh trekker ở một số hẻm xe hơi không vào được.
- Google 3D Maps (Maps JavaScript) có `gmp-flattener` làm phẳng một vùng mesh để chừa chỗ đặt model riêng: chỉ cần nếu sau này khu nhà có 3D photorealistic.
- Google Research có **Open Buildings 2.5D Temporal** (CC BY 4.0): chiều cao nhà theo từng năm 2016–2023, phủ Đông Nam Á. Đây là dữ liệu "của Google" được dùng hợp lệ để dựng phố.
- Đã kiểm tra (P0): khu nhà chưa có 3D photorealistic, Street View có ảnh 06/2024. Phố mình không bị ảnh hưởng.
- Google Maps URLs mở Street View hoặc ảnh vệ tinh đúng chỗ và hướng nhìn, không cần API key: đủ cho Phố thật v1.

## 2. Quyết định (mặc định đề xuất, đổi được)

| # | Quyết định | Mặc định | Lý do |
|---|---|---|---|
| D1 | Phong cách | Voxel ấm (như ảnh 1–3) làm chính; chế độ Diorama (như ảnh 4) dùng chung asset | Một bộ asset, hai cách nhìn |
| D2 | Phạm vi | Bán kính 300 m quanh nhà (v1), 600 m (v2); ngoài rìa là sương và khối giản lược | Giữ ngân sách mobile, đủ "khu mình" |
| D3 | Phố thật | Nút mở Google Maps (Street View, vệ tinh) qua Maps URLs, không nhúng vào app; xét 3D Tiles khi Google phủ 3D tới khu nhà (P7) | Khu nhà chưa có 3D; điều khoản cấm hiện Street View cùng màn hình với bản đồ không phải Google; không cần key, không tốn phí |
| D4 | Hiển thị | Private-first; public chỉ sau checklist riêng tư | Nhà đang xây |
| D5 | Hosting | Lovable cho bản demo (không dữ liệu thật); bản riêng tư: cùng bản build chạy trên Cloudflare Workers của Syringa, sau Cloudflare Access; asset trên R2 | Link Lovable ai có cũng vào; build của repo vốn ra Cloudflare Worker; R2 không tính phí băng thông ra |
| D6 | Engine | three.js + React Three Fiber, WebGL2 làm nền; xét WebGPU sau P12 | Hệ sinh thái chín, AI viết tốt |
| D7 | Cấu hình riêng | Toạ độ nhà, polygon lô (và key nếu có) lấy lúc chạy: server function đọc Worker secret của bản riêng tư, chỉ trả sau Cloudflare Access; thiếu thì chạy chế độ demo | `.env` của Lovable phải commit; Secrets của Lovable cần bật Lovable Cloud |
| D8 | Tên app | "Phố Nhà Mình" (tạm) | Đổi lúc nào cũng được |
| D9 | Ngôn ngữ | Tiếng Việt mặc định, có tiếng Anh | |
| D10 | Tâm bản đồ | Một tâm cố định: nhà mình. Không có bộ chọn địa điểm; nút "Về nhà mình" đưa camera về tâm | Dự án xoay quanh đúng một ngôi nhà |
| D11 | Lô nhà | Để trống; dựng phố xung quanh trước; không dựng lại nhà cũ; nhà mới thêm ở P6, P11 | Nhà cũ đã phá để xây lại |

## 3. Kiến trúc

### Nguyên tắc vàng

1. **Dồn việc nặng vào lúc tải và offline.** Pipeline dựng sẵn, nén sẵn. Lúc tải: precompile shader cho mọi trạng thái (đêm, mưa, lễ hội), upload GPU, dựng BVH. Lúc dùng: chỉ render. Đúng yêu cầu "lần đầu load lâu cũng được, dùng phải mượt".
2. **Một hệ toạ độ duy nhất** cho Phố mình, Phố thật, ảnh và kỷ niệm.
3. **Một nguồn trạng thái duy nhất**: UI và engine chỉ nói chuyện qua store.
4. **Mọi thứ có ngân sách đo được** (mục 5); vượt ngân sách là chưa xong.
5. **Riêng tư mặc định; Google chỉ để xem.**

### Sơ đồ

```text
UI overlay (React, Tailwind, shadcn — Lovable)
        │ đọc/ghi
        ▼
appStore (zustand) — nguồn trạng thái duy nhất
        │ subscribe
        ▼
Engine 3D (React Three Fiber, chỉ chạy phía client)
  ├─ world/       Phố mình: stream chunk, LOD, chọn nhà
  ├─ house/       lô nhà: trống → nhà tương lai → nhà thật
  ├─ atmosphere/  nắng thật, bầu trời, thời tiết, mùa, lễ hội, hậu kỳ
  ├─ life/        xe cộ, người, hàng rong, âm thanh
  ├─ reality/     link mở Google Maps: Street View, vệ tinh (chỉ khi bấm)
  ├─ stories/     góc kỷ niệm, tour, bưu thiếp
  └─ quality/     tier, đo hiệu năng, thích ứng
        │ tải asset
        ▼
manifest.json + GLB / 3D Tiles / âm thanh / ảnh trên R2
(Service Worker chỉ cache asset của mình)
        ▲
pipeline/ (offline, Node/TS): OSM + Overture + Open Buildings + khảo sát → chunk GLB / 3D Tiles
```

### Hệ toạ độ

- Đơn vị mét. Gốc (0, 0, 0) = tâm lô nhà, cao độ mặt đường trước nhà.
- three.js Y-up: +X = Đông, +Y = Lên, −Z = Bắc.
- Chuyển đổi WGS84 ↔ ECEF ↔ ENU tính chính xác trên ellipsoid, chỉ ở `src/geo/` (pipeline dùng chung code).
- Repo chỉ chứa toạ độ ENU tương đối; gốc lat/lng nằm trong cấu hình riêng (D7).

### Bậc chất lượng

Tự chọn theo GPU, rồi điều chỉnh theo FPS đo thực; người dùng đổi được.

| Tier | Máy mục tiêu | DPR tối đa | Bóng | AO | Hậu kỳ | Xe/người | FPS |
|---|---|---|---|---|---|---|---|
| low | điện thoại cũ | 1.0 | bóng giả + AO nướng sẵn | nướng sẵn | không | ≤ 60 | ≥ 30 |
| mid | điện thoại tốt | 1.5 | 1 shadow map bám camera | nướng sẵn | bloom nhẹ | ≤ 200 | ≥ 55 |
| high | laptop, PC | 2.0 | cascaded shadow | N8AO | bloom, SMAA, tilt-shift | ≤ 800 | 60 |
| ultra | PC mạnh | 2.0 | cascaded, độ phân giải cao | N8AO đầy đủ | thêm phản chiếu đường ướt, tia nắng | ≤ 2000 | 60 |

## 4. Stack và thư viện

| Vai trò | Chọn | Ghi chú |
|---|---|---|
| Khung app | Mặc định của Lovable (dự án mới: TanStack Start, React, TypeScript, Tailwind, shadcn/ui) | Giữ nguyên để sync |
| 3D | three, @react-three/fiber, @react-three/drei | Major của fiber/drei khớp React trong repo |
| Trạng thái | zustand | `src/state/appStore.ts` |
| 3D Tiles | 3d-tiles-renderer (NASA-AMMOS) | Tileset của mình (Google tiles chỉ khi khu nhà có 3D); có component R3F |
| Camera | camera-controls (qua `CameraControls` của drei) | Quán tính, giới hạn, cảm ứng |
| Hậu kỳ | postprocessing, @react-three/postprocessing, n8ao | Bật theo tier |
| Va chạm, raycast | three-mesh-bvh | Đi bộ, chọn nhà |
| Mặt trời, mặt trăng | suncalc | Đối chiếu NOAA |
| Âm lịch | Thuật toán Hồ Ngọc Đức, múi giờ +7 | Không dùng lịch Trung Quốc (+8) |
| Thời tiết thật | Open-Meteo | Không cần key |
| Âm thanh | Web Audio API (hoặc howler) | Phát sau thao tác đầu tiên |
| Gaussian splat (tuỳ chọn) | Spark (@sparkjsdev/spark) | Bản "ảnh thật" của nhà |
| PWA | vite-plugin-pwa / Workbox | Chỉ cache asset của mình |
| Pipeline | Node/TS: osmtogeojson, @turf/turf, three (headless), @gltf-transform, meshoptimizer, KTX-Software; DuckDB hoặc overturemaps CLI; Earth Engine hoặc HDX cho chiều cao | `pipeline/package.json` riêng |
| Kiểm thử | vitest, @playwright/test, size-limit, gitleaks | |
| Đo hiệu năng | detect-gpu; r3f-perf hoặc stats-gl (chỉ dev) | |

## 5. Ngân sách hiệu năng

| Chỉ số | low | mid | high |
|---|---|---|---|
| Draw calls | ≤ 120 | ≤ 200 | ≤ 400 |
| Tam giác hiển thị | ≤ 400k | ≤ 800k | ≤ 3M |
| Bộ nhớ GPU ước tính | ≤ 200 MB | ≤ 350 MB | ≤ 1 GB |
| Frame time p95 khi xoay/zoom | ≤ 33 ms | ≤ 18 ms | ≤ 16,7 ms |
| Frame dài nhất khi đang thao tác | ≤ 50 ms | ≤ 50 ms | ≤ 33 ms |

- JS của vỏ ≤ 250 KB gzip; engine tách chunk, lazy-load.
- Lần đầu: vỏ và splash dưới 2 s; quanh nhà (lô nhà + 9 chunk gần nhất) dưới 8 s trên 4G; phần còn lại tải nền.
- Lần sau: dưới 2 s nhờ Service Worker cache asset có hash.
- Dùng liên tục 30 phút trên iPhone tầm trung không crash; đổi chế độ 20 lần, bộ nhớ tăng dưới 10 %.
- Mất WebGL context (iOS khi chuyển app) tự khôi phục. Không có WebGL2: hiện ảnh/video tĩnh và thông báo.

## 6. Lộ trình theo pha

Mỗi pha là một hoặc vài PR. Cỡ tương đối: S, M, L. **MVP đẹp = P1 → P5** (lô nhà để trống, đã có nắng thật từ P3); tiếp theo P7 (link Phố thật), rồi P8 → P10 là phần "sống động"; P6 khi có file kiến trúc sư.

### P0 — Chuẩn bị (Syringa, không code)

- **Mục tiêu**: chốt D1–D11; có tài khoản và dữ liệu thật để làm.
- **Đầu vào**: tài liệu này.
- **Phạm vi**:
  1. ✅ Kiểm tra vùng phủ (13/10/2026): Google Earth không có toà nhà 3D ở khu nhà; Street View có, ảnh 06/2024 (còn nhà cũ).
  2. Google Cloud: **chưa cần** (Phố thật v1 chỉ là link Google Maps, không key). Khi nào nhúng 3D Tiles mới làm: project riêng cho app (không dùng chung Syrin); bật billing, Map Tiles API, Maps JavaScript API; 2 key dev (chỉ localhost, quota thấp) và prod (chỉ domain thật); giới hạn API, quota ngày, budget alert. Key không đưa vào chat, Notion hay repo.
  3. Cloudflare: Worker cho bản riêng tư, bật Cloudflare Access (chỉ email người nhà); R2 bucket cho asset, không public, đọc qua Worker. Token chỉ bạn giữ.
  4. Khảo sát (sáng sớm, nắng nhẹ, ít xe): quay video 4K đi chậm hai bên mọi phố/hẻm trong bán kính; chụp thẳng từng mặt tiền; ghi số tầng từng nhà (OSM gần như không có), màu, mái, bảng hiệu, cây, cột điện. Lưu trong thư mục riêng, không vào repo.
  5. Thu âm phố 4 khung: sáng chợ, trưa, mưa, khuya (5–10 phút mỗi khung).
  6. Xin kiến trúc sư file 3D nhà mới (SketchUp, Revit, IFC hoặc OBJ) cùng mặt bằng, mặt đứng và bản vẽ định vị lô (kích thước, hướng, cao độ nền): OSM không có lô nhà mình.
  7. Viết danh sách 10–20 "góc kỷ niệm": tên, vì sao nhớ, ảnh cũ nếu có.
- **Xong khi**: D1–D11 chốt; Worker có Access và R2 sẵn; dữ liệu khảo sát, âm thanh, bản vẽ lô nằm trong thư mục riêng (file 3D của kiến trúc sư có thể đến sau).
- **Ràng buộc**: không dùng ảnh chụp màn hình Google làm tư liệu dựng; không gửi toạ độ, địa chỉ nhà vào chat, Notion, repo.

### P1 — Lovable dựng vỏ UI (Cỡ S) ✅

- **Mục tiêu**: repo chuẩn Lovable, giao diện overlay đẹp cho cả desktop và mobile, tốn ít credit nhất.
- **Đầu vào**: prompt ở mục 8.
- **Phạm vi/Đầu ra**: overlay, store, i18n, splash, dữ liệu mẫu; kết nối GitHub (repo private).
- **Xong khi**: preview đúng trên desktop và điện thoại; GitHub đã sync; từ đây ngừng sửa trên Lovable trừ khi cần chỉnh UI lớn.
- **Ràng buộc**: 1 tin nhắn Build (tối đa 2); không bật Lovable Cloud; không bấm "Try to fix" lặp lại — lỗi để Hermes sửa.
- **Kết quả (13/10/2026)**: repo `sovergarden-dev/home-3d`, bản publish chạy được. Lệch so với yêu cầu: repo đang public; có bộ chọn địa điểm; trên mobile sheet che nút bản đồ (hai lỗi sau sửa ở P1.1); badge "Edit with Lovable" che tab dưới trên mobile (ẩn trong Project settings, gói Pro trở lên).

### P1.1 — Sửa vỏ: một tâm, lỗi mobile, tài liệu (Notion AI viết patch, Hermes áp; Cỡ S)

- **Mục tiêu**: vỏ đúng D10; mobile không bị che nút; repo có `AGENTS.md` và `docs/PLAN.md` cho Hermes.
- **Phạm vi**:
  - Bỏ tab "Góc phố", `PlacesPanel`, `src/data/places.ts`, `selectedPlaceId`, `selectPlace`. Nhãn trên cùng luôn là "Nhà mình"; nút đặt lại thành "Về nhà mình" (zoom 1, hướng Bắc); dock mở sẵn tab "Thời gian".
  - Mobile: khi sheet kéo lên nửa hoặc gần hết màn hình thì ẩn cụm nút bản đồ (không bấm nhầm, không nằm lẫn dưới kính mờ); sheet về mức thấp thì hiện lại.
  - `AGENTS.md`: giữ nguyên khối LOVABLE và "Project rules" do Lovable tạo, thêm hướng dẫn cho agent. `docs/PLAN.md`: bản sao trang này.
  - Test `src/test/fixed-home.test.tsx` khoá các hành vi trên.
- **Xong khi**: `bunx tsc --noEmit`, `bun run test`, `bun run build` đạt; lint không tệ hơn main; Notion AI xác nhận; Syringa merge; Lovable nhận commit, bấm Publish.
- **Ràng buộc**: repo giữ public theo quyết định mới; không dữ liệu thật/cấu hình riêng; không sửa gì ngoài patch; không sửa trên Lovable khi PR đang mở.

### P2 — Nền repo và CI (Hermes, Cỡ M)

- **Mục tiêu**: repo có quy tắc, kiểm thử, CI và khung thư mục cho engine, pipeline mà không phá sync với Lovable.
- **Đầu vào**: repo sau P1.1 (đã có `AGENTS.md`, `docs/PLAN.md`).
- **Phạm vi**:
  - Thêm `docs/DECISIONS.md` (ADR, ghi cả D10, D11), `docs/ATTRIBUTION.md`, `docs/BACKLOG.md`.
  - Script (chạy bằng bun): `typecheck`, `lint`, `test`, `test:e2e`, `build`, `check`. Một commit riêng chỉ chạy Prettier toàn repo (lint đang đỏ sẵn từ bản Lovable) rồi mới đưa `lint` vào `check`.
  - TypeScript strict cho thư mục mới (`src/engine`, `src/geo`, `src/state`, `src/config`, `pipeline`) qua tsconfig riêng; không ép code Lovable cũ.
  - Vitest (coverage ≥ 85 % cho `src/geo`, `src/state`, logic mô phỏng); Playwright smoke (chromium, firefox, webkit; viewport desktop, iPhone, Android); size-limit; gitleaks.
  - GitHub Actions: `quality` chạy khi mở PR; `e2e-full-chromium`, `e2e-full-firefox`, `e2e-full-webkit` chạy tay (`workflow_dispatch`), đặt tên giống Syrin để dùng chung quy tắc trên Bảng giao việc. Phút Actions của repo private có hạn, nên việc nặng chạy trên máy Syringa trước.
  - Cấu hình runtime fail-closed (zod): thiếu cấu hình riêng thì app chạy "chế độ demo" (gốc giả, tắt Phố thật) và báo rõ.
  - Bản riêng tư (làm trước khi có dữ liệu thật): script `deploy:private` đưa bản build (`.output/server`, đã có sẵn `wrangler.json`) lên Cloudflare Workers của Syringa; hướng dẫn Syringa bật Cloudflare Access (chỉ email người nhà) và đặt secret. Server function chỉ trả cấu hình riêng khi request có JWT Access hợp lệ; bản Lovable luôn chạy demo.
  - `robots.txt` chặn toàn bộ; thẻ `noindex` cho mọi trang.
  - Giờ Việt Nam: thứ trong tuần và "Giờ thật" tính theo `Asia/Ho_Chi_Minh`, không theo múi giờ của máy hay server.
  - Chia 2–3 PR cho dễ review: (1) Prettier, script, CI; (2) cấu hình runtime, bản riêng tư, noindex; (3) múi giờ, khung thư mục.
  - Khung thư mục (mục 7); `pipeline/` có `package.json` riêng.
- **Xong khi**: `check` xanh trên máy và CI; build production giống Lovable chạy sạch; Syringa xác nhận preview Lovable vẫn chạy sau merge; gitleaks sạch; bản riêng tư chỉ mở sau khi đăng nhập Access, bản Lovable không trả cấu hình riêng.
- **Ràng buộc**: giữ cấu trúc và package manager của Lovable (bun, không thêm lockfile khác); không thêm dependency của pipeline vào root; không tạo `.hermes.md` (Hermes sẽ ưu tiên nó và bỏ qua `AGENTS.md`).

### P3 — Lõi 3D, hệ toạ độ, camera, nắng thật (Hermes, Cỡ M)

- **Mục tiêu**: canvas 3D mượt trên mọi thiết bị, đúng hệ toạ độ thật, mặt trời đúng giờ đúng chỗ.
- **Phạm vi**:
  - Cài three, R3F, drei; `SceneViewport` chỉ render phía client (lazy import trong `ClientOnly` hoặc route client-only).
  - `src/geo/`: WGS84 ↔ ECEF ↔ ENU, test với điểm tham chiếu (sai số dưới 1 cm trong 2 km).
  - Cảnh demo: đế diorama, lưới mặt đất, mốc "Nhà mình" ở gốc, mũi tên Bắc; tone mapping AgX, color management đúng.
  - Camera Diorama: orbit quanh nhà (gốc ENU), giới hạn góc 20°–75°, khoảng cách 30–1200 m, biên theo bán kính, quán tính mượt. Cảm ứng: 1 ngón xoay, 2 ngón chụm zoom và kéo, chạm đúp để bay tới điểm. Phím WASD/mũi tên. Nút "Về nhà mình" (`resetView` của store). `touch-action: none` trên canvas.
  - Tier chất lượng (detect-gpu + FPS đo thực, DPR thích ứng); render theo nhu cầu khi đứng yên; dừng khi tab ẩn; xử lý mất context.
  - HUD đo (`?debug=1`): FPS, frame time p95, draw calls, tam giác, texture, bộ nhớ.
  - Mặt trời: suncalc theo toạ độ nhà và ngày giờ đang chọn → hướng, màu nắng, bầu trời.
- **Xong khi**: ≥ 55 fps ở tier mid với cảnh demo; cảm ứng tự nhiên, không xung đột cuộn/zoom trang; azimuth và độ cao mặt trời lệch dưới 0,5° so với NOAA ở 3 ngày thử.
- **Ràng buộc**: chưa gọi Google; chưa có asset nặng.

### P4 — Pipeline dữ liệu v1 (Hermes, Cỡ L)

- **Mục tiêu**: từ dữ liệu mở ra bộ dữ liệu sạch quanh nhà, kèm lớp chỉnh tay.
- **Đầu vào**: gốc, bán kính và polygon lô (từ cấu hình riêng); OSM qua Overpass; Overture (buildings, transportation, places); Google Open Buildings 2.5D Temporal (Earth Engine hoặc bản tải HDX); ghi chú khảo sát.
- **Phạm vi**:
  - Lệnh: `fetch-osm`, `fetch-overture`, `fetch-heights`, `normalize`, `lots`, `roads`, `props`, `report`.
  - Gộp footprint theo ưu tiên khảo sát > OSM > Overture > Open Buildings; sửa topology; khử trùng lặp.
  - Lô nhà mình (D11): bỏ mọi footprint, chiều cao, đạo cụ nằm trong polygon lô (OSM, Overture, Open Buildings 2016–2023 vẫn còn nhà cũ); xuất lô thành nền trống.
  - Chiều cao theo ưu tiên: khảo sát > `height` hoặc `building:levels` của OSM > Open Buildings (trung vị trong footprint, năm mới nhất) > mặc định theo loại (nhà ống 3–4 tầng, 3,3 m/tầng). Khu này OSM gần như không có số tầng, nên khảo sát là nguồn chính.
  - Chia lô: khối lớn bị gộp → lô nhà ống theo mặt tiền (rộng 3,5–6 m, sâu tối đa 20 m), gắn cờ `inferred` để chỉnh tay.
  - Đường: đồ thị liên thông, bề rộng theo loại, vỉa hè, hẻm 2–4 m, vạch qua đường; cây, cột điện, đèn đường từ OSM và khảo sát.
  - Schema `data/overrides/*.json` theo ID ổn định cho chỉnh tay.
  - `docs/ATTRIBUTION.md` và credit trong app: © OpenStreetMap contributors (ODbL), Overture Maps Foundation, Google Open Buildings (CC BY 4.0).
  - Trang xem nhanh 2D (HTML tĩnh) để soát dữ liệu.
- **Xong khi**: phủ 100 % vùng; mọi nhà có chiều cao, số tầng, lô; đồ thị đường liên thông; báo cáo (số lượng, % thiếu dữ liệu, chồng lấn) đạt ngưỡng; bạn soát bản 2D thấy đúng.
- **Ràng buộc**: không dùng nội dung Google Maps, Earth, Street View làm đầu vào dưới bất kỳ hình thức nào; tôn trọng giới hạn Overpass; đầu ra ở `pipeline/out/` (gitignored); script chạy được trên Windows và Linux.

### P5 — Phố mình v1 (Hermes, Cỡ L)

- **Mục tiêu**: phố voxel đẹp, đúng vị trí, chạy mượt — nhìn là nhận ra phố mình.
- **Phạm vi**:
  - Generator có seed cố định, tái lập được: nhà ống (ban công, khung sắt bảo vệ, cửa cuốn, sân thượng, bồn nước inox, máy nước nóng mặt trời, cục nóng máy lạnh, chậu cây, hoa giấy, dàn phơi đồ, bảng hiệu theo tên quán trong OSM/Overture), chung cư, chùa, nhà thờ, trường; cây (me, sao, dầu, bàng, phượng); cột điện và dây điện võng; đèn đường; vỉa hè gạch; vạch kẻ; xe đẩy.
  - Voxel 0,25 m trong 100 m quanh nhà, 0,5 m xa hơn; greedy meshing; màu đỉnh theo bảng màu Sài Gòn (cấu hình được) và AO voxel nướng sẵn, gần như không cần texture.
  - Lô nhà để trống (D11): nền phẳng, viền ranh mảnh, ghim "Nhà mình"; không công trường, không biển "Nhà đang xây".
  - Landmark (chợ, chùa, trường): dựng tay bằng MagicaVoxel/Blender hoặc AI image-to-3D từ ảnh bạn tự chụp, rồi chỉnh cho đồng phong cách.
  - Chunk lưới 64 m, LOD0/LOD1, GLB nén meshopt; xuất 3D Tiles 1.1 (hoặc manifest riêng) để Syringa upload R2.
  - Runtime: stream theo khoảng cách và frustum, ưu tiên quanh nhà; giải nén trong worker; upload GPU rải theo frame; chọn nhà theo ID → thẻ thông tin.
  - Editor (`?editor=1`, chỉ bản private): chọn nhà → sửa tầng, màu, mái, bảng hiệu, đạo cụ → xuất overrides JSON.
- **Xong khi**: toàn vùng hiển thị; lệch vị trí so với OSM dưới 1 m; đạt ngân sách từng tier; bạn duyệt bộ ảnh chuẩn (6 góc × 3 mốc giờ).
- **Ràng buộc**: không hình học nào suy ra từ Google; file trên 1 MB không vào git.

### P6 — Nhà tương lai (Hermes + Syringa, Cỡ M; khi có file kiến trúc sư)

- **Mục tiêu**: khe gắn model có phiên bản trên lô trống (từ P5); xem trước nhà tương lai.
- **Phạm vi**:
  - Cấu hình riêng `house`: polygon lô (ENU), hướng mặt tiền, cao độ nền, trạng thái (`empty`, `future`, `final`), mặc định `empty`.
  - Model kiến trúc sư: SketchUp/Revit → Blender → glTF → tối ưu; tuỳ chọn voxel hoá cho đồng phong cách; công tắc "Hiện tại / Tương lai".
  - Bỏ nội thất, vị trí camera an ninh, két sắt khỏi model trước khi xuất.
- **Xong khi**: model đặt đúng ranh và hướng (lệch dưới 10 cm theo bản vẽ); chuyển trạng thái mượt; bản public không lộ trạng thái "đang xây".

### P7 — Phố thật: mở Google Maps (Hermes, Cỡ S)

- **Mục tiêu**: từ chỗ đang xem trên Phố mình, một chạm mở Street View hoặc ảnh vệ tinh thật của Google, đúng chỗ và hướng nhìn.
- **Phạm vi**:
  - Nút "Phố thật" (thay chế độ xem cùng tên trong vỏ): mở Google Maps ở tab mới, hoặc app Google Maps nếu máy có, qua Maps URLs, không cần key. Street View: `map_action=pano`, `viewpoint` là điểm đang nhìn, `heading` lấy từ camera. Vệ tinh: `map_action=map`, `basemap=satellite`, zoom gần.
  - Chỉ đổi ENU sang lat/lng lúc bấm, ở bản riêng tư (D7); bản demo ẩn nút.
  - Nhắc nhẹ trong app: ảnh của Google có thể cũ (ở lô nhà là ảnh 06/2024, còn nhà cũ).
  - Khi Google phủ 3D tới khu nhà: đọc lại điều khoản (mục 3.2.3(e) cấm dùng dịch vụ Google cùng hoặc cạnh bản đồ không phải Google) rồi mới spike nhúng 3D Tiles (3d-tiles-renderer hoặc `gmp-map-3d` với `gmp-flattener`), tối đa 2 ngày.
- **Xong khi**: chạy trên desktop, iPhone, Android; mở đúng chỗ, hướng lệch dưới 15°; app không gửi request nào tới Google.
- **Ràng buộc**: không nhúng Street View, bản đồ hay ảnh Google vào app; không lưu, cache, đo, trích xuất nội dung Google.

### P8 — Không khí: giờ, thời tiết, mùa, lễ hội (Hermes, Cỡ L)

- **Mục tiêu**: mỗi khoảnh khắc trong ngày và trong năm có "mùi" riêng, đúng thực tế ở khu nhà.
- **Phạm vi**:
  - Giờ thật hoặc thanh trượt; mốc: Sáng sớm, Giờ đi làm, Trưa, Mưa chiều, Hoàng hôn (theo giờ mặt trời lặn thật), Chợ đêm, Khuya, Phố ngủ.
  - Ánh sáng, bầu trời, sương, LUT màu theo độ cao mặt trời; đêm: cửa sổ sáng theo lịch sinh hoạt, đèn đường, đèn xe; pha mặt trăng thật.
  - Thời tiết: Nắng, Nhiều mây, Mưa, Mưa to, Ngập (mặt nước dâng); vật liệu ướt, vũng nước, mưa bằng GPU, bọt nước; tuỳ chọn "Thời tiết thật" (Open-Meteo).
  - Mùa khô, mùa mưa: bảng màu, cây, độ mù.
  - Lễ hội tự động theo âm lịch Việt: Tết (mai, lồng đèn đỏ, cờ), Trung Thu (lồng đèn, đèn ông sao), Giáng sinh, 30/4, 2/9.
  - Precompile shader cho mọi tổ hợp lúc tải.
- **Xong khi**: đổi tuỳ chọn bất kỳ dưới 100 ms, không frame nào quá 50 ms; ngày Tết, Trung Thu đúng lịch Việt 2025–2035 (unit test); bạn duyệt bộ ảnh từng mốc giờ.

### P9 — Sự sống và âm thanh (Hermes, Cỡ L)

- **Mục tiêu**: phố "thở" — có xe, có người, có tiếng.
- **Phạm vi**:
  - Giao thông trên đồ thị đường: xe máy là chủ lực, ô tô, xe buýt, ba gác, xe đạp; bám xe, nhường ở giao lộ; mật độ theo giờ; InstancedMesh và animation trên GPU; LOD.
  - Người đi bộ trên vỉa hè; hàng rong (xe bánh mì, gánh hàng) theo lịch; chó, mèo, gà.
  - Âm thanh từ bản thu của bạn: nền theo giờ và thời tiết; nguồn định vị (quán, chùa, chợ); nút "Tiếng phố"; chỉ phát sau thao tác đầu tiên.
  - Chế độ "Đi bộ" (góc nhìn người, va chạm bằng BVH) và "Ngồi sau xe ôm" (chạy theo tuyến từ nhà ra chợ hoặc trường; kéo hoặc nghiêng điện thoại để nhìn quanh).
- **Xong khi**: số tác nhân co giãn theo tier và vẫn trong ngân sách; âm thanh lặp liền mạch; autoplay trên mobile xử lý đúng.

### P10 — Kỷ niệm, tour, nhật ký xây nhà, bưu thiếp (Hermes, Cỡ M)

- **Mục tiêu**: biến bản đồ thành câu chuyện của riêng bạn.
- **Phạm vi**:
  - Góc kỷ niệm gồm: id, tiêu đề, vị trí ENU, góc camera, chữ, ảnh, âm thanh, ngày, chế độ private hoặc public; ghim và thẻ; tour "Dạo một vòng" theo spline camera; deep link lưu trạng thái camera trên URL.
  - Pipeline ảnh: xoá EXIF/GPS; resize AVIF/WebP (sharp); placeholder mờ; tự soát làm mờ mặt người, biển số, số nhà hàng xóm.
  - Nhật ký xây nhà: mục theo ngày và giai đoạn; thanh thời gian ngay tại lô nhà; trước/sau.
  - Bưu thiếp "Giữ khoảnh khắc": render độ phân giải cao, khung, ngày, tên phường (không ghi địa chỉ); tải về hoặc chia sẻ (Web Share API).
- **Xong khi**: thêm 1 kỷ niệm dưới 2 phút qua editor; test tự động xác nhận ảnh xuất ra không còn GPS; bưu thiếp 4K trên desktop, 2K trên mobile không crash.

### P11 — Nhà thật v2 (Syringa chụp, Hermes tích hợp, Cỡ M)

- **Mục tiêu**: thay lô trống bằng chính ngôi nhà mới.
- **Phạm vi**: quét ngoại thất bằng photogrammetry (RealityScan, Polycam) hoặc Gaussian splat (Scaniverse, Polycam, Postshot); làm sạch trong Blender; 2 biến thể: stylized (voxel/low-poly đồng phong cách) và "ảnh thật" (splat qua Spark).
- **Xong khi**: khớp ranh; splat nén tối đa 30 MB và ≥ 45 fps ở tier mid.
- **Ràng buộc**: chỉ ngoại thất; flycam ở Việt Nam phải xin phép bay.

### P12 — Hoàn thiện hiệu năng, PWA, thiết bị (Hermes, Cỡ M)

- **Mục tiêu**: "hoàn hảo" trên mọi máy trong ma trận thử.
- **Phạm vi**: ma trận thiết bị (Chrome, Edge, Firefox, Safari desktop; iPhone đời cũ và mới; Android tầm trung và yếu); script bench theo đường bay camera cố định → báo cáo JSON (fps p50/p95, draw calls, tam giác, bộ nhớ) so với ngân sách; kiểm rò bộ nhớ; PWA (manifest, icon, offline cho asset của mình, nhắc cập nhật; không đăng ký Service Worker trong iframe preview của Lovable); a11y (bàn phím, giảm chuyển động, phụ đề cho âm thanh); i18n đủ.
- **Xong khi**: mọi ngân sách đạt trên ma trận; Lighthouse cho vỏ: Performance ≥ 90, Accessibility ≥ 95; soak test 30 phút trên iPhone không crash.

### P13 — Phát hành và vận hành (Syringa + Hermes, Cỡ S)

- **Mục tiêu**: đưa lên mạng an toàn, chi phí trong tầm kiểm soát.
- **Phạm vi**:
  - Bản riêng tư trên Cloudflare Workers + Access đã có từ P2. Muốn cả link Lovable cũng riêng tư thì giới hạn website access (gói Business trở lên).
  - Domain riêng cho bản riêng tư (trên Cloudflare); nếu có key Google thì cập nhật referrer và budget alert.
  - Analytics không cookie (ví dụ Cloudflare Web Analytics); log lỗi WebGL không chứa dữ liệu cá nhân.
  - Runbook nội dung trong `docs/`: thêm ảnh, kỷ niệm, cập nhật model nhà, chạy lại pipeline.
- **Xong khi**: checklist riêng tư (mục 10) đạt; chi phí Google ước tính dưới ngưỡng bạn đặt; runbook có trong `docs/`.

## 7. Cấu trúc repo đề xuất

```text
/                        app Lovable (giữ nguyên cấu trúc gốc, kể cả src/routes nếu có)
├─ AGENTS.md
├─ docs/                 PLAN.md, DECISIONS.md, ATTRIBUTION.md, BACKLOG.md, PERF.md
├─ src/
│  ├─ components/overlay/   UI (Lovable)
│  ├─ state/appStore.ts
│  ├─ engine/               world/ house/ atmosphere/ life/ reality/ stories/ quality/
│  ├─ geo/                  frame, wgs84-ecef-enu, sun, lunar
│  ├─ config/               schema cấu hình runtime (zod), chế độ demo
│  ├─ i18n/
│  └─ workers/
├─ pipeline/             package.json riêng; out/ (gitignored)
├─ data/overrides/       chỉnh tay theo ID, toạ độ ENU tương đối
├─ tests/                unit/ e2e/ perf/
└─ .github/workflows/
```

## 8. Prompt cho Lovable

> Đã dùng ở P1 (13/10/2026). Đừng gửi lại cho dự án hiện tại; sửa vỏ qua PR. Khối dưới đã sửa theo D10 và lỗi mobile, để dùng lại nếu phải dựng lại vỏ từ đầu.

Copy nguyên khối dưới vào Lovable ở chế độ Build, gửi 1 lần. Lovable hỏi bật Cloud hay backend thì chọn không. Prompt viết tiếng Anh để Lovable hiểu chính xác (ít phải sửa = ít tốn credit); nhãn giao diện vẫn là tiếng Việt.

```text
Build ONLY the frontend UI shell for "Phố Nhà Mình": a fullscreen interactive 3D map of my neighborhood with my house at the center. Another developer will add the 3D engine later, so do NOT install or write any three.js, WebGL or 3D code. Frontend only: no backend, no Lovable Cloud, no database, no auth, no API keys, no server functions.

LAYOUT
- A fullscreen SceneViewport component as the background placeholder (warm gradient, faint grid, centered text "Bản đồ 3D sẽ hiện ở đây"). Render it client-only. All UI floats above it; empty areas must pass pointer events through to the viewport.
- Top-left: large clock (HH:mm), a line like "Thứ Ba · Nắng nhẹ" (weekday · weather), and the fixed label "Nhà mình". The map always stays centered on my house: never add a place picker, place list or place cards.
- Top-right: "Tiếng phố" sound toggle, VI/EN switch, primary button "Giữ khoảnh khắc".
- Right edge: vertical icon buttons: zoom in, zoom out, reset view ("Về nhà mình"), compass (rotates with heading), view mode switch Diorama / Đi bộ / Phố thật.
- Bottom center: a dock with 4 tabs:
  1. "Thời gian": slider 00:00–23:59; presets 05:30 Sáng sớm, 07:00 Giờ đi làm, 12:00 Trưa, 15:30 Mưa chiều, 18:00 Hoàng hôn, 19:30 Chợ đêm, 23:00 Khuya, 03:00 Phố ngủ; speed Dừng / 1× / 4×; "Giờ thật" toggle.
  2. "Thời tiết": Nắng, Nhiều mây, Mưa, Mưa to; "Thời tiết thật" toggle.
  3. "Lễ hội": Thường ngày, Tết, Trung Thu.
  4. "Kỷ niệm": empty state.
- First-load splash: app name, tagline "Phố nhà mình, một chút thôi.", simulated progress bar, then fade out.

MOBILE (under 768px)
- The dock becomes a draggable bottom sheet (peek / half / full). Controls move to bottom-right above the sheet and hide while the sheet is expanded above peek. Respect safe-area insets, 44px touch targets, no hover-only UI, no page scroll or pinch-zoom over the viewport.

STYLE
- Calm, premium, warm. Cream #F3F1EA, deep green #1F4D3F, terracotta #C2643B. Translucent panels (no backdrop blur over the live 3D canvas), 16px radius, soft shadows.
- Fonts: Be Vietnam Pro for UI, Lora italic for title and tagline.
- Motion 150–250ms, respect prefers-reduced-motion. Keyboard accessible, aria-labels, visible focus.
- Do not generate images.

CODE
- One zustand store at src/state/appStore.ts with: timeOfDayMinutes, timeSpeed, realTimeEnabled, weather, realWeatherEnabled, festival, viewMode, heading, zoom, soundOn, language, loadingProgress, plus actions (resetView returns to the house). Every control reads and writes only this store, so a 3D engine can subscribe later.
- No mock places. Vietnamese by default, dictionaries in src/i18n/vi.ts and src/i18n/en.ts.
- Small typed components in src/components/overlay/. Pages: home and a simple "Giới thiệu" page.
```

## 9. Giao việc cho Hermes

- Kênh: trang "Bảng giao việc Hermes và Cue". Notion AI ghi việc ở "Việc đang mở", kèm patch nếu có; Hermes làm và báo kết quả theo mẫu của trang.
- Việc đầu: **P1.1**, ghi trên Bảng giao việc. Notion AI đã viết và kiểm patch; Hermes áp, mở PR, không merge.
- Sau khi P1.1 merge, giao P2:

```text
Đọc AGENTS.md và docs/PLAN.md. Làm pha P2 đúng phạm vi, chia PR như mục P2 (mỗi PR một nhánh p2-<tên ngắn> từ main mới nhất), dùng bun. Chạy đủ kiểm tra trên máy, mở PR, báo kết quả theo mẫu trên trang Bảng giao việc Hermes và Cue. Không merge. Gặp chỗ mơ hồ hoặc cần quyết định thì dừng và hỏi.
```

- Vòng lặp mỗi pha: Hermes mở PR → Notion AI review (diff + CI) → Syringa merge → Lovable nhận commit trên main → bấm Publish khi muốn đưa lên.
- Lovable hiện "A push to your repository replaced your Lovable work": chọn **Keep repository version**.
- Khi PR đang mở, không sửa trên Lovable để hai bên không lệch nhau.

## 10. Checklist riêng tư và an toàn

- [ ] Repo private. Không có toạ độ, địa chỉ, số nhà, key trong repo, `.env`, Notion, chat.
- [ ] Bản Lovable (link công khai) chỉ chạy demo: không cấu hình riêng, không dữ liệu thật; `robots.txt` chặn, có `noindex`; ẩn badge Lovable nếu gói cho phép.
- [ ] Bản riêng tư sau Cloudflare Access; server function kiểm JWT Access trước khi trả cấu hình riêng.
- [ ] Nếu có key Google (chỉ khi nhúng 3D Tiles): tách dev/prod; giới hạn referrer và API; quota ngày; budget alert.
- [ ] AI không giữ token Google, Cloudflare, R2; Syringa tự upload, publish, đổi cấu hình.
- [ ] Mọi ảnh xuất ra đã xoá EXIF/GPS (có test tự động).
- [ ] Làm mờ mặt người, biển số, số nhà hàng xóm.
- [ ] Không công bố mặt bằng nội thất, vị trí camera an ninh, két.
- [ ] Bản public: không nhãn "Nhà mình", không ghim lô nhà, không nhật ký xây nhà, không kỷ niệm riêng; cân nhắc tắt Phố thật để chặn chi phí.
- [ ] Không cache hay lưu nội dung Google ở bất kỳ đâu.

## 11. Rủi ro và cách giảm

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Vi phạm điều khoản Google (cache, trace, đo, dùng cạnh bản đồ không phải Google) | Bị khoá API hoặc tài khoản | Quy tắc cứng trong AGENTS.md; pipeline không có nguồn Google; Phố thật chỉ là link; review từng PR |
| Hoá đơn Google tăng vọt | Mất tiền | Phố thật dạng link: không gọi API, không tốn phí; nếu sau này nhúng thì quota ngày, budget alert, tắt ở bản public |
| OSM thiếu hoặc sai trong hẻm, gần như không có số tầng | Phố không giống | Khảo sát số tầng từng nhà, editor, overrides; góp lại cho OSM |
| iOS Safari crash vì bộ nhớ | Hỏng trải nghiệm mobile | Ngân sách theo tier; màu đỉnh thay texture; dispose; soak test |
| Lovable và GitHub lệch nhau | Mất code | Chỉ sửa một nơi; mọi thay đổi qua PR; chọn Keep repository version |
| Khu nhà không có 3D photorealistic (đã xảy ra) | Không có lớp 3D thật | Phố mình là lớp chính; Phố thật mở Street View, vệ tinh qua link; xét lại khi Google phủ 3D |
| Repo hoặc link Lovable công khai | Lộ kế hoạch; về sau lộ vị trí nhà | Repo private; bản Lovable chỉ demo, có `noindex`; dữ liệu thật chỉ ở bản sau Cloudflare Access |
| Dữ liệu mở còn nhà cũ ở lô nhà | Dựng lại nhà đã phá | Pipeline bỏ mọi footprint, chiều cao trong polygon lô (P4) |
| Phình phạm vi | Không bao giờ xong | Cổng theo pha; MVP trước; ý mới vào BACKLOG |

## 12. Ý tưởng để sau (BACKLOG)

- "Phố qua các năm": tái hiện nhà cửa mọc lên 2016–2023 từ Open Buildings 2.5D Temporal.
- "Nhà cũ" trong "Phố qua các năm": dựng lại nhà cũ từ ảnh gia đình (không dùng Street View) để xem trước và sau.
- Nhúng Google 3D Tiles khi khu nhà có 3D (xem P7).
- AR: đặt mô hình phố lên bàn (model-viewer: Scene Viewer trên Android, Quick Look trên iOS).
- In 3D mô hình khu phố có nhà mới làm kỷ niệm tân gia.
- Cho người nhà cùng thêm kỷ niệm (cần backend; có thể dùng Supabase).
- Góp dữ liệu hẻm cho OpenStreetMap (chỉ dùng nguồn ảnh được phép, không dùng Google).
- Cảnh mở màn "từ trên cao về nhà".

## 13. Nguồn tham khảo

- [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- [Google Maps Platform Terms of Service (mục 3.2.3)](https://cloud.google.com/maps-platform/terms)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles)
- [Hỏi đáp về Photorealistic 3D Tiles](https://mapsplatform.google.com/resources/blog/commonly-asked-questions-about-our-recently-launched-photorealistic-3d-tiles)
- [Flatten the 3D mesh (Maps JavaScript)](https://developers.google.com/maps/documentation/javascript/3d/mesh-flattening)
- [3D Maps: Models](https://developers.google.com/maps/documentation/javascript/3d/models)
- [Google Street View returns to Vietnam](https://virtualstreets.org/index.php/2025/06/29/google-street-view-returns-to-vietnam/)
- [Open Buildings 2.5D Temporal](https://sites.research.google/gr/open-buildings/temporal/)
- [Open Buildings 2.5D Temporal trên HDX](https://data.humdata.org/dataset/google-open-buildings-temporal)
- [Overture: Buildings](https://docs.overturemaps.org/guides/buildings)
- [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS)
- [Spark](https://sparkjs.dev/)
- [Lovable: GitHub sync](https://docs.lovable.dev/integrations/github)
- [Lovable: Secrets và .env](https://docs.lovable.dev/features/secrets)
- [Lovable: Hosting và quyền xem](https://docs.lovable.dev/features/hosting)
- [Lovable: Project settings (ẩn badge)](https://docs.lovable.dev/features/projects/settings)
- [Lovable: TanStack Start](https://lovable.dev/blog/building-apps-using-tanstack-start)
- [Cloudflare: Access cho workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Cloudflare Access: kiểm JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare Workers: Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Hermes Agent: Context files](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/context-files.md)
