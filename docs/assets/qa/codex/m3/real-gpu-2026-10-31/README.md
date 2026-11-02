# GPU thật Windows — 31/10/2026

Chỉ fixture tổng hợp. Notion AI đo qua Aki MCP trên máy Windows của chủ dự án. Số của máy này không trộn với số máy Intel UHD cũ (M0–M1), máy Linux không GPU hay runner CI; mọi so sánh dưới đây là cùng máy, cùng harness, đo xen kẽ. GPU thật không thay cổng CI.

## Môi trường

| Mục          | Giá trị                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| GPU          | NVIDIA GeForce GTX 1660 Ti 6 GB, driver `32.0.16.1074`                                                    |
| WebGL        | `ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)`, DPR 1          |
| CPU/RAM      | Intel Core i7-10700 (8 nhân/16 luồng), 29 GiB                                                             |
| Hệ điều hành | Windows 10.0.26200                                                                                        |
| Trình duyệt  | Chrome 156.0.8078.47, Edge 156.0.4314.50 (headed); Firefox 146.0.1 và WebKit 26.0 của Playwright 1.58.2   |
| Toolchain    | Node 22.14.0; Bun 1.4.3 qua `npx` (không dùng Bun toàn máy); `bun install --frozen-lockfile` mỗi checkout |

GPU có tải nền khoảng 32% từ ứng dụng khác trước khi đo. Các nguồn được đo xen kẽ nên nhiễu chia đều, nhưng số tuyệt đối không phải của máy rảnh. Firefox che chuỗi renderer (`GeForce GTX 980 …, or similar`); GPU thật vẫn là GTX 1660 Ti.

## Nguồn

- Baseline `de7173261a8a3928685555252c2b479f76a713fe` (baseline app của P10/M1).
- Ứng viên `fba1e09f8093ea77fa79355f9a5098926fdc1b3e` cho H6 và K1.
- Head đã push trước đó `4e5136f1cfdcd5e69a31af7a7455d5fa2f40c74a`, chỉ dùng trong H6 để thấy tác động của `d4fca77`.
- `a4f01210f9c51c5a363b5f23f0feb97c7b6cf15b` chỉ đổi splash: thanh tiến trình có `role="progressbar"`, tên dịch VI/EN và giá trị làm tròn (runtime diff so với `fba1e09` chỉ gồm `Splash.tsx`, `vi.ts`, `en.ts`). FPS, controls và E2E sau sửa đo trực tiếp ở đây. H6 và K1 không đo lại: K1 chạy khi splash đã unmount; trong H6 splash mount lại vô hình khoảng 250 ms mỗi lần quay về route chính, nên số H6 dưới đây chỉ là của `fba1e09`; cổng H6 của head lấy từ CI.
- `400ab08be62ba08f3cd2918bcb09b91e4790a3eb` chỉ đổi harness soak, `build-pwa` và `public/.assetsignore`; `src/` giống hệt `a4f0121`. Soak lần hai chạy ở đây.

Mỗi nguồn chạy server Vite riêng từ checkout ghim, có `VITE_BUILD_SHA` và cây mã runtime sạch. Raw gốc được ghi lại JSON sau khi thay đường dẫn bằng `<REPO>` và bỏ tên máy/user; số đo giữ nguyên.

## H6 hardware — 20 chu kỳ

Spec `20 mode/route/package/capture cycles keep one ready canvas and no page errors` qua `playwright.hardware.config.ts`, Chrome headed 1440×900. Harness của ứng viên dùng cho mọi nguồn. Mỗi nguồn một lượt warm-up (giữ trong raw, loại theo thiết kế), rồi thứ tự cân bằng base, cand, prev, prev, cand, base. Cả 9 lượt passed.

| Nguồn              | Lượt 1 (ms) | Lượt 2 (ms) | Trung bình (ms) | So baseline |
| ------------------ | ----------- | ----------- | --------------- | ----------- |
| Baseline `de71732` | 47.427      | 46.437      | 46.932          | —           |
| Ứng viên `fba1e09` | 49.296      | 48.191      | 48.743,5        | +3,86%      |
| Head cũ `4e5136f`  | 49.368      | 47.993      | 48.680,5        | +3,73%      |

