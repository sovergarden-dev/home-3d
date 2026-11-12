# Home 3D ("Phố Nhà Mình") — Bàn giao tiếp quản cho đội ngũ Grok

- **Mốc mã nguồn đã chạy cổng:** commit runtime `3ac12db4b7ce6d0d5eb9059661a7f4f4c6b6840a` trên nhánh `codex/real-neighborhood-canonical`; commit bàn giao tài liệu nằm ngay kế tiếp và được gắn tag `handoff/2026-11-11-grok` (`git rev-parse handoff/2026-11-11-grok^{commit}`).
- **Thứ tự ưu tiên tài liệu:** Nếu có mâu thuẫn với `docs/CODEX_HANDOFF.md` hoặc `AGENTS.md` §2 về phạm vi dữ liệu thật, tài liệu này thắng cho phạm vi bàn giao ngày 11–12/11/2026.
- **Nền gốc đóng băng trước đó:** `origin/main` = `6e6348694e2aa939eeb82b288662f4b0e6403510`, tag ứng dụng `audit/2026-11-11` (`087884e14bd2364542aa785387ae3f7f8d9e0add` -> `e4a9b9b3b45680d56ba1415965ad85f3e9a0e1fa`) và tag biên nhận `audit/2026-11-11-receipts` (`5ded3f26b88866ed1d4a48e7ae8c22fef260bd92` -> `6e6348694e2aa939eeb82b288662f4b0e6403510`). **Tuyệt đối không sửa hoặc di chuyển hai tag `audit/*` này.**

## 1. Quyền hạn và ranh giới cứng

Chủ dự án (Syringa) cấp quyền cho đội ngũ Grok tiếp quản toàn bộ kỹ thuật: làm việc trên nhánh cục bộ/bundle, sửa code/test/docs, tạo PR nội bộ và đọc/cập nhật Notion của dự án `sovergarden-dev/home-3d`. Việc đẩy nhánh chứa dữ liệu thật lên remote public hoặc merge vào `main` trên GitHub cần một dòng xác nhận bằng văn bản riêng từ chủ dự án về việc chuyển repo sang private hoặc đồng ý công bố trên public GitHub.

### Quy tắc bắt buộc không được vi phạm

1. **Không Publish / không deploy lên production (`nhacvl.lovable.app`):** Chủ dự án giữ quyền Publish/deploy; chỉ phát triển và kiểm thử ở nhánh/PR và môi trường local/CI cho đến khi chủ dự án cho phép phát hành riêng bằng văn bản. Không bật Lovable Cloud, không đổi cài đặt visibility/DNS/Cloudflare.
2. **Không tự ý push/merge tọa độ lên GitHub public:** `sovergarden-dev/home-3d` hiện là repo public. Dù chủ dự án cho phép nhúng snapshot OSM + companion G1 vào app vì đây là nhà đang xây để cho thuê, việc đẩy lịch sử git lên remote public là không thể đảo ngược. Khi chưa có xác nhận rõ của chủ dự án (chuyển repo sang private hoặc đồng ý public), chỉ làm việc trên nhánh cục bộ từ `home-3d-handoff.bundle` và không push `codex/real-neighborhood-canonical` lên remote public hay merge vào `main`.
3. **Phạm vi dữ liệu khu phố thật (cập nhật 11/11/2026):**
   - Căn nhà tâm điểm là **nhà đang xây để cho thuê**, không phải nơi ở hiện tại của chủ dự án; chủ dự án đã cho phép dùng snapshot OSM + companion G1 thật trong repo/build.
   - Dữ liệu hiện tại (`src/world/data/homeNeighborhood.json` và `.georef.json`): `138` đường, `317` building footprints (OSM ODbL 1.0), `0` lots/trees/props; chiều cao tường chỉ là `inferred`; tâm mới ở trạng thái `provisionally-accepted`.
   - Giữ `verificationStatus: "REAL_WORLD_NOT_VERIFIED"` cho đến khi chủ dự án cung cấp số đo/bản vẽ/ảnh khảo sát thực địa và nghiệm thu. Không tự ý bịa hoặc suy diễn ranh lô, hình khối căn nhà mới, hay cao độ thật.
   - **Cấm tuyệt đối Google Maps / Street View geometry:** Không trace, đo, chụp, cache hay dựng model 3D từ Google Maps, Street View, ảnh vệ tinh Google Earth hoặc 3D Tiles. Chỉ mở link Google Maps qua nút "Phố thật".
   - **Bảo vệ hash G1:** `homeNeighborhood.georef.json` khóa cứng `sha256(JSON.stringify(JSON.parse(file)))` (KHÔNG phải `sha256sum` byte thô của tệp) tại `cd4f0146fd3399d0995111bd19a46751c86e0347a56d3e2a770a4832852a7ce3`, kèm `origin` đã được chủ dự án phê duyệt (không phải rò rỉ nhầm — không tự ý xóa `origin` hay `.georef.json`). Tuyệt đối không chạy Prettier/formatter lên `src/world/data/*.json` (đã thêm vào `.prettierignore`). Lệnh kiểm tra đúng: `node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(JSON.stringify(JSON.parse(f.readFileSync('src/world/data/homeNeighborhood.json','utf8')))).digest('hex'))"`
