# Quyết định — Codex hiện hành, các pha trước giữ làm lịch sử

## M2 — Chuẩn bị cô lập trong lúc đo M1

Chuẩn bị build identity, CI và lint trong worktree riêng trong khi M1 đo ma trận A/B; không chạy build/test nặng đồng thời và không sửa source đang đo. Thứ tự chuẩn bị dự kiến M1 rồi M2; quyết định tích hợp cuối bên dưới ghi rõ cổng M1 đang chặn. Phiên bản lấy từ `package.json`; SHA ưu tiên giá trị full SHA hợp lệ do môi trường cấp, rồi Git của checkout, thiếu thì `null`/không xác định. Không thêm plugin Vite trùng và không đưa đường dẫn Git vào client.

Các helper UI không có consumer bên ngoài được giữ nội bộ; hai variant được chia sang module thuần để Fast Refresh đúng quy tắc. Georeference vẫn chỉ đọc trong phiên client, phụ thuộc memo thể hiện đúng trạng thái tham chiếu; không đưa vị trí vào shared store.

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

### M2 — Cổng CI và coverage (đang triển khai)

Bốn job giữ nguyên tên, pin full SHA action và timeout 25 phút; checkout đúng PR head, quyền contents:read. Gitleaks 8.30.1 là CLI QA độc lập, tải từ release chính thức với SHA256 cố định trên CI; Windows dùng binary đã kiểm M0. M0 đã quét lịch sử đầy đủ; PR quét base..HEAD, push main quét lại đầy đủ cho repo nhỏ. Không thêm quyền hay cài đặt GitHub.

Bundle budget dùng manifest Vite để tính hợp các static import closure của mọi entry/dynamic entry trừ engine riêng. Engine bị static-import vào shell sẽ fail; import chung chỉ đếm một lần. Ngưỡng 250.000 byte gzip (bảo thủ hơn 250 KiB). Script không dựa vào tên chunk hash hay bỏ các route UI khỏi phép tính.