Warm-up 52.223 / 53.537 / 52.699 ms (base/cand/prev). Ngưỡng hồi quy ≤ +10% so baseline cùng máy: `PASS`. Ứng viên so head cũ +0,13%, trong nhiễu: trên Chrome có GPU, bỏ backdrop blur không nhanh hơn cũng không chậm hơn. Cổng tuyệt đối < 70.000 ms thuộc CI WebKit.

Giới hạn: ứng viên là `fba1e09`, không phải head cuối. Server là Vite dev, giống `webServer` mặc định của `playwright.config.ts` mà CI dùng, không phải build production. Mỗi nguồn chỉ hai lượt đo và hai lượt cùng nguồn lệch nhau 2,1–2,9%, nên phép so chỉ bắt được hồi quy lớn hơn mức đó.

## K1 — 300 ghim, ma trận đầy đủ

`scripts/p10-1-latency.mjs` (sha256 `e925947c…`), before `de71732`, after `fba1e09`, 6 batch × 10 cặp xen kẽ AB/BA, mỗi nguồn/điều kiện 60 thêm + 60 xoá. 48 batch đều complete, mọi mẫu `REFLECTED`, không lọc mẫu chậm. Mục tiêu p50 < 100 ms. Nhãn: `H_MET_REAL_GPU`.

| Điều kiện (ms, p50 / p95)            | Before add     | Before delete  | After add     | After delete  |
| ------------------------------------ | -------------- | -------------- | ------------- | ------------- |
| Active · 300 ghim · 1440×900         | 69,30 / 201,10 | 62,95 / 194,50 | 27,70 / 35,10 | 27,80 / 34,70 |
| Static · 300 ghim · 1440×900         | 69,00 / 194,50 | 62,50 / 76,40  | 33,80 / 41,20 | 34,05 / 35,50 |
| Active · 300 ghim · 960×600          | 62,50 / 187,80 | 61,05 / 74,70  | 27,90 / 42,80 | 27,60 / 34,90 |
| Active · 0↔1 ghim · 1440×900 (diag.) | 34,75 / 46,70  | 34,80 / 42,70  | 41,60 / 48,70 | 41,60 / 48,80 |

Baseline có 2–10/60 mẫu ≥ 100 ms ở mỗi nhóm 300 ghim; ứng viên không có mẫu nào > 50 ms (max 48,9 ms). Diagnostic 0↔1: ứng viên chậm hơn baseline 6,85 ms p50 (+19,7%), vẫn dưới 100 ms. Phần CPU/DOM nhanh hơn (domCommit p50 3,7 so với 10,75 ms; renderEnd 6,9 so với 12,7 ms) nhưng fence được quan sát muộn hơn (34,7 so với 27,9 ms). Nguyên nhân chưa xác định; không phải cổng, ghi lại để theo dõi. Đây là cận trên cơ hội trình bày, không phải thời gian GPU thực thi.

`provenance.json` ghi môi trường lấy từ raw (Chrome 156.0.8078.47 headed, driver, renderer, DPR 1, viewport từng điều kiện), SHA before/after/harness, hash script và sha256 của 48 raw cùng `summary.json`. Nhãn `H_MET_REAL_GPU` chỉ đúng cho máy này (GTX 1660 Ti, Chrome 156, DPR 1). Lượt Intel UHD/Chrome 152 của Codex ở `4e5136f` (chỉ active-300) vẫn là 103,20/101,00 ms `NOT_MET` ([handoff-2026-10-30](../handoff-2026-10-30/README.md)); hai máy không gộp và không thay nhau. K1 chưa đo lại từ `a4f0121`.

## FPS, draw call và bộ nhớ GPU — `a4f0121`

`scripts/desktop-benchmark.mjs`, 1440×900, DPR 1, 600 bước camera cố định mỗi kịch bản, tier mid. Ngân sách: FPS p50 ≥ 55, khoảng khung lớn nhất ≤ 50 ms, draw call ≤ 200, tam giác ≤ 800.000, bộ nhớ GPU ≤ 350.000.000 byte. Màn hình 144 Hz nên FPS bị chặn quanh 144.

