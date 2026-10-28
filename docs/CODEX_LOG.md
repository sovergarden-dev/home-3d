# Nhật ký Codex — Phố Nhà Mình

## Hiện trạng

- Cập nhật: 29/10/2026 (UTC+7). Nguồn chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md).
- M0 `DONE`: PR #8 đã merge; check ứng viên, production smoke, self-review/privacy và CI PR/main đã đạt. Baseline Windows đỏ được giữ riêng, không gọi là pass.
- Main sau M0: `cf3cb262dfa7b69a881bef63c0d9a89dd32668fb`. Tag `baseline/p10-published` trỏ `de7173261a8a3928685555252c2b479f76a713fe`. Nhánh P10 và nhánh M0 remote đã xoá sau kiểm ancestor/SHA.
- M1 `PARTIAL` trên `codex/m1-p10-polish`; M2–M5 `NOT_DONE` ngoài hai việc tooling M2 đã kéo vào M0. Không có dữ liệu khu thật được mở. Không Publish/deploy hoặc thay cài đặt dịch vụ.
- Việc kế tiếp: K1 đo tách chi phí/ma trận A–B, K2 kích thước và picking, K3 ảnh/R1, regression và soak; không merge M1 trước đủ cổng.

## 28/10/2026 — M0 hoàn tất

### Phạm vi và quyền

Đã đọc file bàn giao do chủ dự án cung cấp rồi `AGENTS.md`. Bàn giao thay phân vai/quy trình cũ, quy tắc cứng giữ nguyên. Chủ dự án uỷ quyền PR và merge commit sau các cổng §5.2; Notion AI chỉ audit cuối khi được yêu cầu. Không dùng quyền admin hiện có để thay cài đặt; không tạo token hoặc mở dữ liệu riêng.

### Bằng chứng thu mới bởi Codex

| Kiểm tra | Kết quả | Nguồn |
| --- | --- | --- |
| Remote main | `de7173261a8a3928685555252c2b479f76a713fe` | Git/GitHub đọc trực tiếp |
| PR mở khi bắt đầu | 0 | GitHub CLI |
| GPU được Windows nhận diện | Intel(R) UHD Graphics | Win32_VideoController |
| Driver | `32.0.101.7082` | Win32_VideoController |
| Chrome đã cài | `152.0.7977.76` | File version |
| Edge đã cài | `156.0.4314.42` | File version |
| Bun riêng của dự án | `1.4.3 (c6da4a4d3)` | Binary chính thức và checksum |
| Renderer WebGL/DPR | Intel UHD / ANGLE D3D11, DPR native = 1 | Raw GPU M0; không suy từ tên GPU Windows |

