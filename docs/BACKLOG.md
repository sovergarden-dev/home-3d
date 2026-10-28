# Backlog — Codex tiếp quản

## Hiện hành từ 28/10/2026

Nguồn phạm vi: [CODEX_HANDOFF.md](CODEX_HANDOFF.md); trạng thái có bằng chứng: [CODEX_LOG.md](CODEX_LOG.md). Các mục dưới là việc phải làm, chưa được gọi DONE.

| Mốc | Phạm vi | Trạng thái |
| --- | --- | --- |
| M0 | Môi trường Windows, baseline local/GPU thật, tag, PR tiếp quản | PARTIAL |
| M1 | P10.1: độ trễ 300 ghim, kích thước/picking ghim, chữ bưu thiếp | NOT_DONE |
| M2 | Phiên bản/build SHA, repo/CI, hồi quy P1.1/P8/P9 và phục hồi WebGL | NOT_DONE |
| M3 | Bench/PWA/font local/a11y/i18n/Lighthouse và ma trận Windows | NOT_DONE |
| M4 | Bản riêng tư và runbook sẵn sàng deploy, không deploy | NOT_DONE |
| M5 | Adapter chiều cao và chi tiết procedural tổng hợp | NOT_DONE |

K1/H vẫn BLOCKED theo evidence P10 cũ; phải đo mới trên GPU thật. G1 được chủ dự án báo GEOREFERENCE_BOUND_PROVEN cho cặp tệp riêng; chưa mở cặp tệp đó trong lượt Codex. REAL_WORLD_NOT_VERIFIED tiếp tục giữ nguyên.

## Cần chủ dự án hoặc để sau

Dữ liệu khu thật, khảo sát/ranh lô, model kiến trúc sư (P6), bản quét nhà hoàn thiện (P11), bản thu phố, thiết bị di động/Safari thật, LICENSE, Publish, cloud/deploy và các ý tưởng ngoài M0–M5. Mặc định và câu hỏi ở [AUDIT_PACKET.md](AUDIT_PACKET.md).

## Lịch sử trước bàn giao — không phải danh sách việc đang mở

Các chỉ đạo phân vai và cổng dưới đây đã được bàn giao thay thế. Giữ nội dung cũ để tra cứu; checkbox chưa sửa không tự mở lại một pha.

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

## P9 — Phạm vi đang nộp review

Lớp sống có seed, giao thông/người/hàng rong/động vật, WebAudio tổng hợp + khe clip local, POV Đi bộ/xe ôm, kiểm chứng hiệu năng/lifecycle thuộc PRP9 hiện hành. Xem `docs/P9_RUNBOOK.md` và receipt scope; không suy trạng thái technical-review-passed từ code/docs.

Review vòng 1 là `CHANGES_REQUESTED`: batch P9-R1…R4 giữ cùng PR #6, đo pha matched và năm lượt H6 WebKit nguyên bài, context ledger, split first-sound, đính chính BVH project-owned. Receipt mới là nơi ghi kết quả; cảnh báo context tồn tại ở P8, giới hạn SwiftShader và heap estimate không được tự đánh dấu đã khép. Chỉ một dispatch mới sau đủ local gate; nếu đỏ thì dừng và nộp trace/bảng pha.

Ngoài P9 tiếp tục đóng: bản thu riêng chưa có; georeference/khu thật `BLOCKED_MISSING_GEOREFERENCE` / `REAL_WORLD_NOT_VERIFIED`; kiểm GPU vật lý/nativeSafari/iOS/Android NOT_VERIFIED. Không reintake, sửa nguồn H6, mở P10–P13, cloud/R2/Access, Publish/deploy hay Lovable sync/settings.

## P10 — giới hạn và việc ngoài lượt

P10 mở riêng từ main P9; G1 vẫn `BLOCKED_MISSING_GEOREFERENCE`, khu thật vẫn `REAL_WORLD_NOT_VERIFIED`. Runbook `docs/P10_RUNBOOK.md`; kết quả thực chạy nằm ở receipt cuối P10. Code không tự đồng nghĩa technical-review-passed.

NOT_DONE có chủ ý: ML mặt/biển số, sharp/blurhash, upload/R2/cloud/đăng mạng, micro, khảo sát/địa chỉ thật và nhà/công trường trên lô. Không chuyển test phần mềm trong scope sang owner. GPU vật lý, native Safari và điện thoại thật là NOT_VERIFIED khi thiếu thiết bị; SwiftShader chỉ chứng minh software WebGL2. P11–P13 chưa mở. Các mục P8/P9 ở trên là lịch sử, không đóng P10 vừa được chỉ đạo.

P12 (chưa mở): cân nhắc self-host Be Vietnam Pro/Lora để loại request Google Fonts; P10 giữ nguyên ba links của main và chỉ abort hai host fonts trong network harness.
