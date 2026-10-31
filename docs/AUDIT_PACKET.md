# Gói audit cuối — Phố Nhà Mình

## Hiện trạng

`PARTIAL` (cập nhật 31/10/2026) — M0 hoàn tất; M1–M5 đã có phần mềm/bằng chứng từng phần trong PR #11, chưa qua đủ cổng; chưa đủ `READY_FOR_FINAL_AUDIT`. Main chưa đóng băng và chưa có tag audit. Notion AI đang tạm tiếp quản theo yêu cầu chủ dự án, không có quyền ghi GitHub: các commit mới chỉ nằm ở nhánh local và git bundle. Trạng thái chi tiết: [CODEX_LOG.md](CODEX_LOG.md). Chỉ đạo: [CODEX_HANDOFF.md](CODEX_HANDOFF.md).

## Mốc và PR

- Baseline được chủ dự án chỉ định và Git xác minh: `de7173261a8a3928685555252c2b479f76a713fe`.
- Tag `baseline/p10-published`: `DONE`, peeled commit đúng baseline; tag object đã kiểm trong [CODEX_LOG.md](CODEX_LOG.md). Nhánh P10 đã xoá sau kiểm SHA/ancestor.
- SHA main đóng băng/tag audit: `NOT_DONE`.
- PR #11 draft tích hợp M1–M5 (`codex/m5-local-height-detail`): head đã push `4e5136f1cfdcd5e69a31af7a7455d5fa2f40c74a`, CI `40836100757` 3/4 — quality, Chromium, Firefox đạt; WebKit 121 ca chức năng đạt nhưng H6 86.957 ms >70.000 ms (baseline cùng runner 87.409 ms). Local đi trước remote: `9b12c1d` (ghi chú tạm dừng), `d4fca77` (bỏ backdrop blur, sửa H6) và commit tài liệu; chưa push, CI đúng head mới NOT_VERIFIED.
- PR #9 parked/draft: runtime `59f6d6881261a542e1f1b52b4d0d2d6e86f4834a`; có CI trung gian 4/4 nhưng head cuối `b6620382f389545850bb025dbd1d4fff7452ec99` không đạt H6. Không được dùng CI trung gian để merge head cuối.
- PR #10 draft tích hợp M1/M2: head đã push `46b1fd87da630bcc8aa509de2e9bd8d449bf099a`, run `40810779896` chỉ quality đạt. Ba browser cùng phát hiện hồi quy Retry 3D; WebKit 115 pass/1 fail, H6 85.858 ms >70.000 ms. Bản sửa mới đang kiểm cục bộ, chưa merge.
- M4 Linux diagnostic `40812073234` ở `80817f34141c8bb68cf832231f52f9ec046b9e22`: dừng lint trước Workerd, không phải kết quả xác minh runtime.
- PR #8 `docs: Codex takeover`: head `aee3b1e2354091d9653afb1413bc2b805094b207`, CI PR `40712548192` 4/4; merge `cf3cb262dfa7b69a881bef63c0d9a89dd32668fb`, CI push `40717187350` 4/4. Self-review cuối không còn finding, privacy scan sạch.

## Bằng chứng

