# P10.1 — Kỷ niệm, ghim và bưu thiếp

`PARTIAL` — mã và các phép đo chính đã đạt; PR #9 còn chờ receipt cuối, CI đúng head cuối, merge commit và CI main. Chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md). Không Publish/deploy.

## Nguồn kiểm chứng

Runtime cuối của M1: `59f6d6881261a542e1f1b52b4d0d2d6e86f4834a`. Các commit sau chỉ sửa harness/receipt. Baseline app: `de7173261a8a3928685555252c2b479f76a713fe`. Evidence ở `docs/assets/qa/codex/m1/`; mỗi file dưới 1 MB, chỉ fixture tổng hợp. Số dưới đây do Codex đo, không chép receipt P10 cũ.

## K1 — 300 ghim

`H_MET_REAL_GPU` trên Chrome 152.0.7977.76 headed, Intel UHD / ANGLE D3D11, driver 32.0.101.7082, DPR 1. Harness `scripts/p10-1-latency.mjs`: bốn điều kiện, sáu batch xen kẽ AB/BA, mỗi nguồn/điều kiện 60 thêm + 60 xoá. Cùng fixture/camera/giờ khởi đầu và warm-up; không lọc mẫu chậm. Tất cả batch của matrix `latency-real-empty-layer` complete, không page error.

| Điều kiện                    | Add p50 / p95 (ms) | Delete p50 / p95 (ms) | Kết luận                   |
| ---------------------------- | ------------------ | --------------------- | -------------------------- |
| Active · 300 ghim · 1440×900 | 86,90 / 104,90     | 85,90 / 100,70        | Ngưỡng primary p50<100 đạt |
| Static · 300 ghim · 1440×900 | 67,90 / 71,00      | 67,55 / 69,10         | Ngưỡng primary đạt         |
| Active · 300 ghim · 960×600  | 81,85 / 91,20      | 81,10 / 87,70         | Diagnostic                 |
| Active · 0↔1 ghim · 1440×900 | 103,55 / 118,70    | 101,85 / 123,00       | Diagnostic NOT_MET 100 ms  |

Frame được ghi sau DOM đúng số thẻ, actual pin render hoặc layer 0-count đã detached trong một main render thật, GPU fence hoàn tất và RAF tiếp theo. Đây là cận trên cơ hội trình bày, không phải GPU execution time hoặc cam kết mọi p95<100. Raw ghi CPU/DOM/RAF1/RAF2/render-end/fence riêng. Viewport nhỏ khởi tạo ở cùng tier 300 rồi resize trước warm-up; xác nhận số pin thật.

Trace chẩn đoán R7 giữ Long Task, Long Animation Frame và Event Timing. Profile chỉ ra React DOM tốn nhiều hơn mutation/matrix writes; M1 memo card/subtree và thu hẹp subscription. Không đổi validator, quota, public projection hoặc persistence. Profile 10 cặp có tracing không phải mẫu nghiệm thu.

SwiftShader: `H_BLOCKED` ở matrix đối chứng source 0265a53. Static và viewport nhỏ đủ 60 thêm + 60 xoá; các ca continuous/full viewport bị censored khi fence chưa được xác nhận, nên không dùng median của phần còn lại làm verdict. Static sau sửa p50 add/delete 199,75/198,75 ms vẫn NOT_MET; nhỏ hơn nhưng active sau sửa 2525,60/2551,05 ms không được gọi cải thiện. Standalone GL clear xác nhận API fence hoạt động dưới tải nhẹ. Sau vòng sửa lifecycle rỗng, chưa tái đo SwiftShader toàn bộ; không gắn các số cũ thành số mới. Giữ trạng thái tham khảo bị chặn theo quy tắc giới hạn vòng thử; H của P10 khép bằng GPU thật theo bàn giao.

Các lượt trước đều giữ: setup viewport tạo mid 120 pin bị dừng; source 1331034 đủ mẫu nhưng active add 102,10 ms chưa đạt; source 0265a53 đạt 86,50/84,75 ms; source 59f6 đo lại sau sửa lifecycle và đạt như bảng. Không thay nhãn hoặc xoá outlier cũ.

## K2 — Ghim hiển thị và chọn

Một InstancedMesh, caps 40/120/300/300. Vòng tròn danh nghĩa20 CSS px, hit target44 CSS px; gần điểm chạm nhất thắng, tie theo ID ổn định. Hover/selection có viền trắng, active instance được vẽ cuối trong cùng batch. Chỉ hiện ở Diorama/Mặt bằng; marker nhà và nhãn giữ ưu tiên. Không sửa geometry canonical.

Pixel renderer thật: ba viewport1440×900/390×844/740×390 ×hai mode ×gần/xa, đủ ba browser. Chromium 14 ca, Firefox/WebKit 28 ca đạt; touch CDP và picking H6 đạt riêng. Gallery `visuals-time` đã được xem ở 12 góc; chọn tab Thời gian bằng UI thật để lộ scene. Overlay có thể che phần scene ở zoom gần; mật độ UI landscape là việc M2, không phải pixel-size pass. `visual-review.json` phân biệt xem ảnh và đo số.

