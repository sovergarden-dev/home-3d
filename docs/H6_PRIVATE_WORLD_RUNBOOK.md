# H6 — Runbook preview world riêng

## Trạng thái

Mã và fixture public dùng world synthetic. Khu thật chỉ được mở bằng package local sau khi pipeline chạy từ config riêng. Không có package riêng thì app tiếp tục Demo, không tuyên bố đã nạp khu thật.

## Dùng gói hiện có — vài thao tác

1. Mở Preview của nhánh `feat/h6-pho-that-mat-bang` từ project hiện có, rồi **Open in new tab** nếu cần. Chọn **Mở gói cục bộ** trong app và cùng `world-package.json` canonical đã giữ; không sửa URL, cài Bun/Node hoặc upload. Link cũ `?local-preview=1` vẫn dùng được.
2. Xem badge và thẻ chất lượng, chuyển **Mặt bằng / Diorama / Tầm mắt** để xem tổng thể. Gói synthetic vẫn ghi dữ liệu tổng hợp. Tầm mắt chỉ là preview camera, chưa walking/collision. Minh họa lô chỉ xuất hiện sau **Bật minh họa tạm**; nhãn không phải ranh khảo sát.
3. Khi cần sửa, mở mục nâng cao, chọn feature và chỉ áp dụng trường hợp lệ đã đổi. **Xuất bản làm việc** yêu cầu trình duyệt tải `world-working-package.json`; giữ file vừa tải để mở lại bằng cùng nút mở gói. Canonical không thay đổi. Xuất không chứng minh người dùng đã lưu thành công. Khi đổi gói/về demo mà còn sửa chưa xuất, app cho hủy/giữ lại hoặc xuất trước.

Không có tự lưu localStorage/IndexedDB/cloud. Reload tab mất phiên chưa xuất; bảo vệ rời trang theo khả năng trình duyệt không thay thế việc chủ động tải bản làm việc. File được đọc trong tab; dữ liệu không gửi tới repo/PR/CI/Notion/backend. Bộ chọn ID là đường dự phòng cho chạm feature trên cảnh.

Build info công khai chỉ gồm phiên bản H6 và SHA build nếu môi trường truyền `VITE_BUILD_SHA` đầy đủ; thiếu thì ghi “không xác định”. Không dùng head PR để khẳng định Preview đang phục vụ đúng bản. URL app Preview phụ thuộc quyền truy cập project, chưa xác minh chỉ từ repository.

## Chuẩn bị private

1. Tạo thư mục private ngoài repository.
2. Giữ origin WGS84, source snapshot OSM/Overture hoặc khảo sát hợp lệ, licence/revision và mọi override trong thư mục đó.
3. Không đặt ảnh Google, Street View, ảnh vệ tinh Google, địa chỉ, polygon/graph ENU, ảnh riêng hoặc token trong repository.
4. Đợt H6 này tái dùng canonical/snapshot đã có, không re-intake, thêm nguồn hoặc xuất lại ZIP/2D. Quy trình pipeline bên dưới dành cho lượt dữ liệu được cho phép riêng, không phải bước để dùng app.

## Build local

Phần này chỉ dành để tạo hoặc làm mới package từ dữ liệu nguồn riêng. Nếu đã có ZIP chuẩn để kiểm thử, bỏ qua các bước bên dưới và dùng mục **Mở preview trực tiếp trong Lovable**; không cần cài dependencies trên máy kiểm thử.

```bash
cd pipeline
bun run check
bun run src/cli.ts --config <private-config-path> --dry-run
bun run src/cli.ts --config <private-config-path>
```

Chỉ dùng config path trên command line. Không truyền toạ độ hoặc source URL trực tiếp. Receipt public chỉ nêu số lượng/quality/issue code; report hình học đầy đủ ở private.

### Config mẫu (dữ liệu hư cấu — không dùng toạ độ khu thật)

```json
{
  "schemaVersion": "1.0",
  "datasetRevision": "synthetic-runbook-v1",
  "origin": { "longitude": 0.6, "latitude": 0.4, "altitude": 0 },
  "input": { "kind": "file", "path": "primary.geojson", "format": "geojson" },
  "secondaryInputs": [
    {
      "kind": "file",
      "path": "secondary.geojson",
      "format": "geojson",
      "source": {
        "kind": "overture",
        "namespace": "overture-secondary",
        "revision": "secondary-rev-1",
        "licence": "CC-BY-4.0"
      }
    }
  ],
  "conflationRulesPath": "rules.json",
  "overridesPath": "overrides.json",
  "confirmedEmptyLotsPath": "lots.json",
  "source": {
    "kind": "synthetic",
    "namespace": "fixture-primary",
    "revision": "fixture-v1",
    "licence": "CC0-1.0"
  },
  "output": { "packagePath": "package.json", "reportPath": "report.json" }
}
```