4. **Vệ sinh repo, công cụ & riêng tư hạ tầng:** Dùng Bun-only (`bun.lock`, không `npm install`); `.env` được commit có chủ đích và chỉ chứa biến công khai (không thêm secret vào `.env`). Không đưa đường dẫn máy cá nhân (`<user-home>/...`, `/home/...`), username, hostname, email cá nhân, ảnh riêng chưa kiểm duyệt, hoặc secret/token vào repo, commit, log, hay QA artifact. Không force-push `main`.
5. **Trung thực kiểm thử:** Giữ đúng các nhãn `PASS`, `FAIL`, `SKIP`, `NOT_VERIFIED`. Skip WebGL2 (ví dụ Firefox CI thiếu WebGL2) **không** phải pass. Không nới lỏng assertion để che bug.

## 2. Những gì đã hoàn tất trên nhánh `codex/real-neighborhood-canonical`

1. **Nạp dữ liệu canonical OSM + G1 (`3ac12db`):**
   - Tách `mode: "home"` khỏi `mode: "fixture"` trong `src/world/schema.ts`, `src/world/privateWorldSession.ts`, `src/world/homeWorldSession.ts`, `src/memories/session.ts`. Fixture `SYNTHETIC_NEIGHBORHOOD` vẫn được giữ riêng cho unit tests và editor preview.
   - Giữ nguyên byte gốc `src/world/data/homeNeighborhood.json` (`739.985 B`) và `src/world/data/homeNeighborhood.georef.json` (`162 B`), khóa hash kiểm chứng tự động trong `src/test/fixed-home.test.tsx`.
   - Cập nhật nhãn UI (`Nhà của tôi · đang xây để cho thuê` / `My house · under construction for rent`), mô tả tình trạng chưa khảo sát, và ghi công bắt buộc `© OpenStreetMap contributors` (`https://www.openstreetmap.org/copyright`) trong `src/components/overlay/TopInfo.tsx`, `src/config/site.ts`, `src/i18n/{vi,en}.ts`, `docs/ATTRIBUTION.md`.
2. **Khung camera và mặt nền theo bounds thật (`src/engine/demoScene.ts`):**
   - Xuất `worldCameraFrame(world)` tính `span`, `radius` (> 800 m), `groundSize`, `maxDistance` (> 380 m), `farPlane` theo extent thực tế của 138 đường + 317 công trình mà không làm lệch gốc tọa độ G1 `(0, 0)`. Unit test khóa tại `src/test/worldHomeCentre.test.ts`.
3. **Sửa lỗi treo trình duyệt khi khởi tạo mô phỏng sự sống (`src/engine/life/simulation.ts`):**
   - _Nguyên nhân gốc đã bắt bằng CDP Debugger:_ Trên dữ liệu thật (`257` graph edges dài `13.297 m`, `317` buildings), `createLifeSimulation()` -> `suitable()` -> `safeAt()` duyệt tuyến tính tất cả `solids` ở từng điểm bước `1 m` × `10 kinds × 2 hướng` (~425 triệu lượt `inGeometry()` đồng bộ trên main thread), làm trình duyệt treo cứng ở màn hình splash 85% (~8,4 s trên Bun JIT, >60 s trên SwiftShader/DevTools).
   - _Cách xử lý:_ Tính sẵn `surfaceBounds(geometry)` cho mỗi solid một lần khi khởi tạo và lọc AABB (`isBoxDisjoint`) trước khi gọi `inGeometry()`. Giảm >99% số lượt kiểm tra đa giác, giữ tương đương hành vi 100% (kể cả polygon lõm/có lỗ/MultiPolygon/empty ring). Thời gian `createLifeSimulation(HOME_NEIGHBORHOOD, 1)` đo trên Bun 1.4.3 `WINDOWS_LOCAL` giảm còn **~288,9 ms**. Có regression test tại `src/test/p9-life-clearance.test.ts`.

## 3. Hiện trạng kiểm chứng (trung thực theo từng cổng)

