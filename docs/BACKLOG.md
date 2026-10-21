# Backlog — H6 hiện hành và lịch sử Demo 1

## H6 hiện hành

Scope W0–W7/T01–T20 nằm trong Notion “H6 — Cue làm trọn gói, nghiệm thu một lần”. Những việc session/UI/inspector/editor/export/lifecycle/privacy trong scope phải khép bằng fixture; không chuyển chúng sang “thiếu dữ liệu”. Cue tự kiểm và chỉ nộp một receipt cuối cho Notion AI, không chờ Syringa kiểm từng bước. Không merge/auto-merge/Publish/deploy.

### Dữ liệu bổ sung sau (một danh sách)

- Ranh lô và số đo từ nguồn khảo sát/bản vẽ hợp lệ; tâm hiện có chỉ chấp nhận tạm, không tự thay intake.
- Chiều cao/tầng/mái, hướng mặt tiền và nhận diện thực địa cần nguồn; không điền prior hoặc trace Google.
- Mô hình nhà mới do kiến trúc sư/khảo sát cung cấp ở lượt riêng. Không dựng lại nhà cũ hoặc công trường.

### Ngoài đợt hoàn thiện này

GPU vật lý/iPhone/Android và SHA của Preview đang phục vụ nếu chưa có quyền/chứng cứ; cloud/R2/Access/deploy; nguồn Overture mới; GIS/editor tổng quát; frontage operation mới; walking/collision; tour/kỷ niệm bền vững; PWA/LOD/thời tiết thật. Không nâng dependency toàn repo chỉ để dọn cảnh báo bảo trì không liên quan.

## Lịch sử sau Demo 1 (không phải trạng thái H6 hiện nay)

Demo 1 chỉ là bản chơi thử hư cấu. Không coi checklist các pha chính đã xong.

## Ưu tiên ghi nhận thời Demo 1

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

## P8 — Lượt hiện hành

- [ ] Đối chiếu receipt cuối P8: lịch/thiên văn, lớp không khí, lễ Việt, adapter consent, perf/lifecycle/privacy và cổng CI đúng head.
- [ ] BLOCKED_MISSING_GEOREFERENCE: activation thời tiết khu thật cần georeference đã kiểm chứng, xử lý riêng; REAL_WORLD_NOT_VERIFIED giữ nguyên.
- [ ] NOT_VERIFIED: GPU vật lý, native Safari/iOS/Android và nghiệm thu thực địa. Không chuyển việc benchmark trung gian cho Syringa.
- H6/P7 accepted giữ nguyên; P9 (xe/người/âm thanh mới), GIS/intake, nhà mới, cloud/deploy ngoài scope P8.
