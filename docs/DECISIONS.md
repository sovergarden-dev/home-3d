# Quyết định — Codex hiện hành, các pha trước giữ làm lịch sử

## M1 — Sửa theo phép đo, giữ hợp đồng dữ liệu

- K3 dùng TextMetrics ở đúng độ phân giải xuất; gap = 0,6 × line-height nhỏ hơn, line-height = 1,2 × cỡ chữ. Giữ nguyên câu tiêu đề, vùng ảnh R1, kích thước/hạ bậc và metadata guard. Frame geometry dùng chung cho capture/compose/caption để không lệch ROI.
- K1 profile đầu dùng fixture R7 đóng băng ngày/giờ, tắt lớp sống như receipt R7; có Chromium trace, Long Task, Long Animation Frame và Event Timing. GPU thật: mutation p50 1,3 ms, ghi instance 0,1 ms, DOM commit 83,35 ms; không cộng các khoảng chồng nhau. Bước đầu chỉ memo các thẻ có props ổn định và thu hẹp subscription của viewport về guest bit. Giữ serialize/validate/quota, public projection, IndexedDB và world state nguyên vẹn. Chưa gọi H_MET từ profile 10 cặp có tracing; ma trận A/B đủ mẫu vẫn bắt buộc.
- Profile sau UI (vẫn 10 cặp có tracing) cho DOM p50 22,95 ms, RAF2 35,5 ms; các lát FunctionCall lớn trước sửa thuộc react-dom. Không tối ưu việc ghi matrix 0,1 ms vì chưa là nút thắt. K2 chọn đường kính tròn 20 CSS px, hit target tròn đường kính 44 CSS px, nearest-centre và tie theo ID ổn định. Billboard dùng một InstancedMesh và shader, không thay hình học world; marker nhà DOM và nhãn giữ ưu tiên. Cần pixel QA và regression trước khi kết luận đạt.

## M0 — Tiếp quản và đo baseline (28/10/2026)

- Chủ dự án giao Codex M0–M5, quyền PR/merge commit theo §5.2 của `CODEX_HANDOFF.md`; chỉ Notion audit cuối khi chủ dự án yêu cầu. Không Publish/deploy hoặc đổi dịch vụ. Các phân vai/cổng cũ bên dưới là lịch sử.
- Toolchain riêng ngoài checkout: tránh đổi Bun của dự án khác và tránh lint quét JavaScript của bộ trình duyệt kiểm thử. Checkout dùng Git local `core.autocrlf=false`, `core.longpaths=true`. Giữ nguyên lint, lockfile, workflow và assertion baseline.
- Tái dùng ba harness P10, chỉ thêm lựa chọn renderer/DPR và chứng cứ renderer thực. Mặc định giữ cách launch cũ, báo renderer quan sát được; `BENCH_GPU=real` bắt buộc Chrome/Edge headed và loại software renderer, `software` ép SwiftShader. DPR `native` được đọc từ cửa sổ headed chưa áp viewport emulation. Không đổi thuật toán đo, warm-up, số vòng hay ngưỡng. H6 chỉ thêm attachment/check GPU khi opt-in đo phần cứng; vòng 20 chu kỳ, capability guard và timeout gốc giữ nguyên.
- Dùng chung adapter launch cho ba harness vì cả ba đang hard-code cùng môi trường và nhãn SwiftShader. Giữ ba bản riêng dễ tạo nhãn sai khi đổi renderer; viết lại benchmark sẽ làm mất tính so sánh. Adapter giới hạn ở launch/metadata, không tổng quát hoá luồng đo. Khi thay driver/browser/DPR phải ghi môi trường mới, không gộp số liệu khác điều kiện.
- Kéo cấu hình gitleaks tối thiểu từ M2 vào M0 vì §5.2 yêu cầu scan trước PR đầu. Quét lịch sử ban đầu tìm sáu false positive đều là đúng chuỗi công khai `synthetic-fixture-p10`, tại `src/memories/session.ts` và `tests/e2e/p10-storage-r2.spec.ts`. Allowlist chỉ rule `generic-api-key`, chuỗi exact và hai đường dẫn đồng thời; không bỏ file/commit/rule, không xoá lịch sử. Scan lại 81 commit sạch. Tích hợp CI đầy đủ vẫn thuộc M2.
- Khi E2E M0 chạy tuần tự trên checkout baseline đóng băng, chuẩn bị K3 của M1 trong worktree riêng để không sửa mã đang kiểm. Đây chỉ là chuẩn bị độc lập; thứ tự merge vẫn M0 trước M1, và nhánh M1 phải nhận main bằng merge trước các cổng cuối.
- Kéo việc ổn định runner Windows của M2 vào M0: Vitest dùng một worker thread trên Windows; Linux giữ cấu hình cũ. Lý do quan sát được là fork worker khởi động/kết thúc timeout, lượt một worker fork mất 1088,54 giây và thiếu bảy file test. Không thay assertion, deadline hay ngưỡng 4 ms; không gọi thay đổi runner là tối ưu runtime app. Giữ fork đơn giản hơn nhưng không giải quyết lỗi tạo tiến trình đã đo; chỉ chấp nhận phương án thread sau khi toàn bộ case cũ chạy đủ và đạt, giữ isolation mặc định.
- Cổng M0 tách baseline khỏi hồi quy PR: §4 yêu cầu chạy và ghi sai khác Windows tại bản đã Publish; §5.2 yêu cầu check ứng viên, E2E liên quan và CI đúng head. M0 không đổi runtime app. Check ứng viên phải xanh, hardware H6 mới phải chạy thật, metadata/privacy phải kiểm; các ca headless Windows đỏ tại baseline được giữ nguyên và chuyển sang M2/M3, không ghi PASS hoặc nới test. M0 chưa đồng nghĩa toàn bộ app đạt ngân sách hoặc đã sẵn sàng phát hành.

