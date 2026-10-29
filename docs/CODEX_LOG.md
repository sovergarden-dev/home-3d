# Nhật ký Codex — Phố Nhà Mình

## Hiện trạng

- M0 DONE: PR #8 merge cf3cb262dfa7b69a881bef63c0d9a89dd32668fb; CI main 40717187350 xanh 4/4.
- M1 PARTIAL: PR #9 parked/draft; head b662 có WebKit H6 87.777 ms (baseline cùng runner 88.233 ms), CI 40781481203 đỏ dù 110 ca chức năng đạt. Không merge/rerun head đó.
- M2: code và kiểm Windows/GPU đã có, đang chuẩn bị PR tích hợp M1; check 378 unit/39 pipeline, lint 0, vỏ 222.305 byte. H6 GPU mới 43.434→41.839 ms. CI head cuối/review cuối còn pending.
- M3/M4/M5 chuẩn bị trong worktree riêng; có test cục bộ từng phần, chưa tích hợp/merge. Không Publish/deploy hoặc đọc dữ liệu khu thật.
- P9 còn NOT_MET ở đỉnh >100 ms; Windows WebKit không có Web Audio. Chi tiết trong M2_RELIABILITY_RUNBOOK và evidence, không gộp thành pass.

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
