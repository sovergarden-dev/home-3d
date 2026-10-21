# P8 — Open-Meteo: nguồn, điều khoản và privacy

Đã đọc trực tiếp [Forecast API](https://open-meteo.com/en/docs) và [Terms & Privacy](https://open-meteo.com/en/terms) trước chốt tích hợp. API free chỉ dùng phi thương mại; dữ liệu CC BY 4.0, cần attribution Open-Meteo. Free tier tại nguồn nêu <10.000 calls/ngày, 5.000/giờ, 600/phút; không mua dịch vụ hay thêm key/proxy/backend trong P8. Dự án cá nhân phi thương mại nằm trong ví dụ cho phép; không mặc định mở rộng quyền sang ứng dụng thương mại.

Ứng dụng chỉ tạo request khi có consent thời tiết riêng, đúng binding gói synthetic và ngày hiện tại:

`https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m%2Cweather_code&timezone=Asia%2FHo_Chi_Minh`

Fetch dùng credentials omit, no-store, no-referrer, redirect error; không world/ID/tên file/token/payload riêng. Endpoint allowlist cố định, không URL do người dùng nhập. Chỉ hai biến current; không gọi dự báo lịch sử/tương lai dưới nhãn hiện tại. Payload current quá cũ (>90 phút) hoặc vượt tương lai >15 phút bị từ chối, không gắn nhãn live. Parser kiểm timezone UTC+7, Celsius/WMO, ngày/giờ ISO hợp lệ, finite/bounds và mã WMO thật.

Điều khoản provider ghi log máy chủ có thể chứa tọa độ và IP, lưu tối đa 90 ngày. **Không thể hứa provider không log vị trí**; disclosure UI nói rõ vị trí được gửi tới Open-Meteo và có thể được lưu log theo chính sách này. Client không log/lưu origin, URL vị trí hoặc response vào storage, SSR/build hay analytics. Attribution/link Open-Meteo có trong dialog.

Cache chỉ trong phiên, TTL 15 phút. Hết TTL và tải lỗi thì hiển thị stale, không gọi là current; không refresh nền. Tắt/ẩn tab/đổi ngày/gói/reference/reset/dispose xóa consent/cache và abort response cũ; retry mạng tối đa một lần mặc định (hard cap hai retries). Manual simulation được lưu riêng với live weather kind, không bị live response ghi đè.

Gói không-synthetic vẫn bị `REAL_WORLD_NOT_VERIFIED` kể cả có origin/tâm xác nhận; thiếu reference là `BLOCKED_MISSING_GEOREFERENCE`. Chỉ synthetic có reference khớp SHA + tâm xác nhận được exercise đường consent trong test. E2E intercept mọi request weather; trong lượt này không gửi request thật bằng tọa độ nhà hoặc fixture.