## H6 — một gói tích hợp, một lượt review

- Theo trang “H6 — Cue làm trọn gói, nghiệm thu một lần”: Cue khép W0–W7 và tự kiểm T01–T20 trong PR #3; Notion AI review kỹ thuật receipt cuối; Syringa chỉ nghiệm thu tổng thể sau đó. Không merge/auto-merge/Publish/deploy.
- Zustand chung chỉ chứa điều khiển UI an toàn. World, package base, overrides, lịch sử và selection/marker theo phiên ở client; không persistence, cloud hoặc SSR serialization dữ liệu riêng.
- UI mặc định có đường mở gói; query `local-preview=1` cũ vẫn tương thích. Synthetic mở từ file vẫn là dữ liệu tổng hợp. Gói lỗi có trạng thái riêng, không lén thay bằng demo.
- Đọc file dùng generation: yêu cầu mới nhất hoặc reset thắng mọi kết quả cũ. Giới hạn 100 MiB cao hơn canonical hiện có. Mã lỗi không chứa nội dung/tên file riêng.
- Bản làm việc dùng schema WorldPackage hiện hữu: base nguyên vẹn cộng document overrides hiện hành, không xuất effective world rồi áp overrides lần hai. Giữ metadata/xác nhận tâm; marker không được xuất thành lots/overrides. Download là yêu cầu trình duyệt tải file, không bằng chứng file đã lưu thành công.
- Chỉnh một thuộc tính chỉ patch thuộc tính đó, provenance thuộc tính khác giữ nguyên. Unknown không phải số đo 0 m; màu chất lượng chỉ là trình bày từ `assessWallHeight`, không xác minh hình học/tầng/mái.
- Lõi và tâm private đã chấp nhận được bảo toàn; toàn dữ liệu chỉ fit khi chủ động chọn. Minh họa lô là opt-in theo package, không phải ranh khảo sát. Không re-intake/Overture mới hoặc bịa khối nhà.
- Build chỉ hiển thị SHA đầy đủ thực sự được truyền qua `VITE_BUILD_SHA`; không có thì “không xác định”. Không gọi GitHub từ runtime hoặc tự gán SHA PR. Không suy build Preview đang phục vụ từ trạng thái PR.
- Bằng chứng mới chỉ dùng fixture tổng hợp độc lập. Frame interval là giữa các frame đã render trong cửa sổ hoạt động, không GPU time/FPS thiết bị; hardware/Preview thiếu chứng cứ ghi NOT_VERIFIED. Perf before/after phải cùng fixture/path/viewport/DPR.
- Cleanup `SceneViewport` chạy ở layout effect, trước khi React tháo canvas, để OrbitControls gỡ listener khỏi đúng document. Sonner 2.0.7 được vá bằng Bun patch hai dòng ESM/CJS: tháo `visibilitychange` trên document đã đăng ký, không nâng dependency. Hai regression riêng bảo vệ đúng thứ tự và đúng event target.
- Soak dùng File/DataTransfer qua input/UI thật để tránh alias input đã tháo bị driver giữ; E2E riêng vẫn dùng `setInputFiles`. Guard retained-growth giữ raw samples, so peak sau warm-up qua 20 vòng và 20 phút; không suy GPU memory hay chứng nhận phần cứng từ JS heap.

