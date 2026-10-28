# M0 — baseline do Codex đo trên Windows

Nguồn app: checkout đóng băng `de7173261a8a3928685555252c2b479f76a713fe`. Server chạy từ checkout này; đã kiểm SHA trong HTML/UI và đường dẫn source module phục vụ. Không dùng dữ liệu khu thật.

- [Tổng hợp baseline](baseline-overview.json), raw trong `real-dpr1/` và `real-native/`.
- [H6 20 vòng trên GPU thật](h6-real.json): một lượt thành công 44.351 ms; giữ riêng hai lượt chưa đạt (setup và timeout), không gọi chúng là pass. Fingerprint file test gắn evidence với nội dung trước commit.
- [Production smoke](production-smoke.json): build Cloudflare-module phục vụ loopback, SHA đúng baseline, sentinel không ra SSR/build/storage/mạng. Nhãn SwiftShader của harness cũ không phải phép đo renderer; xem raw GPU riêng.
- [Check ứng viên trên Windows](windows-check.json): 362 unit, 39 pipeline, typecheck/lint/build đạt; fingerprint source trước commit. [E2E baseline](windows-e2e-overview.json) và ba raw report ghi cả pass/fail/skip. Đường dẫn workspace đã bỏ, chuỗi IP loopback đổi thành `[loopback]`; số đo không lọc. Trace Chromium đầu bị output mặc định của lượt kế tiếp dọn; JSON lỗi vẫn giữ, các lượt sau có bản sao artifact riêng.

GPU: Intel UHD Graphics qua ANGLE Direct3D11, driver 32.0.101.7082; Chrome headed 152.0.7977.76. Viewport 1440×900. DPR gốc quan sát được bằng 1, nên hai nhóm raw là các lượt lặp cùng DPR hiệu dụng. Không suy GPU memory từ heap/counter. Không suy FPS GPU vật lý từ nhịp requestAnimationFrame.

Latency baseline gồm 15 mẫu thêm và 15 mẫu xoá ở mỗi nhóm, giữ mọi mẫu chậm. DPR 1: p50 thêm 135,1 ms, xoá 116,7 ms; native: 141,7/138,6 ms. Đây chưa đủ ma trận và số mẫu của M1; không gọi H đã khép. Tên `after-raw.json` là tên cũ của battery P10; ở M0 nó vẫn đo app baseline, không phải một bản app sau sửa.

Chạy lại từ checkout chứa harness mới, với server baseline đã bật `VITE_BUILD_SHA` bằng SHA Git thực của chính checkout server:

```powershell
$env:BENCH_GPU = 'real'
$env:BENCH_BROWSER = 'chrome'
$env:BENCH_GPU_DRIVER = '<driver đã đọc từ máy>'
$env:BENCH_SOURCE_SHA = 'de7173261a8a3928685555252c2b479f76a713fe'
$env:BENCH_DPR = '1' # hoặc native
$env:P10_PORT = '4184'
node scripts/p10-baseline.mjs 4184 before <thư-mục-evidence>
node scripts/p10-latency.mjs <thư-mục-evidence>
bun scripts/p10-benchmark.mjs perf <thư-mục-evidence>
$env:BENCH_BASE_URL = 'http://127.0.0.1:4184'
$env:REQUIRE_WEBGL2 = '1'
bun x playwright test --config playwright.hardware.config.ts --grep '20 mode/route/package/capture'
```

Các lệnh GPU chạy tuần tự. `harnessSha` xác định checkout chạy harness; `sourceSha` lấy từ UI của server được đo và kiểm với giá trị yêu cầu. Không lấy HEAD của harness để gán cho server khác.
