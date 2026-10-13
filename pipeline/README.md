# Pipeline cục bộ cho world riêng

Pipeline này chỉ nhận **một đường dẫn cấu hình riêng**. Không truyền toạ độ, địa chỉ, bbox, token hay URL khu nhà trên command line.

## Ranh giới dữ liệu

- Giữ config, source snapshot, cache, `world-package.json`, override và report khu thật ngoài repository. Các đường dẫn `pipeline/private/`, `pipeline/out/`, `pipeline/cache/`, `private-world/`, `*.private.json` và `*.private.geojson` đã bị gitignore.
- Không đưa file world thật vào Lovable, bundle public, SSR payload, URL, localStorage, analytics, PR, Actions artifact hay Notion.
- Input `url` chỉ chấp nhận HTTPS host khớp `allowedHost` trong config riêng. Cấu hình phải ghi rõ release/revision và licence của OSM, Overture hoặc nguồn khảo sát.
- Chỉ dùng GeoJSON theo thứ tự longitude, latitude. Origin WGS84 nằm trong config riêng; pipeline chuyển sang ENU qua `src/geo/enu.ts`.

## Cấu hình riêng

Config có `schemaVersion`, `datasetRevision`, `origin`, `input`, `source` và `output`. `origin` là WGS84 hợp lệ, nhưng không được ghi mẫu chứa vị trí thật vào repo. `input.kind` là `file` hoặc `url`; output package và report phải nằm trong thư mục private ngoài repo.

## Chạy

```bash
cd pipeline
bun run src/cli.ts --config <private-config-path> --dry-run
bun run src/cli.ts --config <private-config-path>
```

`--dry-run` chỉ in report số lượng feature, quality và issue code. Nó không in coordinate, bbox, đường dẫn input hoặc URL nguồn.

Pipeline thực hiện: parse config → đọc source snapshot → normalize GeoJSON → WGS84/ECEF/ENU → validate world → viết package và report local. Khi có nhiều snapshot, dùng `conflateWorlds` cùng rule mapping và reason rõ ràng; overlap không có rule chỉ tạo conflict, không bị xoá tự động.

## Preview local

Mở ứng dụng với `?local-preview=1`, chọn `world-package.json` bằng file picker. File chỉ được đọc vào bộ nhớ tab hiện tại. Package lỗi hiện lỗi và **không** chuyển âm thầm về fixture mà gọi đó là khu thật. Bấm trở về fixture để bỏ dữ liệu đã mở khỏi scene.

World thật vẫn `REAL_WORLD_NOT_VERIFIED` cho tới khi Syringa kiểm Mặt bằng và xác nhận ranh lô/điểm cần sửa. Không deploy, upload hoặc Publish từ pipeline này.
