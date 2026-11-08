# Bằng chứng M3 trên GPU thật — 02/11/2026

Notion AI đo trên máy Windows của chủ dự án, chỉ dùng fixture tổng hợp. Nguồn và harness cùng là `252f5e7b3f32d8e45749356da7587740008bde7a`: nhánh `codex/m3-measurements` (ba commit harness) merge main `69543c2`; mã app giống main `69543c2`, chỉ khác ba script đo. Cây mã sạch khi đo (`harnessTreeClean: true`).

| Mục     | Giá trị                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| GPU     | NVIDIA GeForce GTX 1660 Ti, ANGLE D3D11                                                                      |
| Driver  | `32.0.16.1074`, do Chrome báo (`driverSource: BROWSER_SYSTEM_INFO`), không phải biến do người chạy gán       |
| Browser | Chrome 156.0.8078.47 headed, `REAL_GPU`                                                                      |
| Build   | production `252f5e7` (SHA đọc từ UI khớp `BENCH_SOURCE_SHA`), `scripts/production-server.mjs` loopback, gzip |

## Tải 4G — `load-4g/report.json`

Script `scripts/load-benchmark.mjs`: CDP mô phỏng độ trễ 150 ms, 1,6 Mbps xuống / 0,75 Mbps lên, không throttle CPU, không routing của Playwright. Hai viewport (1440×900, 390×844), mỗi viewport 3 context riêng: tải cold, rồi reload trong cùng context sau khi service worker đã điều khiển trang (warm).

Khác lượt đo 30/10 ([handoff-2026-10-30](../handoff-2026-10-30/README.md)): một client CDP thứ hai gắn vào mọi service worker trước khi worker chạy và áp cùng điều kiện mạng, nên request do worker gửi cũng chịu mạng mô phỏng. Một mẫu chỉ được tính khi navigation (fetchStart → responseEnd) mất ít nhất 150 ms; lượt warm còn cần mọi context có worker đã throttle (script lúc đo đếm tổng; từ PR `codex/m3-followups-2` kiểm theo từng context, xem Giới hạn). Thiếu một trong hai thì kết luận là `NOT_VERIFIED`.

| Lượt | Mẫu | FCP (ms) | World sẵn sàng (ms) | Navigation (ms) | Navigation qua worker | Ngưỡng                | Kết luận |
| ---- | --- | -------- | ------------------- | --------------- | --------------------- | --------------------- | -------- |
| Cold | 6   | 700–916  | 3.996–4.493         | 192–204         | 0/6                   | vỏ < 2 s, world < 8 s | `MET`    |
| Warm | 6   | 220–240  | 595–642             | 194–207         | 6/6                   | vỏ < 2 s, world < 2 s | `MET`    |

Service worker: gắn 6, throttle 6, lỗi 0. Không có host ngoài. Navigation warm 194–207 ms, còn ở lượt 30/10 là 22,8–40,7 ms (không chịu throttle), nên lần này request của worker đã đi qua mạng mô phỏng. Ở mỗi mẫu warm, 15/17 tài nguyên do cache của worker trả nên world sẵn sàng nhanh; đó là đường warm thật của app. 2/17 tài nguyên (20.673 byte và một fetch 315 byte) đi mạng qua worker, mất 166–283 ms, nên cũng chịu mạng mô phỏng. Trường `serviceWorkerControlled` ở lượt cold là trạng thái lúc đo xong (worker nhận trang sau khi cài); navigation cold không đi qua worker.

## Thời gian khởi động — `startup/startup-timing.json`

Script `scripts/startup-timing.mjs` (review delta PR #13 mục R-N5): Chrome headed trên GPU thật (`KHR_parallel_shader_compile` có), 1280×720 DPR 1, chặn service worker, không throttle, 5 lượt, mỗi lượt context mới sau một tài liệu cùng origin không có script. Mốc đo bằng `performance.now()` trong trang; trung vị trên cả 5 lượt, không bỏ mẫu.

| Mốc                                            | Trung vị (ms) | Khoảng (ms) |
| ---------------------------------------------- | ------------- | ----------- |
| FCP                                            | 96            | 96–344      |
| Khung đầu (`data-memory-geometries` xuất hiện) | 420           | 403–642     |
| 18/18 biến thể đã gửi biên dịch                | 545           | 519–799     |
| Sẵn sàng thao tác (`data-scene-state=ready`)   | 558           | 531–919     |
| Khung đầu → sẵn sàng                           | 133           | 127–277     |

Lượt 1 chậm nhất ở mọi mốc. Không có long task (> 50 ms) nào sau khung đầu ở cả 5 lượt. Trước khung đầu, mỗi lượt có một task: lượt 1 dài 262 ms, lượt 2–5 dài 85–92 ms; lượt 4–5 thêm một task 55–56 ms lúc đầu trang. Lượt 01/11 bằng script tạm ở `07fc66e` cùng mức: khung đầu → sẵn sàng 125–280 ms, trung vị 141 ms ([real-gpu-2026-11-01](../real-gpu-2026-11-01/README.md)). Cả 5 lượt có đủ bốn mốc (FCP, khung đầu, đủ biến thể, sẵn sàng), nên trung vị không bỏ giá trị nào; script sau PR #15 dừng với lỗi nếu thiếu mốc.

## Giới hạn

Một máy, có tải nền. Mạng mô phỏng bằng CDP, không phải mạng di động thật; điện thoại, Safari thật và Firefox không đo ở đây. Phép đo khởi động chỉ trên Chrome desktop có extension.

CDP áp điều kiện mạng cho từng target, nên trang và service worker mỗi bên có 1,6 Mbps riêng; lúc cold, tải của worker không tranh băng thông với trang như trên một đường mạng thật, nên số cold có thể lạc quan (suy luận từ cách CDP áp theo target, chưa kiểm).

Raw do harness ở `252f5e7` ghi: chỉ có tổng worker gắn 6, throttle 6 cho 6 context, chưa có cờ theo từng context (review PR #15 mục N1). Mỗi navigation warm qua worker mất 194–207 ms, không dưới 150 ms, còn khi bỏ throttle worker chỉ 6,3–8,3 ms, nên coi worker của từng context đã chịu throttle; không đo lại. Driver lấy theo device ID có trong renderer; quy tắc chọn driver sau PR #15 cho cùng kết quả.

## Tệp

Raw giữ nguyên byte như script ghi, không chạy Prettier, nên hash dưới đây là của tệp trong repo.

| Tệp                           | Byte   | SHA-256                                                            |
| ----------------------------- | ------ | ------------------------------------------------------------------ |
| `load-4g/report.json`         | 62.275 | `636bdaae1227b422a94a114744c8da0f3e54062a10833e43390203b509b70956` |
| `startup/startup-timing.json` | 3.272  | `b614f1ac3a650ed5e434cd0359a17627596f137b945d7013a056da9cfe681a5d` |
