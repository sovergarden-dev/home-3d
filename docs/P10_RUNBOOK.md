# P10 — Kỷ niệm của một ngôi nhà

> P10.1 hiện hành: xem [P10_1_RUNBOOK.md](P10_1_RUNBOOK.md). H đã được đo đạt trên GPU thật ở runtime59f6; các nhãn/receipt P10 phía dưới là lịch sử, không bị đổi thành số đo mới.

P10 bổ sung câu chuyện riêng tư vào world đang có: ghim, tour, nhật ký và bưu thiếp. Nhánh `feat/p10-memories` xuất phát từ `72dd2bed1d58c558018538a51aae02f74304bc7d`; không phải một bản phát hành. G1 không chặn P10. `BLOCKED_MISSING_GEOREFERENCE` và `REAL_WORLD_NOT_VERIFIED` vẫn giữ nguyên. Không merge, Publish, deploy hay thay đổi đồng bộ.

Nguồn chốt phạm vi: [trang P10 của Notion AI](https://app.notion.com/p/7592ff65db1f411db4d7cc8e36c2b691). Ba tiêu chí roadmap: thêm kỷ niệm có ảnh ≤6 thao tác và dưới hai phút; kiểm tự động GPS/metadata đã bị loại; bưu thiếp 4K desktop/2K mobile không crash. Receipt duy nhất ở đầu trang P10 phải ghi base/full head/worktree/delta riêng P10, A–H DONE hoặc BLOCKED theo bằng chứng, counts pass/fail/skip thật, production smoke cùng mã cuối, CI event workflow_dispatch ở full SHA với đủ bốn job success. Board chỉ tóm tắt và trỏ về receipt. Không gọi GPU skip là pass GPU, không tự đặt SOFTWARE_TECHNICAL_REVIEW_PASSED.

## Mở xem tổng thể

Chạy `bun install --frozen-lockfile`, `bun run dev --host 127.0.0.1 --port 4178`, mở `http://127.0.0.1:4178/?local-preview=1` và tab **Kỷ niệm**. Demo có ba ghim và nhật ký được gắn nhãn **Ví dụ tổng hợp**. Chọn ghim từ bản đồ hoặc danh sách để bay tới; **Thoát** trả camera cũ. Tour chỉ có ở Diorama và Mặt bằng. Có Trước/Sau/Tạm dừng; reduced-motion nhảy điểm, tab ẩn không chạy bù thời gian. Tab Kỷ niệm là đường dùng bằng bàn phím tương đương, không có dashboard thứ hai.

**Thêm kỷ niệm** lấy vị trí/camera hiện tại làm mặc định. Nhập tiêu đề rồi Lưu; nội dung, ngày/giờ Việt Nam, nhóm, tối đa năm thẻ, sáu ảnh và một audio là tuỳ chọn. ID ngẫu nhiên, không dùng tên tệp. Có sửa/xoá và hoàn tác xoá trong mười giây. Kỷ niệm không đổi tâm, hình học, selection hay undo của world.

## Lưu, sao lưu và chuyển world

Mặc định chỉ RAM trong tab; chỉ cờ opt-in được nhớ qua reload bằng `localStorage`, còn khi cờ tắt thì không mở/đọc IndexedDB. Công tắc **Lưu trên thiết bị này** cấp quyền cho riêng IndexedDB `pnm-p10`, phiên bản 1, store `worlds` và index `updatedAt`. Nếu bật sau khi đã sửa RAM, các sửa đổi được merge theo id với bản đã lưu, không ghi đè các mục khác; nhập gói cũng merge theo id và cần xác nhận. Tổng document bị chặn ở 64 MiB trước khi lưu hoặc thêm ảnh. Đổi world không được nhìn thấy nội dung world khác. Demo có khoá cố định; gói riêng dùng SHA-256 văn bản gói nội bộ, không xuất hash. Thiếu Web Crypto dùng RAM theo epoch và báo trung tính; quota/blocked giữ RAM. Bản IDB hỏng hoặc quá lớn không bao giờ bị overwrite: phiên chuyển readonly và chỉ **Xoá tất cả kỷ niệm trên máy này** sau xác nhận mới dọn kho để bắt đầu lại. Tắt công tắc chỉ ngừng ghi, không âm thầm xoá bản đã lưu. Xoá dữ liệu trang của trình duyệt cũng làm mất bản lưu, nên xuất sao lưu.

Xuất JSON riêng chứa `schemaVersion: 1`, có trần 64 MiB; nhập từ chối khoá lạ, ngày không hợp lệ, chuỗi/quota/số không hữu hạn. Mọi ảnh nhập — kể cả nhật ký — được decode/encode lại, đặt reviewed=false và private. Thay world/rời route/đóng tác vụ làm invalidation, không commit media cũ vào world mới. Không có dịch vụ đăng công khai: bản công khai chỉ là tệp tải về và chế độ xem trước.

## Ảnh và âm thanh an toàn

Nhận JPEG/PNG/WebP; AVIF/HEIC chỉ khi trình duyệt giải mã tự nhiên được. Đầu vào tối đa 25 MiB, 40 MP; ảnh hỏng/quá lớn/không hỗ trợ có lỗi trung tính. Pipeline decode với Orientation, vẽ lại và encode mới, hiển thị cạnh dài ≤1600, thumbnail ≤320, placeholder <1 KiB. Quét byte JPEG APP1/APP13, PNG eXIf/tEXt/iTXt/zTXt, WebP EXIF/XMP sau encode; còn marker là từ chối. Không giữ ảnh gốc, tên tệp hay metadata; giải phóng Bitmap/URL/canvas.

**Làm mờ vùng** kéo hình chữ nhật hoặc nhập X/Y/rộng/cao bằng bàn phím, pixelate trên bản mã hoá cuối; không có đường khôi phục bản gốc. Mỗi ảnh mặc định chưa reviewed; public yêu cầu xác nhận đã che mặt, biển số, số nhà người khác. Bản xuất/guest loại toàn mục public còn ảnh chưa xác nhận. Tự nhận diện bằng ML, sharp, blurhash là **NOT_DONE có chủ ý**, không phải chức năng ngầm hay nút giả.

Audio: tệp local MIME whitelist, ≤2 MiB, duration giải mã metadata ≤60 giây; phát qua bấm nút bằng HTMLAudioElement, không tạo AudioContext thứ hai hay microphone. Dừng khi hidden/world/route hoặc ended. Audio giữ trong bản private, không có audio key trong public export hoặc guest preview. Tiếng phố P9 vẫn độc lập.

## Nhật ký, khách và liên kết

Nhật ký private theo ngày/chặng, tối đa sáu ảnh mỗi mục qua cùng pipeline. Demo gắn lô giả; gói riêng chỉ có khi đã bật minh hoạ lô. Chọn hai ảnh bất kỳ, dùng slider bằng phím mũi tên. Không dựng nhà/công trường hay thay ranh. **Xem như khách** ẩn nhãn Nhà mình, marker/minh hoạ lô, nhật ký và toàn bộ mục private; public export/guest cũng loại audio; cờ này chỉ là preview chứ không cơ chế phân quyền mạng.

Hash versioned chỉ có camera/time/ID; parser whitelist, giới hạn độ dài/khoảng, bỏ qua id lạ hoặc lỗi với thông báo. Không title/body/ảnh/tên file/hash world/lat-lng. `replaceState` chỉ sau dừng thao tác; timer được thu hồi lúc unbind. Clipboard chỉ được chạm khi bấm Sao chép. Liên kết private chỉ có nghĩa trong trình duyệt đang có đúng world/nội dung đó. Chia sẻ hash camera có chủ ý không đồng nghĩa tải tài liệu kỷ niệm lên server.

## Bưu thiếp

**Giữ khoảnh khắc** vẫn nhanh và giữ tối đa bốn ảnh Blob trong phiên, store chỉ có metadata nhẹ. **Tạo bưu thiếp** render target ngoài màn hình: 3840×2160 desktop, 2048×1152 mobile, fallback 1080×608 có thông báo. Có viền, ngày/giờ và nhãn ảnh dựng 3D mô phỏng. Phường/xã tự gõ ≤40 ký tự, trống mặc định, chỉ cảnh báo mềm nếu giống địa chỉ; không suy từ toạ độ. Có Hủy, mã hoá/quét metadata, Web Share chỉ nếu `canShare({files})` đúng; không thì download. Cuối cùng trả camera/projection/renderer/scissor/viewport, dispose target và clear canvas tạm, không resize/DPR canvas thật.

Vòng 2: cảnh được render vào target HDR tuyến tính (HalfFloat), rồi `OutputPass` của Three áp ACES/exposure và chuyển sRGB trước readback target byte. Cả hai target và output pass đều được dispose trong `finally`; không chỉ đặt `renderer.outputColorSpace` rồi đọc pixel tuyến tính. Camera render theo vùng ảnh bên trong khung, để cảnh chiếm 92% bề ngang thay vì khoảng 70%. `node scripts/p10-color-verify.mjs /tmp/p10-color-qa` kiểm WebGL2 Chromium: cùng camera/giờ, DPR 1, ảnh canvas không HUD 1884×804 so với vùng ảnh [82,82,1884,804] trong bưu thiếp 2K; trung bình từng kênh và độ sáng phải lệch không quá 15%. Không tính viền/chữ sáng để làm đẹp số. Script còn chụp danh sách ba kỷ niệm ở 1440×900, không chèn overlay giả.

## Tự kiểm lại bằng fixture

```sh
bun install --frozen-lockfile
bun run check
(cd pipeline && bun run src/cli.ts --config tests/fixtures/synthetic-pipeline.json --dry-run)
# Từ root, với dev server đang chạy:
REQUIRE_WEBGL2=1 bun run test:e2e --project=chromium
bun run test:e2e --project=firefox
bun run test:e2e --project=webkit
node scripts/p10-baseline.mjs 4184 before /tmp/p10-evidence
node scripts/p10-benchmark.mjs perf /tmp/p10-evidence
node scripts/p10-benchmark.mjs soak /tmp/p10-evidence
node scripts/p10-latency.mjs /tmp/p10-evidence
python3 scripts/p10-summarize.py /tmp/p10-evidence
# Sau build gắn SHA hiện tại (chạy smoke không deploy):
VITE_BUILD_SHA=$(git rev-parse HEAD) bun run build
bun scripts/p10-production-smoke.mjs
node scripts/p10-visuals.mjs /tmp/p10-visuals
```

Baseline cần server main detached đúng `72dd2bed1d58c558018538a51aae02f74304bc7d`, ở lượt này là cổng 4184; xác minh PID/cwd/SHA trước khi đo, không chỉ tin cổng được yêu cầu vì Vite có thể tự chuyển cổng. Guard baseline bắt buộc lớp sống P9 có sẵn. Không chạy hai benchmark GPU cùng lúc. Harness benchmark/soak mặc định dùng `P10_PORT=4178`; thay khi cần. Benchmark ba lượt matched main/after cùng demo, camera heading 28/zoom 1, ngày 2026-06-21 07:00, viewport 1440×900, DPR 1, warm-up 5 giây và cửa sổ frame 10 giây; giữ toàn bộ slow frame. Pha đứng yên, 300 ghim/tour, xử lý 12 MP và capture được lưu riêng, không trộn capture vào frame interval. `latency-raw.json` đo save/delete thật khi dock mở (299→300→299); mutation trong after raw dùng Undo và chỉ là mẫu hiệu chuẩn. Mục tiêu thêm/xoá sau warm-up dưới 100 ms; không thay ngưỡng sau đo. Heap, CPU pixel-buffer estimate và renderer texture counter **không phải GPU memory**. SwiftShader không chứng minh FPS/GPU vật lý.

Soak mặc định ít nhất 1.200.000 ms và 20 chu kỳ; raw gồm URL/Bitmap/canvas, DOM listener, RAF, IDB, AudioContext, renderer texture/geometry/render target và heap. Chu kỳ thêm/xoá/undo, ảnh, tour, postcard, khách, world/route và lưu. Biến thời lượng/min-cycle chỉ phục vụ smoke harness; receipt chỉ được dùng lượt đủ 20 phút/20 chu kỳ. Mọi fixture/sentinel/ảnh bằng chứng hoàn toàn tổng hợp. Không sửa timeout 90 giây/assertion/capability guard H6 hay workflow để làm xanh.

## Bằng chứng và ranh giới review

Raw, ảnh cố định và bảng kết quả trong `docs/assets/qa/p10/` sau khi đo hoàn tất; receipt cuối trên Notion là nơi ghi head/PR/CI/counts thực tế. Status chỉ được nộp `SUBMITTED_FOR_TECHNICAL_REVIEW`; Notion AI mới xác nhận kỹ thuật. GPU vật lý, native Safari/iOS/Android và khu thật là **NOT_VERIFIED** khi không có bằng chứng. P11–P13, cloud/R2/Access, ML, micro, nguồn bản đồ/nhà thật và phát hành vẫn ngoài lượt.

## Tái kiểm vòng 2

`node scripts/p10-color-verify.mjs /tmp/p10-color-qa` so đúng vùng cảnh của bưu thiếp 2K với canvas cùng camera và cùng kích thước; ẩn HUD ở ảnh đối chứng, không tính viền/chữ. Ngưỡng chênh từng kênh RGB và độ sáng trung bình vẫn 15%.

`node scripts/p10-r7-decompose.mjs before 4184 /tmp/p10-r7` rồi `node scripts/p10-r7-decompose.mjs after 4178 /tmp/p10-r7` dùng hai server dev tuần tự. Baseline **R7 vòng 2** là full head trước sửa `0eb8967d3770dd2b37c55299ed51fb0c1b049b65`, không phải main dùng cho R6. Phải kiểm SHA/cwd/cổng thật. Mỗi bản có ba lượt, dock 299↔300 thẻ, cùng viewport/DPR/camera/thời điểm đóng băng, tắt lớp sống trong cả hai bản để tách ghim; chờ ổn định trước đo. Harness xác nhận mỗi mẫu có đúng 299 hoặc 300 lần ghi instance ghim, không đo nhầm lớp sống, đồng thời chặn hai host font và đếm các host ngoài khác.

Các khoảng CPU và DOM/RAF có thể chồng nhau, **không cộng thành tổng**: mutation CPU chứa clone/store; `setMatrixAt` chỉ là cận dưới phần ghi instance, không gồm toàn bộ dựng ma trận. MutationObserver cho thời điểm commit DOM, không thay React Profiler. Hai RAF là cận trên đường UI/render/scheduler/compositor trên trình duyệt kiểm, không phải phép đo GPU. Loại bỏ clone không tự chứng minh đạt ngân sách dưới 100 ms; receipt vẫn phải ghi `H_BLOCKED` nếu số đo chưa đạt. Raw và ảnh vòng 2: `docs/assets/qa/p10/round-2/`.
