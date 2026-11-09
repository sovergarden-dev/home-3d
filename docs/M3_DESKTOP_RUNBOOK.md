# M3 — Desktop, offline và khả năng tiếp cận

`PARTIAL`: phần mềm đã vào main qua PR #11 (`beacd9b`, CI main 4/4). Trên máy NVIDIA: FPS Chrome/Edge MET, Firefox bộ nhớ GPU NOT_MET, soak 30 phút MET. Lighthouse trên máy NVIDIA: PR #13 head mã `07fc66e` desktop 97 MET, mobile 50 NOT_MET (`2c21b54`: 97/56), Accessibility 100 (main `5e6aec5`: desktop 79, mobile 44). Trên Intel UHD: Lighthouse `a948321` mobile 26/desktop 60 NOT_MET, soak Codex ở `4e5136f` đỉnh +22,16% NOT_MET. 4G warm MET theo phương pháp local (CDP trên loopback, không phải mạng di động thật) khi throttle cả service worker (`252f5e7`), ObjectURL NOT_EXERCISED (chi tiết ở [AUDIT_PACKET.md](AUDIT_PACKET.md)). Chỉ fixture tổng hợp; không có nghiệm thu khu thật hay thiết bị di động.

## Đã kiểm

- Check tích hợp: 401 unit, 50 pipeline, lint/type/build đạt; phần vỏ 224.355 byte gzip <250.000, engine lazy riêng.
- 5 test PWA production đạt tại `5e093ccc471464e9cd5d8bae86335b87afdae6be`: offline, iframe không đăng ký, xác nhận cập nhật/giữ tab khác, install lỗi, rollback giữ cache đã activate. Review độc lập đã đóng các phát hiện source; không thay bằng chứng browser bằng review.
- Font Be Vietnam Pro/Lora Vietnamese + Latin tự host, giữ OFL và nguồn/hash. Test mạng chỉ cho loopback, không ngoại lệ Google Fonts.
- Axe mở rộng đã sửa nút bị panel che ở landscape; cả 9 ca (3 viewport × 3 browser) đạt, gồm VI/EN và kiểm bàn phím. Không thay kiểm thiết bị/Safari thật bằng kết quả này.
- GPU thật NVIDIA GTX 1660 Ti (Notion AI, 31/10–01/11, DPR 1), không trộn với máy Intel: `a4f0121` check đạt 402 unit + 1 CPU, 50 pipeline, phần vỏ 224.418 byte gzip. FPS/khung/hình học đạt cả 12 kịch bản trên Chrome 156, Edge 156 và Firefox 146.0.1; bộ nhớ GPU Chrome/Edge `MET`, Firefox `NOT_MET` với counter WDDM bất thường (23 GB, vượt VRAM 6 GB) nên cần công cụ khác. Controls Chrome: 14 control P8 < 100 ms nhưng kéo camera 4/1.380 khoảng khung > 50 ms `NOT_MET`; P9 bật âm ấm 1/30 mẫu 107,5 ms `NOT_MET`. P8/P9 lần đo 1 ngày 09/11/2026 với harness nhịp kéo 16 ms trên đồng hồ đơn điệu (chỉ đổi harness, không đổi app hay ngưỡng) đạt `MET`: P8 420/420 thao tác < 100 ms và 1.380/1.380 khoảng ≤ 50 ms (max 42,1 ms), P9 60/60 mẫu < 100 ms (cold max 72,7 ms, warm max 51 ms), trên Chrome 157 / GTX 1660 Ti / DPR 1; chi tiết và giới hạn ở [real-gpu-2026-11-09](assets/qa/codex/m2/real-gpu-2026-11-09/README.md). Soak liên tục `400ab08` 30 phút/31 vòng: heap cuối −17,98%, đỉnh +1,28% (< 10%, `MET` trên máy này), cùng mức trạng thái vẫn trôi +1,42% đến +2,97%; ObjectURL `NOT_EXERCISED`. Chi tiết: [real-gpu-2026-10-31](assets/qa/codex/m3/real-gpu-2026-10-31/README.md).

## Lệnh tái lập

Dùng Bun 1.4.3 và bộ browser của Playwright 1.58.2. Chạy server dev ở cổng local cố định với VITE_BUILD_SHA là full SHA đã commit; cây mã runtime phải sạch. BENCH_SOURCE_SHA phải khớp HUD của server. Không chạy build/test nặng cùng lúc đo GPU.

```powershell
$env:BENCH_GPU = "real"
$env:BENCH_BROWSER = "chrome" # lặp msedge và firefox
$env:BENCH_DPR = "1"
$env:DESKTOP_BENCH_PORT = "4196"
$env:BENCH_SOURCE_SHA = git rev-parse HEAD
bun scripts/desktop-benchmark.mjs test-results/desktop-chrome
```

