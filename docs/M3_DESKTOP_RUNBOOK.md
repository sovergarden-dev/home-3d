# M3 — Desktop, offline và khả năng tiếp cận

`PARTIAL`: phần mềm đã tích hợp; số đo cuối và cổng CI chưa hoàn tất. Chỉ fixture tổng hợp; không có nghiệm thu khu thật hay thiết bị di động.

## Đã kiểm

- Check tích hợp: 401 unit, 50 pipeline, lint/type/build đạt; phần vỏ 224.355 byte gzip <250.000, engine lazy riêng.
- 5 test PWA production đạt tại `5e093ccc471464e9cd5d8bae86335b87afdae6be`: offline, iframe không đăng ký, xác nhận cập nhật/giữ tab khác, install lỗi, rollback giữ cache đã activate. Review độc lập đã đóng các phát hiện source; không thay bằng chứng browser bằng review.
- Font Be Vietnam Pro/Lora Vietnamese + Latin tự host, giữ OFL và nguồn/hash. Test mạng chỉ cho loopback, không ngoại lệ Google Fonts.
- Axe mở rộng đã sửa nút bị panel che ở landscape; cả 9 ca (3 viewport × 3 browser) đạt, gồm VI/EN và kiểm bàn phím. Không thay kiểm thiết bị/Safari thật bằng kết quả này.

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

Gán BENCH_GPU_DRIVER từ driver thực của Windows trước khi chạy. Harness từ chối SwiftShader/renderer không xác định. Firefox dùng bản Playwright chạy headed với GPU Windows, ghi version thực; không gọi đây là native Safari. Mỗi scenario 600 bước camera cố định, plain/details và sunny/storm; giữ toàn bộ khoảng thời gian, peak draw calls/tam giác/tài nguyên. FPS là nhịp render thực được engine gửi lên trong cửa sổ 60 RAF, không phải phép đo scanout hay GPU execution trực tiếp.

Counter WDDM chỉ cộng các tiến trình browser con của harness; ghi dedicated/shared/committed, không xuất PID/tên máy. Đây là allocation của cả browser, gồm overhead, không phải riêng texture của app. Khi counter không đọc được, giữ NOT_VERIFIED.

```powershell
$env:P10_PORT = "4196"
bun scripts/p10-benchmark.mjs desktop-soak test-results/desktop-soak
```

Soak warm-up 6 vòng (vòng 5 đã đi qua SPA navigation, vòng 6 tái tạo trạng thái AudioContext tương đương cuối phép đo) rồi ít nhất 30 phút/20 vòng đo, 4 lần đổi mode mỗi vòng, SPA navigation không reload document, thêm/xóa ảnh/ghim, tour, postcard, IndexedDB opt-in, chi tiết minh họa và âm thanh bật/tắt bằng click thật. Audio output được mute, AudioContext vẫn chạy. Số heap lấy sau yêu cầu GC và chờ ổn định; không dùng kết quả này thay phép đo heap tự nhiên. Phải báo thời gian thật, số vòng, tăng heap sau warm-up và các resource sống.

## Production và mô phỏng mạng

Build bằng bun run build; server QA dùng cùng Worker và ASSETS local, không deploy. PRODUCTION_QA_COMPRESSION=gzip bật gzip level 6 theo Accept-Encoding cho HTML/CSS/JS. Đây là mô phỏng transport được khai báo trước khi đo, không sửa asset hay SSR, không chứng nhận cấu hình host thực. [Cloudflare mô tả việc tự thương lượng gzip/Brotli](https://developers.cloudflare.com/workers/runtime-apis/fetch/); host Lovable/Workers thật vẫn chưa được thao tác hoặc nghiệm thu.

Lighthouse 13.5.0 nằm trong toolchain riêng, chỉ định HOME3D_LIGHTHOUSE_TOOLS. scripts/lighthouse-local.mjs đo root production với cấu hình mobile/desktop chuẩn; JSON gzip chỉ thay origin loopback bằng synthetic.invalid. scripts/load-benchmark.mjs dùng Chrome headed GPU thật, 3 context lạnh mỗi viewport rồi reload cùng context sau khi SW control; 150 ms RTT, 1,6 Mbps down/0,75 Mbps up, không throttle CPU. FCP/vỏ <2 giây, world lạnh <8 giây, world ấm <2 giây; giữ mọi mẫu chậm. Không dùng routing Playwright trong phép tải vì routing tắt HTTP cache.

Ngân sách Lighthouse 90 Performance/95 Accessibility ở cả mobile và desktop giữ nguyên. Các kết quả chưa đo ghi NOT_VERIFIED; số không đạt ghi NOT_MET. Android, iPhone và Safari thật đều NOT_VERIFIED.