| Nhóm                                                  | Trạng thái                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows check, E2E và production smoke                | M1 check 371 unit/39 pipeline pass; related lifecycle 12/12 ba browser; production đúng ddc3246 PASS. Full Windows run cũ bị dừng khi sửa runtime, 126 kết quả/4 fail P8 giữ nguyên; không gọi full pass |
| GPU thật: renderer/driver/browser/viewport/DPR và raw | M1 runtime 59f6 H_MET_REAL_GPU: active-300 p50 86,90/85,90 ms, đủ 60+60 mỗi nguồn/điều kiện. H6 41,481 s; soak lịch sử 10 phút/11 vòng có reload định kỳ; không thay soak liên tục M3. Diagnostic 0↔1 NOT_MET ghi riêng                                    |
| Linux local (Notion AI, 31/10, không GPU)            | `bun run check` đạt ở `9b12c1d` và `d4fca77` (400 unit + 1 CPU, 50 pipeline, bundle 224.367 gzip ở `d4fca77`); Workerd native Linux 4 nhóm PASS; pipeline dry-run hợp lệ; E2E WebKit đầy đủ ở `d4fca77` 120 pass, 1 fail là H6 20 vòng timeout 90 s do máy chậm (15 chu kỳ trong 90 s; `9b12c1d` cũng timeout). Không thay CI |
| H6 WebKit CI (<70.000 ms, ≤+10% baseline cùng runner) | NOT_MET ở `4e5136f` (86.957 ms). Ứng viên `d4fca77`: chẩn đoán Linux không GPU −33,4% vòng 3 chu kỳ, ABBA mã thật; CI đúng head NOT_VERIFIED. [Bằng chứng](assets/qa/codex/m2/h6-webkit-linux-2026-10-31/README.md) |
| Bằng chứng Codex đóng gói 30/10                       | Soak 30 phút (heap cuối −3,15%, peak +22,16% NOT_MET), 4G (đạt 2/8/2 s local), K1 Chrome active-300 (103,20/101,00 ms NOT_MET), H6 hardware 64.975 ms; chép nguyên văn, hash khớp provenance: [handoff-2026-10-30](assets/qa/codex/m3/handoff-2026-10-30/README.md) |
| SwiftShader đối chứng                                 | H_BLOCKED ở source0265a53: static/smaller đủ mẫu, active/full viewport còn censored. Không dùng surviving median để khẳng định đạt; final empty-layer chưa chạy lại software toàn bộ                     |
| Gitleaks và quét diff của các PR mới                  | Baseline scan sạch sau ngoại lệ fixture exact; 31/10 Linux: gitleaks 8.30.1 (checksum khớp) sạch trên toàn lịch sử local và `4e5136f..HEAD`; tệp evidence mới không EXIF, không đường dẫn máy. Diff cuối PR #11 vẫn phải quét lại trên CI                                                                                                                                        |
| Host mạng, SSR/storage và dữ liệu riêng               | Cần kiểm lại trên thay đổi cuối; chỉ fixture tổng hợp                                                                                                                                                    |
| PWA/a11y/Lighthouse/font local                        | PARTIAL: font local, PWA 3 production tests và axe ban đầu 3 viewport đạt; phép đo cuối còn chờ                                                                                                                                                                                                 |
| Bản riêng tư sẵn sàng deploy/runbook                  | PARTIAL: dry-run/auth-only native đạt; full native và review còn chờ                                                                                                                                                                                                 |
| Ảnh tổng hợp và ma trận ghim/bưu thiếp                | K3 54 bbox assertions; K2 36 pixel/6 hit-overlap cases ở ba browser, touch/H6 picking; gallery12góc và4K/2K đã xem; R1 brightness4,38%, maxchannel7,50% <15%                                             |

## Câu hỏi cho Syringa — mặc định cho phép tiếp tục độc lập

| Câu hỏi                                      | Mặc định đang dùng                                 | Có chặn công việc phần mềm không? |
| -------------------------------------------- | -------------------------------------------------- | --------------------------------- |
| Dùng gói khu thật cho smoke hoặc M5?         | Không tìm/mở; chỉ fixture tổng hợp                 | Không                             |
| Kiểm Android USB, iPhone hoặc native Safari? | NOT_VERIFIED cho tới khi có thiết bị được chỉ định | Không                             |
| Chọn giấy phép mã nguồn?                     | Không thêm LICENSE; không tự cấp quyền             | Không                             |
| Ruleset main?                                | Chủ dự án tự quyết; Codex không đổi settings       | Không                             |
| H6 head mới vẫn ≥70 s trên runner chậm?      | Giữ cổng tuyệt đối, ghi NOT_MET; không nới. Phương án để chủ dự án quyết: cổng so baseline cùng runner (+10%) | Có — chặn merge PR #11 |
| Analytics bản riêng tư?                      | Tắt                                                | Không                             |
| Defender exclusion?                          | Không thay đổi                                     | Không                             |

Lovable có cảnh báo lịch sử build/preview và chưa cung cấp build SHA đã xác minh. Để chủ dự án/audit cuối kiểm UI; Codex không sửa hoặc dùng chat Lovable. G1 được bàn giao ghi GEOREFERENCE_BOUND_PROVEN cho cặp tệp riêng; Codex chưa mở cặp đó. REAL_WORLD_NOT_VERIFIED giữ nguyên.

## Giới hạn và thao tác của chủ dự án sau audit

Chưa Publish Lovable, chưa đăng nhập/deploy Cloudflare hoặc Google. Runbook Publish/deploy/rollback và danh sách ngân sách đạt/NOT_MET sẽ được hoàn tất theo evidence thực. Không lấy CI xanh hoặc các placeholder trong gói này làm xác nhận đã hoàn tất.