Chrome/Edge: harness ghi driver do browser báo (`driverSource: BROWSER_SYSTEM_INFO`, GPU khớp device ID trong renderer). Firefox không báo driver: gán BENCH_GPU_DRIVER từ driver thực của Windows trước khi chạy (`driverSource: OPERATOR_ENV`). Provenance ghi `harnessTreeClean`; số đo làm bằng chứng cần cây mã sạch. Harness từ chối SwiftShader/renderer không xác định. Firefox dùng bản Playwright chạy headed với GPU Windows, ghi version thực; không gọi đây là native Safari. Mỗi scenario 600 bước camera cố định, plain/details và sunny/storm; giữ toàn bộ khoảng thời gian, peak draw calls/tam giác/tài nguyên. FPS là nhịp render thực được engine gửi lên trong cửa sổ 60 RAF, không phải phép đo scanout hay GPU execution trực tiếp.

Counter WDDM chỉ cộng các tiến trình browser con của harness; ghi dedicated/shared/committed, không xuất PID/tên máy. Đây là allocation của cả browser, gồm overhead, không phải riêng texture của app. Khi counter không đọc được, giữ NOT_VERIFIED.

```powershell
$env:P10_PORT = "4196"
bun scripts/p10-benchmark.mjs desktop-soak test-results/desktop-soak
```

Soak warm-up 6 vòng (vòng 5 đã đi qua SPA navigation, vòng 6 tái tạo trạng thái AudioContext tương đương cuối phép đo) rồi ít nhất 30 phút/20 vòng đo, 4 lần đổi mode mỗi vòng, SPA navigation không reload document, thêm/xóa ảnh/ghim, tour, postcard, IndexedDB opt-in, chi tiết minh họa và âm thanh bật/tắt bằng click thật. Audio output được mute, AudioContext vẫn chạy. Số heap lấy sau yêu cầu GC và chờ ổn định; không dùng kết quả này thay phép đo heap tự nhiên. Phải báo thời gian thật, số vòng, tăng heap sau warm-up và các resource sống.

## Production và mô phỏng mạng

Build bằng bun run build; server QA dùng cùng Worker và ASSETS local, không deploy. PRODUCTION_QA_COMPRESSION=gzip bật gzip level 6 theo Accept-Encoding cho HTML/CSS/JS. Đây là mô phỏng transport được khai báo trước khi đo, không sửa asset hay SSR, không chứng nhận cấu hình host thực. [Cloudflare mô tả việc tự thương lượng gzip/Brotli](https://developers.cloudflare.com/workers/runtime-apis/fetch/); host Lovable/Workers thật vẫn chưa được thao tác hoặc nghiệm thu.

Lighthouse 13.5.0 nằm trong toolchain riêng, chỉ định HOME3D_LIGHTHOUSE_TOOLS. scripts/lighthouse-local.mjs đo root production với cấu hình mobile/desktop chuẩn; JSON gzip chỉ thay origin loopback bằng synthetic.invalid. scripts/load-benchmark.mjs dùng Chrome headed GPU thật, 3 context lạnh mỗi viewport rồi reload cùng context sau khi SW control; 150 ms RTT, 1,6 Mbps down/0,75 Mbps up, không throttle CPU; điều kiện mạng áp cho cả trang và mọi service worker (client CDP thứ hai gắn vào worker trước khi worker chạy), mẫu có navigation ngắn hơn 150 ms làm kết luận `NOT_VERIFIED`. FCP/vỏ <2 giây, world lạnh <8 giây, world ấm <2 giây; giữ mọi mẫu chậm. Không dùng routing Playwright trong phép tải vì routing tắt HTTP cache. scripts/startup-timing.mjs đo khung đầu, lúc đủ biến thể shader và lúc sẵn sàng thao tác trên build production (Chrome headed GPU thật, chặn service worker, không throttle, mặc định 5 lượt).

Ngân sách Lighthouse 90 Performance/95 Accessibility ở cả mobile và desktop giữ nguyên. Các kết quả chưa đo ghi NOT_VERIFIED; số không đạt ghi NOT_MET. Android, iPhone và Safari thật đều NOT_VERIFIED.

Kết quả trên máy NVIDIA, trung vị 3 lượt ([real-gpu-2026-11-01](assets/qa/codex/m3/real-gpu-2026-11-01/README.md)): main `5e6aec5` mobile 44, desktop 79 (TBT 1.562/401,5 ms). PR #13 `2c21b54` cho khung đầu chờ shader biên dịch song song (`KHR_parallel_shader_compile`) và làm ấm 18 biến thể khí quyển sau khung đầu: desktop 97 MET (TBT 112,5 ms), mobile 56 NOT_MET (TBT 654,5 ms, FCP 3.776 ms, LCP 4.820 ms). Head mã `07fc66e` giữ splash và điều khiển tới khi mọi biến thể đã biên dịch ([DECISIONS.md](DECISIONS.md)): desktop 97 MET (TBT 84 ms), mobile 50 NOT_MET (TBT 876,5 ms, FCP 3.772 ms, LCP 5.209 ms). Giả thuyết, chưa kiểm: mobile còn bị giới hạn bởi đường mạng mô phỏng 1,6 Mbps và task dựng cảnh nhân CPU ×4, nên muốn đạt có thể phải đổi kiến trúc; không hoãn tải cảnh chỉ để tăng điểm.
