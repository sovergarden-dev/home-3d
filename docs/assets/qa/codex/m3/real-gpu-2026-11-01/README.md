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

Toolchain Lighthouse cài bằng `npm install --ignore-scripts --no-audit --no-fund --before=2026-10-31T00:00:00Z`, hash lock `ec901bd61dcefee85d109a556630eb127d26bbd5ba00e4036156952867b6312e`, nằm ngoài repo và không commit. npm cảnh báo `EBADENGINE` (Lighthouse 13.5.0 khai Node ≥ 22.19); cả 12 lượt chạy không lỗi. CPU có tải nền khoảng 20–28% từ ứng dụng khác; hai nguồn đo cùng buổi nhưng không xen kẽ.

## Nguồn và cách đo

- `5e6aec5fdc0bcb157eb2697fbe514c9b983837a4`: main trước thay đổi, thư mục `lighthouse-main/`.
- `2c21b549ac507e4fac4de979fdfc593cd2c8702a`: commit hiệu năng của PR (khung đầu chờ shader biên dịch song song), thư mục `lighthouse-attempt1/`.

Mỗi nguồn: `bun run build` với `VITE_BUILD_SHA` bằng nguồn, `scripts/production-server.mjs` gzip trên loopback, `scripts/lighthouse-local.mjs` 3 lượt mobile và desktop với cấu hình mặc định (mobile: RTT 150 ms, 1,6 Mbps, CPU ×4; desktop: RTT 40 ms, 10 Mbps, CPU ×1; throttling mô phỏng). JSON gzip chỉ thay origin loopback bằng `synthetic.invalid`; số đo giữ nguyên. Hash script, report và trung vị nằm trong `summary.json` của từng thư mục. Không có host ngoài trong 12 lượt.

## Kết quả

| Nguồn          | Form    | Performance (3 lượt) | Trung vị | Accessibility | FCP (ms) | LCP (ms) | TBT (ms) |
| -------------- | ------- | -------------------- | -------- | ------------- | -------- | -------- | -------- |
| main `5e6aec5` | mobile  | 44 / 45 / 43         | 44       | 100           | 3.775    | 5.468    | 1.562    |
| main `5e6aec5` | desktop | 79 / 78 / 79         | 79       | 100           | 742      | 1.146    | 401,5    |
| PR `2c21b54`   | mobile  | 56 / 56 / 58         | 56       | 100           | 3.776    | 4.820    | 654,5    |
| PR `2c21b54`   | desktop | 97 / 97 / 98         | 97       | 100           | 738      | 967      | 112,5    |

FCP, LCP và TBT là trung vị của từng chỉ số. Ngưỡng Performance ≥ 90: desktop `MET` ở `2c21b54`, mobile `NOT_MET` (56). Accessibility ≥ 95: `MET` cả hai. CLS mọi lượt ≤ 0,031 (điểm CLS 1); giá trị 0,031 đã có ở lượt 3 của main nên không do thay đổi này.

## Chẩn đoán

Ở main, lượt mobile 1 có một task chính 917,9 ms khi chunk `demoScene` chạy. CPU profile production lạnh (Chrome headed, hồ sơ mới, chặn service worker) thấy task dài 805 ms: khoảng 456–459 ms chờ đồng bộ link shader trong lần render đầu, khoảng 116 ms `atmosphere.warm` (18 lần `renderer.compile`), khoảng 200 ms dựng cảnh.

Commit `2c21b54` gửi biên dịch chương trình của trạng thái đang hiển thị, hỏi trạng thái hoàn tất qua `KHR_parallel_shader_compile` (không chặn) rồi mới vẽ khung đầu; trình duyệt không có extension giữ đường đồng bộ cũ. 18 biến thể khí quyển được làm ấm mỗi task một biến thể sau khung đầu. Splash và điều khiển chờ khung đầu thật (`ready`) thay vì chỉ chờ dựng xong.

Profile production lạnh sau thay đổi (2 lượt): task dựng còn 425 và 304 ms, render đầu tách thành task 59 ms. Trong task dựng, `canvas.getContext("webgl2")` chiếm khoảng 150–300 ms vì GPU process còn bận ở khoảng 270 ms sau điều hướng; phần này không chia nhỏ được từ JS. Profile chỉ dùng chẩn đoán, không lưu raw.

Mobile vẫn `NOT_MET`: mô phỏng Lantern tính mọi request bắt đầu trước FCP quan sát (khoảng 300 ms) vào đường 1,6 Mbps, gồm `index` 164 KB gzip, `demoScene` 180 KB gzip, 7 font và favicon. FCP quan sát muộn vì đánh giá JS và hydrate chiếm main thread trước lần vẽ đầu. TBT mobile chủ yếu là task dựng nhân CPU ×4. Mobile ≥ 90 cần đổi kiến trúc (entry nhỏ hơn, render ngoài main thread hoặc tương đương). Không hoãn tải cảnh tới sau FCP chỉ để tăng điểm, vì canvas không phải ứng viên LCP và người dùng chỉ thấy cảnh muộn hơn.

## Giới hạn

Một máy, có tải nền, Chrome headless; mỗi nguồn 3 lượt, các lượt mobile lệch nhau 1–2 điểm. Lighthouse mô phỏng không phải đo trên thiết bị: Android, iPhone và Safari thật `NOT_VERIFIED`. Node 22.14 thấp hơn engines của Lighthouse 13.5.0.
