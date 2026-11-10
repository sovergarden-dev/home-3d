# M4 — Đo hiệu năng và bộ nhớ GPU thật sau refactor sa bàn cố định (10/11/2026)

Bằng chứng đo trực tiếp trên GPU vật lý cho nhánh `codex/post-audit-static-neighborhood` sau khi hoàn tất refactor một `HOME_NEIGHBORHOOD` tĩnh, nâng cấp hình học phương tiện/người đi bộ/cây xanh/chi tiết kiến trúc và phục hồi ma trận E2E.

## Nguồn và hash

- Build runtime và harness: `75235e0f11824c0260f4f792a76ead49fe173fb0` (`environment.sourceSha`, `environment.harnessSha`, `environment.harnessTreeClean: true` được ghi trực tiếp trong `desktop-chrome/report.json`; `VITE_BUILD_SHA` của dev server trùng đúng full SHA này và được đọc từ `build-info` trên HUD).
- `scriptSha256` (`scripts/desktop-benchmark.mjs` lúc chạy): `e5059fe2d873c040a7846cc43bbdc3ddbd2b7ee83c1076137ac6ae267e3a27e9`.
- `fixtureSha256` (`JSON.stringify(HOME_NEIGHBORHOOD)`): `41c14131c84f68b6d7a678857405a2e7f94a5f370dd42cb81bf4869b65a2e305` (`syntheticOnly: true`).
- Tệp đã lưu (mọi tệp dưới 1 MB, LF, không chứa tên máy/tên user/đường dẫn cá nhân):
  - `desktop-chrome/report.json`: `365.289` byte, SHA-256 `43b63aef052bed1cb7977654da2dd4b84d8ff14e116caaa0743c376944a1b25b`.
  - `desktop-chrome/gpu-memory.json`: `99.834` byte, SHA-256 `a7751c46f554326218fcd6f4644d4e811a624128cd8f005318f10e139259b465`.
  - `desktop-chrome/gpu-memory.json.baseline.json`: `1.711` byte, SHA-256 `1f8f67042bc9e742f289d90b444954dc1990adac9aa6ed4771d5a106658e3734`.

## Môi trường và kết quả

- Môi trường: `WINDOWS_LOCAL`, `REAL_GPU`, Chrome `157.0.8103.38` (`headed: true`), renderer `ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)`, driver `32.0.16.1074` (`BROWSER_SYSTEM_INFO`, `DEVICE_ID`), viewport `1440×900`, `dpr: 1`, `errors: []`, `externalHosts: []`.
- Bộ nhớ GPU (`scripts/windows-gpu-memory.ps1`, 34 mẫu):
  - Baseline adapter trước khi mở trình duyệt: `3.054.039.040` B.
  - Đỉnh adapter trong suốt bài đo: `3.231.932.416` B.
  - Cận trên delta cấp adapter (`adapterUpperBoundBytes`): **`177.893.376` B (~`169,65` MiB)** ≤ ngân sách bậc `mid` `350.000.000` B → **`midBudgetStatus: MET`**.
  - Đỉnh WDDM per-process: `197.832.704` B (`perProcessReliable: true`, `adapterMatchesNvidia: true`).

| Kịch bản (600 bước camera) | `drawCalls` đỉnh (ngưỡng ≤ 200) | `triangles` đỉnh (ngưỡng ≤ 800.000) | `illustrativeInstances` | `frameMs` p50 / p95 / max (ngưỡng max ≤ 50 ms) | `fps` p05 / p50 / p95 (ngưỡng p50 ≥ 55) | Kết luận |
| -------------------------- | ------------------------------- | ----------------------------------- | ----------------------- | ---------------------------------------------- | --------------------------------------- | -------- |
| `sunny-paused-plain`       | `103`                           | `8.316`                             | `0`                     | `6,90` / `7,70` / `16,90` ms                   | `137,14` / `141,68` / `144,06`          | `MET`    |
| `sunny-paused-details`     | `106`                           | `16.264`                            | `296`                   | `6,90` / `7,70` / `16,90` ms                   | `139,34` / `143,95` / `144,06`          | `MET`    |
| `storm-active-plain`       | `104`                           | `7.300`                             | `0`                     | `6,90` / `7,50` / `14,40` ms                   | `143,95` / `143,99` / `144,02`          | `MET`    |
| `storm-active-details`     | `107`                           | `15.248`                            | `296`                   | `6,90` / `7,50` / `9,50` ms                    | `143,95` / `143,99` / `144,02`          | `MET`    |

## Giới hạn

- Phép đo này xác nhận trực tiếp trên GPU vật lý NVIDIA GTX 1660 Ti (Chrome headed, DPR 1, `1440×900`) cho fixture `HOME_NEIGHBORHOOD` tĩnh.
- Không suy rộng cho thiết bị di động thật, native Safari hoặc gói dữ liệu khu thật ngoài repo (`REAL_WORLD_NOT_VERIFIED`).