| Hạng mục                                                | Trạng thái                                | Chi tiết đo đạc & môi trường                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check` (tại `3ac12db`)                         | **PASS**                                  | `tsc --noEmit` 0 lỗi; ESLint + Prettier 0 lỗi; Vitest 70 files / 436 tests pass + `p9-life-performance` pass (`0,099 ms` p50 / `0,237 ms` p95); coverage ratchet pass (`simulation` 89,31% lines / 77,6% branches); pipeline 10 files / 50 tests pass; Vite client/SSR/Nitro Cloudflare build + PWA pass; `check:bundle` shell gzip `123.515 / 250.000 B`. |
| `check:secrets` (`gitleaks`)                            | **PASS**                                  | Quét 188 commits (~14,91 MB), `no leaks found`.                                                                                                                                                                                                                                                                                                            |
| G1 SHA-256 binding                                      | **PASS**                                  | `sha256(JSON.stringify(homeNeighborhood))` khớp `packageSha256` (`cd4f0146...`).                                                                                                                                                                                                                                                                           |
| Chromium E2E: `fixed-home-render.spec.ts`               | **PASS**                                  | `WINDOWS_LOCAL` + SwiftShader (`REQUIRE_WEBGL2=1`), `40,6 s`, `colorBins: 90`, `nonBackground: 18827`.                                                                                                                                                                                                                                                     |
| Chromium E2E: `fixed-home-scene.spec.ts`                | **PASS**                                  | `WINDOWS_LOCAL` + SwiftShader (`REQUIRE_WEBGL2=1`), `41,1 s`, ổn định geometry qua 3 vòng Plan/Diorama.                                                                                                                                                                                                                                                    |
| Chromium E2E: `fixed-home.spec.ts`                      | **PARTIAL (4 pass / 1 fail / 2 not run)** | 4 test đầu pass (`41,0 s`, `40,7 s`, `39,8 s`, `1,5 s`). **FAIL** ở test 5 (`portrait and short-landscape`, dòng 154: `overlaps(result.info, result.dock)` trả `true`). 2 test cuối chưa chạy.                                                                                                                                                             |
| Chromium E2E: `fixed-home-recovery.spec.ts`             | **FAIL**                                  | Timeout `120 s` ở dòng 53 sau khi bấm `"Thử lại 3D"` chờ `#scene-root` về `"ready"` (3 lượt khởi tạo WebGL2 dưới SwiftShader cộng dồn vượt trần hoặc treo retry).                                                                                                                                                                                          |
| Các suite E2E còn lại (`startup-gate`, Firefox, WebKit) | **NOT_VERIFIED**                          | Chưa chạy trên nhánh này.                                                                                                                                                                                                                                                                                                                                  |
| Benchmark GPU vật lý trên 317 buildings                 | **NOT_VERIFIED**                          | Chưa đo FPS, `drawCalls`, `triangles`, `adapterUpperBoundBytes` trên `HOME_NEIGHBORHOOD` thật.                                                                                                                                                                                                                                                             |

## 4. Rủi ro và nợ kỹ thuật đội tiếp nhận cần biết

1. **Regression bố cục hẹp (`.h6-top-info` chồng `.dock`):** Do nhãn `"Nhà của tôi · đang xây để cho thuê"` + dòng mô tả + link attribution OSM làm khung `.h6-top-info` cao hơn ở viewport hẹp (`src/styles.css` `@media (max-width: 767px) and (max-height: 480px)` đặt `width: 226px` và grid cũ cho nhãn ngắn `"Nhà mình"`). Cần làm gọn layout `.h6-top-info` trên màn hình nhỏ mà **không** xóa link `© OpenStreetMap contributors` hay che khuất thông tin `REAL_WORLD_NOT_VERIFIED`, sau đó chạy lại `fixed-home.spec.ts:110` để xác nhận pass.
2. **Recovery E2E timeout / tốc độ khởi tạo shader:** Mỗi lượt khởi tạo WebGL2 dưới SwiftShader mất ~40 s nên 3 lượt trong `fixed-home-recovery.spec.ts` (ban đầu + tự hồi phục + bấm `"Thử lại 3D"`) dễ vượt 90–120 s. Cần kiểm tra trực tiếp xem có lỗi state khi bấm `"Thử lại 3D"` hay thuần túy do thời gian compile shader SwiftShader quá lâu.
3. **Kích thước chunk `demoScene`:** Vite build cảnh báo `demoScene-*.js` đạt `1.425,17 kB` raw (`243,68 kB` gzip) do nhúng JSON khu phố `740 kB` + Three.js. `check:bundle` chỉ đo shell tĩnh (`123.515 B`), không đo chunk `demoScene` tải lazy; cần theo dõi để tối ưu mobile (Lighthouse mobile ở mốc cũ chỉ đạt 50–56/100).
4. **Shadow camera:** `sun.shadow.camera` trong `src/engine/demoScene.ts` vẫn giữ phạm vi `±90 m` quanh tâm; các công trình xa hơn ngoài vòng lõi sẽ không đổ bóng (chấp nhận được để giữ FPS/độ nét bóng vùng tâm, nhưng cần ghi nhận rõ).
5. **Mâu thuẫn cần đối chiếu ở `AGENTS.md` §2:** `AGENTS.md` (chưa sửa trong nhánh này) vẫn giữ quy tắc lịch sử `"Repo chỉ giữ toạ độ hư cấu/tổng hợp"`. Chủ dự án đã phê duyệt dùng snapshot OSM/G1 thật cho ngôi nhà đang xây để cho thuê ngày 11/11/2026 — đội Grok có thể cập nhật `AGENTS.md` §2 đồng bộ với `docs/DECISIONS.md` và `docs/CODEX_HANDOFF.md` khi chuẩn bị PR.