| Trình duyệt     | FPS p50 (sunny / storm) | Khung max (ms) | Draw call max | Tam giác max | Bộ nhớ GPU đỉnh (byte)     |
| --------------- | ----------------------- | -------------- | ------------- | ------------ | -------------------------- |
| Chrome 156      | 144,0 / 137,1           | 34,7           | 188           | 80.082       | 176.943.104 — `MET`        |
| Edge 156        | 141,6–144,0 / 135,0     | 47,9           | 188           | 80.082       | 181.006.336 — `MET`        |
| Firefox 146.0.1 | 123,4 / 66,5–68,0       | 36,0           | 188           | 80.082       | 23.170.535.424 — `NOT_MET` |

Cả 12 kịch bản complete, đạt FPS, khung và hình học; không page error, không host ngoài. Bộ nhớ là counter WDDM cộng mọi tiến trình browser con, gồm overhead của browser. Với Firefox, dedicated usage tăng đơn điệu từ 162 MB lên 23 GB trong khi TotalCommitted giữ 345–367 MB; con số vượt VRAM vật lý 6 GB nên không phải phép đo hợp lệ về bộ nhớ của app, nhưng nhãn `NOT_MET` của harness được giữ nguyên (mức ổn định đầu tiên 353.497.088 byte cũng vượt 350.000.000). Cần công cụ khác trước khi kết luận về bộ nhớ GPU trên Firefox.

## Controls P8/P9 — Chrome, `a4f0121`

`scripts/controls-benchmark.mjs`, 30 vòng, mỗi vòng mở trang mới, âm thanh output bị mute nhưng AudioContext chạy thật. Độ trễ tính từ input thật tới khung chính khớp, fence GPU và RAF kế tiếp.

- P8: 420/420 mẫu `REFLECTED`, cả 14 control đều < 100 ms (max 65,8 ms), 0 lần link program mới. Kéo camera: 4/1.380 khoảng khung > 50 ms (53,5; 64,8; 50,2; 50,6 ms ở vòng 1 và 3), nên harness ghi `NOT_MET`. App render theo nhu cầu; p50 31,4 ms gần nhịp bước kéo tổng hợp (move + chờ 16 ms), chưa tách được phần do harness.
- P9: 60/60 mẫu `REFLECTED`. Bật âm lạnh p50 58,6 ms, max 92,7 ms; bật âm ấm p50 45,4 ms, p95 87,2 ms, 1/30 mẫu 107,5 ms (vòng 17, submission 23,1 ms, fence quan sát 100,6 ms), nên `NOT_MET`.

## E2E liên quan trên Windows

Playwright 1.58.2 với browser bundled, server Vite loopback riêng có `VITE_BUILD_SHA`; specs `p9-life-sound`, `accessibility`, `h6-completion`. Không phải Safari thật; không thay CI.

| Head      | Chromium | Firefox | WebKit | Tệp                                                              |
| --------- | -------- | ------- | ------ | ---------------------------------------------------------------- |
| `fba1e09` | 19/19    | 17/19   | 17/19  | [summary-fba1e09.json](e2e-related-windows/summary-fba1e09.json) |
| `a4f0121` | 19/19    | 19/19   | 17/19  | [summary-a4f0121.json](e2e-related-windows/summary-a4f0121.json) |

- Firefox ở `fba1e09`: axe báo `aria-prohibited-attr` (serious) trên thanh tiến trình của splash tại 390 và 740 px. Thẻ `div` có `aria-label` mà không có role, có từ trước baseline; Firefox nhanh quét shell khi splash còn đang mờ dần 250 ms. Head cũ `4e5136f` lặp lại đúng lỗi này trên máy này. `a4f0121` chuyển thành `role="progressbar"` có tên dịch VI/EN và giá trị 0–100; test jsdom mới dùng axe-core, đã chứng minh fail trên markup cũ (axe báo đúng `aria-prohibited-attr`) và pass sau sửa.
- WebKit Windows: `sound context is gesture-only…` (`data-audio-contexts` giữ 0) và `OfflineAudioContext…` (`ReferenceError`) fail ở cả `4e5136f`, `fba1e09` và `a4f0121`. Bản WebKit Windows của Playwright thiếu Web Audio, đã ghi từ M2 ([m2/README.md](../../m2/README.md)); WebKit Linux trên CI chạy đủ hai ca này. Nhãn `NOT_VERIFIED_UNSUPPORTED`, giới hạn môi trường, không sửa test.
- `annotations.json` giải thích từng dòng fail trong hai tệp tóm tắt (assertion, dòng spec, nhãn, head).
- Spec H6 20 chu kỳ chạy sát timeout 90 s ở cả ba engine trên máy này: `a4f0121` Chromium 80.671, Firefox 80.678, WebKit 88.621 ms; `fba1e09` 84.025 / 83.269 / 88.582 ms (headless, workers 1, server Vite dev, project Chromium của repo chạy với `--enable-unsafe-swiftshader`). Chậm không riêng WebKit và đây không phải cổng H6. Cổng là CI WebKit Linux: 52.623 ms ở `a4f0121` (run `41209405262`), so với 69.984 ms của `de71732` cùng runner.

