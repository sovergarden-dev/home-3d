# Nhật ký Codex — Phố Nhà Mình

## Hiện trạng

- Cập nhật: 28/10/2026 (UTC+7). Nguồn chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md).
- M0 `PARTIAL`: toolchain/tag, build Windows và production smoke đã có; đã đo GPU thật. PR #8 draft có CI 4/4 success ở head đầu; gate Windows còn đỏ, chưa merge.
- Baseline Git đã xác minh: `de7173261a8a3928685555252c2b479f76a713fe`. Tag annotated `baseline/p10-published` đã push và kiểm peeled SHA; nhánh P10 đã xoá đúng điều kiện. Nhánh công việc: `codex/m0-takeover`; [PR #8](https://github.com/sovergarden-dev/home-3d/pull/8) chưa merge.
- M1–M5 `NOT_DONE`. Không có dữ liệu khu thật được mở. Không Publish/deploy hoặc thay cài đặt dịch vụ.
- Việc kế tiếp: phân loại lỗi Windows, khép cổng local, kiểm sửa chữa sau self-review và cập nhật CI đúng head cuối. K3 M1 chỉ chuẩn bị trong worktree riêng, chưa kiểm hoặc merge.

## 28/10/2026 — M0 đang thực hiện

### Phạm vi và quyền

Đã đọc file bàn giao do chủ dự án cung cấp rồi `AGENTS.md`. Bàn giao thay phân vai/quy trình cũ, quy tắc cứng giữ nguyên. Chủ dự án uỷ quyền PR và merge commit sau các cổng §5.2; Notion AI chỉ audit cuối khi được yêu cầu. Không dùng quyền admin hiện có để thay cài đặt; không tạo token hoặc mở dữ liệu riêng.

### Bằng chứng thu mới bởi Codex

| Kiểm tra                         | Kết quả                                    | Nguồn                                                    |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Remote main                      | `de7173261a8a3928685555252c2b479f76a713fe` | Git/GitHub đọc trực tiếp                                 |
| PR mở khi bắt đầu                | 0                                          | GitHub CLI                                               |
| GPU được Windows nhận diện       | Intel(R) UHD Graphics                      | Win32_VideoController                                    |
| Driver                           | `32.0.101.7082`                            | Win32_VideoController                                    |
| Chrome đã cài                    | `152.0.7977.76`                            | File version                                             |
| Edge đã cài                      | `156.0.4314.42`                            | File version                                             |
| Bun riêng của dự án              | `1.4.3 (c6da4a4d3)`                        | Binary chính thức và checksum                            |
| Renderer WebGL, DPR và hiệu năng | `NOT_VERIFIED`                             | Chưa đo; tên GPU từ Windows không đủ chứng minh renderer |

Baseline CI cũ được đọc lại tại run [39968559993](https://github.com/sovergarden-dev/home-3d/actions/runs/39968559993): quality và ba job E2E success. Log có 362 unit pass, 39 pipeline pass, Chromium 77 pass, WebKit 77 pass, Firefox 48 pass và 29 skip. Đây là CI Linux tại baseline, không thay kết quả Windows mới. Những số H6/P10/SwiftShader trong bàn giao là evidence lịch sử, chưa phải số đo Codex.

### Quyết định môi trường

Dùng toolchain Bun cục bộ riêng cho Home 3D, không nâng Bun toàn máy để tránh ảnh hưởng dự án khác. Không thay Defender, quyền truy cập, nguồn điện hay Windows Update. Tên GPU/driver/trình duyệt được phép vào evidence; đường dẫn tuyệt đối, tên máy/user và profile trình duyệt không vào artifact public. Dùng profile trình duyệt kiểm thử riêng và chỉ fixture tổng hợp.

### PR và cổng

PR #8 draft: `docs: Codex takeover`, published head đầu `66514aec92a0d432094f916a562d16db4830a5a4`, CI PR run `40687608932` đã 4/4 success. Chưa merge. Sửa chữa sau self-review và evidence mới chưa nằm trong head đó; phải có CI mới đúng head cuối.

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

## 29/10/2026 — M2 chuẩn bị, chưa mở PR

`PARTIAL`: worktree riêng từ main M0, chưa merge thay M1. Typecheck đã PASS sau sửa build identity, lint helpers, context recovery và sheet. Coverage provider 4.1.11 cùng chín version bắc cầu được resolve bằng Bun 1.4.3, giữ guard 24h; frozen install scripts-disabled đạt, chưa chạy coverage/check/E2E. Đã kiểm metadata và tarball đủ integrity của mười package mới: không binary native hoặc preinstall/install/postinstall. `parser.exe` trong nested node_modules là shim Windows do Bun tạo cho Babel parser JS có sẵn, không có trong npm tarball magicast. Chi tiết/giấy phép trong ATTRIBUTION và `dependency-review.json`.

Còn phải làm: đo baseline coverage rồi ratchet, xác minh bundle manifest/budget, lint 0, check/E2E recovery/sheet, P8/P9 GPU/landscape/context warnings, quét riêng tư và review/PR/CI. Không coi typecheck là hoàn tất các cổng. Tám JSON M0 CRLF sẽ renormalize trong commit riêng giữ nguyên giá trị.

### M2 preparation and M1 gate update

M2 preliminary Windows validation: 365 semantic tests with V8 coverage, then the unchanged 600-frame/4 ms CPU test without instrumentation (1 pass); typecheck and lint pass with zero warnings. Preliminary shell is 221,427 gzip bytes. Final integrated-head checks remain NOT_VERIFIED. PR #9 final-head CI `40781481203` failed only the absolute WebKit H6 budget (87,777 ms; same-runner baseline 88,233 ms); it remains draft, not merged.
