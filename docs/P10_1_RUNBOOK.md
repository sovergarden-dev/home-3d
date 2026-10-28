# P10.1 — Kỷ niệm, ghim và bưu thiếp

`PARTIAL` — đang chuẩn bị riêng khi baseline M0 chạy; chưa mở PR, chưa kiểm hoặc merge. Phạm vi hiện hành từ CODEX_HANDOFF (M1); nhánh này phải nhận main bằng merge sau khi M0 hoàn tất.

## K3 — Chú thích bưu thiếp

- Giữ nguyên câu tiêu đề cố định, kích thước xuất/hạ bậc, vùng cảnh, quét metadata, Hủy và chia sẻ.
- Dùng TextMetrics của canvas thật để đặt hai hộp chữ. Gap bằng 0,6 lần line-height nhỏ hơn; line-height là 1,2 lần cỡ chữ, không dựa vào việc có hay không tên phường. Chiều cao mực chữ đo được chỉ dùng để đặt baseline và tránh chồng lấn.
- Căn chữ theo lề ảnh; co cỡ chữ theo chiều rộng thực khi cần, không dùng `fillText(maxWidth)` làm lệch bounding box. Hình học frame/ROI được dùng chung cho capture, compose và caption để giữ vùng cảnh R1.
- Cần kiểm: canvas thật tại 3840×2160, 2048×1152, 1920×1080; VI/EN; tên phường rỗng, 40 ký tự và có dấu; ảnh 4K/2K; R1 chênh màu dưới 15%; regression P10. Chưa gọi DONE từ code hoặc mock.

## K1 và K2

Chưa thay đổi. Dùng baseline M0 GPU thật và các phép đo đầy đủ theo bàn giao trước khi chốt tối ưu K1. Ghim vẫn cần kiểm kích thước, hit target, overlap và picking H6.
