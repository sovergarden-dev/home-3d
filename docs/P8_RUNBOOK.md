# P8 — Mở và kiểm tra không khí

P8 mở rộng dock/Three.js hiện có; không thay nguồn hình học. H6 và P7 là baseline đã nhận, không sửa các branch/PR đó. P8 dùng nhánh/PR stacked riêng, không merge, Publish, deploy hoặc đổi Lovable sync.

## Mở cục bộ

```sh
bun install --frozen-lockfile
bun run dev --host 127.0.0.1 --port 4178
```

Mở `http://127.0.0.1:4178/`. Fixture demo hư cấu mặc định không gọi thời tiết thật. Tại dock có ngày đang xem, Giờ thật/Dừng/1×/4×, các preset giờ; Weather có bốn kiểu thời tiết, mùa auto/thủ công, mức ngập mô phỏng và tắt lớp; Festival có auto hoặc sáu lựa chọn thủ công. Mùa auto quy ước tháng 5–11 mùa mưa, không phải quan trắc tại nhà. Mobile dùng chính bottom sheet hiện có, không dashboard thứ hai. Mặt bằng luôn ánh sáng/vật liệu trung tính để đọc geometry.

Các lớp trang trí đều là minh họa không pickable, không thêm feature vào WorldData, không thêm cửa sổ/mặt tiền/cột đèn giả. Màu mùa chỉ thay presentation tán cây có sẵn; đèn ban đêm chỉ bật trên `street_light` có sẵn. Lớp nước tắt ở 0%, không phải cao độ hoặc dự báo. Không có xe/người/collision/âm thanh mới thuộc P9.

## Ranh giới vị trí và thời tiết

Tham chiếu P7 phải khớp đúng SHA nội dung gói hiện hành và chỉ nằm trong client session. “Tính theo tham chiếu cục bộ” không xác nhận ranh/tâm thực địa. Khu thật vẫn `BLOCKED_MISSING_GEOREFERENCE` / `REAL_WORLD_NOT_VERIFIED`; implementation không có đường tự mở khóa gói không-synthetic trong P8.

Đường Open-Meteo hoàn thiện bằng response fixtures và request interception. Nút chỉ hoạt động với gói **synthetic** đã xác nhận tâm, reference hợp lệ, ngày hiện tại và xác nhận tiết lộ riêng. Mở panel/ngày/pan/zoom/import không tự gửi request; consent Google của P7 không dùng lại. Không refresh nền. Đổi gói/reference/date, ẩn tab, tắt hoặc unmount xóa consent/cache và hủy response cũ. Thời tiết mô phỏng lưu riêng với live presentation, nên thoát live không ghi đè lựa chọn mô phỏng.

Nguồn/license và giới hạn: [lịch/thiên văn](./p8-calendar-sources.md), [22 golden Việt](./P8_CALENDAR_GOLDENS.md), [Open-Meteo](./P8_WEATHER_SOURCES.md). Không gọi API bằng tọa độ nhà trong QA.

### Sửa review P8-R1/P8-R2

Freshness của response và cache dùng chung giới hạn: cache phiên 15 phút, tuổi reading không quá 90 phút, tương lai không quá 15 phút và đúng ngày UTC+7. Khi ready hết hạn, một timeout cục bộ chuyển sang stale, giữ timestamp để tham khảo nhưng tắt live ở store/TopInfo/engine và khôi phục lựa chọn mô phỏng. Timeout không tải lại hoặc gửi lại vị trí; chỉ thao tác xác nhận/retry hợp lệ mới có thể yêu cầu mạng. Tắt/ẩn tab/đổi gói/reference/ngày/dispose phải dọn timeout và abort response đang chờ. Không nâng giới hạn 90 phút để chữa nhãn hiện tại.

Dialog vẫn nằm trong panel thời tiết hiện có: action xuống hàng/xếp cột, nhãn đầy đủ, vùng chạm tối thiểu 44px, chiều cao có giới hạn và cuộn trong safe area. Regression VI/EN kiểm 390×844 và 740×390 trước consent, sau ready/error/stale, cả bounding boxes và thao tác focus/click. Hủy không request; off không làm mất phiên chỉnh sửa.

## Cổng kiểm thử cùng mã cuối