## Lịch sử Demo 1

## Demo trước, chi tiết sau

Sau P1.1, chủ dự án yêu cầu gom một lát cắt demo chạy được thay vì đợi hoàn thành từng pha P2–P13. Demo 1 không đồng nghĩa các pha đó đã hoàn tất. Những hạng mục còn lại nằm trong BACKLOG.

## Mã nguồn public, dữ liệu riêng không public

Repo giữ public theo quyết định mới. Bản Lovable và bản HTML xem thử chỉ dùng phố hư cấu. Không có địa chỉ, tọa độ địa lý, link vị trí, polygon lô thật, ảnh riêng, ảnh Google, API key hay endpoint dữ liệu thật. Không triển khai Cloudflare/R2/Access trong lần này. `noindex` không phải cơ chế bảo mật.

## Model và engine demo

- Layout sinh từ seed cố định, hoàn toàn hư cấu; không truy vết, đo hoặc suy ra hình học từ Google Maps/Street View. Dữ liệu thật sau này dùng dữ liệu mở được phép và ảnh người dùng tự chụp.
- Nhà trung tâm là lô trống. Không dựng lại nhà cũ; chưa có model kiến trúc sư.
- Three.js trực tiếp + OrbitControls, lazy-import phía client. Giữ TanStack Start, bun và store; không đổi cấu trúc Lovable. R3F/drei trong kế hoạch là hướng kiến trúc cho các pha engine đầy đủ, chưa là dependency bắt buộc của lát cắt demo.
- InstancedMesh dùng chung geometry/material; không đưa asset nặng vào git. Camera mặc định Diorama, điều khiển zoom/heading qua store. Reset khôi phục cả góc nghiêng camera.
- Tầm mắt là preview góc camera, không phải đi bộ có va chạm. Phố thật bị vô hiệu hóa; thời tiết chỉ mô phỏng, không lấy vị trí.
- Ánh sáng là mô phỏng theo giờ, không phải nắng theo tọa độ thật. Giờ thật/thứ theo Asia/Ho_Chi_Minh.
- Âm thanh tổng hợp sau tương tác bật tiếng; không phải bản thu phố thật. Tạm dừng khi tab ẩn.
- Ảnh chụp chỉ giữ tối đa 4 ảnh trong bộ nhớ phiên, tải PNG được; không lưu lên server/localStorage. Reload xoá ảnh.
- WebGL2 không có/mất context: hiện thông báo và nút thử lại. Chưa có ảnh/video fallback của phố.

## Quy trình phát hành lịch sử (phân vai H6 ở trên)