## 5. Lệnh vận hành chuẩn trên Windows / Linux

- **Bun:** Dùng đúng `bun@1.4.3` (trên Windows nếu chưa cài global đúng bản: `npm exec --yes --package=bun@1.4.3 -- bun ...`).
- **Kiểm tra đầy đủ:** `bun run check`
- **Kiểm tra secret:** `GITLEAKS_BIN="<path-to-gitleaks>" bun run check:secrets`
- **Chạy dev server để E2E / QA:** Luôn khởi chạy dev server với TTY hoặc để Playwright `webServer` tự bật (`vite.js` có thể thoát `stdin is not a tty` nếu stdin đóng ở một số shell không có PTY).
- **Chạy Playwright Chromium cục bộ:**
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE="<path-to-chrome.exe>" CI=1 REQUIRE_WEBGL2=1 bunx playwright test --project=chromium tests/e2e/fixed-home.spec.ts`

## 6. Liên kết Notion dự án (đã ghi tại `docs/CODEX_HANDOFF.md` §10)

- Bàn giao toàn bộ cho Codex: `https://app.notion.com/p/1b0d272224c04e9a97ceadc8bd45888c`
- Siêu kế hoạch map 3D (P0–P13, ngân sách, D1–D14): `https://app.notion.com/p/7cd9eabab7584c27b7189499c03c9651`
- Bảng giao việc và receipt: `https://app.notion.com/p/3d4389143bfe41a593a962b3304bdc4a`
- P10.1 spec: `https://app.notion.com/p/f5bbee0585f141dbbe307314d3e0e96a`
- P10 receipt & giới hạn: `https://app.notion.com/p/7592ff65db1f411db4d7cc8e36c2b691`
- G1 georeference riêng: `https://app.notion.com/p/f1402cd3427e40408db4223e451afcea`
- Sổ kinh nghiệm H6: `https://app.notion.com/p/302120d2a6f6496f948545da6d32dcd5`

## 7. Danh sách việc đề xuất tiếp theo cho đội Grok (theo thứ tự ưu tiên)

1. Kiểm `CHECKSUMS.sha256`, `git bundle verify`, checkout nhánh `codex/real-neighborhood-canonical`, chạy lại `bun run check` + `check:secrets` xác nhận môi trường sạch.
2. Sửa regression layout `.h6-top-info` vs `.dock` trên `portrait and short-landscape` (`src/styles.css` / `TopInfo.tsx`) và điều tra/khắc phục timeout `fixed-home-recovery.spec.ts`, sau đó chạy full E2E Chromium/Firefox/WebKit.
3. Đối chiếu và cập nhật `AGENTS.md` §2 cho khớp quyết định ngày 11/11/2026 về snapshot OSM/G1.
4. Kiểm tra trực quan 3D trên trình duyệt thật (góc camera khởi tạo, tâm nhà, độ rộng đường) và chạy benchmark hiệu năng GPU thật (`fps.p50 ≥ 55`, `frameMs.max ≤ 50 ms`, `drawCalls ≤ 200`, `triangles ≤ 800.000`, `adapterUpperBoundBytes ≤ 350 MB`) trên cảnh 317 công trình.
5. Khi chủ dự án cung cấp kích thước lô, hướng mặt tiền hoặc bản vẽ/chiều cao thực tế, bổ sung ranh lô + khối căn nhà đang xây tại tâm và làm giàu cao độ nhà lân cận theo từng tầng provenance rõ ràng.
