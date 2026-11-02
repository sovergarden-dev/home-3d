# GPU thật Windows — 01/11/2026 (Lighthouse)

Chỉ fixture tổng hợp. Notion AI đo qua Aki MCP trên cùng máy Windows của chủ dự án như [đợt 31/10](../real-gpu-2026-10-31/README.md). Số ở đây không trộn với lượt Lighthouse `a948321` trên Intel UHD hay runner CI. Lighthouse là phép đo mô phỏng, không thay thiết bị di động thật.

## Môi trường

| Mục          | Giá trị                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| GPU          | NVIDIA GeForce GTX 1660 Ti 6 GB, driver `32.0.16.1074`                                                    |
| WebGL        | `ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)`                 |
| CPU/RAM      | Intel Core i7-10700 (8 nhân/16 luồng), 29 GiB                                                             |
| Hệ điều hành | Windows 10.0.26200                                                                                        |
| Trình duyệt  | Chrome 156.0.8078.47 headless, chrome-launcher mở hồ sơ mới mỗi lượt                                      |
| Toolchain    | Node 22.14.0; Bun 1.4.3 qua `npx`; Lighthouse 13.5.0 và chrome-launcher 1.2.2 trong thư mục QA ngoài repo |

Toolchain Lighthouse cài bằng `npm install --ignore-scripts --no-audit --no-fund --before=2026-10-31T00:00:00Z`, hash lock `ec901bd61dcefee85d109a556630eb127d26bbd5ba00e4036156952867b6312e`, nằm ngoài repo và không commit. npm cảnh báo `EBADENGINE` (Lighthouse 13.5.0 khai Node ≥ 22.19); cả 18 lượt chạy không lỗi. CPU có tải nền khoảng 20–28% từ ứng dụng khác; các nguồn đo cùng buổi nhưng không xen kẽ.

## Nguồn và cách đo

- `5e6aec5fdc0bcb157eb2697fbe514c9b983837a4`: main trước thay đổi, thư mục `lighthouse-main/`.
- `2c21b549ac507e4fac4de979fdfc593cd2c8702a`: commit hiệu năng của PR (khung đầu chờ shader biên dịch song song), thư mục `lighthouse-attempt1/`.
- `07fc66e14f89461fb74e348db1371b0b047f4979`: head mã của PR sau review độc lập (thao tác chỉ mở khi mọi biến thể đã biên dịch), thư mục `lighthouse-attempt1-review/`. Vẫn là vòng thử 1, đo lại vì hành vi khởi động đổi; không phải vòng tối ưu mới.

Mỗi nguồn, từ gốc repo ở đúng commit, cây mã sạch:

1. `bun run build` với `VITE_BUILD_SHA=<sha>`.
2. `bun scripts/production-server.mjs` với `PRODUCTION_QA_PORT=4193`, `PRODUCTION_QA_COMPRESSION=gzip`.
3. Ba lượt `node scripts/lighthouse-local.mjs test-results/lighthouse-real-<n>` với `HOME3D_LIGHTHOUSE_TOOLS=<thư mục toolchain>`, `BENCH_SOURCE_SHA=<sha>`, `BENCH_GPU_DRIVER=32.0.16.1074` và hai biến server ở trên; chép `summary.json`, `mobile.json.gz`, `desktop.json.gz` của lượt `<n>` vào `run-<n>/`.
4. `node scripts/lighthouse-summary.mjs <thư mục>` ghi `summary.json` gộp; `node scripts/lighthouse-summary.mjs <thư mục> --check` tính lại và so với tệp đã commit.

