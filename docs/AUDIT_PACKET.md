# Gói audit cuối — Phố Nhà Mình

## Hiện trạng

`PARTIAL` — đang M0, chưa đủ `READY_FOR_FINAL_AUDIT`. Main chưa đóng băng và chưa có tag audit. Trạng thái chi tiết: [CODEX_LOG.md](CODEX_LOG.md). Chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md).

## Mốc và PR

- Baseline được chủ dự án chỉ định và Git xác minh: `de7173261a8a3928685555252c2b479f76a713fe`.
- Tag `baseline/p10-published`: `DONE`, peeled commit đúng baseline; tag object đã kiểm trong [CODEX_LOG.md](CODEX_LOG.md). Nhánh P10 đã xoá sau kiểm SHA/ancestor.
- SHA main đóng băng/tag audit: `NOT_DONE`.
- Bảng PR/head/merge SHA/CI: chưa có PR Codex; bổ sung sau mỗi PR.

## Bằng chứng

| Nhóm | Trạng thái |
| --- | --- |
| Windows check, E2E và production smoke | NOT_VERIFIED |
| GPU thật: renderer/driver/browser/viewport/DPR và raw | NOT_VERIFIED |
| SwiftShader đối chứng | Evidence P10 cũ trong repo; chưa có số đo Codex |
| Gitleaks và quét diff của các PR mới | NOT_VERIFIED |
| Host mạng, SSR/storage và dữ liệu riêng | Cần kiểm lại trên thay đổi cuối; chỉ fixture tổng hợp |
| PWA/a11y/Lighthouse/font local | NOT_DONE |
| Bản riêng tư sẵn sàng deploy/runbook | NOT_DONE |
| Ảnh tổng hợp và ma trận ghim/bưu thiếp | NOT_DONE |

## Câu hỏi cho Syringa — mặc định cho phép tiếp tục độc lập

| Câu hỏi | Mặc định đang dùng | Có chặn công việc phần mềm không? |
| --- | --- | --- |
| Dùng gói khu thật cho smoke hoặc M5? | Không tìm/mở; chỉ fixture tổng hợp | Không |
| Kiểm Android USB, iPhone hoặc native Safari? | NOT_VERIFIED cho tới khi có thiết bị được chỉ định | Không |
| Chọn giấy phép mã nguồn? | Không thêm LICENSE; không tự cấp quyền | Không |
| Ruleset main? | Chủ dự án tự quyết; Codex không đổi settings | Không |
| Analytics bản riêng tư? | Tắt | Không |
| Defender exclusion? | Không thay đổi | Không |

Lovable có cảnh báo lịch sử build/preview và chưa cung cấp build SHA đã xác minh. Để chủ dự án/audit cuối kiểm UI; Codex không sửa hoặc dùng chat Lovable. G1 được bàn giao ghi GEOREFERENCE_BOUND_PROVEN cho cặp tệp riêng; Codex chưa mở cặp đó. REAL_WORLD_NOT_VERIFIED giữ nguyên.

## Giới hạn và thao tác của chủ dự án sau audit

Chưa Publish Lovable, chưa đăng nhập/deploy Cloudflare hoặc Google. Runbook Publish/deploy/rollback và danh sách ngân sách đạt/NOT_MET sẽ được hoàn tất theo evidence thực. Không lấy CI xanh hoặc các placeholder trong gói này làm xác nhận đã hoàn tất.
