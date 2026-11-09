# M2 — P8/P9 lần đo 1 trên GPU thật (09/11/2026)

Bằng chứng cho `patches/controls-attribution.patch` trên nhánh `codex/m2-controls-attribution`. Chỉ đổi harness đo, không đổi app, không đổi ngưỡng, timeout, retry hay assertion.

## Nguồn và hash

- Harness và build runtime: `1423f104e1ea2bcfc19db4b64c15fbbf944a0dec`. `sourceSha`, `harnessSha` và `harnessTreeClean: true` được ghi trong `raw.json` của cả hai họ; `VITE_BUILD_SHA` của dev server trùng full SHA này.
- `scriptSha256` (SHA-256 của `scripts/controls-benchmark.mjs` lúc chạy): `a28194b99831acc8ffee2023cdb784bd833c12b8927ba5176ed911535776ae7b` (cả p8 và p9).
- `fixtureSha256`: p8 `01e1eb6847932115caf945b4099a2a1864a86ec508163ac72f94c58a480a3b89`; p9 `built-in-synthetic-demo`. `randomSeed: 81273`; đồng hồ cảnh `2026-06-21`, 720 phút, tốc độ 0. Chỉ fixture tổng hợp, không có dữ liệu khu thật.
- Môi trường (trích `raw.json`): `REAL_GPU`, Chrome headed `157.0.8103.38`, DPR 1, viewport 1440×900, renderer `ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)`, driver `32.0.16.1074` (`BROWSER_SYSTEM_INFO`, `DEVICE_ID`), `WINDOWS_LOCAL`. `syntheticOnly: true`, `mutedAudioOutput: true`, `errors: []`.
- Tệp: `p8/raw.json` 258.850 byte, `p8/summary.json` 4.787 byte, `p9/raw.json` 24.039 byte, `p9/summary.json` 872 byte; mọi tệp dưới 1 MB.

## Phương pháp

- Dev server Vite bắt buộc (`bun run dev --host 127.0.0.1 --port 4196 --strictPort`), không dùng bản production. Env: `CONTROL_PORT=4196`, `CONTROL_ROUNDS=30`, `BENCH_GPU=real`, `BENCH_BROWSER=chrome`, `BENCH_DPR=1`, `BENCH_SOURCE_SHA` trùng full SHA ở trên. Không chạy build hay test nặng cùng lúc đo.
- Patch thay `page.waitForTimeout(16)` bằng `pause(16)` quay trên đồng hồ đơn điệu (`performance.now()` + `setImmediate`): 48 bước kéo, nghỉ 16 ms sau mỗi bước. Trên máy này timer Node 16 ms thực tế bắn khoảng 30,7 ms (p50), còn vòng quay đơn điệu đạt 16,006 ms (p50) — chẩn đoán trong `HANDOFF.md` mục 5. Thêm observer long-animation-frame (bỏ origin script), timestamp `pointermove`, `endFrames` chờ 2 rAF bất đồng bộ, và đếm `longFrames` cho từng thao tác. Quy tắc `status` không đổi.
- Khoảng kéo là **nhịp submit khung hình chính**, đo từ sự kiện input tới lần nộp khung khớp, fence GPU quan sát được và rAF tiếp theo. Không phải thời gian thực thi GPU, không phải thời điểm hiển thị vật lý. `longFrames` và timestamp `pointermove` chỉ để quy nguyên nhân, không làm đổi `status`. `frames.statistics` của p9 là `null` vì p9 không có vòng kéo.
- `H6` CI và phép đo này là hai bằng chứng khác nhau; CI xanh không thay đo GPU thật, skip không phải pass.

## Kết quả

| Họ  | Vòng | Kết luận | Số liệu chính                                                                                                                                                                                           |
| --- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p8  | 30   | `MET`    | 420/420 thao tác < 100 ms (max 45,9 ms, p95 cao nhất 38 ms); 1.380/1.380 khoảng kéo ≤ 50 ms (p50 27,6 ms, p95 28,9 ms, max 42,1 ms); 0 khung dài, 0 `newProgramLinks`, 0 lỗi                            |
| p9  | 30   | `MET`    | 60/60 mẫu < 100 ms; `cold-sound-on` p50 51,7 ms, p95 72,3 ms, max 72,7 ms; `warm-sound-on` p50 34,05 ms, p95 46 ms, max 51 ms; 0 `newProgramLinks`, 0 lỗi; 2 `longFrames` ở cold chỉ là quy nguyên nhân |

So với bằng chứng cũ `a4f0121` (`docs/assets/qa/codex/m3/real-gpu-2026-10-31/`): P8 trước có 4/1.380 khoảng > 50 ms, P9 trước có 1/30 warm 107,5 ms. Số liệu mới nhất quán với chẩn đoán rằng nhịp timer của harness cũ là nguồn chính của các khoảng vượt ngưỡng (**suy luận**, không đo lại trên app, không sửa app).

## Giới hạn

- **Không xác nhận toàn vòng đời P8.** Chỉ 30 vòng trên một máy, một GPU, một trình duyệt, DPR 1, ở trạng thái cảnh cố định. Không đo mẫu âm thanh nghe được đầu tiên, không kết luận về cold-start browser mới (cold ở p9 là `AudioContext` mới trên trang mới trong cùng một browser process), không khẳng định không còn crash WebKit.
- Bộ nhớ GPU vật lý không được đo: `memoryMeaning` ghi rõ heap và counter renderer không phải bộ nhớ GPU vật lý. Công cụ bộ nhớ GPU cho Firefox là việc riêng (HANDOFF mục 6).
- Đây là **lần đo 1** theo §5.6. Lần 2–3 chỉ khi `NOT_MET` và có quy nguyên nhân phía app; tối đa 3 lần cho mỗi mục. Không nới ngưỡng (P8: thao tác < 100 ms, khoảng kéo ≤ 50 ms; P9: < 100 ms).
- Raw đã quét riêng tư: 0 finding; không có đường dẫn máy, tên user, email thật, IP ngoài loopback, token, account ID, route/domain hay dữ liệu khu thật.