Baseline CI cũ được đọc lại tại run [39968559993](https://github.com/sovergarden-dev/home-3d/actions/runs/39968559993): quality và ba job E2E success. Log có 362 unit pass, 39 pipeline pass, Chromium 77 pass, WebKit 77 pass, Firefox 48 pass và 29 skip. Đây là CI Linux tại baseline, không thay kết quả Windows mới. Những số H6/P10/SwiftShader trong bàn giao là evidence lịch sử, chưa phải số đo Codex.

### Quyết định môi trường

Dùng toolchain Bun cục bộ riêng cho Home 3D, không nâng Bun toàn máy để tránh ảnh hưởng dự án khác. Không thay Defender, quyền truy cập, nguồn điện hay Windows Update. Tên GPU/driver/trình duyệt được phép vào evidence; đường dẫn tuyệt đối, tên máy/user và profile trình duyệt không vào artifact public. Dùng profile trình duyệt kiểm thử riêng và chỉ fixture tổng hợp.

### PR và cổng

Lịch sử mở PR #8 (trạng thái tại lượt đầu): `docs: Codex takeover`, published head đầu `66514aec92a0d432094f916a562d16db4830a5a4`, CI PR run `40687608932` đã 4/4 success. Chưa merge. Sửa chữa sau self-review và evidence mới chưa nằm trong head đó; phải có CI mới đúng head cuối.

Receipt cuối PR #8: head `aee3b1e2354091d9653afb1413bc2b805094b207`, CI PR [40712548192](https://github.com/sovergarden-dev/home-3d/actions/runs/40712548192) 4/4 success. Self-review vòng 2 độc lập không còn finding; gitleaks ba commit sạch. Build/smoke ứng viên đúng head đạt. Merge commit `cf3cb262dfa7b69a881bef63c0d9a89dd32668fb`, CI push [40717187350](https://github.com/sovergarden-dev/home-3d/actions/runs/40717187350) 4/4 success. Main CI: 362 unit, 39 pipeline; Chromium 77/0/0, Firefox 48/0/29, WebKit 77/0/0; H6 Chromium 51,5 giây, WebKit 56,7 giây. Không đổi nhãn skip thành pass. Nhánh M0 remote đã xoá sau ancestor check.

### Những lượt chưa đạt — giữ lại, không trộn vào kết quả xanh

- Lượt check đầu quét nhầm sáu lỗi format trong JavaScript của Chromium tải về nằm dưới checkout. Đã chuyển công cụ ra ngoài, không tắt lint hay thêm ignore vào cấu hình dự án.
- Baseline check kế tiếp: typecheck đạt, lint 0 lỗi/7 cảnh báo, 361 unit pass/1 fail. Test P9 200 tác nhân cho p50 0,284 ms, p95 5,6094 ms, vượt trần 4 ms. Lúc này có khởi động Vite cho E2E song song; chưa kết luận nguyên nhân. Lượt chỉ riêng file P9 sau đó đạt 6/6. Gate toàn bộ đang chạy lại khi không có tác vụ kiểm khác cạnh tranh CPU.
- E2E lần đầu chưa chạy được case nào: dev server không sẵn sàng trong 60 giây. Sau đó khởi động riêng, Vite báo ready trong 5.784 ms. Giữ timeout/test/guard, chưa gọi E2E PASS.
- Gitleaks 8.30.1 tải chính thức/checksum khớp. Sáu kết quả ban đầu đều được đối chiếu đúng commit/dòng: ID fixture công khai, không phải credential. Sau allowlist exact theo DECISIONS, quét 81 commit không có leak. Raw redacted giữ cục bộ; summary public không chứa đường dẫn máy.
- Control âm cho allowlist: cùng ID fixture qua stdin (không khớp hai path) vẫn bị bắt, exit 1. Ngoại lệ không tắt rule hoặc áp cho toàn bộ repo.
- Lượt check toàn bộ tiếp theo gặp nhiều timeout và worker termination timeout; CPU hệ thống đo được 100%, RAM còn khoảng 5,7 GiB. Không đóng ứng dụng khác. Vitest hiện cài có `VITEST_MAX_WORKERS`; đang thực hiện lượt full gate cuối với một worker, không đổi test, timeout hoặc ngưỡng. Các lượt đỏ/không hoàn thành giữ nhãn riêng, không cộng vào pass.
- Lượt một fork worker đã kết thúc: 307 pass, 2 fail, bảy lỗi worker, chỉ 51/58 file chạy; 1088,54 giây. P9 p50 0,357 ms, p95 6,477 ms. Đây là FAIL/incomplete, không phải 362 case đã được kiểm. Đang thử runner thread Windows theo DECISIONS; chưa có kết quả xanh của ứng viên mới.
- Ứng viên runner thread Windows đã chạy `bun run check` exit 0: 58 file/362 unit pass, 39 pipeline pass, typecheck/build đạt, lint 0 lỗi/7 cảnh báo. Giữ nguyên assertion/ngưỡng; fingerprint các file liên quan ở `docs/assets/qa/codex/m0/windows-check.json`. Đây là gate ứng viên mới, không đổi nhãn các lượt baseline fork đã đỏ.
- Chromium Windows baseline đầy đủ: 61 pass, 16 fail, 0 skip, 1079,338 giây. H6 timeout 90 giây; phần lớn các lỗi P8 còn lại không thấy `#scene-root` trong 5 giây. Snapshot chụp sau lỗi có giao diện đã mount, nên chưa kết luận chức năng thời tiết hỏng. Raw JSON được giữ; từ Firefox đã thêm sao chép artifact hoàn tất trước khi project kế tiếp dọn output mặc định.
- Firefox Windows baseline: 68 pass, 9 fail, 0 skip, 1283,827 giây. H6 timeout; tám lỗi còn lại ở chờ giao diện client ban đầu trong 5 giây. WebKit đang chạy. Không thay skip hoặc assertion để đạt số giống Linux.
- WebKit Windows baseline: 66 pass, 11 fail, 0 skip, 1174,125 giây. Ngoài H6/tải giao diện, môi trường này thiếu `OfflineAudioContext` và một ca bộ đếm audio chưa đạt. Không gọi Playwright WebKit là native Safari. Toàn bộ raw JSON đã khử đường dẫn workspace, giữ riêng từng browser trong evidence; 60 artifact hoàn tất của các lượt sau được sao chép cục bộ.

### GPU và build đã đo trực tiếp

Checkout baseline riêng, detached tại `de7173261a8a3928685555252c2b479f76a713fe`; source module phục vụ đã kiểm thuộc checkout baseline. Build Windows và production smoke đạt, SHA trong build đúng baseline; không deploy. Raw: `docs/assets/qa/codex/m0/`.

Chrome headed 152.0.7977.76 xác nhận ANGLE Intel UHD Graphics Direct3D11, driver 32.0.101.7082, 1440×900. DPR gốc bằng 1. Mỗi nhóm latency có 15 add và 15 delete: DPR 1 p50 135,1/116,7 ms, native 141,7/138,6 ms; chưa đủ số mẫu M1 và chưa đạt dưới 100 ms. H6 có một lượt 20 vòng pass trong 44,351 giây, 0 fail/skip; giữ riêng lượt setup lỗi và lượt timeout 90 giây. Không suy GPU memory hoặc kiểm thiết bị thật khác từ các số này.

Self-review độc lập vòng 1 tìm hai P2: summarizer hard-code môi trường và harness gán HEAD của launcher cho server. Đã sửa producer/consumer, nguồn SHA lấy từ UI server và kiểm với SHA yêu cầu; metadata regression probes 3/3 đạt, giữ outlier và từ chối trộn môi trường. Chưa thay bằng review vòng cuối của ứng viên.

### Neo Git đã hoàn tất

Tag object `b5b9b602bbabc58f0820cf4ce464981946a2605d` đã push; peeled commit đúng `de7173261a8a3928685555252c2b479f76a713fe`. Trước xoá remote P10 đã kiểm SHA đúng `a5d9011d404f531f2ebe28efb18d40f2ab0040b9` và ancestor của origin/main; remote sau xoá chỉ còn main. SHA này có thể dùng tạo lại nhánh nếu chủ dự án cần, không cần viết lại lịch sử. Tag không kích hoạt workflow mới theo cấu hình hiện hành; CI baseline push main vẫn 4/4 success tại run 39968559993.

## 28/10/2026 — M1 đang thực hiện

K3 checkpoint `c2c7116`; đã merge main M0 vào nhánh, không rebase. Chú thích đo TextMetrics thật, gap 0,6 lần line-height nhỏ hơn; vùng ảnh/độ phân giải không đổi. Unit media 18/18 đạt. Test renderer thật trên baseline bắt lỗi gap −29 px ở 4K (yêu cầu ≥44,30772 px). Bản sửa: 18 case Chromium, 18 Firefox, 18 WebKit đạt ở 3840/2048/1920 × VI/EN × tên trống/40 ký tự/có dấu. WebKit ban đầu không import được module chưa tải trên trang Giới thiệu; fallback import của harness đã dùng URL tuyệt đối, giữ nguyên phép đo/assertion. Một lượt chạy lại không hợp lệ do lệnh sửa chưa thực thi được giữ riêng, không tính vào pass. K3 còn ảnh trực quan và kiểm màu R1; chưa DONE. K1/K2 chưa sửa runtime.

### M1 — Tiến độ đo K1 ngày 29/10/2026

Runtime K1/K2/K3 đã checkpoint tại `1331034d85b4ece080eeedcbb20b11c5814733cb`; trước = `de7173261a8a3928685555252c2b479f76a713fe`. Phép đo thử xác nhận GPU fence/DOM và SHA. Ma trận đầu dừng vì viewport 960×600 tạo tier mid 120 pin, không đúng condition 300; raw timeout giữ ở `latency-real`. Harness đã sửa bằng khởi tạo high tier rồi resize trước warm-up, kiểm `data-memory-pins`; ca zero↔one thử đã pass.

Ma trận sửa `latency-real-verified` đang chạy. Active-300 đã đủ 60+60 mỗi source: trước add/delete p50 169,45/165,10 ms; sau 102,10/99,95 ms. Vì add chưa dưới 100 ms, chưa chốt H_MET. DOM median sau ở ca active là 39,5 ms so với 23,6 ms ca tĩnh; mutation CPU khoảng 1,1 ms. Chưa sửa source trong khi đo. Đang chuẩn bị ứng viên cuối để thu hẹp subscription của HUD, journal và postcard về dữ liệu thực dùng, giữ quota/validator/persistence; chỉ áp dụng sau khi ma trận hiện tại hoàn tất.

M2 mới chuẩn bị ở worktree riêng: build identity, README/LF, CI/bundle/coverage scripts, lint, recovery và sheet tests. Chưa cài coverage provider, chưa đo baseline coverage, chưa chạy check/E2E; không tính DONE hoặc merge.

Ứng viên cuối K1/UI tại `0265a53b9e8b571b18fd19ad496e0c9ccdad181d`: check Windows đạt 370/370 unit (59 file), 39/39 pipeline, typecheck/build, lint 0 lỗi/7 cảnh báo cũ; frozen install không đổi dependency. Chín browser smoke (mỗi Chromium/Firefox/WebKit ba ca import/reprocess/public export, guest privacy, postcard 4K/2K/cancel) đạt 9/0/0. Có một lỗi typecheck tạm do thiếu selector ready của postcard, đã sửa giữ guard rồi chạy lại toàn check; không dùng lượt đỏ làm bằng chứng xanh. Ma trận GPU thật cuối bắt đầu sau khi mọi install/check khác đã dừng.

K1 matrix cuối hoàn tất `H_MET_REAL_GPU`; raw ở `docs/assets/qa/codex/m1/latency-real-final`, nguồn `0265a53b9e8b571b18fd19ad496e0c9ccdad181d`. Active add/delete p50 86,50/84,75 ms; p95 103,30/98,80 ms. Static p50 66,25/51,30 ms. Toàn bộ 48 batch complete, 60+60 mỗi condition/source. Giữ hai lượt trước riêng, không chọn bỏ mẫu chậm. SwiftShader chưa kết luận: ba raw batch đầu có fence timeout/censored; dừng để tách tải scan, chưa dùng làm nhãn nghiệm thu.

Privacy trước draft PR: source gitleaks 5 commit sạch, evidence dir sạch, kiểm cả trace giải nén không còn đường dẫn máy/loopback/HMR query token, tất cả file <1 MB. Hai URL WebSocket Vite tạm trước đó đã được che; kiểm event counts và ts/dur/tts/tdur không đổi, hash gzip cập nhật. Không có dữ liệu thật. M1 vẫn PARTIAL; đang chuẩn bị draft PR để CI kiểm độc lập trong lúc hoàn tất QA cục bộ, không bật auto-merge.