Coverage dùng provider V8 cùng phiên bản Vitest đã khoá (4.1.11), giấy phép MIT, phát hành 18/08/2026 (đã kiểm registry; không lifecycle install script/native ở package). Phạm vi geo, state, logic mô phỏng và khí quyển gồm cả file chưa chạy. Ratchet được thiết lập từ số đo thật, mục tiêu 85% ghi riêng; không tự cập nhật threshold trong CI. Dependency và các dependency bắc cầu sẽ được kiểm trước khi cài; chưa ghi gate đạt cho đến khi đo. Tài liệu chuẩn: [Vitest coverage](https://vitest.dev/config/coverage), [Vite manifest](https://vite.dev/guide/backend-integration.html).

### M2 — Phục hồi scene và sheet

Context loss bất ngờ: dispose scene cũ khi DOM còn gắn, một lần dựng lại tự động sau 250 ms. Không tự retry khi WebGL2 vắng mặt hoặc import lỗi. Loss tiếp theo giữ fallback tĩnh và nút thử lại; người dùng chủ động thử thì cấp lại một lần tự phục hồi. Timer bị huỷ khi unmount; world/memories vẫn ở client session. Minh hoạ tĩnh là SVG hư cấu độc lập, không đọc footprint của package. Test cũ manual retry được giữ sau loss thứ hai, bổ sung assertion tự phục hồi/lifecycle; không nới H6 timeout hay guard.

Sheet đã có callback ẩn map controls ngay trên pointermove ở mã baseline, nên chưa xác nhận lỗi cũ còn tồn tại. Bổ sung kiểm kéo/cancel/focus thực tế; chuẩn hoá capture về currentTarget, hỗ trợ Enter/Space và tắt transition khi reduced-motion. Đây là sửa khả năng thao tác, không thay snap hoặc kích thước viewport để làm test xanh.

### M2 — Chuẩn hoá LF

Đã kiểm `git ls-files --eol`: 368 tệp tracked ở mốc M0, tám JSON evidence M0 đang CRLF (index và worktree), không có mixed endings. `.gitattributes` quy định text LF và binary cho asset. Tám JSON sẽ chỉ đổi newline trong commit riêng, kiểm nội dung JSON không đổi; không chỉnh số đo. Source đã LF. Chưa renormalize khi cây M2 còn đang sửa để tránh trộn thay đổi nội dung.

M2 dependency verification đã hoàn tất: frozen install scripts-disabled, typecheck PASS. Tất cả mười tarball npm mới kiểm SHA512 theo dist.integrity, không có native binary hoặc lifecycle install script. Có Bun-generated Windows parser.exe shim ở nested node_modules/.bin; xác minh không phải binary xuất bản của dependency. Coverage, bundle gate và browser behavior vẫn chưa chạy, không đánh dấu DONE.

### M2 — Gỡ Three.js khỏi import tĩnh của vỏ

Build M1 cho thấy chunk chung tên postcard chứa Three.js (316,71 kB, gzip 88,47 kB). Kiểm dependency: `bridge/deepLink → memories/camera` và `ScaleBar → planCamera` kéo module Three vào vỏ dù scene dùng import động. M2 chuyển `poseToOrbit` dùng Vector3 sang module engine riêng; clamp/lerp thuần giữ đúng công thức Three.js; tách hàm thước tỉ lệ thuần khỏi module dựng OrthographicCamera. API camera/tour/scale và geometry giữ nguyên. Chưa tuyên bố đạt 250 KB cho tới khi build và script manifest đo thật; không loại chunk dùng chung khỏi phép tính chỉ vì tên file.

### M2 — Harness P8/P9 riêng cho cổng hiện hành

Giữ nguyên guard 20 vòng/20 phút của harness P8 lịch sử. Fixture 64 công trình được tách nguyên văn sang module dùng chung; harness mới chỉ đo 14 thao tác P8 hoặc sound-on lạnh/ấm P9, mặc định 30 lần mỗi thao tác. Timestamp bắt từ input thật, xác nhận state của main-frame submission, GPU fence rồi RAF tiếp theo; không gọi đây là thời gian âm thanh đầu tiên nghe được. Audio output được mute để QA không phát tiếng kéo dài, nhưng AudioContext phải chạy sau gesture và chỉ có một context. Clock cố định, seed 81273, nguồn SHA/renderer/driver phải xác minh. Mọi mẫu chậm/censored giữ trong raw; so ngưỡng 100 ms trên toàn bộ mẫu, không chỉ p50. Script mới chỉ syntax-check, chưa đo; không suy DONE từ code.

### M2 — Coverage không được làm sai phép đo CPU

Lượt coverage V8 đầu: 365 test pass, một bài CPU 200 tác nhân đỏ ở p95 6,945 ms (ngưỡng 4 ms). Chạy nguyên bài đó không coverage: PASS; đây là probe riêng 1 pass/5 case không được chọn, không là full-suite pass. Không nới ngưỡng hoặc giảm 600 frame. Tách nguyên văn bài timing sang file riêng, dùng chung fixture giữ nguyên; coverage chạy mọi bài hành vi rồi chạy bài timing không instrumentation trước khi check ratchet. Cổng check vẫn chạy toàn bộ assertion, không bỏ performance test. Diff body được so không thay token ngoài whitespace.

### Tích hợp M1/M2 khi cổng WebKit tuyệt đối chưa đạt

CI `40781481203` tại M1 `b6620382f389545850bb025dbd1d4fff7452ec99`: quality/Chromium/Firefox đạt; 110 ca chức năng WebKit đạt nhưng H6 mất 87.777 ms, vượt ngân sách giữ nguyên 70.000 ms. Baseline cùng runner 88.233 ms (ứng viên −0,52%). Cùng runtime từng đạt ở runner khác không làm head này xanh. Giữ PR #9 draft, không rerun cùng head; merge M1 vào worktree M2 để tiếp tục việc độc lập. M1 còn PARTIAL tới khi đủ cổng, không merge dựa vào suy luận runner chậm.

### M2 — PCM, trạng thái audio, đọc tác nhân và landscape

Profile trên source 0b56c49 cho thấy AudioContext constructor và synthSample/createSyntheticBuffer chiếm phần lớn lần bật đầu; profiler có overhead, không dùng làm số nghiệm thu. Chuẩn bị PCM tổng hợp công khai 48 kHz/6 giây theo lát 2.048 mẫu, nhường event loop giữa các lát; cache tối đa bốn kiểu thời tiết, không có dữ liệu người dùng. Không tạo AudioContext trước gesture. Copy PCM vào AudioBuffer sau gesture, giữ đường fallback gốc khi chưa chuẩn bị. Khi scene cuối gỡ, huỷ timer chuẩn bị; dữ liệu PCM công khai bất biến được dùng lại qua route. Test so toàn bộ mẫu với phép tổng hợp gốc đạt.

AudioContext statechange chủ động render một khung và cập nhật diagnostics, không mở RAF liên tục. Probe trước sửa cho context thật running nhưng dataset vẫn suspended trong cảnh dừng; không gọi timeout của dataset là âm thanh thực bị hỏng. Diorama phóng đại tác nhân 1,6×, người đi bộ 2×; POV trở về tỉ lệ cũ, simulation/collision/graph và số mesh/tam giác giữ nguyên. Landscape chuyển panel local đã thu gọn sang bên phải; SHA vẫn đầy đủ trong text/title, chỉ cắt hiển thị; hàng tilt/status không đè HUD.

Playwright 1.58 Test không hỗ trợ use.reducedMotion trực tiếp: trace xác nhận field bị bỏ qua. Cấu hình chung chuyển sang contextOptions no-preference để giữ đúng điều kiện thực tế cũ của H6; không dùng thay đổi chế độ chuyển động để giảm thời gian benchmark. Ca reduced-motion bật page.emulateMedia rõ ràng và assert media trước khi kiểm chiều cao ổn định qua hai RAF. Đây là sửa harness, không nới timeout, assertion H6 hay ngưỡng hiệu năng.

### M2 — Khép hai P2 từ review độc lập

Reviewer riêng tìm panel thu gọn đè thước Mặt bằng và lỗi hủy kéo lịch sử chưa được test phát hiện. Chỉ đổi vị trí panel sang phải trong POV đi bộ/xe ôm; Mặt bằng giữ anchor trái cũ. Hủy kéo/lost capture và thả về cùng snap phải gán lại height của snap rõ ràng, không xóa style rồi trông chờ React render khi state không đổi. Pointerdown ngăn default focus của WebKit trước khi focus handle; thao tác bàn phím giữ nguyên.

Test bổ sung geometry sau cancel ở peek/half/full, mất capture thật và Mặt bằng. Firefox dùng pointer ID khác Chromium/WebKit nên harness đọc ID thực từ event; không hard-code 1 cho releasePointerCapture. Windows WebKit 26 thực sự không có AudioContext hay biến thể prefixed/OfflineAudioContext, được probe riêng và ghi NOT_VERIFIED_UNSUPPORTED. Không thêm skip vào assertion audio cũ; CI Linux vẫn phải kiểm đầy đủ.

## M3 — Chuẩn bị font và offline trong worktree riêng

Chuẩn bị mã nhẹ trong lúc M1/M2 chạy cổng riêng; không chạy browser/build/benchmark cạnh phép đo GPU. Nghiệm thu và merge vẫn theo thứ tự. Tự host đúng các face đang dùng: Be Vietnam Pro normal300/400/500/600, Lora italic400/500, subset Vietnamese+Latin;12face dùng10woff2,185.248byte tổng, lớn nhất40.772byte. Kiểm SHA256 từ tệp tải; giấy phép OFL giữ cùng font. Không tải nội dung Maps hoặc dữ liệu khu thật. Chưa build/kiểm UI font/PWA/Lighthouse, nên M3 chưa DONE.

### M3 — Kiểm production và tài nguyên offline

PNG icon được rasterize từ SVG tự tạo; ép riêng hai icon thành asset có hash thay vì data URL để manifest có URL thực. Build đầu đã chặn đúng lỗi thiếu icon có hash, build sau đạt với hai shell prerender. QA production đầu bị 404 ở file sinh sau build vì adapter local gọi Nitro trước static assets. Adapter sửa theo thứ tự Static Assets mặc định của Workers; không đổi app để làm test xanh. Sau sửa, ba E2E production thực (offline/allowlist cache, iframe không đăng ký, update có xác nhận và tab khác không reload) đạt. Cấu hình private run_worker_first cần tự phục vụ public ASSETS sau khi chặn endpoint runtime.

Cấu hình reduce của Playwright Test phải đặt trong contextOptions; a11y kiểm media rõ ràng. Không suy Playwright WebKit là Safari thật. Các kiểm này vẫn là bước chuẩn bị trước tích hợp M2, chưa phải cổng head cuối.

### M3 — Giữ nguyên hook build của Cloudflare/Lovable

Bật prerender của TanStack qua wrapper 2.25.3 làm output local không còn wrangler.json và deploy config. Mã wrapper cài compiled hook để tìm thư mục output; preset Cloudflare cũng dùng compiled để sinh các file này. Đây là dấu hiệu xung đột hook cần tránh, không vá hoặc nâng dependency hàng loạt. Bỏ opt-in prerender của app; hậu xử lý dùng chính fetch export đã build để tạo hai HTML shell công khai. Cấu trúc TanStack/Nitro và plugin wrapper giữ nguyên. Script đọc metadata của build mới nhất để hỗ trợ cả .output/public local và dist/client của wrapper Lovable, thay vì hard-code đường dẫn local. Cần kiểm lại build/config/PWA sau thay đổi; chưa coi là đã xác minh Lovable thật.

### M3 — Soak không reload document

Receipt M1 lịch sử dùng navigation đầy đủ mỗi năm vòng; số heap của nó không chứng minh giữ bộ nhớ liên tục trong một document. M3 thêm mode desktop-soak vào harness có sẵn: năm vòng warm-up nhanh, rồi đủ 30 phút đo và ít nhất20vòng đo; bốn viewmode mỗi vòng, route qua link SPA và kiểm performance.timeOrigin không đổi. Không dùng reload để giải phóng leak. Giữ raw mọi mẫu, baseline heap sau warm-up và đo peak/end so với10%; không coi heap/renderer counters là GPU memory.

### M3 — Lỗi a11y đo được

Axe4.14 trênba viewport tìmhai lỗi: chữtrắng trênnútchụpảnh thiếutươngphản, vàtabactive trỏaria-controls tới panelchưatồntạikhi sheetpeek. Chỉ tối màu nềnCTA chụpảnh cùnghue, giữpalette3D; cácpanel luôncócontainerẩnđúngID, chỉmountnộidungkhi activevàđangmở. Khôngmountnộidungkỷniệm riêng trongcáctabẩn. KeyboardtestdùngTab/Shift+Tab thật, khôngsuyfocus-visible từfocus bằngscript.

## M4 — Chuẩn bị runtime riêng trong lúc M1 đo GPU

Chỉ chuẩn bị mã/server contract và runbook trong worktree riêng khi CPU/GPU đang dành cho M1; không chạy build/test/CLI service song song phép đo. Thứ tự nghiệm thu/merge vẫn sau M1–M3; chưa gọi M4 DONE. Bàn giao cho phép đổi thứ tự có lý do: JWT logic độc lập không thay source/browser đang benchmark.

Cùng build mặc định demo. Runtime riêng chỉ trả trạng thái cho phép chọn file cục bộ sau khi xác minh Access JWT bằng WebCrypto RS256, JWKS của team domain đã cấu hình, issuer/audience/thời hạn. Không đưa origin/geometry/package hoặc token vào response/log/store SSR. G1 companion và consent từng lần giữ nguyên. Endpoint private không bao giờ được cache bởi PWA. Khoá ký synthetic chỉ sinh tạm trong unit test như M4 bàn giao cho phép; không tạo credential cho dịch vụ.

Nguồn chuẩn đã đọc: [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). Chưa đăng nhập, cấu hình hay deploy dịch vụ nào.

M4 chọn `jose` 6.2.13 (MIT, phát hành 20/10/2026, không dependency bắc cầu hay install script) cho JOSE parsing, JWK import và JWT signature/claim verification, theo ví dụ Cloudflare. Đây là runtime dependency server-only cần thiết để tránh tự duy trì parser/mật mã JWT. Chỉ wrapper giới hạn kích thước/network/cache và zod runtime contract thuộc app; không import server module vào client. Trước PR phải kiểm tarball, guard 24h, các ca ký thật bằng khoá synthetic và đo bundle client/server; chưa có claim bundle đạt cho tới khi chạy.

M4 trust boundary nhận binding thô và xác thực schema đúng một lần bên trong verifier, nên URL JWKS không thể lấy từ token/caller-supplied issuer. Định cỡ: reach dự kiến chỉ gia đình sau Access (ước lượng, chưa có deployment/người dùng đo); capability của người gửi request có thể sửa header; motive là truy cập trái phép nếu sau này có dữ liệu server; blast radius v1 chỉ flag chọn file, dữ liệu riêng vẫn local. Sàn xác thực vẫn bắt buộc theo bàn giao. Chọn boundary server + thư viện JOSE, không thêm DB/rate-limit/quota hay login machinery. Mở lại đánh giá khi thêm R2 hoặc dữ liệu server. Các chỉ dẫn stack Nuxt/npm/Pages không áp vào dự án TanStack/Bun/Workers này; giữ cấu hình Nitro/Lovable, không đổi nodejs_compat có sẵn để theo một stack khác.

### M4 — Fetch JWKS trên runtime thật

Workerd1.20261019.1 từchối redirect:error ngaytrước fetch; unitNodekhôngpháthiệnkhácbiệtnày. Dùng redirect:manual, giữcheckresponse.okđểtừchối3xxkhôngđitheoLocation; unitthêmcase302. HelloWorkerdđạt; auth-onlyvàbundleđầyđủđangkiểm. ChưacoilàREADY_TO_DEPLOY_NOT_DEPLOYEDkhi fullnativeWorkerchưađạt.

## M5 — Chiều cao từ raster cục bộ, không nhập footprint

Chỉ đọc các GeoTIFF chủ dự án chỉ định trong config local; không tự tìm vùng, tải tile hoặc đăng nhập. Chọn năm lớn nhất trong danh sách đã cung cấp, không fallback năm cũ cho vùng thiếu mẫu. Mẫu hợp lệ nằm trong footprint hiện có và ngoài lỗ, có building_presence đạt ngưỡng explicit (không phải xác suất). Trung vị building_height là tổng chiều cao trên nền đất: trừ roofHeight đã biết, còn mái chưa biết giữ nguyên roofType và ghi inferred. Không gán giá trị 0/âm hoặc dữ liệu ngoài 0–100 m.

Bỏ qua footprint chạm bất kỳ lô nào và vùng vuông bảo thủ bao quanh bán kính tâm explicit; không coi vùng bảo vệ là ranh lô. Giữ nguyên geometry, topology, ID, số tầng và thuộc tính khác. Feature có override, số tầng hoặc height có căn cứ được giữ nguyên. Provenance mới dùng open_buildings, inferred, v1/năm và CC-BY-4.0; world không trở thành verified.

GeoTIFF và chuyển UTM dùng thư viện chuyên dụng geotiff 3.0.5/proj4 2.22.0 trong package pipeline riêng; không thêm vào app/browser. Đang chuẩn bị, chưa cài/kiểm nên NOT_VERIFIED. Chỉ metadata công khai và code notebook được đọc; không tải dữ liệu địa lý. Đoạn thực thi với dữ liệu thật vẫn PARTIAL cho tới khi có đường dẫn và mục đích do chủ dự án đưa.

### M5 — Làm trực tiếp trên canonical và giữ G1

Bổ sung CLI enrich:canonical để không phải dựng lại footprint từ nguồn GIS mới. Chỉ đọc package, companion G1 và config/tile do chủ dự án đưa; kiểm hash byte của package khớp companion trước khi dùng origin. Đầu ra chỉ đổi height/provenance/manifest nguồn qua enrichment; tạo companion mới với cùng origin và hash của đúng byte package mới, không tái dùng companion cũ sau khi package thay đổi. Không ghi đè nguồn hoặc file đầu ra đã có; dữ liệu không synthetic phải nằm ngoài repo/OneDrive. stdout chỉ số tổng hợp, không hash, ID, origin, path hoặc nhãn licence tự do. Đây là mã chuẩn bị, chưa chạy trên dữ liệu thật.

Ngân sách chi tiết procedural dành tối đa 70% instance cho mặt tiền trước, phần còn lại cho cây/cột/dây/đèn để khu nhiều nhà không làm mất toàn bộ đạo cụ phố. Tắt mặc định, chỉ Diorama, group tách và non-pickable; không ghi vào canonical.

### Thứ tự kiểm cuối M3–M5

Tíchhợp phầnmềmM3/M4/M5trongnhánh trước khi đo soak30phút vàma trậnGPUcuối,vìfont/PWA/lớpchi tiếtcùngảnhhưởngruntime. KhônggọiM3DONEkhisoak/Lighthousechưachạy; khônggọiM4READYkhifullWorkerdchưađượcxácminh. CácPRvẫnphảiđủcổngtrướcmerge. M5dữliệuthậtvẫnPARTIALvìchưacóđườngdẫn/quyền; khônglấykếtquảfixturelàmnghiệmthuthựcđịa.

### M4 — Kiểm Workerd Linux trong quality

WindowsWorkerdkhởiđộngđượchello/auth-onlynhưngbundleSSRđầyđủlỗiinternal qua3lượt, nên dừngretryWindows. Thêm kiểmLinuxnative vào qualityhiệnhữu (vẫn4job), dùngWrangler4.151.3/Workerd1.20261019.1đúnglock trongthưmụctoolQAriêng, bỏinstallscript/metrics/credentialenv; chỉdeploy --dry-run, khôngupload. JWT/khoá thửsinhtạm;mọifetchJWKSđượcchặn vàtrảpublickeylocal, khôngtruycậptàikhoản haydomainthật. Đây làgatechưađạt, cầnkếtquảCItrướckhibáoREADY.

### M3–M5 — Sửa phát hiện từ review độc lập

PWA chỉ giữ thế hệ hiện hành và thế hệ đã activate liền trước, nhận diện bằng cache marker rỗng. Cache của lần install thất bại bị xóa sau khi mọi write đã kết thúc; version digest bao gồm cả mã Service Worker. Không thêm dữ liệu ứng dụng, request riêng hoặc metadata người dùng vào cache.

Enrichment dùng ranh lô sau khi áp dụng override để loại trừ nhưng vẫn trả base package và override tách biệt. GeoTIFF với một tie-point có raster offset khác zero được đưa về pixel-zero đúng bằng affine; nhiều tie-point chưa hỗ trợ thì từ chối. Chi tiết minh họa đi theo building parts như renderer, dùng elevation của part hoặc kế thừa parent; không trang trí parent ảo nằm trên các part thấp/không có căn cứ chiều cao.

Đã thêm ca hồi quy cho bốn phát hiện. Pipeline đạt 50 test, chi tiết 3 unit test đạt; production PWA và check tích hợp còn đang chạy tại thời điểm ghi mục này. Không lấy static review làm bằng chứng runtime.

Review tiếp phát hiện hai ca rollback PWA: marker cũ không đổi thứ tự và install lỗi có thể xóa cache thế hệ từng activate. Đã đổi sang xác minh toàn bộ response trong RAM trước khi ghi CacheStorage, giữ cache đã activate khi có lỗi copy, và tạo lại marker hiện hành khi activate. Thêm ca A→B→A→C cùng rollback A thất bại lúc B đang chạy, kiểm hash byte cache A còn nguyên. Chỉ asset public đã khóa hash được giữ trong bộ đệm tạm; không có nội dung riêng.

### Cổng cuối trên bản tích hợp

M1/M2 chưa qua đủ cổng merge nên main vẫn ở M0; PR #9/#10 giữ draft parked, có lý do CI cụ thể. Gom bản ứng viên M3–M5 cùng các sửa M1/M2 vào PR tích hợp để đo font, PWA, runtime riêng và lớp chi tiết trên cùng cây mã. Giữ lịch sử merge, không squash/rebase/force. Chỉ được merge sau review, privacy, local gate và bốn job CI đúng head; phải kiểm lại CI main. Bản phát hành công khai vẫn do chủ dự án Publish sau audit.

Axe WCAG 2.2 ở 740×390 phát hiện nút mở bảng riêng chỉ còn 12,8 px chiều cao bấm được khi half sheet che lên. Bảng riêng đã thu gọn được ẩn hoàn toàn trong lúc mobile sheet mở hoặc đang kéo, và hiện lại khi về peek; bảng riêng đang mở và dữ liệu phiên không bị đổi. Giữ nguyên luật target-size và bổ sung kiểm bàn phím thu sheet rồi truy cập lại nút.

M4: lỗi native full Worker là gốc module của harness, không phải bằng chứng build SSR sai. Miniflare 5 convertV4 mặc định lấy cwd làm modulesRoot; bundle nằm ngoài checkout sinh tên bắt đầu bằng ../, Workerd từ chối. Đặt modulesRoot=dirname(bundle); giữ nguyên Wrangler/Lovable build. Fresh dry-run + native Windows đầy đủ đã đạt, Linux cần head CI mới.

Axe CI Firefox không có WebGL2 nên nút âm thanh được disable đúng thiết kế. Test keyboard cũ giả định nút luôn focusable. Giữ nguyên kiểm focus âm thanh khi scene ready; fallback phải chứng minh nút disabled và không focus, đồng thời nút chọn VI luôn qua Tab/ShiftTab/focus-visible. Thêm ca forced fallback để Windows cũng chạy nhánh này; không đổi guard H6, timeout hoặc khả năng của app.

Probe bàn phím universal dùng nút chọn ngôn ngữ (form control), vì WebKit có thiết lập Tab mặc định bỏ qua link; kiểm focus link rồi ShiftTab không phải phép chứng minh form-control keyboard ổn định trên các browser. Giữ nguyên assert focus/focus-visible và kiểm âm thanh khi ready, không bật chức năng âm thanh bị disable ở fallback.

Soak được chốt trước khi chạy: warm6 vòng để baseline quiescent có cùng trạng thái AudioContext đã tạo như cuối phép đo, sau khi vòng5 đã luyện SPA remount. Không chọn baseline theo số heap thu được. Phải có gc được expose thực, đo đủ30phút sau warmup, báo cả tăng heap cuối và cực đại của các mẫu sau GC. Kết quả GPU phát triển và các probe production khác phương pháp được giữ riêng; không chuyển diagnostic thành pass ngân sách.

Quét build production phát hiện /.vite/manifest.json trả200 và chứa đường dẫn build tuyệt đối. Đây là manifest nội bộ phục vụ bundle checker, không phải manifest PWA. Sau build chuyển nó sang output server (client-manifest.json), cập nhật checker đọc đúng đầu vào private và thêm test public URL phải404. Không đổi chunk hoặc bỏ size-limit; vẫn dùng nguyên graph của Vite để tính vỏ lazy engine.

### M1/H6 — Bỏ backdrop blur của panel kính (Notion AI tạm tiếp quản, 31/10/2026)

CI `40836100757` ở `4e5136f`: WebKit 121 ca chức năng đạt, H6 86.957 ms >70.000 ms; ba PR liên tiếp đều 86–89 s trên runner EPYC 7763, baseline cùng runner cũng vậy. Chẩn đoán Linux WebKit 26.0, Playwright Desktop Safari (DPR 2), không GPU, fixture tổng hợp, spec giữ nguyên: mỗi lần chọn chế độ main thread chỉ bận ~140–190 ms, còn ~1 s là Playwright chờ phần tử "stable" vì rAF chỉ chạy 3–4 lần/1,5 s; nghẽn ở compositor. Tắt riêng từng yếu tố bằng CSS inject (chỉ chẩn đoán): bỏ blur −31%, bỏ transition −20%, bỏ box-shadow −9%, ẩn canvas −4%.

Quyết định: bỏ `backdrop-filter: blur(18px) saturate(1.3)` ở utility `glass` và `backdrop-blur` của bảng riêng (nền đã 95% đục); tăng alpha `--glass` 0,72→0,8 để giữ độ đọc chữ trên cảnh. Giữ transition 180 ms (PLAN: motion 150–250 ms), shadow, bố cục, copy và hành vi. ABBA cũ trên GPU thật (Chrome/Intel, DPR 1) không thấy khác biệt FPS nhất quán, nên lần này không tuyên bố lợi ích FPS; lý do duy nhất là chi phí compositor của WebKit khi không có GPU. Không đổi test, ngưỡng 70.000 ms/+10%, timeout 90 s, assertion hay capability guard.

ABBA mã thật `9b12c1d`↔`d4fca77`, cùng máy/harness, 6+6 lượt sau warm-up: vòng chẩn đoán 3 chu kỳ trung bình 25.358→16.894 ms (−33,4%), hai khoảng không chồng nhau (24.521–26.355 so với 16.677–17.289 ms). Spec H6 nguyên vẹn trên máy này vẫn timeout 90 s ở cả hai head (máy chậm hơn runner ~1,9 lần), nhưng trong 90 s hoàn thành 10→14 chu kỳ (chu kỳ ổn định 8,3→6,1 s, −26%). Ước lượng CI ~58–66 s chỉ là phép chiếu, NOT_VERIFIED tới khi có CI đúng head mới. Nếu vẫn ≥70 s thì ghi NOT_MET theo §7.4, không nới cổng; phương án cổng chuẩn hoá theo baseline cùng runner do chủ dự án quyết. Ảnh so sánh 1280×720 DPR 2 đã xem: khác biệt nhỏ ở vùng panel đè cảnh. PLAN cập nhật dòng STYLE.

### Sửa phương pháp sau review độc lập ở `a4f0121` (Notion AI, 01/11/2026)

Không đổi ngưỡng, timeout hay hành vi app.

- Soak liên tục đếm `modeChanges`, `audioCycles` và `verifiedPackageTransitions` từ trạng thái quan sát được, không nhân từ số vòng. World: mode/revision của scene khớp sau mỗi lần mở gói và trả fixture. Chế độ: ngoài `aria-checked`, scene host phải báo đúng camera hoặc POV (`OrthographicCamera`, `walk`, `ride`, rồi `PerspectiveCamera` + `none`). Âm thanh: sau khi tắt, context không còn running và còn 0 voice. Thiếu quan sát nào thì dừng phép đo, không đếm.
- `build-pwa` chạy lại được trên cùng output. Khối header PWA chỉ nối một lần. Shell SSR render lại không trùng byte (script stream đổi mỗi lần), nên shell có hash của lần chạy trước bị xoá trước khi ghi shell mới; public chỉ còn đúng hai shell có hash mà `sw.js` tham chiếu. Hai tệp nguồn không hash `offline-home.html` và `offline-about.html` vẫn nằm trong public: cùng nội dung shell công khai đã qua kiểm sentinel riêng tư, service worker không dùng; PR #14 bỏ chúng (mục sau review delta PR #13 bên dưới). Manifest Vite đã chuyển thì bỏ qua, thiếu ở cả hai nơi thì dừng. Thư mục `.vite` rỗng bị xoá khỏi public; nếu còn tệp nội bộ khác thì dừng build thay vì phát hành. Kiểm này từng chạy sau khi đã ghi shell, manifest, `sw.js` và `_headers`, nên khi dừng sẽ để lại output dở dang; PR #14 chuyển kiểm lên đầu script. `public/.assetsignore` loại `.vite` khi deploy bằng Wrangler, kể cả khi chỉ chạy `vite build`. Build của Lovable vẫn NOT_VERIFIED.
- 4G warm trong gói Codex 30/10 hạ xuống NOT_VERIFIED. Harness chỉ throttle CDP session của trang, còn ở lượt warm navigation đi qua service worker (network-first), nên request mạng do worker gửi không bị throttle. Navigation 24.865 byte xong trong ≤ 40,7 ms, không thể có nếu chịu độ trễ 150 ms. Lượt cold không có request nào qua worker nên giữ kết luận. Cách sửa đúng là throttle cả target service worker hoặc dùng proxy giới hạn băng thông; chưa làm trong PR này.

### M3 — Khởi động cảnh: shader song song, biến thể theo lát, thao tác sau mọi biến thể (Notion AI, 01/11/2026)

Lighthouse trên máy NVIDIA ở main `5e6aec5`: desktop 79, mobile 44. Profile chẩn đoán (không lưu raw) thấy task dài nhất gồm lần render đầu chờ link shader đồng bộ và lượt biên dịch 18 biến thể khí quyển trong cùng task.

Quyết định (PR #13): dựng cảnh, gửi biên dịch chương trình của trạng thái đang hiển thị, rồi chạy chuỗi khởi động trong `src/engine/startupSequence.ts` (module không phụ thuộc WebGL, test được từng nhánh): chờ chương trình link xong, vẽ khung đầu, biên dịch mỗi task một biến thể thời tiết/lễ hội/đêm, chờ các chương trình đó, rồi mới mở thao tác. Mỗi lần chờ hỏi `KHR_parallel_shader_compile` 10 ms một lần, tối đa 10 s; quá hạn hoặc lỗi khi hỏi thì đi tiếp và chương trình link khi dùng lần đầu. Splash và điều khiển chờ `ready` báo `interactive`, theo AGENTS.md (shader cho mọi trạng thái trước khi cho thao tác). Không có extension thì không có trạng thái để hỏi: như main, chương trình link khi dùng lần đầu, và thao tác vẫn chỉ mở sau khi đã gửi biên dịch đủ biến thể.

- Dispose hoặc mất context trong lúc khởi động: `ready` báo `stopped`, viewport không báo sẵn sàng, bỏ splash và hiện phục hồi hoặc Thử lại. Một bước ném lỗi thì `ready` reject và viewport hiện fallback. Lượt khởi động sau phục hồi hoặc Thử lại lại có splash che tới khi `interactive` (PR #14).
- Không vẽ trước khung đầu, kể cả nhánh lỗi gói riêng; chụp bưu thiếp trước khung đầu trả `CAPTURE_UNAVAILABLE`. Đổi world giữ một lượt biên dịch đồng bộ để thao tác không gặp biến thể chưa biên dịch.
- Buffer hình học vẫn upload ở lần đầu một camera vẽ object. Main từng upload thêm vài geometry lúc khởi động nhờ một lượt vẽ trong `mountWorld` trước khi áp hiển thị lớp (khung không được hiển thị); cổng khung đầu bỏ lượt vẽ đó. Không thêm lượt vẽ Mặt bằng riêng lúc khởi động: lần chuyển đầu tiên chỉ tạo 4 buffer và không tạo chương trình nào (chẩn đoán bằng spec debug tạm, không lưu raw).
- Đánh đổi: splash giữ thêm từ khung đầu tới khi biến thể xong, 125–280 ms (trung vị 141 ms) trên Chrome GPU thật không throttle, đo bằng script tạm; đo lại bằng `scripts/startup-timing.mjs` ở `252f5e7`: 127–277 ms (trung vị 133 ms). Cả hai lượt không có long task sau khung đầu. Không hoãn tải cảnh tới sau FCP chỉ để tăng điểm. Ngưỡng 90/95 giữ nguyên: desktop `MET`, mobile `NOT_MET`; số đo và raw ở [evidence 01/11](assets/qa/codex/m3/real-gpu-2026-11-01/README.md).

### M3 — Sau review delta PR #13 (Notion AI, 02/11/2026)

PR #14. Không đổi ngưỡng, timeout hay thứ tự khởi động lần đầu.

- Splash che cả lượt khởi động sau phục hồi hoặc Thử lại (review mục R-N2). Trước đây splash đã ẩn hẳn thì không hiện lại, nên ở lượt khởi động mới dock và canvas nhận thao tác trước khi biến thể biên dịch xong. Chọn hiện lại splash khi tiến độ về dưới 1 thay vì khoá từng điều khiển: một chỗ sửa, cùng cơ chế với lần tải đầu, không phải giữ danh sách điều khiển. Unit test và e2e (Chromium, Firefox, WebKit) kiểm phần tử nhận điểm chạm ở tâm canvas và ở nút giờ trên dock: là splash khi đang tải lần đầu, sau phục hồi và sau Thử lại; là chính nó sau `ready`. Bỏ bản sửa thì cả hai test fail ở bước sau Thử lại. Splash không giữ focus nên Tab có thể tới dock/canvas phía sau lúc tải, có từ lần tải đầu; ghi P3 trong BACKLOG, không sửa ở PR này (sửa sau PR #15 bằng `inert`, mục dưới).
- Máy không có `KHR_parallel_shader_compile` (review mục R-N3): e2e chặn extension và ghi mọi lần đổi trạng thái scene; lần đầu báo `ready` đã đủ n/n biến thể, mọi lúc còn tải đều có splash.
- Rò scene khi điều hướng SPA, nguồn của +1 node DOM mỗi lượt trong [soak 31/10](assets/qa/codex/m3/real-gpu-2026-10-31/README.md). Three.js dùng chung một `BufferGeometry` cho mọi `Sprite`; nhãn không đưa geometry đó vào danh sách dispose, nên mỗi renderer đã vẽ nhãn để lại listener `dispose` trên geometry dùng chung, giữ renderer, context WebGL2 và canvas đã gỡ. Sửa: thêm geometry dùng chung vào danh sách dispose của scene, một lần; `dispose()` chỉ báo renderer giải phóng buffer, geometry vẫn dùng lại được. Probe heap trên build production, Chromium, 3 lượt Giới thiệu ↔ Về phố giữa hai snapshot: trước sửa node DOM 480 → 483, node tách 17 → 20, canvas tách 3 → 6; sau sửa 477 → 477, 14 → 14, không loại node tách nào tăng. Unit test và e2e Chromium mới (đếm canvas engine đã tách sau GC qua CDP) fail khi bỏ bản sửa; e2e đếm được 4 canvas sau 4 lượt.
- `build-pwa` kiểm `.vite` (chỉ cho phép manifest Vite) và chuyển manifest sang `client-manifest.json` cạnh entry server trước khi ghi shell. Kiểm icon bắt buộc và đọc template lúc đó vẫn chạy sau khi đã ghi shell (review PR #14 mục F2); sửa ở mục sau PR #15. Shell render vào bộ nhớ, qua kiểm sentinel rồi mới ghi; chỉ ghi hai shell có hash, xoá shell không hash và shell cũ. Kiểm âm: tệp lạ trong `.vite` hoặc thiếu manifest thì dừng, output không đổi; chạy lại trên cùng output vẫn OK. E2e PWA kiểm `/offline-home.html` và `/offline-about.html` trả 404.
- Test chi tiết minh hoạ ngoài việc số geometry bằng nhau qua 3 vòng còn kiểm số đó lớn hơn lúc chưa bật chi tiết (review mục R-N4). Evidence 01/11 dùng một cơ sở cho task main thread, ghi rõ long task là mô phỏng Lantern (review mục R-N1).

### M3 — Đo 4G warm, khởi động và provenance benchmark (Notion AI, 02/11/2026)

PR đo M3 (`codex/m3-measurements`). Không đổi ngưỡng; mã app không đổi, chỉ script đo.

- 4G warm: throttle cả service worker. CDP session của trang không áp điều kiện mạng lên service worker, mà navigation warm đi qua worker (network-first), nên lượt 30/10 không chịu throttle. Script mở thêm một client CDP qua cổng debug loopback trống, bật `Target.setAutoAttach` (`waitForDebuggerOnStart`, `flatten`, chỉ nhận service worker), áp cùng `Network.emulateNetworkConditions` rồi mới cho worker chạy. Chọn cách này thay proxy giới hạn băng thông vì dùng cùng cơ chế throttle của Chrome đang áp cho trang và không thêm tiến trình mạng; chưa so với proxy.
- Một mẫu chỉ được tính khi navigation (fetchStart → responseEnd) mất ít nhất độ trễ mô phỏng; lượt warm còn cần mọi context có worker đã throttle (đếm tổng; sau PR #15 đổi sang kiểm theo từng context, mục dưới). Thiếu một trong hai thì kết luận là `NOT_VERIFIED`; lỗi khi áp throttle làm script dừng với lỗi. Đột biến bỏ throttle worker (ở `c670e9c`, script tạm, không lưu raw): navigation warm 6,3–8,3 ms, kết luận warm `NOT_VERIFIED`.
- Driver do browser báo: `SystemInfo.getInfo` qua CDP của browser liệt kê GPU kèm version driver. Chọn GPU có device ID nằm trong renderer WebGL không che, để GPU thứ hai không cho mượn driver; không khớp device ID thì chỉ nhận theo hãng khi hãng đó có đúng một version driver (Chrome có thể liệt kê một adapter hai lần; sau PR #15 chỉ khi renderer không có device ID, mục dưới). Firefox không có API này: dùng `BENCH_GPU_DRIVER` do người chạy gán, ghi `driverSource: OPERATOR_ENV`; không có cả hai thì `NOT_VERIFIED`; headless ghi `SOFTWARE_OR_HEADLESS`. `scripts/lighthouse-local.mjs` và e2e H6 hardware chưa chuyển, ghi ở BACKLOG.
- `harnessTreeClean` ghi `git status --porcelain` rỗng lúc chạy, vì SHA harness không nói gì về tệp đã sửa mà chưa commit. Số đo dùng làm bằng chứng cần cờ này là `true`.
- Script đo khởi động commit thành `scripts/startup-timing.mjs` (review delta PR #13 mục R-N5): cùng mốc và cách mở trang với script tạm 01/11; chạy qua `launchBenchmark` nên có kiểm GPU thật, SHA build và provenance như các harness khác.

### M3 — Sau review PR #14 và PR #15 (Notion AI, 02/11/2026)

PR `codex/m3-followups-2`. Không đổi ngưỡng, timeout hay thứ tự khởi động.

- Bàn phím lúc splash che: `<main>` có thuộc tính `inert` khi tiến độ khởi động < 1; splash nằm ngoài `main`. Chọn `inert` thay vì disable từng điều khiển hoặc giữ focus trong splash: một chỗ, cùng điều kiện với splash, và trình duyệt tự bỏ phần tử inert khỏi thứ tự Tab, điểm chạm và cây trợ năng. Splash vẫn được đọc vì nằm ngoài vùng inert. Áp cho mọi lượt khởi động: lần đầu, sau phục hồi, sau Thử lại và khi scene đã tương tác rồi mất context.
- `build-pwa`: mọi kiểm và mọi giá trị suy từ input (kiểm `.vite`, icon bắt buộc, template, tên và bản ghi shell) chạy trước bất kỳ thao tác ghi, đổi tên hay xoá nào; việc dời `.vite/manifest.json` sang `client-manifest.json` cạnh entry server và xoá `.vite` chỉ diễn ra ở đầu pha ghi. Dừng ở bất kỳ kiểm nào cũng giữ nguyên output của bước build (kể cả `.vite`).
- Kết luận 4G theo từng mẫu (`scripts/load-verdict.mjs`): mẫu phải chịu độ trễ mô phỏng; mẫu warm còn cần worker của chính context đã throttle (so `browserContextId` của trang và của worker); có lỗi gắn hoặc throttle worker thì mọi kết luận là `NOT_VERIFIED`. Thay cách đếm tổng vì worker khởi động lại ở một context có thể bù cho context khác chưa có worker.
- Driver GPU: renderer có device ID mà không khớp GPU nào thì không lấy driver theo hãng (dùng `BENCH_GPU_DRIVER` hoặc `NOT_VERIFIED`); ghi `driverMatch` để phân biệt driver khớp device ID với driver suy theo hãng.
- Trung vị khởi động không bỏ giá trị: lượt nào thiếu một mốc thì script dừng (`STARTUP_MARKS_MISSING`) thay vì tính trung vị trên ít lượt hơn.
- Crash WebKit ở bài H6 20 vòng (Q2 đã đóng 09/11/2026, chủ dự án chốt phương án (a)): phân loại lỗi trong trình duyệt dựa trên core dump SIGABRT của process mạng WebKit; không nới ngưỡng, không retry trong test, không bỏ bài. Từ nay tới lúc đóng băng: (a) Bằng chứng bắt buộc để coi là lỗi hạ tầng trình duyệt: trace Playwright của bài fail phải có chữ "Network process crashed" hoặc "WebKit encountered an internal error" ngay sau `setInputFiles` ở bước mở gói; không có trace hoặc không có chữ crash thì coi là lỗi thật (log CI chỉ có assertion timeout, không phân biệt được với lỗi app); (b) Tối đa 1 rerun cho mỗi head (SHA) theo §5.1 có ghi lý do; rerun đỏ thì giữ đỏ, cần head mới; (c) Áp dụng cho cả PR lẫn push `main` theo quyết định của chủ dự án (reviewer PR #16 đề nghị không rerun ở `main`, nhưng quyết định của chủ dự án thắng vì đẩy thêm một commit tài liệu chỉ để có run mới là rerun đi đường vòng; không đẩy commit rỗng hay commit vô nghĩa chỉ để có run mới); (d) Ghi bảng đếm dồn mọi lần xuất hiện trong [BACKLOG.md](BACKLOG.md). CI xanh không được coi là đã sửa. Hướng sửa gốc (Playwright/WebKit mới hơn, báo lỗi WebKit) để PR riêng.
- Pin runner CI sang `ubuntu-24.04` (T13, 09/11/2026): ở CI run `42520453329` (head `15ab951`), GitHub Actions đã chuyển nhãn `ubuntu-latest` từ Ubuntu 24.04.5 sang Ubuntu 26.04.1 (`ubuntu26.04-x64`). Playwright 1.58.2 (đang khoá trong `bun.lock`) dừng ngay ở bước `playwright install --with-deps` trên cả ba job trình duyệt với lỗi `Playwright does not support chromium/firefox/webkit on ubuntu26.04-x64`, trong khi job `quality` vẫn đạt. Theo quy tắc dự án không nâng dependency hàng loạt, chọn pin tường minh `runs-on: ubuntu-24.04` cho cả 4 job trong `.github/workflows/ci.yml` để giữ đúng môi trường runner Ubuntu 24.04 LTS mà toàn bộ baseline và các PR trước đã dùng.

### M4 — Chốt runbook, kiểm compatibility của Worker riêng và tự động hoá checklist §10 (09/11/2026)

PR `codex/m4-runbook`. Không đăng nhập dịch vụ, không deploy; trạng thái chốt `READY_TO_DEPLOY_NOT_DEPLOYED` (`M4 DONE`).

- Smoke Workerd cục bộ (`scripts/private-workerd-smoke.mjs`, cũng chạy trong job `quality` trên CI) đọc `compatibility_date` và `compatibility_flags` trực tiếp từ `wrangler.private.jsonc` bằng `JSON.parse`, thay vì hard-code ngày riêng trong harness. Nhờ đó cấu hình chạy thử khớp cấu hình sẽ deploy; file `wrangler.private.jsonc` được giữ là JSON thuần không comment, và script dừng ngay nếu ngày không phải ngày lịch hợp lệ, cờ không hợp lệ hoặc `compatibility_date` mới hơn ngày mà bản `workerd` cục bộ hỗ trợ.
- Tự động hoá các mục kiểm được trong repo của checklist riêng tư §10 (`src/test/private-checklist.test.ts`): khoá chính xác tập khoá được duyệt của `wrangler.private.jsonc` (chặn vô tình thêm account ID, route/domain thật, secret, R2 hay logging), khoá `public/robots.txt` (`Disallow: /`), và xác minh `scripts/private-deploy.mjs` từ chối `--deploy` khi có `CI` cũng như từ chối mọi tham số lạ mà không cần truyền đường dẫn CLI hay credential vào tiến trình con.
- Runbook `docs/PRIVATE_DEPLOY_RUNBOOK.md` bổ sung hướng dẫn chạy smoke production tuỳ chọn trên loopback (`scripts/private-production-smoke.ts`), quy định analytics không cookie mặc định Tắt (không chèn beacon ngoài, không bật Workers Logs/Logpush khi chưa rà header JWT), và bảng kiểm 10 mục đối chiếu §10 giữa phần kiểm tự động trong CI với thao tác sau audit của chủ dự án. Đạt tiêu chí "Xong khi" của M4 trong `CODEX_HANDOFF.md`.

### M4 — Phân loại CI PR #17 và quyết định T14 (09/11/2026)

Run CI `pull_request` `42532756267` trên head `ab0b168` đỏ 3/4: `quality`, `e2e-full-chromium`, `e2e-full-firefox` đạt; `e2e-full-webkit` có 124 passed / 1 skipped, `H6_DURATION {"status":"passed","durationMs":64897,"limitMs":70000,"enforced":true}`, nhưng `H6BudgetReporter` dừng job vì baseline cùng runner `de71732` bị kiểm duyệt: `H6_BASELINE {"cpuModel":"AMD EPYC 7763 64-Core Processor","status":"timedOut","durationMs":92395}` (Playwright `timeout: 90000` trong `playwright.config.ts`), nên `H6_COMPARISON.changePct` là `null`. Không có bài test nào fail, không có assertion timeout, trace không có chữ `Network process crashed` hay `WebKit encountered an internal error`.

**T14 (Hermes tự quyết, 09/11/2026).** Phân loại đây là **phép đo baseline cùng runner bị kiểm duyệt trên runner chậm**, không phải crash process mạng WebKit (Q2) và không phải hồi quy app. Lý do: Q2(a) chỉ áp cho "trace Playwright của bài fail", mà ở đây không có bài fail; baseline `de71732` có từ trước bản sửa `d4fca77` bỏ `backdrop-filter: blur` (CODEX_LOG 31/10) nên chậm hơn head hiện tại (**suy luận**, không đo lại trên app); số H6 của head hiện tại đạt ngân sách tuyệt đối. Chọn phương án an toàn nhất theo bằng chứng:

- Không dùng `gh run rerun`: không có dấu crash, Q2(b) và §5.1 không cho phép.
- Không đẩy commit rỗng hay commit tài liệu vô nghĩa để có run mới (T12, F3(e)).
- Không nới ngưỡng 70.000 ms/+10 %, không đổi `timeout: 90000`, không tắt/skip/retry test, không sửa `H6BudgetReporter` hay `scripts/h6-ci-baseline.mjs`.
- Chạy đúng **một** `workflow_dispatch` độc lập trên cùng head `ab0b168`: §5.2 chấp nhận "CI 4/4 … (PR-event hoặc dispatch)" làm bằng chứng cổng merge, §5.1 liệt kê `workflow_dispatch` là cách chạy CI, và đây là lần dispatch đầu tiên trên head này nên không phải "dispatch lặp cho cùng head" (§5.6). Run `42539034661` đạt 4/4: WebKit `H6_BASELINE status: passed, durationMs: 70.724` trên `AMD EPYC 9V74 80-Core Processor`, `H6_DURATION status: passed, durationMs: 54.642`, `H6_COMPARISON changePct: -22,74 %` (ngưỡng +10 %), 124 passed / 1 skipped. Nếu run dispatch cũng đỏ thì không dispatch lại, ghi `NOT_MET` kèm số và chuyển mục khác.
- Ghi cả hai run vào thân PR #17, comment phân loại, biên nhận merge và các tài liệu dưới đây.

Ranh giới: T14 không đổi chính sách Q2. Một bài H6 fail vẫn cần trace crash để được coi là lỗi hạ tầng trình duyệt; một run đỏ không có bài fail nào và chỉ thiếu phép đo baseline được xử lý theo T14. CI xanh không được coi là đã sửa crash WebKit.

### M2 — P8/P9 lần đo 1 bằng harness nhịp kéo đồng hồ đơn điệu (09/11/2026)

PR `codex/m2-controls-attribution`, head harness `1423f104e1ea2bcfc19db4b64c15fbbf944a0dec`. Chỉ đổi `scripts/controls-benchmark.mjs`, không đổi app, không đổi ngưỡng (P8: thao tác < 100 ms, khoảng kéo ≤ 50 ms; P9: < 100 ms), timeout, retry hay assertion. Bằng chứng: [real-gpu-2026-11-09/README.md](assets/qa/codex/m2/real-gpu-2026-11-09/README.md).

- Thay `page.waitForTimeout(16)` bằng `pause(16)` quay trên đồng hồ đơn điệu (`performance.now()` + `setImmediate`) cho 48 bước kéo; thêm observer long-animation-frame (bỏ origin script), timestamp `pointermove`, `endFrames` chờ 2 rAF bất đồng bộ, đếm `longFrames` cho từng thao tác, và các trường raw `dragPacing` / `longFramesSupported`. Quy tắc `status` không đổi. Lý do: chẩn đoán gói bàn giao đo timer Node 16 ms bắn p50 30,70 ms trên máy này, còn vòng quay đơn điệu đạt p50 16,006 ms; các khoảng vượt ngưỡng của bằng chứng cũ `a4f0121` chủ yếu phản ánh nhịp input của harness, không phải thời gian thực thi GPU (**suy luận**, không đo lại trên app).
- Giữ nguyên chủ trương T8: patch chưa từng đo, nên đây vẫn là **lần đo 1** theo §5.6. Một `workflow_dispatch` hay một lượt CI không được tính thành lần đo lại. Lần 2–3 chỉ khi `NOT_MET` và có quy nguyên nhân phía app.
- Kết quả GPU thật (Chrome 157.0.8103.38, GTX 1660 Ti, driver 32.0.16.1074, DPR 1, `harnessTreeClean: true`, `errors: []`): P8 `MET` 30 vòng — 420/420 thao tác < 100 ms, max 45,9 ms; 1.380/1.380 khoảng kéo ≤ 50 ms, p50 27,6 ms, max 42,1 ms; 0 khung dài, 0 link chương trình mới. P9 `MET` 30 vòng — 60/60 mẫu < 100 ms; `cold-sound-on` p50 51,7 ms / p95 72,3 ms / max 72,7 ms; `warm-sound-on` p50 34,05 ms / p95 46 ms / max 51 ms; 2 `longFrames` ở cold chỉ dùng để quy nguyên nhân. So với `a4f0121` (P8 4/1.380 khoảng > 50 ms, P9 1/30 warm 107,5 ms), số liệu mới nhất quán với chẩn đoán nhịp timer (**suy luận**).
- Giới hạn: **không xác nhận toàn vòng đời P8**; không đo mẫu âm thanh nghe được đầu tiên, không đo bộ nhớ GPU vật lý, không khẳng định hết crash WebKit. Bộ nhớ GPU cho Firefox là việc riêng (HANDOFF mục 6). CI xanh không thay đo GPU thật, skip không phải pass.

### M2 — Rerun Q2, rà lại tiêu chí review PR #18 (T15, T16, N4, N5 — 09/11/2026)

- **T15 / N4 (Q2 rerun trên PR #18, head `3fd2a00`).** Run `pull_request` `42546213836` lần 1 đỏ 3/4: `e2e-full-webkit` có 123 passed / 1 skipped / 1 failed ở bài H6 20 vòng (`tests/e2e/h6-completion.spec.ts:138`, bước `openPackage`), baseline cùng runner `de71732` đạt 60.894 ms, `H6_COMPARISON.changePct -27,32 %`. Trace Playwright của bài fail có `WebKit encountered an internal error`, `WebSocket network error: Network process crashed.` và `[vite] server connection lost` ngay sau `setInputFiles` — đúng điều kiện Q2(a) (khác T14 vì ở đây có bài test thật sự fail). Áp đúng 1 rerun `gh run rerun 42546213836 --failed` theo Q2(b): lần 2 đạt 4/4 (WebKit 124 passed / 1 skipped, `H6_DURATION` 58.921 ms < 70.000 ms, baseline 71.737 ms, `changePct -17,87 %`). Không đẩy commit tài liệu rỗng trên `3fd2a00` chỉ để ghi bảng đếm dồn (T12, F3(e), Q2(c)), nên dòng đếm dồn và hai mục quyết định T15/T16 được ghi ở PR nội dung này (`codex/m2-gpu-adapter`).
- **T16 / N5 (rà lại tiêu chí review độc lập khi lỗi nằm ở đề bài review, không nằm ở artifact).** Lượt review độc lập #1 trên `9f0639e..3fd2a00` trả `MERGE_BLOCKED` riêng ở C1 vì đề bài review viết nhầm rằng `BENCH_SOURCE_SHA` phải bằng hash script `a28194b9...`, gộp chung hai họ định danh khác nhau (C2–C6 đều PASS, CI lần 2 đã kiểm 4/4). Trong mã thực tế, `BENCH_SOURCE_SHA` / `VITE_BUILD_SHA` là SHA build trên HUD (`1423f104...`), được `scripts/benchmark-browser.mjs:62-67` đọc từ `build-info` trên trang đang chạy và ghi thành `environment.sourceSha`, còn `scriptSha256` (`a28194b9...`) là SHA-256 runtime của `scripts/controls-benchmark.mjs`. Khi lỗi nằm ở câu chữ đề bài review chứ không ở mã hay dữ liệu, phát lại 1 phiên review độc lập chỉ đọc với tiêu chí C1 đã sửa trên **cùng head không đổi** `3fd2a00` (không sửa file, không thêm commit, không chạy lại CI, không đo lại); phiên #2 xác nhận `VERDICT: MERGE_OK`. Ghi kèm lưu ý N5: Bun hệ thống 1.3.14 dừng ở `pipeline/bun.lock` (`lockfileVersion: 2`, đã có nguyên trạng ở base `9f0639e`), trong khi bản Bun 1.4.3 pin đúng theo README/CI chạy sạch toàn bộ cổng `bun run check`.

### M3 — Công cụ bộ nhớ GPU cấp adapter cho Firefox và chốt vạch đích M1–M3 (T17, T18 — 09/11/2026)

PR `codex/m2-gpu-adapter`, head harness `c53bddc9c338f5945e61f03809bb6902e8491d72`. Chỉ sửa `scripts/windows-gpu-memory.ps1` và `scripts/desktop-benchmark.mjs`, không đổi mã ứng dụng, không đổi ngân sách `350.000.000` byte hay bất kỳ ngưỡng/timeout/retry/skip/assertion nào. Bằng chứng: [gpu-adapter-2026-11-09/README.md](assets/qa/codex/m3/gpu-adapter-2026-11-09/README.md).

- **T17 (đo bộ nhớ GPU cấp adapter có baseline trước trình duyệt).** Trên Windows 11 + GTX 1660 Ti (6.144 MiB), counter WDDM theo tiến trình (`GPUProcessMemory`) cộng cho cây Firefox trôi lên 22,94–23,17 GB nên không dùng làm căn cứ nghiệm thu được. Bổ sung chế độ `-Mode baseline` chạy trước `launchBenchmark` để chụp `GPUAdapterMemory DedicatedUsage` (đỉnh giữa các LUID) và `nvidia-smi memory.used` khi trình duyệt đo chưa mở; chế độ `-Mode sample` ghi mỗi giây cả per-process, adapter và `nvidia-smi`, gắn `perProcessReliable: false` khi tổng per-process vượt `1,05 ×` tổng adapter, và kiểm chéo `adapterMatchesNvidia`. Đại lượng xét ngân sách là `adapterUpperBoundBytes = max(0, adapterPeakBytes - adapterBaselineBytes)` — cận trên cấp adapter gồm cả mọi tiến trình nền dùng GPU. Quy tắc bảo thủ: `midBudgetStatus = "MET"` **chỉ khi** `adapterUpperBoundBytes ≤ 350.000.000`; nếu vượt thì ghi **`NOT_VERIFIED`** thay vì `NOT_MET`, vì cận trên không tách được phần của tiến trình khác khỏi phần của ứng dụng.
  - Hiệu chuẩn Chrome `157.0.8103.38`: delta adapter `157.523.968` B (150,23 MiB) khớp `nvidia-smi` `+150` MiB (`adapterMatchesNvidia: true`), cùng bậc với đỉnh per-process `190.656.512` B (`perProcessReliable: true`) → `midBudgetStatus: MET`, cả 4 kịch bản đạt hình học/khung/FPS.
  - Firefox `146.0.1` (lần đo 1/3 theo §5.6): per-process lại trôi lên `22.944.378.880` B (`perProcessReliable: false`), trong khi adapter và `nvidia-smi` giữ phẳng ở `+300` đến `+344` MiB (`adapterMatchesNvidia: true`). Đỉnh cận trên `361.734.144` B (vượt ngưỡng 350 MB đúng `11.734.144` B, tức `+3,35 %`, chỉ ở mẫu #6/#8/#9 rồi giữ ở 310,2–334,3 MB tới cuối bài) → xếp **`NOT_VERIFIED`** theo quy tắc bảo thủ. Không đo lặp lần 2–3 vì phần chênh 11,73 MB nằm trong nhiễu tiến trình nền của cả adapter (**suy luận** về nhiễu nền; con số `361.734.144` B là số đo trực tiếp) và Firefox không có API chuẩn báo VRAM riêng từng context WebGL.
- **T18 (chốt trạng thái M1–M3 sang `DONE` theo §7 mục 1–4, giữ nguyên mọi nhãn giới hạn mức hạng mục).** `CODEX_HANDOFF.md` §4 chỉ viết mục "Xong khi" riêng cho M0 và M4; với M1–M3, `HANDOFF.md` mục 7 quy định chốt `DONE` khi toàn bộ hạng mục phần mềm trong §4 đã vào `main`, cổng CI 4/4 và cổng local đạt, và mọi ngân sách/thiết bị còn lại đã có số đo thật kèm nhãn trung thực (`MET`, `NOT_MET`, `NOT_VERIFIED`, `BLOCKED`, `NOT_DONE`) theo §7 mục 2 & 4:
  - **M1 `DONE`:** K1 đạt `H_MET_REAL_GPU` trên cả máy Intel UHD cũ (`59f6`) và NVIDIA GTX 1660 Ti (`fba1e09`, ma trận đầy đủ 60+60 mẫu A/B), H của P10 đã khép theo §4 M1, đối chứng SwiftShader giữ nhãn `H_BLOCKED`, diagnostic 0↔1 giữ nhãn theo dõi; K2 (đường kính tối thiểu, vùng chạm 44 CSS px, ưu tiên gần điểm chạm, InstancedMesh theo tier) và K3 (khoảng cách tỷ lệ cỡ chữ trên 4K/2K/1080p × VI/EN, R1 màu < 15 %) đã vào `main` và có test/ảnh kiểm chứng; H6 WebKit CI đạt `< 70.000` ms và `≤ +10 %` trên mọi `main` hiện hành, độ ổn định process mạng WebKit được quản lý tường minh theo Q2 kèm bảng đếm dồn.
  - **M2 `DONE`:** cả 10 đầu mục trong §4 M2 đã vào `main` (nguồn phiên bản/SHA duy nhất trên HUD, `.gitattributes` LF, `README.md`, CI hardening + pin SHA + gitleaks + bundle `< 250` KB + coverage ratchet + guard tuổi gói 24h, lint 0 cảnh báo, P9 first sound-on `< 100` ms trên GPU thật lần đo 1 `MET`, P8 thao tác `< 100` ms và kéo `≤ 50` ms lần đo 1 `MET`, P1.1 kéo sheet + focus/inert khi splash, phục hồi mất WebGL context + fallback WebGL2, rà phụ thuộc); giới hạn phạm vi (chưa chứng nhận toàn vòng đời P8 ngoài 14 thao tác + vòng kéo chuẩn, không đo mẫu âm thanh vật lý đầu tiên) được giữ nguyên bằng nhãn rõ trong `AUDIT_PACKET.md` và `BACKLOG.md`.
  - **M3 `DONE`:** cả 9 đầu mục phần mềm và phép đo trong §4 M3 đã hoàn tất với nhãn trung thực theo §7 mục 4 — bench 3 trình duyệt trên GPU thật (Chrome/Edge `MET`, Firefox FPS `MET`, bộ nhớ GPU Firefox `NOT_VERIFIED` với cận trên adapter `361,73` MB / `nvidia-smi` `+344` MiB đã đối chiếu), soak 30 phút (`MET` `+1,28 %` trên NVIDIA, `NOT_MET` `+22,16 %` trên Intel UHD cũ, ghi cả hai), tự host font OFL 0 host ngoài, PWA 5/5 test production + không đăng ký trong iframe, a11y axe 9/9 ca + bàn phím + phụ đề âm thanh, i18n đủ khoá VI/EN, Lighthouse lưu JSON (Accessibility 100; Performance desktop NVIDIA 97 `MET`, mobile NVIDIA 50–56 `NOT_MET`, Intel UHD 26/60 `NOT_MET`), tải 4G có throttle service worker theo context `MET` (cold `< 8` s, warm `< 2` s), Android/iPhone/Safari thật `NOT_VERIFIED` do không có thiết bị chỉ định.
  - **M5 giữ `PARTIAL` có lý do hợp lệ theo §7 mục 1:** M5.1 (adapter chiều cao Open Buildings 2.5D Temporal CC BY 4.0) và M5.2 (đạo cụ & mặt tiền procedural Sài Gòn v1 có công tắc "Chi tiết minh họa") đã xong toàn bộ phần mềm với 50 pipeline test trên fixture tổng hợp; phần chạy trên gói khu thật mặc định "Không" theo quyết định chủ dự án (`REAL_WORLD_NOT_VERIFIED`).

### T19 — E2E fixed-home sau refactor và sửa phát hiện review độc lập (10/11/2026)

- Giữ contract kiểm chứng hành vi còn lại, không phục hồi các luồng sản phẩm đã bỏ. `startup-gate.spec.ts` giữ kiểm shader compile, splash/input gating, mất context và retry; hash time override được thay bằng kiểm preset “Chiều” cập nhật mô phỏng. `navigation-retention.spec.ts`, `cycle-budget.spec.ts` và `fixed-home.spec.ts` đều đi qua link UI thật “Giới thiệu” (`TopActions`) sang `/gioi-thieu` và back-link “Về phố”, không còn dùng `history.pushState` giả lập. `illustrative-details.spec.ts` bị loại khỏi suite vì toggle đã bỏ; `fixed-home-scene.spec.ts` thay bằng kiểm geometry fixture bất biến, chi tiết minh hoạ trong Diorama/tắt ở Mặt bằng, một canvas và resource count ổn định.
- `fixed-home-recovery.spec.ts` kiểm mất context thật bằng `WEBGL_lose_context`, tự phục hồi lần đầu, fallback lần hai và retry thủ công; test gắn identity lên canvas cũ để xác nhận canvas sau recovery được tạo lại. `fixed-home-render.spec.ts` lấy screenshot canvas và kiểm pixel bins/độ biến thiên, không coi DOM fallback là render. `accessibility.spec.ts` quét axe ở cả bốn trạng thái (`VI initial shell`, `VI Plan controls` khi `ready`, `VI evening rain presets`, `EN evening rain presets`); từ đó phát hiện và sửa lỗi WebKit giữ frame màu trung gian `transition-duration: 0.01ms` dưới `prefers-reduced-motion: reduce` bằng `transition: none !important` trong `src/styles.css` và bỏ lớp màu chồng ở `src/components/overlay/Dock.tsx`.
- Phạm vi legacy không còn trong `testMatch`: E2E package upload/override/editor/roundtrip/review23, real-street, festivals, audio/POV, memories/storage/tour/postcard. Chúng được phân loại **retired with removed product paths**, không phải uncovered retained behavior; một số module legacy chưa xoá vật lý để giữ các unit test lịch sử và coverage ratchet xanh, được ghi rõ là phạm vi tồn lưu có chủ đích.
- Bằng chứng local, Windows + Bun 1.4.3, `CI=1 REQUIRE_WEBGL2=1`: Chromium 19/19 pass; Firefox 18 pass/1 skip; WebKit 18 pass/1 skip (chỉ Chromium-CDP heap retention). Pixel evidence: Chromium 1280×800, 152 color bins/24.825 chromatic samples; Firefox 1280×800, 141/24.840; WebKit 2560×1600, 188/98.651. Đây là `REQUIRE_WEBGL2` browser-test evidence, không chứng minh physical GPU. `bun run check` đạt 428 unit, 50 pipeline, coverage ratchet, typecheck/lint/build; bundle 159,986 gzip bytes/250,000. Production PWA 5/5, private Workerd 4 checks, Gitleaks 178 commits/no finding.
- Benchmark mới đo 20 view changes + một client-router About/home remount qua link UI thật, không còn benchmark package/capture cycle lịch sử. WebKit local 18.190 ms so với cùng-runner baseline commit `ba0c67a` 22.013 ms (−17,37%), dưới 70.000 ms và +10% gate; đây là cùng-runner evidence cho workload mới, không so trực tiếp với H6 cũ. Local browser run không phải CI 4/4 trên head mới.
- **T20 (Đo GPU vật lý sau refactor sa bàn cố định — 10/11/2026).** Cập nhật `scripts/desktop-benchmark.mjs` từ luồng nạp gói cũ sang `homeWorldSession` + `HOME_NEIGHBORHOOD` tĩnh, giữ nguyên 4 kịch bản × 600 bước camera và toàn bộ ngưỡng bậc `mid` (`drawCalls ≤ 200`, `triangles ≤ 800.000`, `frameMs.max ≤ 50 ms`, `fps.p50 ≥ 55`, `adapterUpperBoundBytes ≤ 350.000.000 B`). Đo trên commit sạch `75235e0f11824c0260f4f792a76ead49fe173fb0` (`harnessTreeClean: true`, Chrome `157.0.8103.38` headed, `NVIDIA GeForce GTX 1660 Ti`, driver `32.0.16.1074`, `1440×900`, `dpr: 1`): cả 4 kịch bản đạt `MET` (`fps.p50 = 141,68–143,99`, `frameMs.max = 9,50–16,90 ms`, `drawCalls = 103–107`, `triangles = 7.300–16.264`, `adapterUpperBoundBytes = 177.893.376 B`, `perProcessPeakBytes = 197.832.704 B`, `midBudgetStatus: MET`). Raw JSON và SHA-256 lưu tại [fixed-home-gpu-2026-11-10/README.md](assets/qa/codex/m4/fixed-home-gpu-2026-11-10/README.md).
