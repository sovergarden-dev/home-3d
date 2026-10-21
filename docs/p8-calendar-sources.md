# P8 — Lịch Việt và thiên văn offline

## Lịch Việt UTC+7

`src/atmosphere/calendar.ts` chuyển đổi bằng kỳ sóc, kinh độ Mặt Trời, tháng 11 và tháng nhuận theo thuật toán Hồ Ngọc Đức, tham chiếu Jean Meeus. Bản chuyển TypeScript dựa trên [amlich-aa98.js](https://github.com/vanng822/amlich/blob/master/lib/amlich-aa98.js); header gốc ghi © Hồ Ngọc Đức và cho phép dùng/copy/sửa cho **mục đích phi thương mại**, với thông báo bản quyền được giữ. Không gọi đây là MIT hoặc “không có license” chỉ vì không thêm package. Dự án cá nhân phi thương mại phù hợp phạm vi này; trước sử dụng thương mại phải thay bằng triển khai có giấy phép phù hợp hoặc có quyền riêng. Không có dependency mới, Bun lock không đổi.

Runtime tính công thức, không dùng bảng override. [Golden độc lập](./P8_CALENDAR_GOLDENS.md) có 22 mốc từ lịch Việt Báo Nghệ An 2025–2035 và đối chứng Việt Nam khác. Các mốc nhạy cảm đúng UTC+7: Tết 2030-02-02; Trung thu 2032-09-19 và 2034-09-26. Không lấy lịch Trung Quốc UTC+8 làm golden Việt Nam. Test kiểm 2025 nhuận tháng 6, 2033 nhuận tháng 11, các biên lễ và khác biệt UTC+7/UTC+8.

Quy ước hiệu ứng: Tết mùng 1–3 tháng Giêng không nhuận; Trung thu 15/8 không nhuận; Giáng sinh 24–25/12; 30/4 và 2/9 đúng ngày dương lịch. Chọn thủ công tắt auto; Thường ngày bỏ trang trí. Không coi đây là lịch nghỉ hành chính.

## Thiên văn và nguồn độc lập

`astronomy.ts` là triển khai nhỏ offline của các xấp xỉ vị trí Mặt Trời/Mặt Trăng, không copy mã SPA. UTC+7 chuyển sang Julian day; ENU +X Đông, +Y Lên, −Z Bắc. Pha trăng dùng chu kỳ sóc trung bình; vị trí Mặt Trăng là xấp xỉ mỹ thuật, **không có chứng nhận sai số góc Mặt Trăng hoặc mục đích quan trắc**.

Nguồn đã đọc:

- [NOAA — chi tiết tính Mặt Trời](https://gml.noaa.gov/grad/solcalc/calcdetails.html): bối cảnh Meeus, khúc xạ −0,833° cho rise/set và giới hạn địa lý/thời tiết. Không gán độ chính xác NOAA cho chính implementation này.
- [Timeanddate — Hà Nội tháng 6/2026](https://www.timeanddate.com/sun/vietnam/hanoi?month=6&year=2026): 21/6 bình minh 05:15, hoàng hôn 18:40, trưa 11:58 độ cao 87,6°. Test đối chiếu sự kiện ±2 phút và hướng Đông/Bắc.
- [NREL/NLR SPA tester](https://midcdmz.nlr.gov/spa/spa_tester.c): ca công khai 2003-10-17 12:30:30 UTC−7, 39.742476°N/−105.1786°E; zenith 50.111622°, azimuth 194.340241°. Test dùng cùng thời điểm ở UTC+7 (`2003-10-18 02:30:30`), góc lệch <0,5° từng thành phần; kết quả này không chứng nhận mọi ngày/vị trí. Chỉ dùng dữ kiện output kiểm thử, không đưa mã SPA có điều khoản riêng vào ứng dụng.

Không có sự kiện ở ngày cực được trả `null`; date sai/NaN/tọa độ vượt miền không trả số giả. Date/clock tests bao phủ leap day, year rollover, timer cleanup, delay/visibility và nhiều timezone máy.

## Tham chiếu không phải xác minh thực địa

Mặc định mô phỏng dùng điểm **synthetic 15°N, 105°E**, được gắn nhãn; không phải tọa độ nhà hoặc địa danh. Với gói riêng thiếu reference, scene dùng art-direction fallback, không mượn điểm synthetic làm vị trí thật. Khi reference P7 khớp SHA gói hiện hành, chỉ tính theo origin đó trong client session; nhãn vẫn “chưa kiểm chứng thực địa”. Không đưa origin vào store SSR, log hay working package.

Preset hoàng hôn dùng `sunEvents` khi có reference; thiếu reference dùng 18:00 minh họa với copy rõ, không gọi đó là giờ lặn thật. Giờ thật đồng bộ cả ngày và phút Việt Nam; 1× là 1 phút mô phỏng mỗi giây, 4× là 4 phút; tab ẩn dừng mô phỏng không catch-up.
