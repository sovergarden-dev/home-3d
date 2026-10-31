# H6 WebKit — chẩn đoán Linux, 31/10/2026

Chỉ fixture tổng hợp; chỉ là chẩn đoán, không phải kết quả CI hay ngân sách đạt. Máy: Linux 2 vCPU Xeon 2,5 GHz, 4 GiB RAM, không GPU; Playwright WebKit 26.0, Desktop Safari 1280×720 DPR 2, no-preference. Mỗi nhánh dùng server Vite riêng đúng SHA.

- `summary.json`: bối cảnh CI `40836100757`, thử tắt từng yếu tố bằng CSS inject trước sửa, ABBA mã thật `9b12c1d`↔`d4fca77` (6+6 lượt sau warm-up, −33,4% trung bình), tiến độ spec H6 nguyên vẹn trong 90 s (10→14 chu kỳ, cả hai đều timeout trên máy này), các yếu tố còn lại sau sửa và phép chiếu CI có nhãn NOT_VERIFIED. Hash script chẩn đoán nằm trong tệp; script được giữ ngoài repo trong gói bàn giao.
- `glass-before-after.jpg`: màn hình đầu, trước/sau bỏ blur. Đã xem: khác biệt nhỏ, chữ trên panel vẫn đọc rõ.
- `d4fca77` là commit sửa đã đo (tên cũ `84ac97a` trong gói ZIP 31/10; chỉ bỏ một trailer khỏi message trước lần push đầu). Cây mã `20d5e06` giữ nguyên nên số đo không đổi.

Cổng CI giữ nguyên: H6 WebKit <70.000 ms và không quá +10% baseline cùng runner. Kết quả đúng head mới phải lấy từ CI.
