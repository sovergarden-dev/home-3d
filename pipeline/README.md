# Pipeline cục bộ cho world riêng

Pipeline này chỉ nhận **một đường dẫn cấu hình riêng**. Không truyền toạ độ, địa chỉ, bbox, token hay URL khu nhà trên command line.

## Ranh giới dữ liệu

- Giữ config, source snapshot, cache, `world-package.json`, override và report khu thật ngoài repository. Các đường dẫn `pipeline/private/`, `pipeline/out/`, `pipeline/cache/`, `private-world/`, `*.private.json` và `*.private.geojson` đã bị gitignore.
- Không đưa file world thật vào Lovable, bundle public, SSR payload, URL, localStorage, analytics, PR, Actions artifact hay Notion.
- Input `url` chỉ chấp nhận HTTPS host khớp `allowedHost` trong config riêng. Cấu hình phải ghi rõ release/revision và licence của OSM, Overture hoặc nguồn khảo sát.
- Chỉ dùng GeoJSON theo thứ tự longitude, latitude. Origin WGS84 nằm trong config riêng; pipeline chuyển sang ENU qua `src/geo/enu.ts`.

## Cấu hình riêng và identity nguồn

Config có `schemaVersion`, `datasetRevision`, `origin`, `input`, `source` và `output`. `origin` là WGS84 hợp lệ, nhưng không được ghi mẫu chứa vị trí thật vào repo. `input.kind` là `file` hoặc `url`; output package và report phải nằm trong thư mục private ngoài repo.

- Primary source mặc định namespace `primary`; khai báo `source.namespace` rõ ràng nếu muốn giữ identity qua việc đổi nguồn/chuyển role.
- Mỗi `secondaryInputs[]` cần `source.namespace` riêng, không rỗng và khác mọi namespace khác trong build. Namespace là identity ổn định, không phải revision; tăng `source.revision` không được đổi local IDs.
- Tất cả input phải dùng cùng `origin`/ENU frame. Local IDs explicit và fallback đều mang namespace; legacy override/rule IDs chỉ migrate khi alias duy nhất. Alias cũ trỏ nhiều feature sẽ dừng với lỗi ambiguity, không đoán hoặc deduplicate.

## Hợp đồng feature GeoJSON

Adapter hiện hỗ trợ:

- `LineString`/`MultiLineString` có thuộc tính `highway` để tạo roads.
- `Polygon`/`MultiPolygon` có tag `building` hoặc `building:part` để tạo building/parts; part cần parent ID exact hoặc đúng một parent chứa hoàn toàn.
- `Polygon`/`MultiPolygon` có tag lot được hỗ trợ: `lot`, `boundary: "lot"`, `landuse: "residential_lot"` hoặc `landuse: "lot"`.

Không coi mọi polygon là building. Polygon không phân loại bị từ chối (`GEOJSON_POLYGON_UNCLASSIFIED`); line thiếu `highway` bị từ chối (`GEOJSON_LINE_UNCLASSIFIED`); geometry type khác bị từ chối (`GEOJSON_GEOMETRY_TYPE_UNSUPPORTED`). Parent part sai/thiếu/mơ hồ cũng dừng build bằng issue code riêng, không silently-drop hoặc nối theo substring. GeoJSON point-based trees/props chưa được adapter này hỗ trợ; nếu cần phải bổ sung adapter/schema có phân loại và provenance trước, không ngầm bỏ chúng.

Conflation giữ các category đã có trong world và attribution thực sự được giữ lại: buildings, roads, lots, trees và props; merge licences/source metadata/coverage, phát hiện duplicate identity, và không tự xoá overlap nếu thiếu resolver rule có reason. Trong adapter GeoJSON hiện tại, các loại được nhập là buildings/parts, roads và lots; không tuyên bố đã nhập trees/props từ nguồn này.

## Chạy

```bash
cd pipeline
bun run src/cli.ts --config <private-config-path> --dry-run
bun run src/cli.ts --config <private-config-path>
```

`--dry-run` chỉ in report số lượng feature, quality và issue code. Nó không in coordinate, bbox, đường dẫn input hoặc URL nguồn.

Pipeline thực hiện: parse config → đọc source snapshot → normalize GeoJSON → WGS84/ECEF/ENU → validate world → ghi package và report local. Package giữ world source/conflated làm base và lưu override document riêng; loader áp document đó để mở effective world. Cách này cho phép undo/reload và rebuild từ source gốc với document đã export mà không biến world đã chỉnh thành base mới.

## Preview local

Mở ứng dụng với `?local-preview=1`, chọn `world-package.json` bằng file picker. File chỉ được đọc vào bộ nhớ tab hiện tại. Package lỗi hiện lỗi và **không** chuyển âm thầm về fixture mà gọi đó là khu thật. Bấm trở về fixture để bỏ dữ liệu đã mở khỏi scene.

World thật vẫn `REAL_WORLD_NOT_VERIFIED` cho tới khi Syringa kiểm Mặt bằng và xác nhận ranh lô/điểm cần sửa. Không deploy, upload hoặc Publish từ pipeline này.
