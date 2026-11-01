# H6 WebKit — chẩn đoán Linux, 31/10/2026

Chỉ fixture tổng hợp; chỉ là chẩn đoán, không phải kết quả CI hay ngân sách đạt. Máy: Linux 2 vCPU Xeon 2,5 GHz, 4 GiB RAM, không GPU; Playwright WebKit 26.0, Desktop Safari 1280×720 DPR 2, no-preference. Mỗi nhánh dùng server Vite riêng đúng SHA.

- `summary.json`: bối cảnh CI `40836100757`, thử tắt từng yếu tố bằng CSS inject trước sửa, ABBA mã thật `9b12c1d`↔`d4fca77` (6+6 lượt sau warm-up, −33,4% trung bình), tiến độ spec H6 nguyên vẹn trong 90 s (10→14 chu kỳ, cả hai đều timeout trên máy này), các yếu tố còn lại sau sửa và phép chiếu CI có nhãn NOT_VERIFIED. Hash script chẩn đoán nằm trong tệp (`rafAfterClick` `91fe80ab…`, ABBA `7f8a3d24…`), nhưng hai script không có trong repo và không có trong workspace máy Windows (đã tìm ngày 01/11/2026); nếu còn thì chỉ trong gói ZIP bàn giao. Nhãn: `NOT_REPRODUCIBLE_FROM_REPO`.
- `glass-before-after.jpg`: màn hình đầu, trước/sau bỏ blur. Đã xem: khác biệt nhỏ, chữ trên panel vẫn đọc rõ.
- `d4fca77` là commit sửa đã đo (tên cũ `84ac97a` trong gói ZIP 31/10; chỉ bỏ một trailer khỏi message trước lần push đầu). Cây mã `20d5e06` giữ nguyên nên số đo không đổi.

Cổng CI giữ nguyên: H6 WebKit <70.000 ms và không quá +10% baseline cùng runner. Kết quả đúng head mới phải lấy từ CI. Đã có và thay phép chiếu NOT_VERIFIED ở trên: CI `41187853749` tại `ec7d6fd` đo 60.422 ms (baseline cùng runner 88.001 ms); CI `41209405262` tại `a4f0121` đo 52.623 ms (baseline `de71732` cùng runner 69.984 ms, −24,81%).
