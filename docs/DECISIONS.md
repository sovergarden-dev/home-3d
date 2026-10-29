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
