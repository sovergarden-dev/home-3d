# M3 — Bộ nhớ GPU cấp adapter trên Chrome (hiệu chuẩn) và Firefox (lần đo 1, 09/11/2026)

Bằng chứng cho nhánh `codex/m2-gpu-adapter`. Chỉ đổi `scripts/windows-gpu-memory.ps1` và `scripts/desktop-benchmark.mjs`; không đổi mã ứng dụng, không đổi ngưỡng 350.000.000 byte, không đổi kịch bản camera hay bất kỳ timeout/retry/skip/assertion nào.

## Nguồn và hash

- Harness và build runtime: `c53bddc9c338f5945e61f03809bb6902e8491d72`. `environment.sourceSha`, `environment.harnessSha` và `environment.harnessTreeClean: true` được ghi trong `report.json` của cả hai trình duyệt; `VITE_BUILD_SHA` của dev server trùng full SHA này và được đọc trực tiếp từ HUD của trang đang chạy (`scripts/benchmark-browser.mjs:62-67`).
- `scriptSha256` (`scripts/desktop-benchmark.mjs` lúc chạy): `c49bb6e5268f6156f069ed1b338052c65e33c3ab2511dddeff27e1f492c04cc9` (cả hai lượt).
- SHA-256 của `scripts/windows-gpu-memory.ps1`: `61c21c45c55909fd1a72bbebf5d80e09aa6dff4107a6c692f58d8606aba3fe1f`.
- `fixtureSha256`: `7fcab9356d7d6e9e6bf958a0519c0afb9848c0f607283a41aecd428f8a569511`. Chỉ fixture tổng hợp (`P8_PACKAGE_TEXT`), không có dữ liệu khu thật.
- Tệp đã lưu (mọi tệp dưới 1 MB; không lưu ảnh chụp màn hình để tránh trùng với bộ 31/10):
  - `desktop-chrome/report.json`: 366.039 byte, SHA-256 `b5f399d64c308c492a7a410c2fb05c999a5c38881e5704c32f706d1318953f42`.
  - `desktop-chrome/gpu-memory.json`: 99.796 byte (LF trong Git), SHA-256 `70ca5ccf56400bda06cd5a6c18f67a3840c523135a112efd8d37843d6c968541`.
  - `desktop-chrome/gpu-memory.json.baseline.json`: 1.710 byte (LF trong Git), SHA-256 `fce1aa11a6194d82ffa77af5a68cb2a712cd97c2d29677288f33f09423673371`.
  - `desktop-firefox/report.json`: 320.786 byte, SHA-256 `84b429581864686c6ef23c0d624214fd7356b3e1acd1b451b4de64551b5ac9db`.
  - `desktop-firefox/gpu-memory.json`: 131.932 byte (LF trong Git), SHA-256 `6bb2abf3d85ef3f22fd5e1f3b15dd2f866b01b5cb5f97705ce53939157fd3d45`.
  - `desktop-firefox/gpu-memory.json.baseline.json`: 1.710 byte (LF trong Git), SHA-256 `7dd36a1cc16ef4e2d7d6d73d0d22579741dd5f9a6468c1e9061c56cd6ed3b875`.

## Phương pháp

- Lý do đổi công cụ: ở bộ đo 31/10 (`a4f0121`), `Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory` cộng theo cây tiến trình trình duyệt báo `dedicated` của Firefox tăng tới 23,17 GB trên card GTX 1660 Ti 6.144 MiB — số không thể có thật, nên kết luận `NOT_MET` trước đây dựa trên một counter bị hỏng trên Firefox.
- Trước khi gọi `launchBenchmark`, `desktop-benchmark.mjs` chạy `windows-gpu-memory.ps1 -Mode baseline` để ghi `DedicatedUsage` cấp adapter (`Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory`, đỉnh giữa các instance LUID) và `nvidia-smi --query-gpu=memory.used,memory.total` khi cây tiến trình trình duyệt đo chưa tồn tại.
- Trong lúc chạy 4 kịch bản × 600 bước camera cố định (`sunny-paused-plain`, `sunny-paused-details`, `storm-active-plain`, `storm-active-details`), chế độ `sample` ghi mỗi giây cả ba nguồn: counter WDDM theo tiến trình con (để đối chiếu), `DedicatedUsage` cấp adapter, và `nvidia-smi`. Không ghi PID hay tên máy vào JSON.
- Đại lượng được báo là `adapterUpperBoundBytes = max(0, adapterPeakBytes - adapterBaselineBytes)` — **cận trên cấp adapter**, gồm cả mọi tiến trình khác đang dùng GPU trong thời gian chạy, không phải riêng byte texture của ứng dụng. `perProcessReliable` bằng `false` khi tổng per-process vượt `1,05 ×` tổng dedicated của adapter (chính là dấu hiệu lỗi của Firefox). `adapterMatchesNvidia` kiểm hai nguồn độc lập khớp nhau trong dung sai `max(128 MiB, 25 %)`.
- Quy tắc kết luận ngân sách bậc `mid` (`350.000.000` byte giữ nguyên): `midBudgetStatus = "MET"` **chỉ khi** `adapterUpperBoundBytes ≤ 350.000.000`; ngược lại `NOT_VERIFIED`, vì một cận trên vượt ngân sách không tách được phần của tiến trình nền hay phần đệm của trình duyệt khỏi phần của ứng dụng.

## Kết quả