Một runner tạm ngoài repo đã chạy các bước 1–3 (kèm lọc đường dẫn máy, user, host trước khi ghi) và gộp kết quả. `lighthouse-summary.mjs --check` đạt cho cả ba thư mục: dòng, trung vị, nhãn, hash và kích thước report, cùng hash script ở commit nguồn đều tính lại được từ tệp đã commit. Phần không suy ra được từ tệp (phiên bản Node, toolchain, hash lock, lệnh cài, chế độ build, số lượt yêu cầu) giữ từ `summary.json` gốc; khi tạo mới, script đọc toolchain từ `HOME3D_LIGHTHOUSE_TOOLS`.

Cấu hình mặc định của Lighthouse: mobile RTT 150 ms, 1,6 Mbps, CPU ×4; desktop RTT 40 ms, 10 Mbps, CPU ×1; throttling mô phỏng. JSON gzip chỉ thay origin loopback bằng `synthetic.invalid`; số đo giữ nguyên. Không có host ngoài trong 18 lượt.

## Kết quả

| Nguồn          | Form    | Performance (3 lượt) | Trung vị | Accessibility | FCP (ms) | LCP (ms) | TBT (ms) |
| -------------- | ------- | -------------------- | -------- | ------------- | -------- | -------- | -------- |
| main `5e6aec5` | mobile  | 44 / 45 / 43         | 44       | 100           | 3.775    | 5.468    | 1.562    |
| main `5e6aec5` | desktop | 79 / 78 / 79         | 79       | 100           | 742      | 1.146    | 401,5    |
| PR `2c21b54`   | mobile  | 56 / 56 / 58         | 56       | 100           | 3.776    | 4.820    | 654,5    |
| PR `2c21b54`   | desktop | 97 / 97 / 98         | 97       | 100           | 738      | 967      | 112,5    |
| PR `07fc66e`   | mobile  | 42 / 50 / 58         | 50       | 100           | 3.772    | 5.209    | 876,5    |
| PR `07fc66e`   | desktop | 98 / 97 / 97         | 97       | 100           | 734      | 969      | 84       |

FCP, LCP và TBT là trung vị của từng chỉ số. Ngưỡng Performance ≥ 90: desktop `MET` ở cả hai commit PR, mobile `NOT_MET`. Accessibility ≥ 95: `MET` mọi nguồn.

CLS từng lượt (mobile; desktop):

- main `5e6aec5`: 0 / 0 / 0,0307; 0,0114 / 0,0093 / 0,0047.
- `2c21b54`: 0,0309 / 0,0307 / 0,0307; 0,0093 / 0,0093 / 0,0095.
- `07fc66e`: 0 / 0,0287 / 0,0290; 0,0089 / 0,0087 / 0,0089.

Mọi lượt dưới 0,1. Không suy luận nguyên nhân của các giá trị khác 0.

## Thời gian khởi động ở `07fc66e`

Raw: `startup-timing-07fc66e.json`. Build production, server gzip loopback, Chrome headed trên GPU thật (`KHR_parallel_shader_compile` có), 1280×720 DPR 1, chặn service worker, không throttle, 5 lượt, mỗi lượt context mới. Mốc đo bằng `performance.now()` trong trang.

| Mốc                                            | Trung vị (ms) | Khoảng (ms) |
| ---------------------------------------------- | ------------- | ----------- |
| FCP                                            | 96            | 88–528      |
| Khung đầu (`data-memory-geometries` xuất hiện) | 421           | 394–835     |
| 18/18 biến thể đã gửi biên dịch                | 548           | 508–994     |
| Sẵn sàng thao tác (`data-scene-state=ready`)   | 562           | 521–1.115   |
| Khung đầu → sẵn sàng                           | 141           | 125–280     |

Lượt 1 chậm nhất ở mọi mốc. Không có long task (> 50 ms) nào sau khung đầu; trước khung đầu, lượt 2–5 có một task 88–93 ms, lượt 1 có task 56 và 439 ms.

## Chẩn đoán