Notion AI tạo và kiểm patch. Hermes áp nguyên patch, chạy frozen install/check/e2e, mở PR và workflow_dispatch đúng SHA. Notion AI review CI trước merge. Syringa merge bằng merge commit, kiểm Lovable và Publish. Không force push hoặc tự merge.

## H6: world synthetic/public, package riêng/local

- Runtime public dựng đúng một `WorldData` synthetic. Không chồng grid/road/nhà thủ tục cũ lên world polygon.
- Mặt bằng dùng `OrthographicCamera` thật, Bắc lên trên, thước mét lấy từ frustum/zoom/canvas. Pan và zoom chỉ tác động camera local; renderer phát số đo sang store, không serialise world riêng.
- Pipeline, package parser và file picker đều nhận package local explicit. Package lỗi không fallback âm thầm sang fixture rồi gắn nhãn khu thật.
- Package thật, source snapshot, mapping, ENU, override và report ở ngoài git/build. Repo chỉ giữ schema, code, docs và fixture synthetic.

## P8 — Presentation và quyền thời tiết riêng

- Ngày UTC+7 là nguồn chung cho đồng hồ, lịch Việt, mùa, lễ và thiên văn. Mô phỏng 1× = một phút/giây thực; tab ẩn không bắt kịp thời gian mô phỏng.
- Không khí là lớp tách khỏi WorldData. Mùa tự động dùng quy ước mô phỏng miền Nam (tháng 5–11 mưa), không phải quan trắc khu nhà. Ngập là hiệu ứng mặt nước tắt được, không phải cao độ/rủi ro.
- Tham chiếu dùng binding P7 của đúng gói trong phiên. Không lấy demo làm vị trí khu thật. Consent Google không cấp quyền cho Open-Meteo; quyền thời tiết chỉ ở client session và bị xóa khi đổi gói/reference/reset.
- Không thêm backend/key/hạ tầng. Asset trang trí procedural tự tạo; không tải nội dung Google làm model/texture. Thiết bị/GPU vật lý chưa kiểm ghi NOT_VERIFIED.

## P9 — Lớp sống/âm thanh và POV client-only

- P9 từ main `7221b0c416633d2bd4273afdbd77b894b9ac5f23`, PR thường, không stack H6/P7/P8. Lõi các pha đã nhận giữ nguyên; thay nhãn Đi bộ cũ thành POV thực có BVH; hành vi export P7 vẫn dùng hợp đồng mode `walk` khi camera ở POV.
- Chung vòng render/đồng hồ P8, không thêm RAF/timer. Dừng đứng yên, 1× = 1 giây chuyển động/giây thực, 4× = bốn lần có bước cố định 1/30 giây. Đồng hồ lịch P8 vẫn giữ quy ước một phút/giây tại1×; không sửa pha đã chấp nhận. Tab ẩn bỏ catch-up; reduced-motion bỏ head bob và giảm tốc/nhìn rung.
- Đồ thị/làn/lối đi suy ra là bộ nhớ trình bày, không ghi vào roads/footprints. BVH CPU tường footprint bảo thủ (thiếu chiều cao dùng3m), mặt đất/biên gói, vật cản xe buffer tái dùng; không dependency vật lý/audio mới. Xe ôm chỉ một tuyến đồ thị hữu hạn nối liên tục từ tâm tới nút hợp lệ; fixture có nhãn đích giả; không chỉ đường thật.
- Nút tắt nhanh lớp sống luôn thấy; Mặt bằng trung tính không tác nhân. AudioContext chỉ tạo bằng thao tác âm thanh thực, một context trong scene; tổng hợp/clip local manifestSHA256≤1.000.000byte. Không fetch/micro/storage/upload. Thư mục audio-local gitignored; asset procedural tự tạo.
- Ngưỡng CPU update tiermid đặt trước ≤4ms p95; latency mục tiêu<100ms. So sánh perf phải cùng fixture/time/camera/DPR, rawslowframe không lọc; JS heap estimate không phải GPUmemory. Thiết bị/GPU vật lý/nativeSafari/khu thật chưa đo ghi NOT_VERIFIED. Chi tiết và giới hạn trong runbook/receipt, không đổi ngưỡng để gọi đạt.

