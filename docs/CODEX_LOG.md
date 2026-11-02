# Nhật ký Codex — Phố Nhà Mình

## Hiện trạng

Cập nhật 02/11/2026 (Notion AI tạm tiếp quản theo yêu cầu chủ dự án; từ 31/10 làm trên máy Windows GPU thật qua Aki MCP; chi tiết từ mục 30–31/10 trở đi). Mục 28–30/10 bên dưới là lịch sử, không phải trạng thái hiện hành.

- Main là `69543c2489a3b1d36de93e924bf4e7615b200607` (merge PR #14 `codex/m3-followups`, 02/11/2026). Trước đó: PR #13 `a76daab`, PR #12 `5e6aec5` (biên nhận chỉ docs của PR #11), PR #11 `beacd9b48b429db0e22530777e7d335d74369c7d` (CI push `41263307199` 4/4). CI push main `41383947465` ở `69543c2` 3/4: WebKit fail bài H6 20 vòng vì process mạng WebKit crash; lỗi có từ trước PR #14 (mục 02/11). Chưa đóng băng, chưa tag audit. Main trước PR #11 là `cf3cb26` (M0 DONE, PR #8, CI main `40717187350` 4/4).
- PR #11 `codex/m5-local-height-detail` đã merge: head `c6240276a987fae61cdee4dcebca5f44b1345034`, CI `41261238654` 4/4, review độc lập phần delta `MERGE_OK`; chi tiết ở mục 31/10–01/11. PR #9/#10 (draft) được GitHub tự đánh dấu MERGED lúc 01:59:22Z vì head của chúng đã nằm trong `beacd9b`; không có merge riêng. PR #13 và PR #14 đã merge (mục 01/11 và 02/11). PR đang làm: PR đo M3 `codex/m3-measurements`.
- M1 PARTIAL (H6 WebKit đạt ngân sách ở mọi CI chạy hết bài 20 vòng, đã vào main; bài này hỏng khoảng 2/10 lượt vì process mạng WebKit crash, có từ trước PR #14; chưa audit); M2 PARTIAL (trên GPU NVIDIA, P8 kéo camera còn khung > 50 ms và P9 còn mẫu > 100 ms); M3 PARTIAL (Lighthouse NVIDIA: main `5e6aec5` mobile 44/desktop 79, PR #13 head mã `07fc66e` desktop 97 MET, mobile 50 NOT_MET (`2c21b54`: 97/56), Accessibility 100; lượt Intel UHD `a948321` NOT_MET; FPS Chrome/Edge và soak < 10% chỉ đạt trên máy NVIDIA, Firefox bộ nhớ GPU NOT_MET, soak Codex trên Intel đỉnh +22,16% NOT_MET; ObjectURL NOT_EXERCISED; 4G warm MET ở `252f5e7` khi throttle cả service worker); M4 PARTIAL (auth fail-closed, Workerd native Windows và Linux CI đạt; còn rà runbook để chốt READY_TO_DEPLOY_NOT_DEPLOYED); M5 PARTIAL (pipeline 50 test, chỉ fixture tổng hợp).
- Không Publish/deploy, không đăng nhập cloud, không đọc dữ liệu khu thật. `REAL_WORLD_NOT_VERIFIED` giữ nguyên.

## 28/10/2026 — M0 hoàn tất

### Phạm vi và quyền

Đã đọc file bàn giao do chủ dự án cung cấp rồi `AGENTS.md`. Bàn giao thay phân vai/quy trình cũ, quy tắc cứng giữ nguyên. Chủ dự án uỷ quyền PR và merge commit sau các cổng §5.2; Notion AI chỉ audit cuối khi được yêu cầu. Không dùng quyền admin hiện có để thay cài đặt; không tạo token hoặc mở dữ liệu riêng.

### Bằng chứng thu mới bởi Codex

| Kiểm tra                   | Kết quả                                    | Nguồn                                    |
| -------------------------- | ------------------------------------------ | ---------------------------------------- |
| Remote main                | `de7173261a8a3928685555252c2b479f76a713fe` | Git/GitHub đọc trực tiếp                 |
| PR mở khi bắt đầu          | 0                                          | GitHub CLI                               |
| GPU được Windows nhận diện | Intel(R) UHD Graphics                      | Win32_VideoController                    |
| Driver                     | `32.0.101.7082`                            | Win32_VideoController                    |
| Chrome đã cài              | `152.0.7977.76`                            | File version                             |
| Edge đã cài                | `156.0.4314.42`                            | File version                             |
| Bun riêng của dự án        | `1.4.3 (c6da4a4d3)`                        | Binary chính thức và checksum            |
| Renderer WebGL/DPR         | Intel UHD / ANGLE D3D11, DPR native = 1    | Raw GPU M0; không suy từ tên GPU Windows |

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

### Draft PR #9 đã mở

[PR #9](https://github.com/sovergarden-dev/home-3d/pull/9) `perf(memories): improve 300-pin latency, picking and postcard captions`, head ban đầu `797512f9a3979af1034720c1d13a48dbe978bb36`. Runtime đo/check tại `0265a53…`; commit sau chỉ docs/evidence và scrub URL WebSocket của profiler. Scan toàn diff sáu commit sạch; scan riêng 68,93 MB trace giải nén sạch. Branch chứa main M0, không behind. PR đang draft, không auto-merge. CI và self-review độc lập đang chạy; chưa có merge SHA. Tiếp tục K2 Firefox/WebKit, software diagnostic, gallery/R1, H6 và soak/full regression.

K2 bổ sung tại source runtime 0265a53: Firefox/WebKit 28/28 đạt (mỗi browser 12 ca pixel theo 3 viewport × 2 mode × gần/xa và 2 ca hit/overlap). Ghép Chromium trước đó thành đủ ba browser; chưa thay cho ảnh manual. Color R1 GPU thật ở 2K đạt: độ sáng chênh 4,38%, từng kênh RGB 2,47/3,72/7,50%, dưới trần 15%; không page error. Ảnh/bảng raw ở color-real.

CI draft head `797512f9a3979af1034720c1d13a48dbe978bb36`, run [40750407968](https://github.com/sovergarden-dev/home-3d/actions/runs/40750407968): cả bốn job success. Self-review CLI phiên độc lập không thấy actionable finding và xác nhận nhãn K1 phù hợp harness/raw; không gọi đây là quyền merge khi QA còn thiếu.

H6 GPU thật 20 vòng tại source 0265a53 đạt 46,820 s, so với baseline Windows 44,351 s là +5,57%, trong trần +10%; driver được đọc lại vẫn 32.0.101.7082. Lượt chọn nhầm regex trước đó chạy 0 test, NOT_MEASURED, không phải pass hoặc hồi quy app.

SwiftShader retry riêng ở static-300 (1 add/1 delete mỗi source) hoàn tất được fence, chứng tỏ không phải API fence luôn không dùng được. Đây vẫn là diagnostic thiếu mẫu. Bắt đầu ma trận cuối đủ condition/batch sau khi toàn bộ scan, reviewer và browser QA khác đã kết thúc; giữ nguyên threshold và protocol.

Đọc log chi tiết CI draft: Chromium 109 pass, Firefox 66 pass/43 skip, WebKit 109 pass. Tuy nhiên H6 WebKit hiển thị 1,4 phút, vượt cổng riêng <70 s dù job xanh; M1 chưa đủ merge. Chromium H6 52,4 s (M0 main 51,5 s). Cần phân biệt CI test success với budget success; đang so log baseline và đường render pin rỗng trước khi quyết định sửa/đo lại. Không rerun cùng head, không nới timeout 90 s.

Soak GPU thật hoàn tất 600.024 ms, 11 vòng: không page error, URL/bitmap/IDB/audio context đang mở đều 0 ở mọi mẫu; RAF luôn 1, world luôn 1, geometry 42 và texture 3 ổn định, render target tạm 0. Heap sau yêu cầu GC từ 70.954.468 xuống 56.983.130 byte (−19,69%); đây không phải số đo GPU memory. `soak-real/summary.json` PASS cho cổng M1 10 phút/10 vòng. Lease giữ máy thức chỉ tồn tại trong tiến trình QA và đã được khôi phục trong finally.

Head `b1d9bb18e8d7355eec3ca70540f6ff9399846860` bổ sung cổng H6 WebKit, attachment số đo bbox và tuỳ chọn ảnh ghim với tab Thời gian. Không thay runtime app. Full check Windows lặp lại đã PASS; toàn bộ 327 ca E2E Windows bắt đầu chạy tuần tự, artifact nằm riêng để tránh bị lượt sau xoá. Đã xem gallery 12 góc ghim (3 viewport × 2 mode × gần/xa) và outline trắng của ghim active; overlay cũ vẫn có thể che một phần scene khi zoom gần, độ chật landscape dành cho M2.

CI head b1d9bb, run 40765218170: unit/pipeline và cả ba browser đều không có assertion fail (Chromium/WebKit 109 pass, Firefox 66 pass/43 skip), nhưng reporter mới chặn WebKit ở H6 88.745 ms ≥70.000 ms; job WebKit failure đúng thiết kế. Chromium H6 33.462 ms. Đây là lần budget WebKit không đạt thứ hai; không merge, không rerun cùng head. Cần so baseline/candidate trên cùng runner và kiểm việc compile/render lớp ghim rỗng trong H6 trước vòng sửa có đo tiếp theo.

Probe shader rỗng: trước sửa WebKit 4 shader pin ở mỗi remount dù 0 ghim; sau tháo mesh rỗng khỏi group, cả Chromium/Firefox/WebKit đều 0, test PASS 3/3. Unit pin layer tăng thành 9/9, typecheck PASS. H6 CI vòng tiếp theo sẽ có baseline de71732 trong cùng worker/browser (warm demo rồi unchanged H6), cache Vite riêng, receipt không chứa đường dẫn máy; candidate vẫn phải <70 s và không quá +10% baseline. Probe logic reporter 9 boundary/skip/missing/comparison cases đạt; số thời gian trong các probe này là fixture unit, không là benchmark. Runtime mới đang full-check; chưa gán H_MET của source 0265a53 cho code mới.

Sau sửa mesh rỗng, full check Windows đạt 371 unit/59 file, 39 pipeline, typecheck/build; lint vẫn 7 cảnh báo cũ. Helper baseline CI đã được chạy thật cục bộ ở port riêng: warm demo pass, baseline de71732 H6 WebKit timed out ở 92.844 ms gồm teardown; helper giữ đúng trạng thái timedOut, không gọi pass, và tự đóng đúng server của nó. Đây là giới hạn Windows WebKit đã có ở M0, không thay kết quả CI. Đang chạy candidate WebKit với cùng hai test/warm-up để quan sát delta; cổng CI vẫn cần kết quả trên runner CI.

WebKit Windows đối chiếu: warm demo đạt ở cả hai; cả baseline và candidate H6 đều timed out, vì vậy delta NOT_VERIFIED_CENSORED, không lấy 92,844 s làm baseline pass. Source check 371/39 và shader 4→0 đã đạt; source scan hai commit mới sạch. Đã push 59f6d6881261a542e1f1b52b4d0d2d6e86f4834a cho vòng CI budget thứ ba, kèm baseline cùng runner. Self-review độc lập phần delta đang chạy; PR vẫn draft.

Self-review phần delta tìm một P1 ở harness baseline: Vite CI có ANSI quanh port nên match URL liên tục có thể không báo ready. Đã sửa bằng marker ASCII riêng sau listen, kiểm port thực của HTTP server, vẫn đối chiếu SHA endpoint. Probe ANSI/chunk split/wrong port đạt; không đổi runtime app hay ngưỡng. Đây là sửa lỗi công cụ, không phải rerun cùng head để chọn kết quả nhanh; cần commit mới và CI xác minh. Reviewer không thấy defect mới ở detach/re-attach pin hoặc zero-frame witness.

Run 40774796288 tại59f6: H6 WebKit 67.841 ms, ngưỡng tuyệt đối <70 s MET; Chromium52.429ms. Chromium/WebKit110pass, Firefox66pass/44skip,371unit/39pipelinepass. JobWebKit đỏ vì baselineDIAGNOSTIC_FAILED do P1ANSI, không phải test chức năng hoặc ngưỡng70. Sửa handshake marker là vòng sửa công cụ; runtime/threshold/cycle giữ nguyên. Không tính việc sửa harness là tối ưu lặp lại app hay ghi baseline pass khi chưa đo.

Requalification runtime59f6 hoàn tất đủ48batch/4condition/60add+60delete mỗi nguồn, không censored: H_MET_REAL_GPU cho300ghim. Active300 p50add/delete86,90/85,90ms, p95 104,90/100,70ms; static30067,90/67,55ms. Diagnostic0↔1ghim103,55/101,85ms làNOT_MET theo mốc100, không gọi tất cả thao tác đều đạt. Không lọc mẫu chậm. Source59f6 được giữ tách khỏi các receipt0265cũ. H6native vàsoak10phút ở59f6 đang requalify; camera/hit/capture pixel tests đã có ởCI110case.

Smoke production đầu ở cuối QA đã chặn đúng SHA: build59f6 nhưng Git HEADddc3246 do commit công cụ. Không tính pass, không sửa assertion; giữ screenshot vàreceipt FAILED_SOURCE_IDENTITY_CHECK rồi build lại đúngHEAD. So sánh frame snapshot stationary-camera/active-life trongmatrix59f6 giữ41drawcall, triangles9028→4842; medianp50snapshot17,10→17,15ms (+0,29%, dưới10%). Đây là snapshot rolling củaengine, không phảiGPUexecutiontime.

### Tổng kết QA M1 trước merge

- Runtime cuối: `59f6d6881261a542e1f1b52b4d0d2d6e86f4834a`; commit công cụ đã xanh CI: `ddc3246b38fea900c3e9413d146061fbaa2a7861`, run `40777137757`. Không thay các giá trị này bằng SHA của commit receipt.
- Full Windows check: 371 unit / 59 file và 39 pipeline PASS. Related lifecycle: 12/12 ở ba browser PASS, gồm shader rỗng, actual pixels/no rebuild, journal VI/EN/privacy và flight/pause/hidden/reduced-motion. Production build đúng ddc3246 rồi smoke PASS; không ngoài host, không lỗi hydration/shader, SSR/build không chứa sentinel.
- K1 GPU thật đủ matrix: 300 ghim active p50 86,90/85,90 ms; K2 renderer pixel/hit/overlap và K3 bbox/ảnh/R1 đã kiểm. H6 native 41,481 giây; CI WebKit cùng runner 58,262→57,605 giây. Soak runtime cuối 600,002 giây / 11 vòng, tài nguyên ổn định, heap giảm 20,81%; heap không phải GPU memory.
- Self-review độc lập đã đóng P1 readiness; source scan sạch. Còn quét artifact/commit receipt cuối và CI đúng head đó trước merge; PR vẫn draft. Chi tiết và giới hạn ở P10_1_RUNBOOK và evidence README.

## 29/10/2026 — M2 chuẩn bị, chưa mở PR

`PARTIAL`: worktree riêng từ main M0, chưa merge thay M1. Typecheck đã PASS sau sửa build identity, lint helpers, context recovery và sheet. Coverage provider 4.1.11 cùng chín version bắc cầu được resolve bằng Bun 1.4.3, giữ guard 24h; frozen install scripts-disabled đạt, chưa chạy coverage/check/E2E. Đã kiểm metadata và tarball đủ integrity của mười package mới: không binary native hoặc preinstall/install/postinstall. `parser.exe` trong nested node_modules là shim Windows do Bun tạo cho Babel parser JS có sẵn, không có trong npm tarball magicast. Chi tiết/giấy phép trong ATTRIBUTION và `dependency-review.json`.

Còn phải làm: đo baseline coverage rồi ratchet, xác minh bundle manifest/budget, lint 0, check/E2E recovery/sheet, P8/P9 GPU/landscape/context warnings, quét riêng tư và review/PR/CI. Không coi typecheck là hoàn tất các cổng. Tám JSON M0 CRLF sẽ renormalize trong commit riêng giữ nguyên giá trị.

### M2 sơ bộ và cập nhật cổng M1

Kiểm Windows sơ bộ M2: 365 ca semantic với V8 coverage đạt, sau đó ca CPU giữ nguyên 600 frame/4 ms không instrumentation đạt; typecheck và lint không lỗi/cảnh báo. Vỏ sơ bộ 221.427 byte gzip. Cổng head tích hợp cuối NOT_VERIFIED. PR #9 CI `40781481203` đỏ ở H6 WebKit 87.777 ms (baseline cùng runner 88.233 ms); PR vẫn draft, chưa merge.

## 29/10/2026 — M2 trước PR tích hợp

Checkpoint a68da1c chuẩn bị reliability/quality, merge M1 bằng 0b56c49, tối ưu audio/đọc tác nhân 1da524d, LF riêng 487156d, sửa review 6cce959, tăng assertion lost capture ff55065. Không rebase/amend/squash. Main vẫn cf3cb262dfa7b69a881bef63c0d9a89dd32668fb; branch không behind main.

Full check tại6cce959 đạt 377 unit semantic có coverage + ca CPU nguyên600frame/4ms,39pipeline,typecheck/lint/build,bundle222305gzip. NativeH6 cùng harnessChrome/Intel/DPR1/no-preference: de71732 43434ms→6cce959 41839ms (−3,67%). C/F22case liên quan đạt; layout9/9 ba browser vàlost-capturetrướcmouseup6/6 đạt. WindowsWebKit audio thực không cóAPI, giữfail/NOT_VERIFIED_UNSUPPORTED; không đổi skipguard.

P8/P9raw487 giữ mọi mẫu: P8 420actionsmax78,4ms, continuous717intervalmax44,5ms; P9cold-contextp5077,10,p9592,10,max124,20;warmp5061,55,p9576,80,max108. P9NOT_MET cho mọi mẫu<100; không đo firstaudible. Reviewer riêng xác nhận protocol/hash, tìm2P2đãsửa/đóng và1P3assertionđãtăngcường/kiểm6browsercase. Không gọi CI/mergeDONE khi chưa có run đúngheadcuối.

Chuẩn bị M3 phát hiện prerender opt-in qua wrapper làm mất Wrangler output config; chuyển hậu xử lý sang chính fetch export đã build, config phục hồi và shell/hash được sinh thật. PWA ba ca production local đã đạt ở bước chuẩn bị, cần kiểm sau tích hợp. M4 17 unit JWT và dry-run thật Wrangler4.151.3 đạt, chưa deploy; runtime Workerd còn cần kiểm. M5 47pipelinecases synthetic đạt, gồm GeoTIFFWGS/UTM và canonical+G1; phần renderer/hiệu năng cuối chưa nghiệm thu. Đây là tiến độ, không phải milestoneDONE.

Review cuối ở ff550657 xác nhận không còn actionable finding. Assertion lost capture nay chờ sự kiện native và kiểm height trước mouseup, đã chạy6/6 ởC/F/W. Evidence M2 gồm34file, max168124byte trước receipt cuối; gitleaksdir515340byte sạch, path/token scan sạch. H6raw đã khử path/loopback. Đang commitreceipt để mở PR, chưa gọi CI4/mergepass.

### CI PR #10 vòng đầu

Run40800634965 ởhead5f59f0e: qualityvàWebKit đạt, Firefox68pass/46skip/1fail ởfocus sau pointercancel trongportrait. Geometry đãkhôi phục; phép kiểm gửi pointercancel tổng hợp rồi mouseup native đểdọn driver, bước sau cóthểfocus phần tử đangnằm dưới con trỏ sau khisheetđổiheight. Giữ assertionfocus nhưng kiểmngaysau cancel trước bướcdriver cleanup; dùngpointerIDthực cho mọicancel. Không thayruntime, timeout hoặcskipguard; đây làharnessfix cầnheadmớivàCIkiểm, khôngreruncùnghead.

ChromiumCI lượt40800634965 có114pass/1fail: HUDportrait-label tronglandscape dùngfontLinux xuốngthêm1dòng, chồngPOV12px (screenshot synthetic đãxem). Giữđủnội dung, đưagiờ/ngày thànhhai cột trongHUDlandscape đểgiảmchiềucao; giữnguyênzero-overlap assertion. WebKit115/115pass, H6baseline59970ms→55801ms (−6,95%), ngưỡng70s/+10%đạt. Đây làCIheadđầuM2, chưađủ4/4.

Headabed181đãfullchecklại:378unit/39pipeline/lint0, shell222303gzip;3layoutcasevà6cancelcaseC/F/Wđạt. Review độc lập phầnCI-fixkhôngcònactionablefinding, xácnhậntimingassertionfocusđúngsựkiệnchứkhôngnớiđiềukiện. Chuẩn bịheadreceiptmới choCI; khôngrerun5f59f0e.

## 29/10/2026 — PR #10 tích hợp M1/M2 đã mở

[PR #10](https://github.com/sovergarden-dev/home-3d/pull/10), head `5f59f0ee69fef323e3db202012a97796331b7859`, draft. Source thực thi đã check tại6cce959, test-only cuối ff550657 vàreceipt5f59f0e; reviewer độc lập không còn actionable finding. Gitleaks cuối17commits/4,26MB sạch; evidence/path/token/size sạch. Main chưa merge, CI đúngheadđangchạy. PR #9parked đượcgiữ lại vìheadcũkhôngđủcổng; không rerun hoặc nớiH6. M3 tíchhợp nhánhứngviên đểtiếptục việcđộc lập, không coilàmainđãđạt.

### Điều tra focus CI vònghai

Run40804608976 Firefoxvẫnfailtrướcmouseup, nên giảthuyếtcleanupkhônggiảithíchđủ. ProbeFirefoxWindowsépnoWebGL2 táihiện:ởfullsnap725px, pointerdownkhôngtớihandle vìcardfallbacknằmtrênnó; focusvềbodyvàheightkhôngđổikéo. ScreenshotCIxácnhậncardchehandle. Sheetexpandedđượcnângz-indextrênfallback/POV; testthêmcheckfocus/capturethậtvàheightphảithayđổitrướccancel, tránhnoopvẫngreen. GiữmọiassertionvàchưakếtluậnCIpass.

### M2 — Hồi quy nút thử lại ở landscape

CI vòng ba `40810779896` đã qua toàn bộ ca kéo bảng; Firefox còn lỗi mới ở nút Retry 3D sau chuỗi consent thời tiết EN landscape (69 pass, 46 skip, 1 fail). Bảng half cao 48dvh với z50 che nút ở mép trên; bản sửa trước đã nâng cả half và full dù probe chỉ chứng minh vấn đề full. Giới hạn z50 cho full; half giữ z20 để thẻ fallback vẫn thao tác được. Giữ nguyên test thời tiết/click thật và ca hủy kéo; không nới timeout hoặc assertion. Mục kéo bảng đã có bằng chứng đạt; hồi quy vừa phát hiện được kiểm riêng trước khi xin cổng CI ở head mới. Chưa merge hoặc đánh dấu M2 DONE.

## 29/10/2026 — Review tích hợp M3–M5

Phiên review độc lập `01a185af-1d0b-73e3-8903-d047f9e42cc0` đưa ra bốn P2 cụ thể: cache install lỗi đẩy mất cache đang dùng; enrichment bỏ qua ranh lô override; GeoTIFF tie-point không ở pixel zero; chi tiết dùng parent thay vì building parts. Đã sửa cả bốn và thêm test tương ứng. Pipeline 50/50 và detail unit 3/3 đạt. Check/PWA và lượt review xác nhận sửa vẫn pending; M3/M4/M5 giữ PARTIAL.

M2 head `88e0306` check cục bộ đạt 378 unit/39 pipeline, lint/type/build/bundle; run liên quan Windows giữ 17 pass/4 fail (đều 5 giây khởi tạo scene, không phải assertion tương tác). Không đổi timeout. Bản tự host font M3 sẽ được kiểm tích hợp lại; chưa dùng kết quả này để khẳng định mọi E2E Windows đạt.

### PR #10 được giữ parked

Đã cập nhật mô tả PR #10 với head `46b1fd87da630bcc8aa509de2e9bd8d449bf099a`, CI `40810779896`, hồi quy Retry 3D và H6 vượt 70 giây. Head local `88e0306` đã được review không còn finding và nằm trong bản tích hợp; chưa merge PR. Check tích hợp đạt 401 unit/50 pipeline, shell 224.355 byte gzip. PWA 5 production test tại `5e093ccc471464e9cd5d8bae86335b87afdae6be` đạt; review độc lập đóng tất cả phát hiện source, bao gồm rollback. Kiểm giao diện mở rộng còn lỗi nút collapsed private panel bị sheet che một phần ở landscape, đang sửa. Main chưa đóng băng.

### Gate UI/PWA sau sửa

Axe mở rộng 9/9 (1440×900, 390×844, 740×390 trên C/F/W) đạt, có cả keyboard đưa sheet về peek và nút private panel hiện lại. PWA production dùng gzip đạt 5/5 tại `a948321b72d9d95833ab2af7338c55e4dc24d05e`; shell 224.364 byte gzip. Review cuối chỉ thêm P3 cho QA transport bỏ qua gzip;q=0; đã sửa parser quality và kiểm 4 HTTP request thật, body hash khớp asset build trong mọi chế độ. Không có finding runtime còn mở; cổng CI/native/GPU cuối vẫn chưa đạt.

Probe thêm test thời tiết gốc trên build production: Chromium/Firefox đạt; WebKit fail mock request counter (0 thay vì 1). Trace thực ghi HTTP 200 từ host Open-Meteo trong lúc Service Worker điều khiển trang, chỉ với fixture/companion tổng hợp. [Playwright ghi rõ page.route không chặn được request do Service Worker xử lý](https://playwright.dev/docs/api/class-page#page-route). Giữ fail, không gọi đây là phép thử hoàn toàn mock hoặc chứng nhận Safari; không tiếp tục probe mạng này. Test weather dev trên WebKit ở lượt tích hợp đã đạt 4/4. Không có dữ liệu khu thật hoặc host mới trong app.

## 29/10/2026 — PR #11 tích hợp và CI đầu tiên

[PR #11](https://github.com/sovergarden-dev/home-3d/pull/11) đã mở draft ở `43a0edeb30c8f50ff3ae5f771dd87961cd98b505`; main vẫn `cf3cb262dfa7b69a881bef63c0d9a89dd32668fb`. CI `40817266052`: Chromium success; quality qua 401 unit/50 pipeline/build/bundle rồi lỗi gốc module ở probe Workerd; Firefox 70 pass/47 skip/3 fail do test cố focus nút sound disabled; WebKit 120 pass nhưng H6 89.097 ms >70.000 ms (baseline cùng runner 89.716 ms). Không rerun cùng head.

Đã sửa modulesRoot và xác minh Worker native đầy đủ trên Windows. Test a11y phân biệt nút có khả năng hoạt động và disabled, giữ kiểm focus hiện hữu khi ready, thêm forced fallback; lượt mới 12/12 Windows đạt. Review độc lập không còn finding cho hai sửa. Ngưỡng, timeout và guard H6 giữ nguyên.

Ma trận desktop GPU thật đã chạy đủ Chrome/Edge/Firefox, 4 cảnh ×600 bước/cảnh; raw và ảnh trong m3/desktop-development. Draw/tam giác đạt mid; FPS và một số khung >50 ms không đạt. Chrome WDDM peak244MB, Edge179MB; Firefox shared counter bất thường14,98GB trong khi committed378MB, không gọi đây là VRAM vật lý hoặc bằng chứng leak. Kiểm production ngắn 180 bước vẫn thấy storm p95>50ms; giữ nhãn diagnostic, không thay ma trận hoặc loại mẫu chậm. Chưa chạy soak30phút/Lighthouse/4G tại mục này.

Lighthouse13.5 production tại `a948321b72d9d95833ab2af7338c55e4dc24d05e`, gzip, headless Chrome152 IntelUHD: mobilePerformance26/Accessibility100; desktop60/100. Performance NOT_MET, accessibility đạt95. MobileTBT9.914,5ms, desktop936,5ms; không request ngoài. Audit chỉ ra42,3s ScriptEvaluation ở engine trong profile mobile, không có căn cứ đổ lỗi cho React UI là nguyên nhân chính. Giữ đầy đủ JSON gzip, không giảm tiêu chuẩn hoặc thay root bằng trang nhẹ để báo xanh.

Quét endpoint build xác nhận /.vite/manifest.json trả200 kèm đường dẫn build; đã chuyển manifest nội bộ sang server-only, check bundle vẫn đọc graph gốc. Test production mới yêu cầu URL nội bộ404, đang chạy. Không có dữ liệu khu thật và chưa Publish/deploy.

## 29/10/2026 — Tạm dừng theo chủ dự án để khởi động lại máy

Đã dừng phép đo Edge đang chạy và các server/browser QA cục bộ thuộc Home 3D. Mã ứng viên `4e5136f1cfdcd5e69a31af7a7455d5fa2f40c74a` đã push lên PR #11; main vẫn `cf3cb262dfa7b69a881bef63c0d9a89dd32668fb`, chưa merge/freeze/audit tag. CI `40836100757` chạy độc lập trên GitHub: quality success, ba browser còn đang chạy tại thời điểm tạm dừng. Không hủy/rerun CI.

Soak30phút đã hoàn tất và raw được lưu. Lượt Edge full matrix bị ngắt theo yêu cầu chủ dự án: giữ tất cả batch đã ghi, đánh dấu INTERRUPTED, không coi là ma trận hoàn chỉnh. Điểm tiếp tục cục bộ ghi đủ đường dẫn, log, giới hạn và việc còn lại; sau reboot phải xem kết quả CI cũ trước, không tự rerun cùng head. Chưa Publish/deploy hoặc mở dữ liệu khu thật.

## 30–31/10/2026 — Chuyển máy; Notion AI tạm tiếp quản

Codex đóng gói ZIP bàn giao ngày 30/10 để chuyển sang máy mạnh hơn; máy đó bận nên ngày 31/10 chủ dự án yêu cầu Notion AI tạm tiếp quản và làm tiếp từ PR #11, không làm lại M0. Môi trường: Linux sandbox 2 vCPU Xeon 2,5 GHz, 4 GiB RAM, không GPU. Phiên này không có quyền ghi GitHub (không token/gh), nên không push, không mở PR, không chạy CI; kết quả giao bằng git bundle. Không Publish/deploy, không đăng nhập cloud, không dữ liệu khu thật.

### Khôi phục và đọc lại trạng thái

Gói ZIP khớp manifest SHA-256 (1.064 tệp). Bundle khôi phục đúng `9b12c1d8b2581b3a7eaed55af1579a944589b905`, working tree sạch, `git fsck` sạch, tag `baseline/p10-published` đúng. Đọc remote công khai (không cần đăng nhập): main vẫn `cf3cb26`, PR #11 draft head `4e5136f`, PR #9/#10 draft, run `40836100757` vẫn failure như lúc đóng gói. Không rerun hay dispatch.

### Cổng local Linux tại 9b12c1d

Bun 1.4.3 (checksum khớp), Node 24.14.1, `bun install --frozen-lockfile`. `bun run check` đạt trong 108 s: typecheck, lint 0, 400 unit có coverage + 1 bài CPU, ratchet coverage, 50 pipeline, build, bundle 224.385 gzip ≤250.000. Host Amazon Linux 2023 thiếu glibc 2.38 cho Playwright WebKit, nên E2E WebKit chạy trong chroot Ubuntu 24.04 (WebKit 26.0).

### H6 WebKit — nguyên nhân và sửa

Spec H6 nguyên vẹn trên máy này timeout 90 s ở `9b12c1d` (10 chu kỳ trong 90 s); máy chậm hơn runner CI ~1,9 lần nên số này không so trực tiếp với CI. Chẩn đoán: WebKit chạy Desktop Safari DPR 2 (Chromium DPR 1); mỗi lần chọn chế độ main thread chỉ bận ~140–190 ms, nhưng Playwright chờ ~1 s để phần tử "stable" vì rAF chỉ chạy 3–4 lần/1,5 s. Tắt riêng từng yếu tố bằng CSS inject: bỏ backdrop blur −31%, bỏ transition −20%, bỏ box-shadow −9%, ẩn canvas −4%.

`d4fca77` bỏ backdrop blur của panel kính và bảng riêng, tăng alpha nền 0,72→0,8; transition, shadow, test, ngưỡng, timeout và guard giữ nguyên (lý do trong DECISIONS). ABBA mã thật 6+6 lượt: vòng chẩn đoán 3 chu kỳ 25.358→16.894 ms trung bình (−33,4%), hai khoảng không chồng nhau. Spec nguyên vẹn vẫn timeout trên máy này nhưng hoàn thành 14 thay vì 10 chu kỳ (chu kỳ ổn định 8,3→6,1 s). Sau sửa, các yếu tố còn lại đều <10% và nhiễu; DPR 1 nhanh gấp đôi DPR 2. Phép chiếu CI ~58–66 s là NOT_VERIFIED. Bằng chứng: [h6-webkit-linux-2026-10-31](assets/qa/codex/m2/h6-webkit-linux-2026-10-31/README.md).

Theo quy tắc ba vòng: nếu CI đúng head mới vẫn ≥70 s thì dừng tối ưu H6, ghi NOT_MET/PARTIAL và hỏi chủ dự án về cổng chuẩn hoá theo baseline cùng runner; không nới ngưỡng hoặc đổi runner để chọn số.

### Bằng chứng còn thiếu trong repo

Đã chép nguyên văn 20 tệp bằng chứng Codex đã khử thông tin khi đóng gói (soak 30 phút, tải 4G và probe throttle, K1 Chrome active-300, H6 hardware) vào [handoff-2026-10-30](assets/qa/codex/m3/handoff-2026-10-30/README.md). SHA-256 khớp provenance của gói; nhãn giữ nguyên: peak heap và K1 NOT_MET, ObjectURL NOT_EXERCISED, delta H6 hardware NOT_VERIFIED. Edge INTERRUPTED và trace lớn chỉ nằm trong ZIP.

### Cổng local sau sửa (d4fca77)

`bun run check` đạt trong 115 s: 400 unit + 1 bài CPU, 50 pipeline, bundle 224.367 gzip. Workerd native Linux (chroot, wrangler theo lock của repo) PASS 4 nhóm, JWKS chặn cục bộ 1 request; pipeline dry-run hợp lệ, 0 issue. E2E WebKit đầy đủ trong 24,0 phút: 120 pass, 1 fail là H6 20 vòng timeout 90 s do máy chậm (15 chu kỳ trong 90 s; reporter không enforce ngoài CI). Đây không phải kết quả đạt và không thay CI. Gitleaks 8.30.1 (checksum khớp) sạch trên toàn lịch sử local và trên `4e5136f..HEAD`. Chưa chạy Chromium/Firefox local, chưa đo GPU thật; self-review độc lập trước merge vẫn là việc của phiên kế tiếp.

### Bàn giao lại

Không push. Gói tiếp nối gồm git bundle đầy đủ và bundle tăng dần từ `4e5136f`, README hướng dẫn fast-forward lên PR #11 (không force), log/số liệu thô và script chẩn đoán. Việc kế tiếp: push, đọc CI đúng head mới, đi tiếp các cổng §5 nếu đủ 4/4. Việc cần GPU thật: K1 full matrix, H6 hardware, FPS/GPU, P9, Lighthouse ở head mới.

## 31/10–01/11/2026 — Máy Windows GPU thật (Notion AI qua Aki MCP)

Chủ dự án cho Notion AI làm trên máy Windows có GPU thật qua Aki MCP, với allowlist lệnh do chủ dự án cấp (`powershell` và `cmd` có sẵn từ trước). GitHub CLI đã đăng nhập sẵn nên phiên này push được nhánh PR #11; không force-push, không đổi cài đặt repo. Không Publish/deploy, không đăng nhập cloud, không dữ liệu khu thật. Số của máy này không trộn với máy Intel UHD (M0–M1), sandbox Linux hay runner CI.

### Môi trường

NVIDIA GeForce GTX 1660 Ti 6 GB (driver 32.0.16.1074, ANGLE D3D11), i7-10700, 29 GiB, Windows 10.0.26200, màn hình 144 Hz. Chrome 156.0.8078.47, Edge 156.0.4314.50; Playwright 1.58.2 với Firefox 146.0.1 và WebKit 26.0 (cài vào cache người dùng). Node 22.14.0; Bun 1.4.3 chỉ qua `npx`; mỗi checkout `bun install --frozen-lockfile`. GPU có tải nền khoảng 32% từ ứng dụng khác; các nguồn được đo xen kẽ nên nhiễu chia đều.

### Push, CI và sửa trên Windows

Fast-forward nhánh lên `ec7d6fd` (gồm `9b12c1d`, `d4fca77` và commit tài liệu từ sandbox Linux) rồi push. CI `41187853749` 4/4; H6 WebKit 60.422 ms, nên `d4fca77` đã gỡ chặn H6.

- `fba1e09` — Node 22.14 trên Windows: webcrypto từ chối ArrayBuffer tạo trong realm jsdom nên ba unit test nhập âm thanh fail. Hash qua view `Uint8Array` của cùng byte, giống các chỗ gọi digest khác.
- `a4f0121` — axe trên Firefox Windows báo `aria-prohibited-attr` (serious) ở 390 và 740 px: thanh tiến trình splash là `div` có `aria-label` mà không có role, có từ trước baseline; máy nhanh quét shell khi splash còn mờ dần. Chuyển thành `role="progressbar"` có tên dịch VI/EN và giá trị 0–100; test jsdom axe mới fail trên markup cũ và pass sau sửa.
- `bun run check` Windows ở `a4f0121` đạt: typecheck, lint 0, 402 unit + 1 bài CPU, 50 pipeline, build, bundle 224.418 gzip. CI `41209405262` ở `a4f0121` 4/4: quality; Chromium 121 + PWA 5; Firefox 74 pass/47 skip; WebKit 121, H6 52.623 ms so với `de71732` cùng runner 69.984 ms (−24,81%).

### Bằng chứng GPU thật

Chi tiết, raw và cách tái lập: [real-gpu-2026-10-31](assets/qa/codex/m3/real-gpu-2026-10-31/README.md). Baseline luôn là `de71732` (baseline chính thức của P10/M1); `4e5136f` chỉ là head cũ để thấy tác động của `d4fca77`.

- H6 hardware (Chrome headed, harness `fba1e09`, 2 lượt mỗi nguồn sau warm-up, thứ tự cân bằng): `de71732` 46.932 ms, `fba1e09` 48.743,5 ms (+3,86%, `PASS` ≤ +10%), `4e5136f` 48.680,5 ms. Bỏ blur không đổi thời gian trên Chrome có GPU.
- K1 full matrix (48 batch, before `de71732`, after `fba1e09`): `H_MET_REAL_GPU` chỉ cho máy này; after p50 27,6–34,1 ms, không mẫu nào > 50 ms; baseline có mẫu ≥ 100 ms ở mọi nhóm 300 ghim. Diagnostic 0↔1 chậm hơn baseline 6,85 ms p50 (+19,7%), chưa rõ nguyên nhân.
- FPS/GPU ở `a4f0121`: Chrome và Edge đạt mọi ngân sách (bộ nhớ GPU đỉnh 176.943.104 / 181.006.336 byte). Firefox đạt FPS/khung/hình học nhưng bộ nhớ GPU `NOT_MET`; counter WDDM tăng tới 23,2 GB, vượt VRAM 6 GB, nên cần công cụ khác trước khi kết luận.
- Controls Chrome ở `a4f0121`: P8 420/420 < 100 ms (max 65,8 ms) nhưng kéo camera 4/1.380 khoảng khung > 50 ms `NOT_MET`; P9 60/60, một mẫu warm 107,5 ms `NOT_MET`.
- E2E liên quan (Playwright bundled): `a4f0121` Chromium 19/19, Firefox 19/19, WebKit 17/19. Hai ca WebKit fail là Web Audio không có trong WebKit Windows (`NOT_VERIFIED_UNSUPPORTED`, như M2); CI WebKit Linux chạy đủ. Spec H6 chạy sát timeout 90 s ở cả ba engine trên máy này (headless, workers 1), không riêng WebKit và không phải cổng.

### Review độc lập và sửa sau review

Review ở phiên mới (Notion AI ẩn danh, chỉ đọc repo qua Aki MCP) cho phạm vi `7179e01..a4f0121` và evidence chưa commit: `MERGE_BLOCKED` với 1 P1, 5 P2, 4 P3. Xử lý:

- P1, chưa có bằng chứng CI/check ở `a4f0121` trong repo: đã ghi ở trên và trong AUDIT_PACKET; head cuối chạy lại check và CI.
- P2: AUDIT_PACKET còn nói không có quyền ghi GitHub và head `4e5136f` — đã cập nhật. 4G warm bị ghi đạt quá tay — đã kiểm raw: navigation warm đi qua service worker (network-first) nên nằm ngoài throttle, hạ xuống NOT_VERIFIED; cold giữ kết luận. K1 thiếu môi trường/hash — thêm `provenance.json`, giới hạn nhãn trong máy này. E2E fail chưa chú thích — thêm `annotations.json`. Evidence chưa commit — commit cùng README.
- P3: ghi giới hạn H6 (ứng viên `fba1e09`, Vite dev, 2 lượt/nguồn). Soak tính `modeChanges`/`audioCycles`/`verifiedPackageTransitions` bằng phép nhân — `400ab08` đếm theo trạng thái scene quan sát được, thiếu quan sát thì dừng. `build-pwa` không chạy lại được và để `.vite/manifest.json` trong public — `400ab08` sửa, thêm `public/.assetsignore`, xoá shell có hash cũ khi chạy lại. Script chẩn đoán H6 Linux không có trong repo — gắn `NOT_REPRODUCIBLE_FROM_REPO`, ghi CI đã thay phép chiếu.

### Soak liên tục

Lượt đầu ở `a4f0121` dừng sau 6 warm-up và 27 vòng đo (1.570.495 ms) vì cửa sổ Chrome bị đóng giữa chừng; raw giữ với `complete: false`, không dùng cho kết luận. Lượt hai ở `400ab08` (harness đếm theo trạng thái quan sát), Chrome 156 GPU thật, một document: 6 warm-up + 31 vòng trong 1.803.134 ms; 124 lần đổi mode, 62 lần chuyển gói, 31 chu kỳ âm thanh; không page error; tối đa 1 canvas/1 RAF/1 AudioContext, ImageBitmap 74 tạo/74 đóng. Heap cuối −17,98%, đỉnh +1,28% so baseline 79.955.818 byte: tiêu chí < 10% `MET` trên máy này. Heap nằm ở ba mức theo trạng thái vòng nên số âm chủ yếu do khác mức; cùng mức vẫn trôi +1,42% đến +2,97% sau 30 phút, chưa chứng minh không rò rỉ. ObjectURL `NOT_EXERCISED`. Soak Intel của Codex (đỉnh +22,16% `NOT_MET`) giữ nguyên, không bị thay.

### Cổng local trước merge (`400ab08`)

- `bun install --frozen-lockfile` không đổi; `bun run check` đạt: typecheck, lint, 402 unit + 1 bài CPU, 50 pipeline, build, bundle 224.408 gzip < 250.000. Commit tài liệu sau đó không đổi mã.
- Production PWA (`playwright.production.config.ts`) 5/5 trên Windows, vì `400ab08` sửa `build-pwa`.
- Gitleaks 8.30.1 sạch: toàn lịch sử local 131 commit và `cf3cb26..400ab08` 47 commit; tài liệu/evidence chưa commit quét chế độ `dir` sạch. Quét riêng tư các tệp sắp commit chỉ còn dương tính giả (từ tiếng Việt thông thường, số byte có dạng IPv4); mọi tệp < 1 MB.
- CI đúng head cuối, review độc lập phần delta và biên nhận merge ghi ở PR tài liệu tiếp theo.

### CI, review và merge PR #11 (01/11/2026)

- CI `41261238654` ở head `c6240276a987fae61cdee4dcebca5f44b1345034` đạt 4/4. Quality: 402 unit + 1 bài CPU, 50 pipeline, bundle 224.410 gzip. Chromium 121 + PWA production 5; Firefox 74 pass/47 skip theo capability; WebKit 121, H6 61.710 ms < 70.000 ms, baseline `de71732` cùng run 89.851 ms (−31,32%, ngưỡng ≤ +10%). Runner lần này chậm hơn lần `a4f0121` (baseline 69.984 ms), nên chỉ so với baseline cùng run.
- Review độc lập phần delta `a4f0121..c624027` ở phiên mới (Notion AI ẩn danh, chỉ đọc qua Aki MCP): `MERGE_OK`, không có P0–P2. Review xác nhận mọi phát hiện của lượt trước đã sửa hoặc gắn nhãn đúng, số soak khớp raw (sha256 khớp, tính lại được +1,28% và −17,98%), `src/` và `tests/` không đổi từ `a4f0121`, quét riêng tư sạch. Sáu P3 và cách xử lý:
  - Hai shell không hash vẫn nằm trong public, câu trong DECISIONS nói chỉ còn hai shell: sửa câu, đưa việc bỏ tệp vào BACKLOG.
  - Kiểm `.vite` chạy sau khi ghi output: ghi trong DECISIONS, đưa vào BACKLOG.
  - Node DOM tăng 1 sau mỗi lần SPA navigation (797 → 803): ghi trong README soak, đưa vào BACKLOG.
  - Soak phần lớn thời gian là render nhàn (thời gian vòng đo 9,83%), phạm vi "bộ nhớ" và nhãn bộ đếm bitmap chưa ghi: bổ sung trong README soak. Nhãn `MET` giữ nguyên theo cách M3.2 định nghĩa.
  - H6 WebKit của head cuối chưa ghi: ghi ở mục này.
  - Provenance benchmark phụ thuộc người chạy (có từ trước): đưa vào BACKLOG.
- PR body cập nhật theo trạng thái cuối, `gh pr ready 11`, rồi `gh pr merge 11 --merge --match-head-commit` đúng head trên lúc 01:59:20Z. Merge commit `beacd9b48b429db0e22530777e7d335d74369c7d` có hai cha `cf3cb26` và `c624027`; không squash/rebase, không force-push, không đổi cài đặt repo.
- CI push main `41263307199` ở `beacd9b` đạt 4/4: quality 402 unit + 1 bài CPU, 50 pipeline, gitleaks sạch; Chromium 121 + PWA production 5; Firefox 74 pass/47 skip; WebKit 121, H6 61.210 ms < 70.000 ms, baseline `de71732` cùng run 89.656 ms (−31,73%).
- Dọn máy sau merge: xoá hai worktree đo tạm (`400ab08` và baseline `de71732`). Trước khi xoá đã đối chiếu raw soak gốc với bản đã commit: cùng nội dung JSON, bản commit chỉ thêm ký tự xuống dòng cuối do Prettier, nên sha256 ghi trong `summary.json` là của bản commit.
- Sửa ghi chú cũ: PRIVATE_DEPLOY_RUNBOOK còn ghi Linux CI pending, trong khi bước `Verify private Worker locally (no deployment)` của job quality đạt (4 nhóm kiểm, 0 outbound bất ngờ) ở CI main `41263307199`; ATTRIBUTION còn ghi ma trận tích hợp cuối pending. Đã cập nhật hai tệp; M4 vẫn PARTIAL vì runbook chưa rà xong; Lighthouse ở head cuối vẫn NOT_VERIFIED.
- Merge vào main tự cập nhật Lovable Preview; không Publish, không mở hay sửa Lovable. Build của Lovable vẫn NOT_VERIFIED.
- PR #9 và #10 (draft) được GitHub tự đánh dấu MERGED lúc 01:59:22Z, 2 giây sau PR #11, vì head `b662038` và `46b1fd8` đã là tổ tiên của `beacd9b`; không có merge riêng, không còn gì để đóng. Ghi chú "draft parked" trước đây là sai.
- Xoá nhánh remote đã merge theo §5.1, sau khi `git merge-base --is-ancestor <sha> beacd9b` trả 0 cho từng nhánh; SHA để khôi phục (lấy từ `git ls-remote origin` ngay trước khi xoá): `codex/m1-p10-polish` `b6620382f389545850bb025dbd1d4fff7452ec99`, `codex/m2-reliability` `46b1fd87da630bcc8aa509de2e9bd8d449bf099a`, `codex/m4-private-runtime` `80817f34141c8bb68cf832231f52f9ec046b9e22`, `codex/m5-local-height-detail` `c6240276a987fae61cdee4dcebca5f44b1345034`. Commit con `092d093` của nhánh m4 vào m5 qua merge `5ca766a`, cũng nằm trong `beacd9b`. Nhánh của PR #12 xoá sau khi PR #12 merge.
- PR #12 (biên nhận này): CI `41264961644` ở head trung gian `ab634a2` 4/4 (WebKit H6 47.724 ms, baseline `de71732` cùng run 61.970 ms), không phải cổng merge. Review độc lập phiên mới trả `MERGE_BLOCKED`: P1 ghi PR #9/#10 còn mở trong khi GitHub đã đánh dấu MERGED; P2 Lighthouse mất nhãn NOT_MET; P2 dòng M4 trong AUDIT_PACKET còn ghi full native đang chờ; P2 nhãn K1 không ghi máy/SHA nên đọc như trộn máy; P3 "thao tác 9,83%" thật ra là thời gian vòng đo gồm GC và 500 ms chờ; P3 câu về PR #12 đọc như đã merge. Sáu mục đã sửa ở `b2c8550`, kèm sửa dòng trạng thái cũ của P10_1, M2 và M3 runbook. Review lại lần hai xác nhận sáu mục đã đóng nhưng vẫn `MERGE_BLOCKED`: P2 câu 0↔1 NOT_MET ở P10_1/BACKLOG đọc như kết quả NVIDIA (thật ra là Intel UHD `59f6`); P3 dòng CI head trung gian mâu thuẫn dòng đầu; P3 chưa ghi nguồn SHA nhánh m4; P3 dòng trạng thái M3 runbook thiếu Lighthouse NOT_MET. Bốn mục đã sửa ở commit tiếp theo; kết quả review cuối ghi trong PR #12.

## 01/11/2026 — Lighthouse ở main và PR #13 (khung đầu chờ shader song song)

- Lighthouse 13.5.0 trên máy NVIDIA (Chrome 156 headless, server gzip loopback, cấu hình mặc định, 3 lượt mỗi form) ở main `5e6aec5`: mobile 44/45/43 (trung vị 44; FCP 3.775 ms, LCP 5.468 ms, TBT 1.562 ms), desktop 79/78/79 (79; FCP 742 ms, LCP 1.146 ms, TBT 401,5 ms); Accessibility 100. Raw, hash và cách đo nằm trong thư mục evidence `m3/real-gpu-2026-11-01` của Codex.
- Chẩn đoán: lượt mobile 1 có task 917,9 ms (audit `main-thread-tasks`) khi chunk `demoScene` chạy (report đã lưu). Profile production lạnh (chẩn đoán, không lưu raw) thấy khoảng 456–459 ms chờ link shader đồng bộ ở render đầu, khoảng 116 ms `atmosphere.warm`, khoảng 200 ms dựng cảnh.
- PR #13, commit `2c21b54` (chỉ mã): khung đầu chờ biên dịch song song qua `KHR_parallel_shader_compile`; không có extension thì không có trạng thái để hỏi, khung đầu vẽ ngay và chương trình link khi dùng lần đầu như main; 18 biến thể khí quyển làm ấm mỗi task một biến thể sau khung đầu; `SceneRuntime.ready` để splash và điều khiển chờ khung đầu thật; hash link chỉ áp sau khung đầu. Thêm 3 unit test: làm ấm theo lát giữ đúng thứ tự và trạng thái render; chỉ báo sẵn sàng sau khung đầu; khung đầu lỗi thì fallback và giải phóng cảnh.
- Đo lại ở `2c21b54`: desktop 97/97/98 (97; FCP 738 ms, LCP 967 ms, TBT 112,5 ms) `MET`; mobile 56/56/58 (56; FCP 3.776 ms, LCP 4.820 ms, TBT 654,5 ms) `NOT_MET`; Accessibility 100. Profile lạnh (chẩn đoán, không lưu raw): task dựng 805 ms còn 425 và 304 ms, render đầu tách thành task 59 ms; `getContext("webgl2")` vẫn chiếm khoảng 150–300 ms.
- Quyết định: mục Lighthouse dùng 1/3 vòng thử theo §5.6 handoff và dừng ở đây. Giả thuyết, chưa thử (`NOT_VERIFIED`): mobile bị giới hạn bởi JS tải trước FCP trên đường mô phỏng 1,6 Mbps và task dựng nhân CPU ×4, nên đạt ≥ 90 có thể cần đổi kiến trúc (entry nhỏ hơn, render ngoài main thread hoặc tương đương), ngoài phạm vi đợt này. Không hoãn tải cảnh tới sau FCP chỉ để tăng điểm. Ngưỡng không nới.
- Cổng local ở `2c21b54`: `bun run check` đạt (405 unit + 1 bài CPU, 50 pipeline, build, bundle 224.444 gzip < 250.000).
- CI `41312548072` ở head `da450d4`: chromium và webkit FAIL ở `illustrative-details`, số geometry [40, 41, 41] thay vì ba số bằng nhau. Spec debug tạm (không commit, không lưu raw): ở main lúc sẵn sàng đã có 42 geometry và chuyển Mặt bằng không tạo buffer mới; ở PR có 37, lần chuyển Mặt bằng đầu tiên tạo 4 buffer (một geometry chỉ góc đó vẽ) rồi giữ nguyên, không tạo chương trình nào ở cả hai. Main có số đó sớm nhờ một lượt vẽ trong `mountWorld` trước khi áp hiển thị lớp; cổng khung đầu bỏ lượt vẽ đó. Không có rò rỉ. Commit `079f5c5` cho test vẽ Mặt bằng rồi Diorama một lần trước khi đếm, giữ assertion ba số bằng nhau, đính kèm số đếm trước khi assert. Đột biến tạo lại chi tiết mỗi lần bật làm test FAIL với ba số khác nhau.
- Review độc lập phiên mới ở `da450d4`: `MERGE_BLOCKED`, 9 mục, đã sửa ở `deb4a91` (mã và test), `079f5c5`, `07fc66e` (script) và commit tài liệu này:
  - P1 CI FAIL: như trên.
  - P1 mất context trong lúc khởi động để splash (tiến trình 0,85) che nút Thử lại: viewport đặt tiến trình 1 khi mất context.
  - P2 thao tác mở trước khi biến thể xong, trái AGENTS.md: chuỗi khởi động mới `src/engine/startupSequence.ts`; `ready` chỉ báo `interactive` sau khi mọi biến thể đã biên dịch, báo `stopped` khi dispose hoặc mất context. Quyết định ghi ở DECISIONS.
  - P2 test chỉ mock `ready`: thêm 6 unit test cho chuỗi khởi động (hỏi trạng thái, giới hạn 10 s, dừng, bước lỗi), 2 test viewport (khởi động dừng thì không báo sẵn sàng; mất context lần hai trước khi xong thì bỏ splash) và e2e `startup-gate` giữ chương trình chưa link: còn loading và splash tới khi mọi biến thể xong, mất context hai lần thì hiện Thử lại bấm được, hash đổi trong lúc chờ vẫn được áp. Đột biến báo sẵn sàng ngay sau khung đầu làm e2e FAIL; bỏ dòng đặt tiến trình 1 làm test viewport FAIL.
  - P3 chú thích `ready` hứa quá và các lượt vẽ chưa chặn: viết lại chú thích; nhánh lỗi gói riêng dùng `render()` (không vẽ trước khung đầu); đổi world giữ lượt biên dịch đồng bộ, có chú thích; chụp bưu thiếp trước khung đầu trả `CAPTURE_UNAVAILABLE`.
  - P3 số profile không lưu raw và giới hạn mobile ghi như sự thật: gắn nhãn chẩn đoán/giả thuyết ở log, README evidence và M3 runbook.
  - P3 README evidence suy luận nguyên nhân CLS: thay bằng giá trị từng lượt.
  - P3 `summary.json` gộp không tái tạo được từ repo: thêm `scripts/lighthouse-summary.mjs` (ghi hoặc `--check`); `--check` đạt cho ba thư mục; sáu ca sửa tay (trung vị, nhãn, dòng run, đổi report, hash script, bỏ một run) đều bị bắt.
  - P3 BACKLOG mất dòng Lighthouse Intel UHD `a948321` NOT_MET: đã khôi phục.
- Đo lại ở head mã `07fc66e` (vẫn vòng thử 1, không phải vòng tối ưu mới): desktop 98/97/97 (97; FCP 734 ms, LCP 969 ms, TBT 84 ms) `MET`; mobile 42/50/58 (50; FCP 3.772 ms, LCP 5.209 ms, TBT 876,5 ms) `NOT_MET`; Accessibility 100. Task lớn nhất lượt mobile 1–3 là 671,5 / 438,8 / 238,1 ms (audit `main-thread-tasks`, thời gian quan sát; main 917,9 / 813,1 / 864,9 ms, `2c21b54` 266,2 / 242,3 / 178,3 ms); lượt 3 cùng cỡ `2c21b54`, lượt 1–2 lớn hơn, chưa xác định nguyên nhân (`NOT_VERIFIED`). Bản trước ghi số mô phỏng của audit `long-tasks` (1.343, 1.134 và 878 ms); review delta PR #13 chỉ ra trộn hai cơ sở, đã sửa trong PR theo sau. Đo khởi động (Chrome headed GPU thật, không throttle, 5 lượt, raw trong evidence; script tạm, bản commit là `scripts/startup-timing.mjs` ở PR đo 02/11): khung đầu trung vị 421 ms, sẵn sàng 562 ms, khoảng giữa 125–280 ms (trung vị 141 ms), không có long task sau khung đầu.
- Cổng ở `07fc66e`: `bun run check` đạt (413 unit + 1 bài CPU, 50 pipeline, build, bundle 224.458 gzip < 250.000); `startup-gate` và `illustrative-details` đạt local trên chromium, firefox và webkit; CI `41338350050` 4/4 (head trung gian, không phải cổng merge). CI đúng head cuối, review độc lập và biên nhận merge ghi ở PR #13 và PR tài liệu tiếp theo.

## 02/11/2026 — Merge PR #13 và PR #14 (sửa sau review delta)

- PR #13 merge bằng merge commit `a76daab5536eea81a488e55119ba3fe9bd6a78df` lúc 01/11/2026 19:49:03Z, `--match-head-commit c670e9c`. CI head `41340901104` 4/4 (WebKit H6 50.760 ms, baseline cùng lượt 61.300 ms, −17,19%); CI push main `41343646768` 4/4 (H6 55.169 ms, baseline 71.262 ms, −22,58%; WebKit 122 passed). Gitleaks `5e6aec5..c670e9c` sạch; nhánh remote xoá sau kiểm ancestor; biên nhận ở comment PR #13.
- Review delta phiên mới ở `c670e9c`: `MERGE_OK`, 5 mục cho PR sau: R-N2 (P2) splash không quay lại ở lượt khởi động sau phục hồi hoặc Thử lại; R-N1 README evidence 01/11 trộn hai cơ sở số task; R-N3 nhánh không có `KHR_parallel_shader_compile` chưa có test; R-N4 test chi tiết minh hoạ đọc baseline geometry mà không dùng; R-N5 script đo khởi động chưa commit (để PR đo tiếp theo).
- PR #14 `codex/m3-followups` từ `a76daab`; quyết định ghi ở DECISIONS (mục sau review delta PR #13):
  - `abe18d2` (R-N2, R-N3): splash hiện lại khi lượt khởi động mới bắt đầu. Unit test mới và e2e `startup-gate` kiểm điểm chạm ở tâm canvas và nút giờ là splash lúc tải lần đầu, sau phục hồi và sau Thử lại, là chính nó sau `ready`; e2e mới chặn extension: lần đầu có `ready` đã đủ n/n biến thể, mọi mẫu còn tải có splash. Đạt local trên chromium, firefox, webkit. Đột biến bỏ bản sửa: unit test và e2e FAIL ở bước sau Thử lại.
  - `aeddb52` (R-N4): số geometry khi bật chi tiết phải lớn hơn lúc chưa bật.
  - `6a0c697`, `394789b`: rò canvas khi điều hướng SPA (+1 node DOM mỗi lượt ở soak 31/10). Probe heap trên build production (Chromium, 3 lượt Giới thiệu ↔ Về phố giữa hai snapshot, script tạm, không lưu raw): canvas Three.js đã gỡ tăng 3 → 6, đường giữ là geometry dùng chung của `Sprite` → listener `dispose` của renderer → context WebGL2 → canvas. Sửa: đưa geometry dùng chung vào danh sách dispose. Sau sửa: node DOM 477 → 477, node tách 14 → 14 (trước 480 → 483, 17 → 20). Unit test mới và e2e `navigation-retention` (Chromium, CDP); đột biến bỏ bản sửa: unit FAIL, e2e đếm 4 canvas tách sau 4 lượt.
  - `cd7cbeb`: `build-pwa` kiểm `.vite` và chuyển manifest trước khi ghi, chỉ ghi shell có hash. Kiểm âm bằng script tạm: shell không hash cũ bị xoá; tệp lạ trong `.vite` và thiếu manifest dừng với output không đổi; chạy lại sạch đạt. E2e PWA kiểm hai đường shell không hash trả 404.
  - Tài liệu (R-N1): README evidence 01/11 và mục 01/11 của log dùng một cơ sở `main-thread-tasks`; số `long-tasks` ghi rõ là mô phỏng Lantern. Cập nhật DECISIONS, BACKLOG, AUDIT_PACKET và README soak 31/10.
- Cổng local ở `394789b` (cùng tài liệu chưa commit): `bun run check` đạt (415 unit + 1 bài CPU, 50 pipeline, build, bundle 224.467 gzip < 250.000); production PWA 5/5. CI, review độc lập và biên nhận merge ghi ở PR #14 và PR tài liệu tiếp theo.
- CI `41347880882` ở `be72eca`: quality, Chromium, Firefox đạt; WebKit 122 pass, 1 fail ở bài 20 vòng của H6 (`h6-completion.spec.ts:311`, vòng 17/20, bước mở gói; reporter ghi 59.700 ms là thời gian chạy tới lúc fail, không phải số đo H6; baseline cùng run 88.464 ms). Trace: process mạng của WebKit crash lúc đọc tệp gói (`Network process crashed`, `WebKit encountered an internal error`); client Vite mất WebSocket HMR, kết nối lại rồi tải lại trang về `/`, nên gói vừa mở bị mất và bước chờ "Đã mở gói cục bộ" hết 5 s. Ở vòng 16, WebKit báo quá nhiều context WebGL đang sống và bỏ context cũ nhất, kèm thông báo `loseContext: context already lost`. Thông báo chỉ chứng minh có context đã mất trước đó (gỡ scene gọi `forceContextLoss`); việc context đó chỉ chờ GC hay bị WebKit giữ lại là suy luận, chưa kiểm (`NOT_VERIFIED`, sửa nhãn theo review PR #14 mục F4); vòng 16 vẫn qua các bước kiểm. PR #14 không đổi tải mạng, blob, IndexedDB hay số context mỗi vòng; bài này đạt ở CI head và CI main của PR #13, và đạt 3/3 lượt local WebKit (Windows) ở `be72eca` (mỗi lượt 1,4 phút; không lưu raw). Phân loại lúc đó: lỗi hạ tầng trình duyệt (xem lại ở mục CI main của PR #14 bên dưới). Không nới ngưỡng, không sửa test, không rerun cùng head; commit tài liệu này là head mới để CI chạy lại đủ bốn job. Việc giữ context trên WebKit ghi ở BACKLOG.
- CI `41380859828` ở head cuối `88dcbe7` (commit tài liệu trên) 4/4: WebKit 123 pass, 1 skip; H6 55.371 ms < 70.000 ms, baseline cùng run 71.367 ms (−22,41%). Gitleaks `a76daab..88dcbe7` sạch.
- Review độc lập phiên mới ở `88dcbe7`: `MERGE_OK`, không có P0–P2; bốn mục P3: F1 bước "sau phục hồi" của unit `sceneLifecycle` và e2e `startup-gate` làm mất context khi lượt khởi động đầu còn giữ, nên vẫn đạt khi bỏ bản sửa (chỉ bước Thử lại phân biệt được); F2 `build-pwa` còn hai điểm dừng sau lần ghi đầu (icon bắt buộc, đọc template); F3 script đo khởi động (R-N5) chưa có mục theo dõi; F4 suy luận ghi như sự thật ở log và BACKLOG. F3, F4 sửa ở PR đo M3 (mục dưới); F1, F2 ghi ở BACKLOG cho PR sau.
- PR #14 merge bằng merge commit `69543c2489a3b1d36de93e924bf4e7615b200607` lúc 02/11/2026 03:35:40Z, `--match-head-commit 88dcbe7`; nhánh remote xoá sau kiểm ancestor; biên nhận ở comment PR #14.
- CI push main `41383947465` ở `69543c2`: quality, Chromium, Firefox đạt; WebKit 122 pass, 1 fail ở cùng bài 20 vòng (vòng 6/20, bước mở gói; baseline cùng run 73.217 ms; 20.498 ms là thời gian chạy tới lúc fail). Trace cùng dấu hiệu: `Network process crashed` trong lúc `setInputFiles`, Vite tải lại trang, gói mất.
- Chẩn đoán, không phải cổng merge: nhánh tạm chỉ chạy bài 20 vòng trên WebKit nhiều lần (`--repeat-each`), mỗi head dispatch một lần. Run `41386555203` ở `a76daab` (trước PR #14): 10 lượt, 2 fail (vòng 20 và 10). Run `41386558130` ở `69543c2`: 10 lượt, 2 fail (vòng 12 và 20). Run `41388914976` ở `69543c2` có ghi bộ nhớ: 10/10 đạt; runner 4 CPU, RAM 15.983 MB, dùng tối đa 5.036 MB; process web WebKit tới khoảng 3 GB RSS mỗi lượt, process mạng không nằm trong 8 process lớn nhất; dmesg không có OOM. Cả bốn lần fail cùng dấu hiệu: process mạng WebKit crash khoảng 2 s sau khi `setInputFiles` bắt đầu (bình thường gói mở trong khoảng 0,3 s). Kết luận: lỗi có từ trước PR #14 (4/30 lượt chẩn đoán, chia đều hai mã), không phải hồi quy của PR #14. Phân loại "lỗi hạ tầng trình duyệt" ở trên đúng về nguồn gốc nhưng sai khi coi là hiếm. Nguyên nhân crash chưa rõ (`NOT_VERIFIED`); trong lượt không crash, bộ nhớ còn xa giới hạn.
- Xử lý: không nới ngưỡng, không thêm retry, không sửa test, không rerun CI main; CI main chạy lại khi merge PR kế tiếp. Theo dõi ở BACKLOG.

## 02/11/2026 — Đo 4G warm, thời gian khởi động và provenance benchmark

- PR đo M3 `codex/m3-measurements`, chỉ đổi script đo; merge main `252f5e7` để đo trên mã app của main `69543c2`. Quyết định ghi ở DECISIONS (mục đo 02/11).
  - `ca9cfab`: `launchBenchmark` ghi driver GPU do Chrome báo (`SystemInfo.getInfo` qua CDP, `driverSource: BROWSER_SYSTEM_INFO`), chọn GPU khớp device ID trong renderer WebGL; Firefox vẫn dùng `BENCH_GPU_DRIVER` (`OPERATOR_ENV`). Thêm `harnessTreeClean`. Probe trên máy này: Chrome liệt kê GTX 1660 Ti hai lần, Intel UHD và Microsoft Basic Render Driver; chọn đúng driver 32.0.16.1074 theo device ID.
  - `0c4d46f`: `load-benchmark` throttle cả service worker qua client CDP thứ hai. Đột biến bỏ throttle worker ở `c670e9c` (script tạm, không lưu raw): navigation warm 6,3–8,3 ms, kết luận warm `NOT_VERIFIED`.
  - `4c8cf09`: `scripts/startup-timing.mjs` (review delta PR #13 mục R-N5).
- Đo trên build production `252f5e7` (cây mã sạch, Chrome 156 headed, GTX 1660 Ti, driver do Chrome báo). 4G (6 lượt cold, 6 warm; worker gắn 6, throttle 6, 0 lỗi): cold FCP 700–916 ms, world 3.996–4.493 ms, navigation 192–204 ms, 0/6 qua worker; warm FCP 220–240 ms, world 595–642 ms, navigation 194–207 ms, 6/6 qua worker. Bốn kết luận MET, không có host ngoài. Khởi động 5 lượt: trung vị FCP 96 ms, khung đầu 420 ms, đủ biến thể 545 ms, sẵn sàng 558 ms, khung đầu → sẵn sàng 133 ms (127–277 ms); không có long task sau khung đầu; task trước khung đầu lượt 1 là 262 ms, lượt 2–5 là 85–92 ms. Raw, hash và giới hạn ở README evidence `m3/real-gpu-2026-11-02`.
- Tài liệu: AUDIT_PACKET (hàng Tải 4G và khởi động, PR #14, H6 WebKit), BACKLOG (M3 4G warm MET; F1, F2, crash WebKit, công cụ bộ nhớ GPU Firefox; harness chưa dùng driver do browser báo), DECISIONS, M3 và P10_1 runbook, README evidence 01/11 (F3) và log này (F4).
- Cổng local ở `252f5e7` (cùng tài liệu chưa commit): `bun run check` đạt (415 unit + 1 bài CPU, 50 pipeline, build, bundle 224.468 gzip < 250.000). CI, review độc lập và biên nhận merge ghi ở PR đo M3 và PR sau.
