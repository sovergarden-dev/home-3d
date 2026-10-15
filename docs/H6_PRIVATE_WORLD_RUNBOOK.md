# H6 — Runbook preview world riêng

## Trạng thái

Mã và fixture public dùng world synthetic. Khu thật chỉ được mở bằng package local sau khi pipeline chạy từ config riêng. Không có package riêng thì app tiếp tục Demo, không tuyên bố đã nạp khu thật.

## Chuẩn bị private

1. Tạo thư mục private ngoài repository.
2. Giữ origin WGS84, source snapshot OSM/Overture hoặc khảo sát hợp lệ, licence/revision và mọi override trong thư mục đó.
3. Không đặt ảnh Google, Street View, ảnh vệ tinh Google, địa chỉ, polygon/graph ENU, ảnh riêng hoặc token trong repository.
4. Nếu có vị trí riêng hợp lệ, chạy pipeline ngay để lấy đường và footprint nguồn mở. Ranh lô, ảnh, tầng và mái bổ sung dần qua override có reason/provenance.

## Build local

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
      "source": { "kind": "overture", "namespace": "overture-secondary", "revision": "secondary-rev-1", "licence": "CC-BY-4.0" }
    }
  ],
  "conflationRulesPath": "rules.json",
  "overridesPath": "overrides.json",
  "confirmedEmptyLotsPath": "lots.json",
  "source": { "kind": "synthetic", "namespace": "fixture-primary", "revision": "fixture-v1", "licence": "CC0-1.0" },
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


## Mở preview

1. Chạy app local.
2. Thêm `?local-preview=1` vào URL local.
3. Chọn package local bằng file picker.
4. Kiểm Mặt bằng trước: north-up, scale bar, road graph, footprint, courtyard, lot empty và conflict.
5. Kiểm Diorama sau: massing, footprint, roof fallback, frontend và props.
6. Nếu package lỗi, app giữ lỗi local. Không gọi fixture là khu thật.

## Sửa có kiểm soát

- Mỗi override cần stable local ID, revision, reason và provenance.
- Road/footprint/lot geometry có validator. Polygon tự cắt, hole sai, building chạm lô empty đã xác nhận hoặc connector không tồn tại làm package không hợp lệ.
- Editor cục bộ hỗ trợ chiều cao/tầng/kiểu mái công trình hoặc part đang render, footprint công trình, bề rộng tuyến đường và ranh lô. Parent có parts là vùng chứa; controls sửa scalar/geometry của parent bị khóa và part được chọn/sửa riêng. Mọi thao tác đi qua `applyWorldOverrides` + `validateWorld`; sửa không hợp lệ bị từ chối, app giữ bản hợp lệ cuối và hiển thị mã lỗi thay vì dựng world sai.
- Sửa trong editor mặc định `inferred`; chỉ nâng lên `verified` khi có nguồn khảo sát cụ thể. Frontage (`frontageCandidates`) chưa có operation override trong schema nên chưa phơi trong editor — không tự nhận đã sửa được frontage.
- Conflation chỉ xoá duplicate khi có rule resolver kèm reason. Candidate overlap không có rule vẫn là conflict.
- Không xây lại nhà cũ. Lô empty được giữ trống đến khi có model/nguồn hợp lệ cho giai đoạn mới.

## Cổng H6

`IMPLEMENTATION_READY` chỉ áp dụng khi pipeline synthetic, loader, Mặt bằng, renderer, override và tests pass. `REAL_WORLD_NOT_VERIFIED` giữ nguyên cho tới khi Syringa kiểm preview private và xác nhận đường/lô/landmark theo dữ liệu hợp lệ.

Không merge, Publish, deploy, upload R2 hoặc đổi Cloudflare Access trong runbook này.
