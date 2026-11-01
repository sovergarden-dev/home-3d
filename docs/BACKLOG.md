# Backlog — Codex tiếp quản

## Hiện hành từ 28/10/2026

Nguồn phạm vi: [CODEX_HANDOFF.md](CODEX_HANDOFF.md); trạng thái có bằng chứng: [CODEX_LOG.md](CODEX_LOG.md). Các mục dưới là việc phải làm, chưa được gọi DONE.

| Mốc | Phạm vi                                                            | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | Môi trường Windows, baseline local/GPU thật, tag, PR tiếp quản     | DONE — PR #8, CI main 4/4                                                                                                                                                                                                                                                                                                                                                                            |
| M1  | P10.1: độ trễ 300 ghim, kích thước/picking ghim, chữ bưu thiếp     | PARTIAL — đã vào main qua PR #11 (`beacd9b`); H6 WebKit CI MET (61.710 ms ở head `c624027`); K1 `H_MET_REAL_GPU` trên NVIDIA ở `fba1e09` (`src/` của `c624027` chỉ khác ở splash a11y); lượt Intel UHD `4e5136f` chỉ active-300, NOT_MET, `DIAGNOSTIC_INSUFFICIENT_SAMPLES`; diagnostic 0↔1 còn mở; chưa audit                                                                                       |
| M2  | Phiên bản/build SHA, repo/CI, hồi quy P1.1/P8/P9 và phục hồi WebGL | PARTIAL — đã vào main qua PR #11; trên GPU NVIDIA P8 kéo camera còn khung > 50 ms và P9 còn mẫu > 100 ms                                                                                                                                                                                                                                                                                             |
| M3  | Bench/PWA/font local/a11y/i18n/Lighthouse và ma trận Windows       | PARTIAL — đã vào main qua PR #11; FPS Chrome/Edge và soak < 10% chỉ đạt trên máy NVIDIA (soak Intel đỉnh +22,16% NOT_MET); Firefox bộ nhớ GPU NOT_MET; Lighthouse Performance NOT_MET ở `a948321` (Intel UHD); Lighthouse NVIDIA ở mã PR #13 `07fc66e` (merge `a76daab`): desktop 97 MET, mobile 50 NOT_MET (`2c21b54`: 97/56; main `5e6aec5`: 79/44); 4G warm NOT_VERIFIED; ObjectURL NOT_EXERCISED |
| M4  | Bản riêng tư và runbook sẵn sàng deploy, không deploy              | PARTIAL — đã vào main qua PR #11; Workerd native Windows/Linux đạt; còn rà runbook để chốt READY_TO_DEPLOY_NOT_DEPLOYED                                                                                                                                                                                                                                                                              |
| M5  | Adapter chiều cao và chi tiết procedural tổng hợp                  | PARTIAL — đã vào main qua PR #11; pipeline 50 test trên fixture tổng hợp; dữ liệu khu thật chưa được phép                                                                                                                                                                                                                                                                                            |

Cập nhật 01/11/2026: Notion AI tạm tiếp quản; từ 31/10 làm trên máy Windows GPU thật qua Aki MCP và push bằng GitHub CLI đã đăng nhập sẵn. PR #11 đã merge vào main bằng merge commit `beacd9b48b429db0e22530777e7d335d74369c7d`; M1–M5 vẫn PARTIAL, chưa `READY_FOR_FINAL_AUDIT`.

Việc mở (P3 từ review độc lập và giới hạn đo đã ghi; chưa sửa, không chặn). Node DOM tăng 1 sau mỗi lần SPA navigation trong soak và hai việc `build-pwa` đã sửa ở PR #14 ([DECISIONS](DECISIONS.md), mục sau review delta PR #13).

- Splash chưa chặn bàn phím: splash không giữ focus và nút dock không bị disable lúc khởi động, nên Tab có thể tới dock và canvas phía sau (có từ lần tải đầu; chuột và chạm đã bị splash chặn). Viết e2e bàn phím trước khi sửa.
- Provenance benchmark: ghi cờ cây mã sạch (`git status --porcelain`) cùng SHA harness; đọc version driver từ thông tin GPU của browser thay vì biến `BENCH_GPU_DRIVER` do người chạy gán.
- Đo lại 4G warm với throttle cả target service worker hoặc proxy giới hạn băng thông; tìm công cụ đo bộ nhớ GPU trên Firefox thay counter WDDM bất thường.

Quan sát từ 31/10, chưa sửa: gợi ý "Kéo để xoay · Chụm / cuộn để zoom" bị dock che một phần ở 1280×720 (có từ `9b12c1d`, chỉ trang trí, pointer-events-none; nội dung vẫn có trong nhãn điều khiển cảnh).

K1/H theo máy: Intel UHD cũ `H_MET_REAL_GPU` ở runtime `59f6` (PR #9); NVIDIA GTX 1660 Ti `H_MET_REAL_GPU` ở `fba1e09`; lượt Intel UHD của Codex ở `4e5136f` chỉ đo active-300 (p50 103,20/101,00 ms, NOT_MET, `DIAGNOSTIC_INSUFFICIENT_SAMPLES`; chưa đủ ma trận để gắn nhãn H). SwiftShader đối chứng còn H_BLOCKED. Diagnostic 0↔1: NOT_MET trên Intel UHD `59f6` (103,55/101,85 ms); NVIDIA `fba1e09` < 100 ms nhưng chậm hơn baseline 6,85 ms p50 (+19,7%), chỉ theo dõi. M1 đã vào main nhưng chưa audit; không dùng số đo cũ để tuyên bố source mới đạt. G1 được chủ dự án báo GEOREFERENCE_BOUND_PROVEN cho cặp tệp riêng; chưa mở cặp tệp đó trong lượt Codex. REAL_WORLD_NOT_VERIFIED tiếp tục giữ nguyên.

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