## P9 review vòng 1 — demand render và ownership

- Walk đứng yên không phải hoạt ảnh: dùng dirty pose/input/vận tốc còn lại để yêu cầu frame trên RAF hiện hữu; phím, kéo, pointer-lock, touch và orientation đánh thức frame. Khi cập nhật tiêu thụ dirty flag, scene vẫn vẽ frame cuối; Ride chạy/dừng/kết thúc và tác nhân theo đồng hồ giữ hành vi cũ. Không giảm chất lượng, cắt số vòng hay sửa timeout/test/workflow để che chi phí.
- Graph không dùng được không thể sinh tác nhân: giữ simulation/status và POV/BVH, nhưng không cấp phát geometry/material/instance tác nhân rỗng để renderer warm shader vô ích mỗi lần mở gói/route. World mới tạo runtime mới; graph hợp lệ giữ đủ tác nhân, không giảm chất lượng hay trần tier.
- Runtime presentation trả mọi InstancedMesh đã tạo, gồm batch đèn riêng, và tháo group khỏi scene khi thay gói/dispose. Việc này khép ownership của lớp sống, không tự chứng minh nguyên nhân cảnh báo context WebKit hoặc việc driver đã thu hồi bộ nhớ GPU.
- BVH va chạm là mã riêng tại `src/engine/life/collision.ts`, không phải dependency `three-mesh-bvh`; không thêm dependency/đổi lock trong batch này.

## P10 — Kỷ niệm, tour, nhật ký và bưu thiếp

- Base main `72dd2bed1d58c558018538a51aae02f74304bc7d`; không phụ thuộc G1. Không suy tham chiếu địa lý, merge/Publish/deploy hoặc đổi đồng bộ.
- Nội dung/ảnh/audio/ENU kỷ niệm ở session ngoài zustand và SSR; SHA-256 của world chỉ làm khoá cục bộ. RAM mặc định, explicit opt-in mới mở `pnm-p10/worlds` v1. Thành công ở transaction completion; đóng connection cả lỗi/abort. Thiếu Web Crypto chỉ RAM theo epoch. Quota/blocked giữ RAM. Nhập JSON nghiêm/có trần, reprocess mọi ảnh và audio; ảnh import private, reviewed=false. Xoá tất cả có xác nhận và dọn mọi world của kho P10.
- Không dependency mới: canvas/createImageBitmap áp orientation, re-encode 1600/320 và placeholder nhỏ, pixelation thủ công, quét metadata sau encode. Không bản gốc/tên file. ML mặt/biển số là NOT_DONE có chủ ý, không ML/mạng. Audio chỉ qua thao tác, HTMLAudioElement kiểm dung lượng/duration; không AudioContext mới/micro, dừng hidden/world/route.
- Pin InstancedMesh theo tier; tour Catmull–Rom trong tham số camera, shortest yaw/cao độ an toàn trên RAF hiện hữu. Reduced-motion nhảy điểm, pause/hidden không catch-up; exit khôi phục raw camera/plan centre. Không sửa world/selection/undo.
- Hash versioned/whitelist chỉ camera/time/ID, không nội dung/tên/world hash/lat-lng. replaceState sau control-end; Clipboard chỉ nút bấm. Public/guest là preview/xuất file, không đăng mạng; nhật ký/marker luôn private.
- Bưu thiếp 3840×2160/2048×1152 (fallback 1080×608) render đúng vùng ảnh: target HalfFloat tuyến tính → OutputPass ACES/exposure/sRGB → target byte để readback. Three r180 không tone-map offscreen như canvas; chỉ đặt outputColorSpace không đủ. Vùng ảnh chiếm 92% bề ngang. Finally trả camera/renderer, dispose cả hai target/output pass/clear canvas; không đổi canvas/DPR thật. Encode mới/quét metadata; Web Share chỉ nếu canShare(files), còn lại download.
- Telemetry lỗi chỉ mã tĩnh, không serialize Error/context riêng; giữ mã `CLIENT_RENDER_FAILURE`. Khôi phục đúng ba Google Fonts links của main cho Be Vietnam Pro/Lora; P10 network harness chỉ abort các host `fonts.googleapis.com`/`fonts.gstatic.com` và yêu cầu 0 request ngoài hai host này. Không thay consent weather/Google P7/P8. TopInfo dùng hydration snapshot để ngày UTC+7 không lệch SSR.