## Soak liên tục — `400ab08`

`scripts/p10-benchmark.mjs desktop-soak`, Chrome 156 headed, GPU thật, 1440×900, DPR 1, một document liên tục (SPA navigation mỗi vòng chia hết cho 5, không reload). Warm-up 6 vòng rồi đo 1.803.134 ms (30 phút 3 giây) với 31 vòng; tổng 1.836.996 ms. Bộ đếm theo trạng thái scene quan sát được, không nhân từ số vòng: 124 lần đổi mode, 62 lần chuyển gói đã xác minh, 31 chu kỳ âm thanh. Output âm thanh mute, AudioContext chạy thật. Không page error.

Mỗi vòng đo là một khe khoảng 58 giây (khoảng cách giữa hai vòng 52,2–63,9 s): phần vòng đo chiếm 4,5–10,5 s mỗi vòng, gồm thao tác, `window.gc()` và 500 ms chờ ổn định (`cycleMs` trong raw), tổng 177.299 ms trên 1.803.134 ms (9,83%), trong đó 15,5 s là các lần chờ 500 ms. Phần còn lại app vẫn mở và render theo nhu cầu trong cùng document, nên đây là soak theo thời gian với tải thao tác định kỳ, không phải tải liên tục.

| Chỉ số                            | Giá trị                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Heap baseline (vòng warm-up cuối) | 79.955.818 byte                                                                                                                                                                |
| Heap cuối (pha final)             | 65.576.254 byte (−17,98%)                                                                                                                                                      |
| Đỉnh heap tĩnh                    | 80.982.665 byte (+1,28%)                                                                                                                                                       |
| Tài nguyên sống tối đa            | 1 canvas, 1 RAF, 1 AudioContext, 0 ImageBitmap mở (wrapper của harness đếm 74 tạo / 74 đóng, gồm warm-up, 2 mỗi vòng; bộ đếm của app 37 / 37), 0 ObjectURL, 0 handle IndexedDB |
| DOM                               | listener 415–496, node 618–803                                                                                                                                                 |

Tiêu chí tăng heap cuối và đỉnh < 10% so baseline: `MET` cho lượt này. Heap sau GC nằm ở ba mức theo trạng thái vòng (khoảng 80, 64 và 61 MB; mức thấp nhất rơi đúng các vòng có SPA navigation). Baseline thuộc mức cao nên −17,98% chủ yếu do khác mức, không phải heap giảm thật. So cùng mức, heap trôi nhẹ lên trong 30 phút: mức cao +1,42% (vòng 8 → 37), mức giữa +2,97% (vòng 7 → final), mức thấp +2,40% (vòng 10 → 35). Mức trôi này dưới ngưỡng nhưng không chứng minh không rò rỉ; muốn loại trừ tăng chậm cần soak dài hơn. Workload không tạo ObjectURL nên nhánh đó là `NOT_EXERCISED`. "Bộ nhớ" ở đây gồm heap JS của Chrome sau khi yêu cầu GC, bộ đếm DOM và bộ đếm tài nguyên trong bảng (canvas, RAF, AudioContext, ImageBitmap, ObjectURL, IndexedDB); không gồm bộ nhớ GPU.

