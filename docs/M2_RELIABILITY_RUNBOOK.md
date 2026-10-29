# M2 — độ tin cậy và cổng chất lượng

`PARTIAL — PR/CI cuối chưa chốt`. Source runtime chính: `6cce9597edfb7ae93790a4a4c4abc0d4b8c415fb`; phép đo P8/P9 desktop tại `487156d0a8a266161f8c00ad1096d5efed081429`, trước sửa riêng giao diện mobile từ review. M1 được tích hợp bằng merge thường; PR #9 giữ draft vì cổng WebKit head cuối chưa đạt. Không Publish/deploy, không dữ liệu khu thật.

## Thay đổi

- Version lấy từ package.json; SHA ưu tiên biến build full SHA hợp lệ, rồi Git checkout, thiếu thì ghi rõ không xác định. Không gọi GitHub từ browser.
- LF được khai báo; tám JSON M0 chỉ đổi CRLF sang LF, parsed JSON và byte sau thay newline đã đối chiếu trong commit riêng.
- Actions pin full SHA, job timeout 25 phút, contents:read; gitleaks quét lịch sử trong quality. Shell manifest phải tách engine lazy và ≤250.000 byte gzip.
- Coverage V8 cho geo/state/simulation/atmosphere có ratchet thực đo. Mục tiêu 85% chưa đạt ở mọi chỉ số state/simulation. Ca CPU 600 frame / p95 ≤4 ms giữ nguyên, chạy ngoài instrumentation sau toàn bộ ca semantic; không bỏ assertion để lấy coverage xanh.
- Lint 0 lỗi/0 cảnh báo. Tách helper UI và math thuần để vỏ không kéo Three.js qua import tĩnh.
- WebGL mất context: thử tạo lại scene tự động một lần, rồi fallback minh họa hư cấu và nút thử thủ công. Package/session giữ nguyên. Bản fallback không dựng silhouette từ geometry riêng.
- PCM tổng hợp được chuẩn bị theo lát nhỏ trước tương tác; AudioContext vẫn chỉ tạo từ gesture. Native statechange cập nhật frame/diagnostics; cache chỉ dữ liệu âm thanh thủ tục công khai, dừng timer khi không còn scene sở hữu.
- Tác nhân Diorama 1,6×, người đi bộ 2× để dễ thấy; POV/simulation/collision không đổi. Landscape tách HUD/POV/panel/ruler; pointercancel/lost capture trả sheet về đúng snap, giữ keyboard và focus.

## Đã chạy bởi Codex

| Phép kiểm | Kết quả |
| --- | --- |
| Full Windows check ở 6cce959 | 377 unit có coverage + 1 CPU guard đạt; 39 pipeline; typecheck/build; lint 0 |
| Shell ở cùng build | 222.305 byte gzip, giới hạn 250.000 |
| Chromium/Firefox liên quan | 22/22 đạt, gồm mất context thật qua extension, clip local/gesture và OfflineAudioContext mix |
| Layout sau review ở ba browser | 9/9 đạt; bổ sung 6/6 xác nhận native lost capture phục hồi trước mouseup |
| Windows WebKit audio | NOT_VERIFIED_UNSUPPORTED: cả AudioContext, OfflineAudioContext và tên prefixed đều undefined; assertion cũ giữ nguyên và thất bại được lưu |
| H6 20 vòng GPU thật | Baseline 43.434 ms; ứng viên 41.839 ms; −3,67%, trong trần +10% |
| P8 sau sửa | 420/420 thao tác <100 ms, max 78,4 ms; 0 shader link mới |
| P8 xoay liên tục | 720 bước, 717 khoảng render; max 44,5 ms, đủ bước; đây là submit cadence, không GPU execution/display scanout |
| P9 sau sửa | Mỗi loại 30 mẫu đầy đủ; cold p50/p95/max 77,10/92,10/124,20 ms; warm 61,55/76,80/108 ms |
| P9 ngưỡng mọi mẫu <100 ms | NOT_MET; giữ toàn bộ outlier, không đo mẫu âm thanh nghe được đầu tiên |

GPU: Intel(R) UHD Graphics, driver 32.0.101.7082, Chrome 152.0.7977.76 headed, ANGLE Direct3D11, DPR1. Cold P9 là AudioContext mới trên page/context mới trong cùng browser process; không đại diện 30 lần khởi động browser/device audio service mới. Raw và hash ở [evidence M2](assets/qa/codex/m2/README.md).

Sparse drag cũ có khoảng chờ vận chuyển lệnh driver; nhãn NOT_MET và raw gốc vẫn giữ. Phép continuous riêng điều khiển pointer theo RAF và không lọc mẫu chậm. Reviewer độc lập xác nhận cách phân biệt này trung thực; không suy FPS chung hoặc khả năng chạy khu thật từ các số trên.

## Review và giới hạn

Review riêng tìm hai P2: panel che thước Mặt bằng, và test chưa bắt việc hủy kéo mất height khi snap không đổi. Cả hai đã sửa; reviewer follow-up đóng P2. P3 sau đó yêu cầu kiểm lost capture trước mouseup để không bị onPointerUp che lỗi; assertion đã tăng cường và 6 ca browser đạt. Reviewer cuối đã xác nhận không còn actionable finding ở ff550657; CI đúng head receipt vẫn cần chốt.

M1 WebKit <70 s và ≤+10% baseline trên cùng runner vẫn nguyên cổng, timeout 90 s không đổi. Hardware H6 không thay CI. Playwright Test dùng contextOptions no-preference để giữ điều kiện H6 thực tế cũ; reduced-motion được bật/assert riêng trong ca cần kiểm.

Không có `LICENSE` mới: chủ dự án chọn. Advisory chưa được xác nhận không là lý do nâng hàng loạt dependency. Thiết bị điện thoại, native Safari, audio phát ra loa, app Lovable sau sync/Publish và dữ liệu khu thật không được chứng nhận từ các kiểm này.