Empty-layer probe ghi4 shader pin khi0 pin trước sửa; sau sửa cả ba browser ghi 0. Three compile duyệt cả mesh invisible, nên layer rỗng tháo mesh khỏi group và tái dùng cùng mesh khi có dữ liệu. Unit 9/9 và browser 3/3 đạt; không hạ caps hoặc tắt test. Primary K1 được đo lại ở runtime mới.

## K3 — Bưu thiếp

Giữ tiêu đề cố định, photo ROI, kích thước4K/2K/fallback, cancel/share và metadata guard. Caption dùng TextMetrics ở đúng output size; gap 0,6×line-height nhỏ hơn, line-height 1,2×font-size. Test thật ở 3840×2160/2048×1152/1920×1080 × VI/EN ×tên rỗng/40 ký tự/có dấu:54 ca đạt. Lượt WebKit đầu lỗi import harness được giữ riêng; đã sửa URL import tuyệt đối và18 ca WebKit chạy lại đạt.

Đã xem PNG 4K không tên phường và PNG 2K. R1 trên GPU thật: chênh độ sáng 4,38%, từng kênh 2,47/3,72/7,50%, dưới 15%; không page error. Nguồn `color-real/brightness-evidence.json`. Tệp ảnh chứa cảnh tổng hợp; không có ảnh khu thật.

## H6, soak và hồi quy

- H6 native GPU 20 vòng: 41,481 giây so baseline Windows 44,351 giây (−6,47%). Driver và renderer xác minh. Baseline/candidate WebKit Windows đều timeout; không gọi đó là pass hoặc delta hợp lệ.
- CI 40777137757 tại ddc3246: baselineWebKit cùng runner 58,262 giây, candidate 57,605 giây (−1,13%), dưới 70 giây và trong 10%. Chromium 50,658 giây; đây là runner khác receipt lịch sử 39,8 giây, không suy delta đồng máy từ hai số đó. CI 4/4: Chromium/WebKit 110 pass; Firefox 66 pass/44 skip (không cóWebGL2),371 unit / 39 pipeline.
- Reporter giữ H6 timeout 90 giây và mọi assertion/capability guard; CI WebKit còn bắt buộc baseline cùng runner hợp lệ, không skip và không vượt 70 giây / 10%. Lỗi ANSI readiness đã được independent review phát hiện và đóng bằng marker ASCII+bound-port+SHA check; các run lỗi vẫn ghi đúng trạng thái.
- Soak 59f6: 600,002 giây, 11 vòng; không page error. URL/bitmap/IDB/audio đang mở đều 0; RAF 1 / world 1; texture 3 / geometry 42 ổn định; render target tạm 0. Heap 70.999.896 → 56.226.348 byte (−20,81%) sau yêu cầuGC. Không dùng heap/counter làm chứng nhận GPU memory.
- Stationary-camera/active-life snapshots ở 299 pin: median engine p50 17,10→17,15ms (+0,29%);41 draw call không đổi, triangles 9028 → 4842. Đây là aggregate rolling snapshots, raw nguồn vẫn giữ; không gọi là GPU execution time.
- Windows full run cũ bị dừng để xử lý H6 budget:126 kết quả đã quan sát, 4 fail P8; không gọi327 ca đã chạy. CI Linux là cổng ba browser; Windows là bổ sung. Test liên quan và production smoke cuối được ghi tiếp trong CODEX_LOG, không che thất bại baseline/setup.

## Tái lập

Chạy riêng từng benchmark, không đồng thời build/test nặng hoặc browser GPU khác. Khởi động baseline và candidate từ các commit đã chốt, đặt `VITE_BUILD_SHA` đúng commit; kiểm UI SHA trước đo. Dùng Bun 1.4.3, Playwright đã khoá, fixture tổng hợp.

```powershell
$env:BENCH_GPU='real'
$env:BENCH_BROWSER='chrome'
$env:BENCH_DPR='1'
$env:BENCH_GPU_DRIVER='<driver đã đọc từ máy>'
$env:K1_BEFORE_SHA='<full baseline SHA>'
$env:K1_AFTER_SHA='<full candidate SHA>'
node scripts/p10-1-latency.mjs test-results/k1
```

Mặc định before4184/after4186,6batch×10 cặp. `K1_BEFORE_PORT/K1_AFTER_PORT` đổi port. `BENCH_GPU=software` đo riêng và giữ nhãn khác. `playwright.hardware.config.ts` dùng Chrome/Edge headed, không ép SwiftShader. `scripts/p10-benchmark.mjs soak` dùng `P10_SOAK_MS=600000`, `P10_MIN_CYCLES=10` cho M1. Bản production phải build lại với đúng HEAD trước smoke; assertion SHA không được nới để nhận build cũ.

Trước push: gitleaks source/evidence và trace đã giải nén; loại đường dẫn máy, loopback/HMR query token. Giữ nguyên timing events khi redaction và cập nhật checksum. Không đưa artifact raw chứa đường dẫn cá nhân của Playwright vào repo.