- `secondaryInputs` là đường duy nhất để nạp nguồn phụ; mỗi nguồn có `source` riêng và phải cùng `origin`/khung với nguồn chính. Không có `secondaryInputs` thì `conflationRulesPath` không có tác dụng và sẽ không được âm thầm bỏ qua nếu rule trỏ sai target.
- Namespace của primary mặc định `primary`; từng secondary bắt buộc namespace khác nhau. Namespace là identity ổn định qua revision/rebuild, không đưa ngày/revision vào namespace. ID explicit/fallback đều namespaced; legacy alias mơ hồ dừng build thay vì đoán.
- GeoJSON adapter nhận `LineString`/`MultiLineString` có `highway`; `Polygon`/`MultiPolygon` có `building`/`building:part`; hoặc lot được gắn `lot`, `boundary=lot`, `landuse=residential_lot` hay `landuse=lot`. Polygon không phân loại, line thiếu `highway`, point/geometry không hỗ trợ và part không resolve parent exact/unique đều bị reject bằng issue code, không silently-drop. Point-based trees/props chưa được GeoJSON adapter hỗ trợ.
- `rules.json` chỉ chứa quyết định resolver dạng `{ primaryBuildingId, duplicateBuildingId, reason }`. Rule sai target làm pipeline **dừng** với `CONFLATE_RULE_TARGET_NOT_FOUND`. Candidate chồng lấn không có rule nằm ở `report.conflation.unresolved` cùng cờ `passesQualityGate`.
- `overridesPath` là document override đã xuất (đủ mọi operation `patch_building`, `patch_building_part`, `replace_building_geometry`, `patch_road`, `replace_lot_geometry`). Override trỏ sai target hoặc sai schema làm pipeline **dừng** với `PIPELINE_OVERRIDE_FAILED`, không có build "thành công nhưng bỏ sửa".
- Output package giữ world từ source/conflation làm base và lưu override document riêng. Loader áp document khi mở; khi rebuild từ source dùng document đã export để giữ edits mà không biến world effective cũ thành base.
- `confirmedEmptyLotsPath` thêm các lô đã xác nhận; lô `confirmed + empty` bị vi phạm diện tích dương (> 0,01 m²) làm package không hợp lệ.
- Bộ CLI fixture end-to-end sống trong `pipeline/src/cli.test.ts` (nguồn phụ + rules + lots + overrides exported, cùng hai ca lỗi). Chạy `cd pipeline && bun test src`.

Conflation giữ các category đã có trong `WorldData` cùng attribution/licences/source metadata/coverage, và không tự deduplicate identity hoặc overlap thiếu resolver rule. GeoJSON adapter hiện chỉ nhập buildings/parts, roads và lots; không coi polygon tùy ý là building và không tuyên bố nhập trees/props từ point data.

## Trạng thái gói và giới hạn sự thật

Badge phân biệt demo hư cấu, gói cục bộ và lỗi; synthetic không được gọi khu thật chỉ vì mở qua file. Counts lấy từ runtime, số footprint không phải số nhà/hộ/thửa. Chiều cao thiếu giữ mặt phẳng/viền và “Chiều cao chưa biết”, tầng suy ra chỉ ước tính; nguồn hình học không xác minh mọi thuộc tính khác. Gói lỗi dừng ở lỗi, không fallback ngầm. Request đọc mới nhất hoặc reset thắng các promise cũ. Giới hạn file 100 MiB; lỗi được lọc không echo file.

Giữ ranh chưa đo và tâm chỉ chấp nhận tạm theo metadata gói. Không tự thêm parcel hoặc đổi tâm. Không có bài test nhỏ riêng giao Syringa; sau Notion AI review kỹ thuật mới mời xem tổng thể một lần.

### Khung camera private

- Mặc định và reset ở Mặt bằng giữ tâm ENU đã cung cấp và hiển thị lõi rộng 300 m theo chiều dọc (±150 m); không fit theo bbox của toàn bộ roads/buildings.
- Diorama private cũng bắt đầu ở tâm ENU đã cung cấp và scale 300 m, không dời camera theo midpoint của bbox dài; geometry nguồn không bị dịch. Các tuyến dài ngoài khung đầu có thể được khám phá bằng camera/pan.
- Khi chuyển từ Diorama sang Mặt bằng, zoom fit của camera perspective không được tái dùng: way dài có thể làm OrbitControls chạm giới hạn khoảng cách và làm bẩn zoom dùng chung. Mặt bằng bắt đầu ở 1× để giữ đúng 300 m; zoom do người dùng chọn được giữ khi vẫn ở Mặt bằng.
- Geometry nguồn vẫn nạp nguyên vẹn. Pan được giới hạn theo bounds đầy đủ cộng vùng đệm 150 m, nên các way dài ngoài khung đầu vẫn có thể pan tới; zoom vẫn hoạt động bình thường.
- Khi chưa có parcel geometry, nhãn `Lô trống · minh họa tạm · ranh chưa đo` là lớp UI-only opt-in neo tại ENU origin có guard; không mặc định mọi gói đều là lô của Syringa. Mở package mới/reload/fixture/error reset lựa chọn; sửa cùng package giữ lựa chọn. Toggle không đổi world bytes/epoch/revision hoặc dựng lại world.

