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
- Conflation chỉ xoá duplicate khi có rule resolver kèm reason. Candidate overlap không có rule vẫn là conflict.
- Không xây lại nhà cũ. Lô empty được giữ trống đến khi có model/nguồn hợp lệ cho giai đoạn mới.

## Cổng H6

`IMPLEMENTATION_READY` chỉ áp dụng khi pipeline synthetic, loader, Mặt bằng, renderer, override và tests pass. `REAL_WORLD_NOT_VERIFIED` giữ nguyên cho tới khi Syringa kiểm preview private và xác nhận đường/lô/landmark theo dữ liệu hợp lệ.

Không merge, Publish, deploy, upload R2 hoặc đổi Cloudflare Access trong runbook này.