### M1 — Lượt tối ưu UI cuối của K1

Ma trận đủ mẫu ở `1331034…` kết thúc `H_NOT_MET_REAL_GPU`: active 300 add/delete p50 102,10/99,95 ms; static 65,45/67,90 ms; smaller 84,30/84,80 ms; zero 85,25/83,85 ms. Trước sửa active là 169,45/165,10 ms. Mỗi condition/source đủ 60 thêm + 60 xoá, không lọc outlier và không lỗi page. Trần 100 ms giữ nguyên.

Trace chỉ ra React DOM; sau memo card, HUD/journal/postcard vẫn subscribe toàn snapshot và render lại khi chỉ thêm/xoá memory. Lượt cuối chỉ thu hẹp subscription về guest/journal/ready/error thực dùng và memo các subtree không đổi props. Không thêm cache giữ tài liệu riêng, không xoá node khỏi DOM hay virtualize để tránh đổi hợp đồng đo. World/persistence/quota/validation giữ nguyên. Kiểm type/unit/E2E và ma trận đủ mẫu mới trước khi chốt H; nếu vẫn vượt thì ghi NOT_MET và chuyển tiếp theo quy tắc ba vòng.

### M1 — Cổng H6 WebKit tách khỏi test success

CI draft 4/4 nhưng H6 WebKit log 1,4 phút, nên budget NOT_MET và chưa merge. Các ca WebKit trước H6 cũng tăng khoảng 1,5 lần, gồm forced-WebGL fallback; đây là dấu hiệu runner/load khác, chưa phải chứng minh hồi quy shader. Không sửa runtime theo phỏng đoán. Thêm reporter ghi duration ms chính xác và làm CI WebKit fail nếu H6 thiếu/skip/fail hoặc ≥70.000 ms; giữ nguyên test/assertion/capability guard và timeout 90 s. Reporter không áp ngưỡng CI WebKit lên Windows/hardware hoặc Firefox không có WebGL2. Kiểm boundary 69.999/70.000, skip, timeout, missing case và scope Chromium đều đúng. Lượt CI tiếp theo chỉ ở head mới có QA receipts/harness, không dispatch lặp cùng head.

### M1 — Bỏ compile shader khi lớp ghim rỗng

Probe WebKit thật trên source 0265a53 đếm 4 lần shaderSource có pinViewport ở scene đầu và vẫn 4 lần sau route remount với 0 ghim; assertion kỳ vọng 0 đỏ đúng cơ chế. Three r180 compile duyệt scene.traverse kể cả mesh invisible, nên chỉ tắt visible không đủ. Giữ một InstancedMesh để tái dùng, chỉ gắn vào group khi có ghim; zero count tháo khỏi group. Không đổi caps, viewport, H6 cycle/assertion/timeout hoặc hình ghim có nội dung.

Đây là vòng sửa budget H6 riêng, không phải nới mục tiêu K1. Probe K1 bổ sung chứng cứ trạng thái rỗng: sau actual main render, mesh count=0 và detached, DOM count=0, rồi vẫn yêu cầu GPU fence và RAF tiếp theo. Dữ liệu ghim dương vẫn phải qua actual draw. Vì runtime/probe đã đổi, cần requalification GPU và related tests ở SHA mới; dữ liệu 0265a53 vẫn giữ với nguồn đúng, không đổi nhãn lịch sử.
