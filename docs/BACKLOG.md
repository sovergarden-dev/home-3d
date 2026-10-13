# Sau Demo 1

Demo 1 chỉ là bản chơi thử hư cấu. Không coi checklist các pha chính đã xong.

## Ưu tiên kế tiếp

- Kiểm CI Chromium/Firefox/WebKit trên SHA PR và thiết bị thật (iPhone Safari, Android), đo FPS/GPU thật. Headless software WebGL không chứng minh ngân sách FPS.
- Khóa bundle budget tự động, coverage mục tiêu, gitleaks toàn lịch sử; CI dùng action pin SHA nếu cần hardening.
- Khung runtime private + Cloudflare Access xác thực JWT, R2 riêng; chỉ trước khi thêm dữ liệu thật. Người dùng tự giữ secrets và deploy.
- Pipeline OSM/Overture/Open Buildings + khảo sát ảnh tự chụp, ranh lô từ bản vẽ. Không dùng Google Maps/Street View để dựng model. Chưa fetch hoặc khảo sát địa điểm thật.
- Hệ tọa độ WGS84/ECEF/ENU và nắng thật; camera pan chọn điểm, walking có va chạm. Demo hiện chỉ có orbit quanh lô.
- Lễ hội đẹp hơn, mái nhà và đạo cụ phong phú, xe/người hành vi thay vì chạy vòng đơn giản; bản thu âm thật.
- Kỷ niệm lâu dài/editor, xử lý ảnh EXIF và quyền riêng tư; postcard có nhãn và ngày. Demo hiện chỉ lưu PNG thô trong phiên.
- Model nhà mới theo file kiến trúc sư. Giữ lô trống tới lúc đó.
- PWA/offline asset, LOD streaming, tier GPU thích ứng, soak test và context restore tự động.

## Đã xử lý trong Demo 1

- Nút map ẩn ngay trong quá trình kéo sheet và phục hồi sau pointercancel.
- Lint sạch lỗi (giữ 6 cảnh báo Fast Refresh có sẵn).
- Nhãn demo rõ, tắt dữ liệu thật, noindex/robots, giờ Việt Nam, progress tải thật và capture thật.