## Sửa có kiểm soát

- Mỗi override cần stable local ID, revision, reason và provenance.
- Road/footprint/lot geometry có validator. Polygon tự cắt, hole sai, building chạm lô empty đã xác nhận hoặc connector không tồn tại làm package không hợp lệ.
- Editor cục bộ hỗ trợ chiều cao/tầng/kiểu mái công trình hoặc part đang render, footprint công trình, bề rộng tuyến đường và ranh lô. Parent có parts là vùng chứa; controls sửa scalar/geometry của parent bị khóa và part được chọn/sửa riêng. Mọi thao tác đi qua `applyWorldOverrides` + `validateWorld`; sửa không hợp lệ bị từ chối, app giữ bản hợp lệ cuối và hiển thị mã lỗi thay vì dựng world sai.
- Sửa trong editor mặc định `inferred`; chỉ nâng lên `verified` khi có nguồn khảo sát cụ thể. Frontage (`frontageCandidates`) chưa có operation override trong schema nên chưa phơi trong editor — không tự nhận đã sửa được frontage.
- Conflation chỉ xoá duplicate khi có rule resolver kèm reason. Candidate overlap không có rule vẫn là conflict.
- Không xây lại nhà cũ. Lô empty được giữ trống đến khi có model/nguồn hợp lệ cho giai đoạn mới.

## Cổng H6

Một receipt tổng **SUBMITTED_FOR_TECHNICAL_REVIEW** sau khi W0–W7 và T01–T20 đã xử lý, local check/ba browser/production smoke và CI tay đúng full head có đủ bốn jobs. Notion AI review trước `READY_FOR_FINAL_USER_PREVIEW`; không tự ghi approved/merged/published. `REAL_WORLD_NOT_VERIFIED` và ranh/thuộc tính thiếu vẫn tách biệt với hoàn thiện phần mềm.

## Tái lập QA (chỉ fixture tổng hợp, dành Cue/reviewer)

```bash
bun install --frozen-lockfile
bun run check
(cd pipeline && bun run src/cli.ts --config tests/fixtures/synthetic-pipeline.json --dry-run)
REQUIRE_WEBGL2=1 bun run test:e2e --project=chromium
bun run test:e2e --project=firefox
bun run test:e2e --project=webkit
git diff --check
# Dev server phục vụ fixture cho visual/perf/soak, không mở dữ liệu thật:
bun run dev --host 127.0.0.1 --port 4178
# Terminal khác: baseline ở cổng 4180, final ở 4178; script mặc định soak 20 phút
H6_BEFORE_URL=http://127.0.0.1:4180 H6_FINAL_URL=http://127.0.0.1:4178 node scripts/h6-completion-qa.mjs
# Smoke production theo adapter hiện hữu (không deploy):
bun run build
bun scripts/h6-production-smoke.mjs
```

Runner production phục vụ `.output/server/index.mjs` bằng Bun loopback, truyền built public assets qua binding ASSETS đúng adapter Cloudflare-module. Nó mở fixture synthetic, kiểm 3 mode/sửa/xuất/mở lại, SSR/noindex/build không có sentinel rồi tự dừng; không thay config/deploy/Cloudflare. Muốn ghi SHA thật, chỉ build trên cây sạch với `VITE_BUILD_SHA=$(git rev-parse HEAD) bun run build`; build không được cấp SHA vẫn ghi không xác định.

Script QA ghi ảnh/số đo vào `test-results/h6-completion` (gitignored), fixture độc lập không sao từ khu thật. Cần browser Playwright đã cài, có thể truyền `PLAYWRIGHT_CHROMIUM_EXECUTABLE` cho Chromium cục bộ. Soak không thay cho unit/lifecycle; frame interval là của frame render hoạt động, không GPU time; JS heap/estimate không phải GPU memory. Không suy FPS người dùng từ SwiftShader. Screenshot A/B giữ cùng fixture, camera, time, viewport, DPR; không đổi nhãn ảnh cũ thành SHA mới. Mọi skip phải ghi lý do và không gọi fallback là GPU pass.

Không merge, Publish, deploy, upload R2 hoặc đổi Cloudflare Access trong runbook này.