- Môi trường chung: `WINDOWS_LOCAL`, `REAL_GPU`, NVIDIA GeForce GTX 1660 Ti (6.144 MiB), driver `32.0.16.1074`, DPR 1, viewport 1440×900, Vite dev server trên loopback cổng 4196, `syntheticOnly: true`, `errors: []`, `externalHosts: []`.

| Lượt            | Trình duyệt                                                 | Baseline adapter / `nvidia-smi` | Đỉnh adapter / `nvidia-smi` | Cận trên delta adapter / `nvidia-smi` | Đỉnh WDDM per-process (`perProcessReliable`)        | Khớp `nvidia-smi` | `midBudgetStatus` (ngân sách 350.000.000 B) |
| --------------- | ----------------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------------------- | --------------------------------------------------- | ----------------- | ------------------------------------------- |
| Hiệu chuẩn      | Chrome `157.0.8103.38` (`BROWSER_SYSTEM_INFO`, `DEVICE_ID`) | 1.064.042.496 B / 1.007 MiB     | 1.221.566.464 B / 1.157 MiB | 157.523.968 B (150,23 MiB) / 150 MiB  | 190.656.512 B, committed 192.892.928 B (`true`)     | `true`            | `MET`                                       |
| Lần đo 1 (§5.6) | Playwright Firefox `146.0.1` (`OPERATOR_ENV`)               | 1.064.812.544 B / 1.008 MiB     | 1.426.546.688 B / 1.352 MiB | 361.734.144 B (344,98 MiB) / 344 MiB  | 22.944.378.880 B, committed 405.237.760 B (`false`) | `true`            | `NOT_VERIFIED`                              |

- Hiệu chuẩn Chrome: 34 mẫu; delta adapter 157,52 MB khớp `nvidia-smi` 150 MiB và nằm cùng bậc với đỉnh per-process 190,66 MB (tại mẫu đỉnh: dedicated 172.879.872 B + shared 17.776.640 B = 190.656.512 B; shared lớn nhất cả lượt là 21.868.544 B). Cả 4 kịch bản đều `geometryBudget: true`, `frameBudget: true` (max 8,7–15,8 ms), `fpsBudget: true` (p50 139,37–143,99).
- Firefox lần đo 1 (tính 1/3 theo §5.6): 45 mẫu; counter per-process WDDM lại trôi đều từ 70 MB lên 22,94 GB (`perProcessReliable: false`), trong khi cả `GPUAdapterMemory` lẫn `nvidia-smi` giữ phẳng quanh +300 đến +344 MiB suốt bài chạy. Đỉnh cận trên `361.734.144` byte xảy ra ở mẫu #8 (`t = 9.992 ms`), cao hơn ngân sách 350.000.000 byte là **11.734.144 byte (+3,35 %)**; từ mẫu #10 đến hết bài chạy delta giữ ở 310,2–334,3 MB (< 350 MB). Theo quy tắc bảo thủ đã đặt trước, kết luận bộ nhớ GPU trên Firefox đổi từ `NOT_MET` (do counter hỏng 23 GB) sang **`NOT_VERIFIED`** kèm cận trên 361.734.144 B — không gọi là `MET`, cũng không đổ lỗi cho app khi khoảng vượt 11,73 MB nằm gọn trong nhiễu tiến trình nền của cả adapter (**suy luận** về thành phần tiến trình nền; bản thân số 361.734.144 B là số đo trực tiếp).
- Khung hình của lượt Firefox này: `geometryBudget: true` và `fpsBudget: true` ở cả 4 kịch bản (FPS p50 74,48–132,93 ≥ 55); `frameBudget` đạt ở 3 kịch bản đầu (max 33 / 13 / 38 ms) và có đúng **1/600** khoảng ở `storm-active-details` đạt 63 ms > 50 ms (mẫu 531, p50 13 ms, p95 18 ms). Lượt 31/10 (`a4f0121`, không chạy sampler `nvidia-smi` mỗi giây) đạt 4/4 `frameBudget` trên Firefox (max 22–36 ms); một gai 63 ms trùng chu kỳ gọi tiến trình con mỗi giây có thể chịu ảnh hưởng của chính sampler (**suy luận**, chưa tách riêng).

## Giới hạn

- Một máy Windows, một GPU (GTX 1660 Ti), một DPR (1), chỉ fixture tổng hợp.
- Delta cấp adapter bao gồm cửa sổ trình duyệt headed, tiến trình hệ thống Windows và mọi tiến trình khác đang giữ VRAM trên cùng card; không phải phép đo byte texture riêng của ứng dụng và không phải kiểm kê VRAM vật lý theo từng đối tượng WebGL.
- Firefox không có API chuẩn để báo riêng bộ nhớ GPU thực của một tab/context WebGL cho Playwright; vì vậy khi cận trên cấp adapter nhỉnh hơn 350 MB, trạng thái trung thực nhất là `NOT_VERIFIED`.
- CI xanh không thay đo GPU thật; skip không phải pass; không khẳng định lỗi crash WebKit đã sửa.
- Hành vi đã biết (không sửa trong PR này để giữ nguyên `scriptSha256` của bằng chứng): chế độ `-Mode sample` chạy xong mà không thu được mẫu nào vẫn thoát với mã 0 và chỉ ghi `status: NOT_VERIFIED`; phía `desktop-benchmark.mjs` vì thế rơi vào nhánh `NOT_VERIFIED`, nên không có cửa nào thành `MET` giả, nhưng mã thoát một mình không phân biệt được sampler rỗng.