DOM: số node tăng đúng 1 sau mỗi lần SPA navigation Giới thiệu ↔ Về phố và không giảm sau GC: vòng thường 797 → 803 (vòng 6 → 37), vòng có navigation 617 → 623 (vòng 5 → 35); lượt bị dừng cùng mẫu (797 → 802). Mức này nhỏ nhưng là dấu hiệu giữ node theo route; chưa xác định node nào, ghi ở BACKLOG. Cập nhật 02/11/2026: node đó là canvas Three.js đã gỡ, còn bị geometry dùng chung của `Sprite` giữ qua listener của renderer; PR #14 sửa (probe heap 3 lượt: node 477 → 477, trước sửa 480 → 483). Số của soak này giữ nguyên, chưa chạy lại soak 30 phút sau bản sửa.

Lượt đầu ở `a4f0121` (harness cũ, bộ đếm tính bằng phép nhân) dừng sau 6 vòng warm-up và 27 vòng đo (1.570.495 ms) vì cửa sổ Chrome bị đóng giữa chừng. Raw giữ nguyên trong `soak-raw-interrupted-a4f0121.json` (`complete: false`) và không dùng cho kết luận; phần đã ghi không có page error, heap cuối +1,32% và đỉnh +2,13% so baseline của lượt đó. Soak của Codex trên máy Intel UHD ở `4e5136f` (cuối −3,15%, đỉnh +22,16% `NOT_MET`, [handoff-2026-10-30](../handoff-2026-10-30/README.md)) là máy khác; hai kết quả không gộp và không thay nhau.

## Tệp

- `h6-hardware-chrome/`: 9 raw (`warmup-*`, `run1…run6`) và `summary.json` có sha256 của từng raw.
- `k1-real-chrome/`: 48 batch raw, `summary.json` và `provenance.json`.
- `desktop-chrome/`, `desktop-msedge/`, `desktop-firefox/`: `report.json` và `gpu-memory.json`.
- `controls-p8-chrome/`, `controls-p9-chrome/`: `raw.json` và `summary.json`.
- `e2e-related-windows/`: tóm tắt Playwright theo head và `annotations.json`.
- `soak-desktop-chrome/`: `soak-raw.json` (lượt `400ab08`), `summary.json` (có sha256 của raw) và `soak-raw-interrupted-a4f0121.json` (lượt đầu bị dừng).

## Tái lập

Mỗi nguồn một checkout sạch (worktree) đã `bun install --frozen-lockfile`, server riêng:

```powershell
$env:VITE_BUILD_SHA = git rev-parse HEAD
node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4184 --strictPort
```

H6 từ checkout ứng viên, lặp cho từng server theo thứ tự ở trên:

```powershell
$env:BENCH_GPU = "real"; $env:BENCH_BROWSER = "chrome"; $env:H6_REAL_DPR = "1"
$env:BENCH_GPU_DRIVER = "<driver thực>"; $env:BENCH_SOURCE_SHA = "<SHA của server>"
$env:BENCH_BASE_URL = "http://127.0.0.1:4184"
node node_modules/playwright/cli.js test --config playwright.hardware.config.ts --grep "20 mode/route/package/capture"
```

K1 (before 4184, after 4186):

```powershell
$env:K1_BEFORE_SHA = "<baseline>"; $env:K1_AFTER_SHA = "<ứng viên>"
$env:K1_BEFORE_PORT = "4184"; $env:K1_AFTER_PORT = "4186"
$env:BENCH_GPU = "real"; $env:BENCH_BROWSER = "chrome"; $env:BENCH_DPR = "1"; $env:BENCH_GPU_DRIVER = "<driver thực>"
node scripts/p10-1-latency.mjs test-results/k1-real
```

FPS và controls theo [M3_DESKTOP_RUNBOOK.md](../../../../../M3_DESKTOP_RUNBOOK.md) với server cổng 4196 (`DESKTOP_BENCH_PORT`, `CONTROL_PORT`, `CONTROL_FAMILY=p8|p9`). Không chạy build/test nặng cùng lúc đo.

Soak từ checkout `400ab08`, server cổng 4198:

```powershell
$env:BENCH_GPU = "real"; $env:BENCH_BROWSER = "chrome"; $env:BENCH_DPR = "1"; $env:P10_PORT = "4198"
$env:BENCH_GPU_DRIVER = "<driver thực>"; $env:BENCH_SOURCE_SHA = git rev-parse HEAD
npx --yes bun@1.4.3 scripts/p10-benchmark.mjs desktop-soak test-results/desktop-soak-real
```