```sh
bun run check
cd pipeline && bun run src/cli.ts --config tests/fixtures/synthetic-pipeline.json --dry-run
cd ..
REQUIRE_WEBGL2=1 bun run test:e2e --project=chromium
bun run test:e2e --project=firefox
bun run test:e2e --project=webkit
```

Chromium bắt buộc WebGL2. Firefox/WebKit báo GPU skip nếu môi trường không có WebGL2; DOM/data pass không phải GPU pass. Native Safari và thiết bị/GPU vật lý chưa có được ghi NOT_VERIFIED. Không đổi capability guard, timeout hay ngưỡng để làm xanh.

Production smoke P8 dùng `.output` của build cùng commit, Bun loopback 4179, synthetic import/export/consent và browser interception; không publish. Script P7 smoke cũng được chạy **trên P8 build**, không phải rerun CI head P7 đã nhận.

## Pixel, hiệu năng và retained-memory estimate

```sh
P8_PHASE=before P8_BEFORE_URL=http://127.0.0.1:4180 P8_BEFORE_CWD=/workspace/home-3d-p7 P8_OUTPUT_DIR=/workspace/home-3d-p8-evidence/before-final node scripts/p8-atmosphere-qa.mjs
P8_PHASE=final P8_FINAL_URL=http://127.0.0.1:4178 P8_CYCLES=20 P8_SOAK_MINUTES=20 P8_OUTPUT_DIR=/workspace/home-3d-p8-evidence/final node scripts/p8-atmosphere-qa.mjs
```

Không chạy benchmark đồng thời với test/build khác trong cùng máy. Cả hai dùng cùng JSON synthetic (64 buildings/10 roads/2 trees/1 light), seed, camera, ngày 21/6/2026 trưa, 1440×900 DPR1. Một warm-up và ba vòng held-pointer; mỗi vòng và chuỗi pixel bắt đầu bằng document mới để camera không mang damping từ vòng trước; mọi interval chậm được giữ. Tách parse/build/idle/capture khỏi interaction metrics. Latency bắt đầu ở click/input/keydown capture phase và dừng ở main-frame submission đã phản ánh trạng thái mới; canvas PNG hashes kiểm thay đổi pixel riêng. Shader warm chỉ compile các biến thể thật dùng: weather và festival độc lập, đêm/pha trăng, ngập và lớp trung tính; không tạo tích mọi tổ hợp tùy chọn. Raw report tách SHA ứng dụng baseline/P8 và SHA harness.

Bộ ảnh gồm ngày/hoàng hôn/đêm, bốn thời tiết, khô→ướt→khô, hai mùa, ngập, các lễ, tắt lớp, topdown trung tính, eye-level, mobile portrait/landscape. Tối thiểu 20 vòng đổi hiệu ứng/mode/gói/route/capture và soak 20 phút, raw GC/CDP samples dùng helper H6 với ngưỡng giữ nguyên. Đây là **ước lượng retained JS/DOM**, không phải GPU-memory certification. Mục tiêu <100ms option và không frame >50ms phải báo đúng trên môi trường đo; SwiftShader không chứng minh hiệu năng GPU vật lý.

Receipt cuối duy nhất trên trang Notion P8 ghi full head, PR/base, exact workflow_dispatch run + bốn jobs, counts/skip, production smoke và đường bằng chứng. Trạng thái chỉ `SUBMITTED_FOR_TECHNICAL_REVIEW`; Notion AI mới đặt `SOFTWARE_TECHNICAL_REVIEW_PASSED`.

Batch sửa review chỉ làm mới weather/dialog/cleanup/soak bị ảnh hưởng; album và benchmark render của head `1ef66a3426bc5357d7415a2de5f8a77cd7b5a2f0` vẫn là bằng chứng lịch sử của head đó, không đổi nhãn thành head sửa. Chạy full local check/ba browser/production smoke đến ổn định trước khi push head cuối và dispatch đúng full SHA một lần; không rerun CI xanh của head cũ. Soak weather riêng ghi raw samples và ngưỡng retained-memory như trên, không phải benchmark GPU. Giữ giới hạn SwiftShader 50ms chưa đạt và native Safari/GPU vật lý chưa xác minh.