Ở main, lượt mobile 1 có một task chính 917,9 ms khi chunk `demoScene` chạy (audit `main-thread-tasks`, thời gian quan sát trong trace; raw đã lưu). CPU profile production lạnh (Chrome headed, hồ sơ mới, chặn service worker; chẩn đoán, không lưu raw) thấy task dài 805 ms: khoảng 456–459 ms chờ đồng bộ link shader trong lần render đầu, khoảng 116 ms `atmosphere.warm` (18 lần `renderer.compile`), khoảng 200 ms dựng cảnh.

Commit `2c21b54` gửi biên dịch chương trình của trạng thái đang hiển thị, hỏi trạng thái hoàn tất qua `KHR_parallel_shader_compile` (không chặn) rồi mới vẽ khung đầu. Trình duyệt không có extension không có trạng thái để hỏi: khung đầu vẽ ngay và chương trình link khi dùng lần đầu, như main. 18 biến thể khí quyển được biên dịch mỗi task một biến thể sau khung đầu. Ở `2c21b54`, splash và điều khiển mở ngay sau khung đầu, trước khi các biến thể xong; review độc lập chỉ ra điều này trái AGENTS.md. Ở `07fc66e`, splash và điều khiển chờ tới khi mọi biến thể đã gửi biên dịch và, nếu có extension, đã link xong (xem [DECISIONS.md](../../../../../DECISIONS.md)).

Profile production lạnh ở `2c21b54` (2 lượt; chẩn đoán, không lưu raw): task dựng còn 425 và 304 ms, render đầu tách thành task 59 ms; trong task dựng, `canvas.getContext("webgl2")` chiếm khoảng 150–300 ms. Giả thuyết, chưa kiểm: GPU process còn bận khoảng 270 ms sau điều hướng. Lời gọi này là một lời gọi đồng bộ nên không chia nhỏ được từ JS.

Task lớn nhất của từng lượt mobile, cùng một cơ sở là audit `main-thread-tasks` (thời gian quan sát trong trace, chưa nhân throttle): main 917,9 / 813,1 / 864,9 ms; `2c21b54` 266,2 / 242,3 / 178,3 ms; `07fc66e` 671,5 / 438,8 / 238,1 ms, lượt 1 thêm một task 283,5 ms. Ở `07fc66e`, lượt 3 cùng cỡ `2c21b54`, lượt 1–2 lớn hơn; chưa xác định vì sao (`NOT_VERIFIED`). Audit `long-tasks` báo thời gian mô phỏng của Lantern, khác cơ sở (main lượt 1: 1.836 ms; `07fc66e` lượt 1: 1.343 và 1.134 ms), nên không so với số quan sát. Phép đo khởi động ở trên không thấy task dài sau khung đầu.

Mobile vẫn `NOT_MET`. Theo report: mô phỏng Lantern tính mọi request bắt đầu trước FCP quan sát (khoảng 300 ms) vào đường 1,6 Mbps, gồm `index` 164 KB gzip, `demoScene` 180 KB gzip, 7 font và favicon; TBT mobile chủ yếu là task dựng nhân CPU ×4. Giả thuyết, chưa thử: FCP quan sát muộn vì đánh giá JS và hydrate chiếm main thread trước lần vẽ đầu, nên mobile ≥ 90 có thể cần đổi kiến trúc (entry nhỏ hơn, render ngoài main thread hoặc tương đương). Không hoãn tải cảnh tới sau FCP chỉ để tăng điểm, vì canvas không phải ứng viên LCP và người dùng chỉ thấy cảnh muộn hơn.

## Giới hạn

Một máy, có tải nền, Chrome headless; mỗi nguồn 3 lượt, các lượt mobile lệch nhau tới 16 điểm ở `07fc66e`. Lighthouse mô phỏng không phải đo trên thiết bị: Android, iPhone và Safari thật `NOT_VERIFIED`. Node 22.14 thấp hơn engines của Lighthouse 13.5.0. Phép đo khởi động chỉ trên Chrome desktop có extension; đường không có extension chỉ kiểm bằng e2e.
