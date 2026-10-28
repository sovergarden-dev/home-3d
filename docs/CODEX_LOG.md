# Nhật ký Codex — Phố Nhà Mình

## Hiện trạng

- Cập nhật: 28/10/2026 (UTC+7). Nguồn chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md).
- M0 `PARTIAL`: Bun 1.4.3 frozen install và ba trình duyệt Playwright đã cài thành công; công cụ riêng ngoài checkout. Gate Windows đang chạy lại tuần tự sau baseline đỏ; GPU thật chưa đo.
- Baseline Git đã xác minh: `de7173261a8a3928685555252c2b479f76a713fe`. Tag annotated `baseline/p10-published` đã push và kiểm peeled SHA; nhánh P10 đã xoá đúng điều kiện. Nhánh công việc: `codex/m0-takeover`; PR chưa mở, chưa merge.
- M1–M5 `NOT_DONE`. Không có dữ liệu khu thật được mở. Không Publish/deploy hoặc thay cài đặt dịch vụ.
- Việc kế tiếp: khép môi trường, ghi kết quả check/E2E/production smoke và GPU thật; neo tag; self-review, quét riêng tư, mở PR và qua cổng CI.

## 28/10/2026 — M0 đang thực hiện

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
| Renderer WebGL, DPR và hiệu năng | `NOT_VERIFIED` | Chưa đo; tên GPU từ Windows không đủ chứng minh renderer |

Baseline CI cũ được đọc lại tại run [39968559993](https://github.com/sovergarden-dev/home-3d/actions/runs/39968559993): quality và ba job E2E success. Log có 362 unit pass, 39 pipeline pass, Chromium 77 pass, WebKit 77 pass, Firefox 48 pass và 29 skip. Đây là CI Linux tại baseline, không thay kết quả Windows mới. Những số H6/P10/SwiftShader trong bàn giao là evidence lịch sử, chưa phải số đo Codex.

### Quyết định môi trường

Dùng toolchain Bun cục bộ riêng cho Home 3D, không nâng Bun toàn máy để tránh ảnh hưởng dự án khác. Không thay Defender, quyền truy cập, nguồn điện hay Windows Update. Tên GPU/driver/trình duyệt được phép vào evidence; đường dẫn tuyệt đối, tên máy/user và profile trình duyệt không vào artifact public. Dùng profile trình duyệt kiểm thử riêng và chỉ fixture tổng hợp.

### PR và cổng

PR/head/merge SHA/run ID sẽ được ghi bằng giá trị thực sau khi phát sinh. Chưa đủ điều kiện merge; chưa có tuyên bố DONE.

### Những lượt chưa đạt — giữ lại, không trộn vào kết quả xanh

- Lượt check đầu quét nhầm sáu lỗi format trong JavaScript của Chromium tải về nằm dưới checkout. Đã chuyển công cụ ra ngoài, không tắt lint hay thêm ignore vào cấu hình dự án.
- Baseline check kế tiếp: typecheck đạt, lint 0 lỗi/7 cảnh báo, 361 unit pass/1 fail. Test P9 200 tác nhân cho p50 0,284 ms, p95 5,6094 ms, vượt trần 4 ms. Lúc này có khởi động Vite cho E2E song song; chưa kết luận nguyên nhân. Lượt chỉ riêng file P9 sau đó đạt 6/6. Gate toàn bộ đang chạy lại khi không có tác vụ kiểm khác cạnh tranh CPU.
- E2E lần đầu chưa chạy được case nào: dev server không sẵn sàng trong 60 giây. Sau đó khởi động riêng, Vite báo ready trong 5.784 ms. Giữ timeout/test/guard, chưa gọi E2E PASS.
- Gitleaks 8.30.1 tải chính thức/checksum khớp. Sáu kết quả ban đầu đều được đối chiếu đúng commit/dòng: ID fixture công khai, không phải credential. Sau allowlist exact theo DECISIONS, quét 81 commit không có leak. Raw redacted giữ cục bộ; summary public không chứa đường dẫn máy.
- Control âm cho allowlist: cùng ID fixture qua stdin (không khớp hai path) vẫn bị bắt, exit 1. Ngoại lệ không tắt rule hoặc áp cho toàn bộ repo.
- Lượt check toàn bộ tiếp theo gặp nhiều timeout và worker termination timeout; CPU hệ thống đo được 100%, RAM còn khoảng 5,7 GiB. Không đóng ứng dụng khác. Vitest hiện cài có `VITEST_MAX_WORKERS`; đang thực hiện lượt full gate cuối với một worker, không đổi test, timeout hoặc ngưỡng. Các lượt đỏ/không hoàn thành giữ nhãn riêng, không cộng vào pass.

### Neo Git đã hoàn tất

Tag object `b5b9b602bbabc58f0820cf4ce464981946a2605d` đã push; peeled commit đúng `de7173261a8a3928685555252c2b479f76a713fe`. Trước xoá remote P10 đã kiểm SHA đúng `a5d9011d404f531f2ebe28efb18d40f2ab0040b9` và ancestor của origin/main; remote sau xoá chỉ còn main. SHA này có thể dùng tạo lại nhánh nếu chủ dự án cần, không cần viết lại lịch sử. Tag không kích hoạt workflow mới theo cấu hình hiện hành; CI baseline push main vẫn 4/4 success tại run 39968559993.
