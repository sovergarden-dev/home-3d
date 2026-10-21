# P7 — Phố thật, mở ngoài có xác nhận

## Trạng thái và phạm vi

P7 là delta riêng trên nhánh `feat/p7-real-street-links`, stacked trên `feat/h6-pho-that-mat-bang` ở H6 đã chấp nhận `70967c003c0b39e74c7196665ca37e54c1ad0cf8`. Không thay thế PR #3, không đổi main/Lovable sync, không merge/Publish/deploy. Không thay geometry, chiều cao, mái, tâm, provenance hoặc nhãn xác minh H6. `REAL_WORLD_NOT_VERIFIED` vẫn giữ nguyên.

Đã có generator, validation, nối camera và UI hai ngôn ngữ cho Street View/Vệ tinh. Phần kích hoạt canonical thật là **BLOCKED_MISSING_GEOREFERENCE**: có cấu hình riêng được giữ nhưng chưa có bằng chứng ràng buộc origin với đúng nội dung canonical đã chấp nhận. Không suy ra từ tên/path, ID, số lượng hay tâm chấp nhận tạm; không tự tạo companion cho khu thật. Không cần cung cấp thêm dữ liệu giữa lượt triển khai này.

## Cách dùng

1. Mở gói cục bộ như H6; nếu có companion đã được kiểm chứng cho chính nội dung gói đó, chọn **Mở tham chiếu địa lý**. Không có companion hợp lệ thì **Phố thật** vẫn vô hiệu hóa và giải thích lý do. Demo không mở địa điểm.
2. Chọn **Phố thật**, chọn **Street View** hoặc **Vệ tinh**. Hộp thoại nêu điểm/hướng, dữ liệu sẽ chuyển sang Google và giới hạn ảnh. Focus bắt đầu ở **Hủy**; Escape/hủy không tạo URL hoặc tab.
3. Chọn **Mở Google** để xác nhận lần mở hiện tại. Chỉ lúc đó app đọc lại target/hướng camera, kiểm lại phiên/tham chiếu và tạo URL tối thiểu. Tab ngoài không có opener/referrer. Nếu popup bị chặn hoặc Google không có ảnh, phiên sửa vẫn giữ nguyên; không có tự dò coverage hay tự mở dự phòng.

Không có đồng ý ghi nhớ hoặc tự sao chép clipboard. Không gọi Google khi nạp gói, nạp companion, pan/zoom, mở hộp thoại, đổi lựa chọn hoặc hủy. Vệ tinh chỉ gửi vị trí và zoom; Street View gửi vị trí target và heading, không gửi vị trí đứng camera, dữ liệu world, nguồn, tên file, địa chỉ hay token Preview.

## Companion và phiên

Companion JSON nhỏ (tối đa 4 KiB trong UI), schema `1.0`, đúng ba trường `schemaVersion`, `packageSha256`, `origin`. Digest SHA-256 là của **đúng văn bản UTF-8 đã mở**, bao gồm khoảng trắng; không phải hash filename/localId/count. `origin` chỉ chứa latitude, longitude và altitude tùy chọn; số hữu hạn, kinh độ trong ±180°, vĩ độ nằm nghiêm ngặt giữa hai cực. Các cực bị từ chối an toàn vì giới hạn bộ chuyển đổi ENU hiện hữu. Trình duyệt cần Web Crypto/secure context; không có thì vô hiệu hóa an toàn, không fallback hash yếu.

Companion là siêu dữ liệu riêng do người giữ nguồn đã kiểm chứng chuẩn bị; hash chỉ chứng minh khớp nội dung, không chứng minh origin đúng thực địa. Không cung cấp công cụ tự gán origin từ nguồn chưa được chứng minh. Không nhúng companion vào WorldPackage, không sửa canonical; export H6 giữ nguyên schema cũ và **không thêm origin/reference**. Bản làm việc có nội dung khác cần companion được kiểm chứng tương ứng nếu muốn mở ngoài sau khi mở lại.

World và reference chỉ ở phiên client, không ở shared UI store/SSR/storage/logs/analytics. Đổi gói, bắt đầu đọc file mới (kể cả treo), lỗi, về demo hoặc reload xóa reference và hủy xác nhận cũ; promise cũ không được gắn vào phiên mới. Sửa/undo trong cùng gói giữ reference; menu không thay revision/world và không dựng lại world.

## Quy ước camera và URL

Camera Three.js hiện có cung cấp target thực và vector nhìn của camera đang hoạt động ở lần xác nhận. Chuyển target với X Đông, Y lên, −Z Bắc qua `src/geo/enu.ts`; hướng là `atan2(direction.x, -direction.z)`, chuẩn hóa [0,360). Mặt bằng/nhìn thẳng đứng dùng Bắc 0°, được ghi trong hộp thoại. Mức zoom vệ tinh mặc định 19, kiểm integer hữu hạn 0–21; không tuyên bố tương đương pixel với zoom 3D.

Theo [Maps URLs chính thức](https://developers.google.com/maps/documentation/urls/get-started), endpoint cố định `https://www.google.com/maps/@`: `api=1&map_action=pano&viewpoint=…&heading=…` hoặc `api=1&map_action=map&center=…&basemap=satellite&zoom=…`. Không nhận URL/panorama ID tùy ý từ package. Không có SDK/key/backend/chi phí/hạ tầng mới, ảnh nhúng, tile, cache, trace, đo hay spike Google 3D. URL hợp lệ không chứng minh có panorama hoặc ảnh mới.

Để phát hiện popup bị chặn mà vẫn bỏ opener/referrer, mở một tab `about:blank` trong cùng gesture xác nhận, xóa `opener`, đặt meta `referrer=no-referrer` và điều hướng bằng liên kết `target=_self`, `rel="noopener noreferrer"`, `referrerPolicy="no-referrer"`. Chỉ đặt meta rồi gọi `Location.replace` từ cửa sổ gốc không đủ: smoke đã bắt referrer của caller; test navigation thật được intercept giữ regression này. Dùng `noopener,noreferrer` trực tiếp trong `window.open` trả về `null` cả khi mở thành công, nên không dùng giá trị đó để báo chặn sai. E2E kiểm cả stub lẫn navigation thật được intercept/fulfill tại browser; không request ra Google.

## Tái lập kiểm tra (chỉ synthetic)

```bash
bun install --frozen-lockfile
bun run check
(cd pipeline && bun run src/cli.ts --config tests/fixtures/synthetic-pipeline.json --dry-run)
REQUIRE_WEBGL2=1 bun run test:e2e --project=chromium
bun run test:e2e --project=firefox
bun run test:e2e --project=webkit
bun scripts/h6-production-smoke.mjs
bun scripts/p7-production-smoke.mjs
git diff --check
```

Production smoke phục vụ built Cloudflare-module handler/ASSETS tại loopback, không deploy. P7 smoke intercept mọi navigation Google với HTML tổng hợp, kiểm opener/referrer, SSR/build/storage/sentinel và reset sau reload. Không dùng package/tọa độ thật trong test/CI. Unit/component tách chuyển tọa độ/heading/URL khỏi UI, race và khớp nội dung; E2E giữ các capability guard H6, báo skip thật.

iPhone/Android/native Safari và GPU vật lý không có bằng chứng thì **NOT_VERIFIED**. Playwright WebKit/viewport di động là mô phỏng, không thay thiết bị thật. Không chạy lại album/soak H6 không liên quan; bằng chứng H6 cũ giữ nguyên SHA. Receipt cuối trên trang P7 là nguồn tổng hợp CI/head và giới hạn, chờ Notion AI review kỹ thuật.
