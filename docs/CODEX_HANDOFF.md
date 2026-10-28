# Home 3D — Bàn giao toàn bộ cho Codex

> Notion AI lập ngày 28/10/2026 theo yêu cầu của Syringa (chủ dự án). Trạng thái: `HANDOFF_READY`. File an toàn cho repo public: không có tọa độ, địa chỉ, token, đường dẫn máy, IP hay dữ liệu khu thật. Khi cập nhật, giữ nguyên tính chất này.

## 0. Tóm tắt một phút

- **Vai trò:** Codex chạy trên mini PC Windows của Syringa, toàn quyền trên máy. Từ nay Codex là người phụ trách duy nhất của Home 3D (repo `sovergarden-dev/home-3d`, app "Phố Nhà Mình"). Cue (VPS) và Hermes dừng Home 3D. Notion AI không review từng PR nữa, chỉ **audit cuối** khi Syringa yêu cầu.
- **Mốc xuất phát:** `main` = `de7173261a8a3928685555252c2b479f76a713fe` (P10 đã merge và Publish ngày 24/10/2026). 0 PR mở, CI `main` 4/4 xanh, không có push mới từ 23/10.
- **Việc:** M0 tiếp quản an toàn → M1 P10.1 (K1 độ trễ 300 ghim, K2 ghim đủ lớn, K3 chữ bưu thiếp; khép tiêu chí H bằng GPU thật) → M2 độ tin cậy và vệ sinh repo → M3 P12 (bench, PWA, a11y, Lighthouse, tự host font) → M4 bản riêng tư sẵn sàng deploy (không deploy) → M5 độ giống lõi. Chi tiết ở §4; được đổi thứ tự nếu có lý do.
- **Quyền:** tự quyết, tự code, tự merge vào `main` khi đủ cổng §5. Không Publish Lovable, không deploy, không đổi visibility, không chi tiền, không tạo tài khoản hay token. Dữ liệu khu thật không bao giờ vào repo, PR, CI hay log.
- **Kết thúc:** đạt vạch đích §7 → đóng băng `main`, hoàn tất `docs/AUDIT_PACKET.md`, báo Syringa `READY_FOR_FINAL_AUDIT` kèm full SHA.

## 1. Dự án

- Phố Nhà Mình: web app bản đồ 3D khu phố quanh nhà Syringa. Nhà là tâm cố định duy nhất (D10, không bộ chọn địa điểm). Lô nhà để trống vì nhà cũ đã phá để xây lại; không dựng lại nhà cũ (D11).
- Hai lớp: **Phố mình** tự dựng từ dữ liệu mở (OSM, Overture, Google Open Buildings CC BY 4.0) và khảo sát của Syringa; **Phố thật** chỉ mở Google Maps qua link khi người dùng bấm.
- Bản công khai https://nhacvl.lovable.app chỉ chạy demo phố hư cấu (fixture tổng hợp). Khu thật chỉ xem cục bộ bằng gói riêng (`?local-preview=1` rồi chọn file), không lên Lovable, repo hay CI. Bản riêng tư dự kiến chạy trên Cloudflare Workers + Access của Syringa (chưa làm, xem M4).
- Stack: TanStack Start (SSR, build ra Cloudflare Worker) qua `@lovable.dev/vite-tanstack-config`; React 19; Three.js trực tiếp (three 0.180, WebGL2, không R3F); zustand; zod; Vitest 4; Playwright 1.58.2; Bun 1.4.3. `bunfig.toml` có guard `minimumReleaseAge` 24 giờ. Pipeline dữ liệu ở `pipeline/` (package riêng).
- Đã xong: P1/P1.1 vỏ UI, Demo 1, H6 khu thật đúng mặt bằng (preview cục bộ), P7 Phố thật (link Google Maps), P8 không khí (giờ, thời tiết, mùa, lễ hội âm lịch), P9 sự sống, âm thanh tổng hợp, POV Đi bộ/xe ôm, P10 kỷ niệm, tour, nhật ký xây nhà, bưu thiếp, G1 georeference riêng.
- Lovable sync nhánh `main` ("In sync"). Merge vào `main` làm Preview Lovable tự cập nhật (Preview cần đăng nhập); trang công khai chỉ đổi khi bấm Publish. Publish gần nhất 24/10/2026 09:46 (+07), bản P10.
- Repo public, chủ là tài khoản cá nhân: GitHub Actions miễn phí. Vẫn chạy kiểm cục bộ trước để vòng lặp nhanh hơn.

## 2. Nguồn sự thật và thứ tự đọc

1. **File này** — thắng mọi chỉ đạo, phân vai và quy trình cũ khi mâu thuẫn: mục "Chỉ đạo hiện hành — P10", "Vai trò", bước 6 "Không merge khi Notion AI chưa xác nhận" trong `AGENTS.md`, các trang Notion cũ giao Cue hoặc Hermes.
2. **`AGENTS.md`** — quy tắc cứng (Google, riêng tư, Lovable, asset, ngân sách hiệu năng) vẫn nguyên hiệu lực và thắng file này nếu có chỗ vô tình nới lỏng. Giữ nguyên khối `LOVABLE:BEGIN/END`.
3. `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/ATTRIBUTION.md`; runbook `docs/H6_PRIVATE_WORLD_RUNBOOK.md`, `docs/P7_REAL_STREET_RUNBOOK.md`, `docs/P8_RUNBOOK.md`, `docs/P9_RUNBOOK.md`, `docs/P10_RUNBOOK.md`; bằng chứng `docs/assets/qa/p10/`.
4. Harness có sẵn trong `scripts/`: `p10-latency.mjs`, `p10-benchmark.mjs`, `p10-baseline.mjs`, `p10-r7-decompose.mjs`, `p10-color-verify.mjs`, `p10-visuals.mjs`, `p10-summarize.py`, `p10-production-smoke.mjs`, `p7-production-smoke.mjs`, `p8-production-smoke.mjs`, `p8-atmosphere-qa.mjs`, `p8-weather-revision-qa.mjs`, `h6-production-smoke.mjs`, `h6-lifecycle-memory.mjs`, `h6-completion-qa.mjs`. Tái dùng trước khi viết mới.
5. `docs/PLAN.md` là snapshot ngày 13/10, chỉ tham khảo; roadmap gốc ở Notion.
6. Notion không bắt buộc (danh sách ở §10). Không truy cập được Notion thì file này đủ để làm việc.

## 3. Hiện trạng đã kiểm (28/10/2026)

| Mục | Giá trị |
| --- | --- |
| `main` | `de7173261a8a3928685555252c2b479f76a713fe` — merge PR #7; cây mã bằng P10 reviewed head `a5d9011d404f531f2ebe28efb18d40f2ab0040b9` |
| Nhánh remote | `main`; `feat/p10-memories` = `a5d9011…` (đã nằm trong `main`, chưa dọn) |
| PR / issue / tag | 0 / 0 / chưa có tag |
| CI mới nhất | push `main` run 39968559993: quality, e2e-full-chromium, e2e-full-firefox, e2e-full-webkit đều success |
| Trang công khai | https://nhacvl.lovable.app trả 200, bản P10 |
| Lovable | theo `main`; thẻ lịch sử có "Build unsuccessful / Preview is out of date" chưa rõ nguyên nhân (cần UI Lovable, để audit cuối) |

### Mốc số đo (baseline)

| Chỉ số | Mốc |
| --- | --- |
| Unit (Vitest) | 362 pass, 58 file |
| Pipeline | 39 pass, 6 file |
| E2E CI Chromium | 77 pass / 0 fail / 0 skip |
| E2E CI Firefox | 48 / 0 / 29 skip (CI Firefox không có WebGL2) |
| E2E CI WebKit | 77 / 0 / 0 |
| Lint | 0 lỗi, 7 cảnh báo |
| H6 20 vòng (dispatch 39941270224) | Chromium 39,8 s; WebKit 57,4 s (WebKit phải dưới 70 s; timeout 90 s giữ nguyên) |
| Draw calls / tam giác | main 37 / 4556; 300 ghim 38 / 9356 |
| K1 trên SwiftShader (P10; 1440×900, DPR 1, 299↔300 thẻ, 30 mẫu) | RAF1 p50 114,05 ms; RAF2 p50 223,85 ms, p95 566,6 ms; DOM commit p50 104,05 ms; CPU mutation p50 1,85 ms; khung đứng yên p50 khoảng 116,6 ms |

### Lỗi và nợ đã biết

- **HUD** hiện "P9 · SHA không xác định": `src/config/buildInfo.ts` hard-code `PUBLIC_BUILD_VERSION = "P9"`; `BUILD_SHA` chỉ đọc `VITE_BUILD_SHA`, mà Lovable không đặt biến này.
- **H (P10) BLOCKED:** độ trễ thêm/xoá ghim ở 300 ghim chưa đạt p50 dưới 100 ms tới khung phản ánh; mới đo trên SwiftShader.
- **S1:** ghim kỷ niệm ở Diorama 1440×900 chỉ cao khoảng 8 px.
- **Bưu thiếp 4K** khi tên phường trống: dòng ngày sát hoặc chạm tiêu đề.
- **P9:** first sound-on tới khung hiển thị 91–105 ms khi ấm, 157–197 ms lần đầu (NOT_MET, mục tiêu dưới 100 ms); cảnh báo WebGL context chưa giải thích hết; xe và người ở Diorama nhỏ; landscape 740×390 chật.
- **P8:** mục tiêu đổi tuỳ chọn dưới 100 ms và không khung nào quá 50 ms chưa đạt trên SwiftShader, chưa kiểm GPU thật.
- **P1.1 follow-up:** khi kéo sheet từ peek, cụm nút bản đồ còn hiện tới lúc thả tay; chưa từng sửa, cần kiểm lại còn không.
- **Tài liệu cũ:** README là boilerplate Lovable (ghi npm, sai: dùng bun); `AGENTS.md` còn chỉ đạo P10 và vai trò cũ; `docs/PLAN.md` là snapshot 13/10; `docs/BACKLOG.md` còn checkbox P8/P9 cũ.
- **Repo:** chưa có `.gitattributes`, `LICENSE`; CI chưa pin action theo SHA, chưa có `timeout-minutes`, gitleaks, size-limit, ngưỡng coverage (roadmap P2 yêu cầu).
- **Mạng:** Google Fonts (Be Vietnam Pro, Lora) tải từ hai host ngoài trong `src/routes/__root.tsx`; test mạng hiện cho phép đúng hai host này.

### Dữ liệu riêng (ngoài repo)

- G1: Syringa giữ gói canonical khu thật và tệp companion georeference; kết quả G1 là `GEOREFERENCE_BOUND_PROVEN` cho đúng cặp này. Cách dùng trong app: mở gói canonical → "Mở tham chiếu địa lý" → chọn companion; Phố thật và Thời tiết thật chỉ gửi vị trí sau xác nhận từng lần; reload hoặc đổi gói là xoá. `REAL_WORLD_NOT_VERIFIED` giữ nguyên.
- Codex **không tìm, mở hay sao chép** tệp riêng trên máy khi Syringa chưa đưa đường dẫn và mục đích rõ (xem §6).

## 4. Việc cần làm

Codex được đổi thứ tự, gộp hoặc tách nếu có lý do; ghi lý do vào `docs/DECISIONS.md` và `docs/CODEX_LOG.md`. Mỗi milestone kết thúc bằng một mục tổng kết trong `docs/CODEX_LOG.md`.

### M0 — Tiếp quản an toàn (làm đầu tiên)

1. **Môi trường:** theo §9 — Git `core.autocrlf=false`, `core.longpaths=true`, clone ở đường dẫn ngắn; Bun 1.4.3 (khớp CI); `bun install --frozen-lockfile`; `bun x playwright install chromium firefox webkit`; `gh auth status` với quyền tối thiểu (§5.5).
2. **Baseline cục bộ** trên `de71732`: `bun run check` (typecheck, lint, unit, pipeline, build), `bun run test:e2e` cho ba trình duyệt, production-build smoke; so với §3. Lệch vì Windows (ví dụ Firefox có WebGL2 nên chạy cả test đang skip trên CI) thì ghi rõ và điều tra; không sửa test cho xanh. CI Linux vẫn là cổng merge.
3. **Baseline GPU thật:** ghi GPU, driver, phiên bản trình duyệt và `UNMASKED_RENDERER_WEBGL`. Dùng Chrome hoặc Edge headed (xác nhận không phải SwiftShader): H6 20 vòng, `scripts/p10-latency.mjs`, `scripts/p10-benchmark.mjs`, khung đứng yên; ở 1440×900 DPR 1 và ở DPR gốc. Raw JSON (chỉ fixture tổng hợp) lưu dưới `docs/assets/qa/codex/`, mỗi file dưới 1 MB, đã xoá đường dẫn tuyệt đối, tên máy, tên user.
4. **Neo an toàn:** tạo annotated tag `baseline/p10-published` tại `de7173261a8a3928685555252c2b479f76a713fe` và push. Xoá remote `feat/p10-memories` chỉ khi SHA remote đúng `a5d9011d404f531f2ebe28efb18d40f2ab0040b9` và `git merge-base --is-ancestor` trả 0; ghi SHA vào log để khôi phục được.
5. **PR tài liệu "docs: Codex takeover":**
   - thêm file này thành `docs/CODEX_HANDOFF.md`; tạo `docs/CODEX_LOG.md` (khối "Hiện trạng" ngắn ở đầu, nhật ký theo ngày bên dưới);
   - `AGENTS.md`: thay "Chỉ đạo hiện hành — P10" và các mục "Lịch sử chỉ đạo" bằng một mục ngắn "Chỉ đạo hiện hành — Codex" trỏ tới file này (lịch sử chuyển sang `docs/` nếu muốn giữ); cập nhật vai trò và bước 6 theo §5; sửa lý do cấm `AGENTS.override.md` (Codex cũng ưu tiên file override và bỏ qua `AGENTS.md`); giữ nguyên quy tắc cứng; giữ `AGENTS.md` dưới khoảng 24 KB (Codex mặc định chỉ nạp 32 KiB đầu);
   - đánh dấu `docs/PLAN.md` là snapshot cũ; sắp lại `docs/BACKLOG.md`: việc mở hiện hành ở trên, lịch sử ở dưới.
6. PR này cũng là **phép thử quy trình**: PR → CI 4/4 đúng head → self-review → merge commit → CI push `main` xanh → ghi log.

**Xong khi:** baseline cục bộ và GPU thật có trong log; tag đã push; nhánh P10 đã xoá; PR tài liệu đã merge và CI `main` xanh.

### M1 — P10.1: độ trễ 300 ghim, ghim S1, chữ bưu thiếp

Từ `main` mới nhất, một PR hoặc ba PR nhỏ (K1, K2, K3). Đặc tả gốc ở trang Notion P10.1 (trước giao Cue, chưa ai làm); phần dưới là bản đủ dùng.

**K1 — Độ trễ thêm/xoá ghim ở 300 ghim (khép H)**

- Giả thuyết cần kiểm, chưa phải kết luận: trên SwiftShader mỗi khung tốn khoảng 100 ms và chặn main thread, nên độ trễ có "sàn" một đến hai khung, không phải chi phí logic ghim. Sau khi P10 bỏ `structuredClone`, RAF2 còn tăng (144,65 → 223,85 ms): số đo dao động lớn hoặc có nút thắt khác.
- **Tách sàn khung khỏi chi phí app:** đo mutation → DOM commit → RAF1 → RAF2 dưới ba điều kiện cùng fixture, camera, giờ: (a) như P10; (b) viewport hoặc DPR nhỏ, hoặc tạm dừng render; (c) 0 ghim so với 300 ghim. Dùng Chromium trace (long task, long-animation-frame, event timing), không chỉ hai RAF.
- **Chỉ sửa phần thuộc app khi số đo chỉ ra.** Gợi ý: chỉ ghi và upload dải instance thay đổi; gộp mutation trong một khung; selector hẹp để không re-render cả dock; memo hoặc ảo hoá danh sách 300 thẻ; không serialize/validate toàn document đồng bộ trên đường nóng; IndexedDB không chặn đường vẽ. Giữ hành vi, validator, trần dung lượng, guard riêng tư (review P10 R2/R3), và ghim không rebuild world.
- **Phép đo:** mỗi điều kiện × mỗi bản (before = `de71732`, hoặc `main` ngay trước M1 nếu mã đã đổi; after = nhánh mới) ít nhất 60 mẫu thêm và 60 mẫu xoá, xen kẽ A/B, cùng warm-up; báo p50/p95/min/max; giữ mọi mẫu chậm; raw không lọc kèm script tái lập.
- **Ngưỡng giữ nguyên:** p50 dưới 100 ms tới khung phản ánh cho cả thêm và xoá; ghi p95. Không nâng ngưỡng. Chỉ số phụ (ví dụ phần vượt sàn khung) được báo kèm nhãn nhưng không dùng để tuyên bố đạt.
- **Nhãn:** SwiftShader — đúng một trong `H_MET_SWIFTSHADER`, `H_IMPROVED_NOT_MET`, `H_BLOCKED` (kèm nguyên nhân đã chứng minh). GPU thật (mới) — `H_MET_REAL_GPU` hoặc `H_NOT_MET_REAL_GPU`, kèm renderer string, trình duyệt, viewport, DPR. H của P10 coi như khép khi có `H_MET_REAL_GPU` trên Chrome hoặc Edge desktop; nhãn SwiftShader vẫn ghi trung thực.
- **Không làm xấu hơn:** khung đứng yên, draw calls và tam giác, H6 20 vòng không chậm quá 10% so với mốc §3; WebKit CI dưới 70 s; không đổi timeout 90 s, assertion, capability guard.

**K2 — Ghim S1 đủ lớn để thấy và chạm**

- Kích thước hiển thị tối thiểu trên màn hình, không co theo khoảng cách camera trong giới hạn Diorama và Mặt bằng (gợi ý từ 16 px; chọn số cụ thể, ghi DECISIONS).
- Vùng chọn tối thiểu 44 CSS px bằng dung sai chọn theo không gian màn hình (không cần vẽ ghim to bằng vùng chọn). Ghim chồng nhau thì chọn ghim gần điểm chạm nhất; ghim được chọn hoặc hover có viền rõ.
- Không che marker lô, footprint, nhãn; không làm hỏng picking nhà, inspector, undo của H6. Vẫn là InstancedMesh (draw calls không tăng), chỉ ở Diorama và Mặt bằng; trần theo tier low 40, mid 120, high/ultra 300; tôn trọng reduced-motion.
- Chứng minh: đường kính đo bằng pixel renderer thật ở 1440×900, 390×844, 740×390, camera gần và xa; E2E chạm trong dung sai thì chọn đúng ghim, ngoài dung sai thì không; ca chồng ghim; regression picking H6; ảnh gallery tổng hợp tự xem.

**K3 — Dòng ngày bưu thiếp không chạm tiêu đề**

- Khoảng cách giữa các khối chữ theo tỷ lệ cỡ chữ, không phụ thuộc có hay không tên phường; gap tối thiểu ít nhất nửa chiều cao dòng nhỏ hơn (chọn hệ số, ghi lại).
- Test đo bounding box thật (measureText hoặc pixel) ở 3840×2160, 2048×1152, 1920×1080 × VI/EN × tên phường trống, 40 ký tự, có dấu; tiêu đề dài không tràn hay cắt xấu.
- Không đổi chữ "Phố Nhà Mình · ảnh dựng 3D mô phỏng" (không địa chỉ), kích thước đầu ra, hạ bậc, Hủy, quét metadata. Đo màu R1 (`scripts/p10-color-verify.mjs`, vùng cảnh dưới 15%) vẫn đạt. Tự xem ảnh 4K và 2K, có và không có tên phường.

**Regression chung M1:** P10 (kỷ niệm, tour, khách, lưu opt-in, ảnh, bưu thiếp), H6, P7, P8, P9; một canvas, một AudioContext; không thêm cảnh báo hydration; không request ngoài mới (hai host font vẫn được phép cho tới khi M3 tự host); soak cục bộ ít nhất 10 phút và 10 chu kỳ thêm/xoá ghim, tour, bưu thiếp, có đếm ObjectURL, ImageBitmap, texture, render target, listener, RAF, IndexedDB, AudioContext. M1 không thêm dependency runtime.

### M2 — Độ tin cậy và vệ sinh repo

1. **Phiên bản và SHA trong HUD:** một nguồn phiên bản duy nhất, không lệch pha như "P9"; SHA thật khi bản build có (thử lấy từ git lúc build, có fallback an toàn); không có thì ghi rõ "không xác định"; có test. Không thêm plugin trùng với `@lovable.dev/vite-tanstack-config`. Lovable có cấp SHA hay không sẽ kiểm ở audit cuối.
2. **Line endings:** kiểm `git ls-files --eol`, thêm `.gitattributes` (`* text=auto eol=lf` và khai báo binary); renormalize không được đổi nội dung, nếu có thì commit riêng.
3. **README thật:** mô tả ngắn, lệnh bun, cấu trúc, nguyên tắc riêng tư, link docs; giữ link dự án Lovable.
4. **CI hardening:** pin action theo full SHA (kèm comment version), `timeout-minutes` cho từng job, giữ `permissions: contents: read`; gitleaks (quét toàn lịch sử một lần, rồi mỗi PR); size-limit cho JS vỏ tối đa 250 KB gzip (engine tách chunk lazy); coverage dạng ratchet (ngưỡng bằng mức hiện tại, mục tiêu ≥ 85% cho `src/geo`, `src/state`, logic mô phỏng). DevDependency mới phải qua guard 24 giờ, không có postinstall hay native binary (build Lovable có thể hỏng mà Codex không thấy), ghi giấy phép vào DECISIONS/ATTRIBUTION.
5. **Lint:** 7 cảnh báo về 0 nếu sửa nhỏ; không tắt rule.
6. **P9 còn mở:** đo first sound-on trên GPU thật (mục tiêu dưới 100 ms tới khung hiển thị), sửa nếu cần; truy nguyên cảnh báo WebGL context; xe và người ở Diorama dễ thấy hơn trong ngân sách; bố cục 740×390.
7. **P8:** kiểm trên GPU thật việc đổi tuỳ chọn dưới 100 ms và không khung nào quá 50 ms; không đạt thì tối ưu (precompile shader, tránh dựng lại material).
8. **P1.1:** kiểm hành vi kéo sheet; còn lỗi thì sửa, kèm pointercancel, focus, reduced-motion.
9. **Khả năng phục hồi:** mất WebGL context thì tự khôi phục; không có WebGL2 thì fallback tĩnh và thông báo; có test.
10. **Phụ thuộc:** không nâng hàng loạt; chỉ vá advisory thật, tôn trọng `minimumReleaseAge`.

### M3 — P12: hiệu năng, PWA, a11y, thiết bị desktop

1. **Bench:** script đường bay camera cố định → báo cáo JSON (fps p50/p95, frame time p95, khung dài nhất, draw calls, tam giác, texture/geometry, heap ước tính) so với ngân sách tier trong `AGENTS.md`; chạy GPU thật (Chrome, Edge, Firefox trên Windows); SwiftShader chỉ để tham khảo.
2. **Soak** 30 phút trên desktop GPU thật; đổi chế độ 20 lần, bộ nhớ tăng dưới 10%.
3. **Tự host font** Be Vietnam Pro và Lora (OFL; chỉ weight và subset cần, có tiếng Việt; woff2; mỗi file dưới 1 MB; kèm license OFL và ATTRIBUTION); bỏ link Google Fonts; siết test mạng thành 0 host ngoài.
4. **PWA:** manifest, icon tự làm; Service Worker chỉ ở production, không đăng ký trong iframe (Preview Lovable); chỉ cache asset có hash của mình; offline cho vỏ; nhắc cập nhật; không bao giờ cache nội dung Google; có E2E.
5. **a11y:** bàn phím, focus thấy rõ, reduced-motion, phụ đề hoặc mô tả cho âm thanh, aria; kiểm tự động (ví dụ axe) cộng kiểm tay.
6. **i18n:** test đủ khoá vi/en, không hard-code chuỗi.
7. **Lighthouse** cho vỏ: Performance ≥ 90, Accessibility ≥ 95 (mobile và desktop); lưu JSON.
8. **Tải:** vỏ và splash dưới 2 s; quanh nhà dưới 8 s trên 4G giả lập; lần sau dưới 2 s nhờ cache.
9. **Ma trận:** Windows Chrome, Edge, Firefox GPU thật — đo; Android — chỉ khi Syringa cắm máy qua USB (tuỳ chọn); iPhone và native Safari — `NOT_VERIFIED` (WebKit của Playwright không thay Safari thật).

### M4 — Bản riêng tư sẵn sàng deploy (Codex không deploy)

1. Thiết kế, ghi DECISIONS: cùng bản build chạy trên Cloudflare Workers của Syringa, sau Cloudflare Access; bản Lovable luôn là demo.
2. **Cấu hình runtime riêng** (zod, fail-closed): server function chỉ trả cấu hình khi request có JWT Access hợp lệ (chữ ký theo certs của team domain, `aud`, hạn); thiếu hoặc sai thì về chế độ demo, lỗi không lộ thông tin. Unit test bằng khoá thử sinh cục bộ, không dùng secret thật.
3. **Phân phối gói riêng:** v1 giữ chọn file cục bộ sau Access; v2 (tuỳ chọn) R2 private đọc qua Worker sau Access. Syringa tự upload.
4. **`deploy:private`** và cấu hình wrangler tách khỏi build Lovable (không làm hỏng Lovable); chạy thử cục bộ (ví dụ `wrangler dev`) nếu không cần tài khoản.
5. **Runbook** `docs/PRIVATE_DEPLOY_RUNBOOK.md` từng bước cho Syringa: Access (chỉ email người nhà), secrets, R2, domain tuỳ chọn, analytics không cookie tuỳ chọn, kiểm sau deploy, rollback.
6. Checklist riêng tư (roadmap §10) thành bảng kiểm; tự động hoá chỗ làm được.

**Xong khi:** test xanh, runbook đủ để Syringa tự làm; trạng thái `READY_TO_DEPLOY_NOT_DEPLOYED`.

### M5 — Độ giống lõi (phần mềm; dữ liệu thật chỉ khi Syringa mở)

1. **Chiều cao Open Buildings 2.5D Temporal** (CC BY 4.0) trong pipeline. Hiện 315/317 footprint của gói thật chưa có căn cứ chiều cao, 2 cái suy từ số tầng. Chỉ gán cho footprint đã có (trung vị trong footprint, năm mới nhất); bỏ qua polygon lô và vùng tâm (dữ liệu còn nhà cũ); không nhập footprint mới quanh tâm hoặc lô; provenance `source-only` hoặc `inferred` kèm năm; test bằng fixture tổng hợp; cập nhật ATTRIBUTION. Nguồn đòi đăng nhập Google hoặc Earth Engine thì không tạo tài khoản, ghi câu hỏi. Chạy trên gói thật chỉ cục bộ khi Syringa cho phép; đầu ra ở thư mục riêng ngoài repo.
2. **Đạo cụ và mặt tiền procedural Sài Gòn v1:** ban công, khung sắt, cửa cuốn, bồn nước, cục nóng máy lạnh, chậu cây và hoa giấy, bảng hiệu chung chung, cây (me, sao, dầu, bàng, phượng), cột điện và dây võng, đèn đường. Seed cố định, InstancedMesh, theo tier, có công tắc "Chi tiết minh họa", nhãn stylized/inferred; không đổi footprint hay topology; giữ ngân sách.
3. Chunk, LOD, manifest chỉ làm khi số đo cho thấy cần.
4. Để sau (ghi BACKLOG): landmark dựng tay từ ảnh tự chụp, frontage operation trong editor, nguồn Overture mới, GIS/editor tổng quát.

### Để sau — cần người, thiết bị hoặc quyết định (không chặn vạch đích)

| Việc | Cần gì | Nhãn hiện tại |
| --- | --- | --- |
| Khảo sát thực địa (video, ảnh mặt tiền, số tầng, màu, mái, bảng hiệu) | Syringa đi chụp | NOT_DONE |
| Thu âm phố bốn khung giờ | Syringa thu | khe nạp và fallback tổng hợp đã có |
| 10–20 góc kỷ niệm | Syringa nhập trong app | — |
| Ranh lô và số đo | bản vẽ hoặc khảo sát | tâm chấp nhận tạm, ranh chưa đo |
| Nhà tương lai (P6), nhà thật (P11) | file kiến trúc sư; bản quét khi xây xong | NOT_STARTED |
| Nghiệm thu thực địa | Syringa | REAL_WORLD_NOT_VERIFIED |
| iPhone, native Safari, Android | thiết bị thật | NOT_VERIFIED |
| Deploy bản riêng tư, domain | tài khoản Cloudflare của Syringa, sau audit | READY_TO_DEPLOY_NOT_DEPLOYED (sau M4) |
| Publish Lovable | sau audit cuối | — |
| Ẩn badge Lovable | tuỳ gói Lovable | — |
| Nhúng Google 3D Tiles | chỉ khi Google phủ 3D khu nhà và đã đọc lại điều khoản | NOT_STARTED |
| ML làm mờ mặt, biển số | quyết định riêng; hiện soát tay từng ảnh | NOT_DONE có chủ ý |
| Ý tưởng backlog (Phố qua các năm, AR, in 3D, gia đình cùng thêm kỷ niệm) | quyết định sản phẩm | — |
| Giấy phép mã nguồn (`LICENSE`) | Syringa chọn | chưa có |

## 5. Quyền hạn và cổng

### 5.1 Codex tự làm, không cần hỏi

- Mọi thay đổi code, test, docs, CI trong repo này theo M0–M5; tạo nhánh, PR, merge theo cổng 5.2.
- Chạy CI (PR, `workflow_dispatch`); rerun chỉ khi lỗi hạ tầng và ghi lý do. Tạo tag. Xoá nhánh đã merge sau khi kiểm ancestor.
- Thêm devDependency hợp lý (guard 24 giờ, giấy phép, không postinstall hay native). Dependency runtime mới chỉ khi thật cần, có lý do và đo bundle.
- Quyết định kỹ thuật và UX trong khuôn D1–D14 và quy tắc cứng; ghi DECISIONS.
- Sau mỗi milestone, nhắn Syringa 3–5 dòng (đã xong gì, PR và SHA, việc tiếp theo, câu hỏi nếu có), không chờ trả lời.

### 5.2 Cổng của mỗi PR trước khi merge

1. Cục bộ: `bun install --frozen-lockfile`, `bun run check` đạt; E2E liên quan đạt.
2. CI 4/4 (`quality`, `e2e-full-chromium`, `e2e-full-firefox`, `e2e-full-webkit`) success đúng full head SHA (PR-event hoặc dispatch); ghi run ID. Job cancelled hoặc skipped không tính.
3. Nhánh không behind `main` (cập nhật bằng cách merge `main` vào nhánh, không rebase nhánh đã push).
4. Self-review trong một phiên hoặc luồng mới (ví dụ `/review` của Codex) với vai reviewer khó tính: hồi quy, riêng tư, quy tắc cứng, test có thật sự kiểm điều được tuyên bố.
5. Quét riêng tư: gitleaks sạch; diff không có tọa độ, địa chỉ, đường dẫn tuyệt đối, tên máy, tên user, IP, token; không thêm host mạng.
6. Merge bằng merge commit; không squash, không rebase; không bật auto-merge khi chưa đủ cổng.
7. Sau merge: CI push `main` 4/4 xanh. Đỏ thì sửa ngay bằng PR mới hoặc revert bằng PR (`git revert`); không force-push.

### 5.3 Phải hỏi Syringa — gom một lần, không ngồi chờ

Ghi vào mục "Câu hỏi cho Syringa" trong `docs/AUDIT_PACKET.md` (chỉ nhắn trong chat nếu mọi việc còn lại đều bị chặn), rồi làm việc khác trong lúc chờ:

- tiền, billing, gói dịch vụ; tạo hoặc đăng nhập tài khoản; secret, token, khoá;
- Publish hoặc đổi cài đặt Lovable; deploy Cloudflare; DNS, domain; đổi visibility hoặc cài đặt repo, tài khoản GitHub;
- dùng dữ liệu khu thật ngoài phạm vi Syringa đã chỉ định; công khai bất kỳ dữ liệu thật nào;
- thao tác phá huỷ: viết lại lịch sử, xoá nhánh chưa merge, xoá tag hoặc release, xoá bằng chứng;
- đổi quy tắc cứng hoặc D1–D14; quyết định làm đổi bản chất sản phẩm; giấy phép mã nguồn.

Câu hỏi đã biết trước, kèm mặc định khi Syringa chưa trả lời:

| Câu hỏi | Mặc định |
| --- | --- |
| Dùng gói khu thật cục bộ cho smoke riêng tư và M5? | Không; chỉ fixture tổng hợp |
| Cắm Android qua USB để kiểm? | Bỏ qua, ghi NOT_VERIFIED |
| Thêm `LICENSE`? | Không thêm (giữ mọi quyền) |
| Ruleset cho `main`? | Syringa tự bật hoặc bỏ qua; Codex không cần quyền admin |
| Analytics không cookie cho bản riêng tư? | Tắt |
| Defender exclusion cho thư mục repo? | Không |

### 5.4 Không bao giờ

Publish hoặc sửa Lovable, dùng chat Lovable hoặc Lovable Cloud; đăng nhập Cloudflare hoặc Google; deploy; tự tạo token hoặc khoá; push thẳng `main`; force-push hoặc rebase, amend, squash lịch sử đã push; đụng dự án khác trên máy (ví dụ Syrin Notes); tìm hoặc mở dữ liệu riêng khi chưa được chỉ đường dẫn.

### 5.5 Quyền GitHub tối thiểu (đề xuất cho Syringa)

- Fine-grained token chỉ cho repo `home-3d`: Contents RW, Pull requests RW, Actions RW, Workflows RW (để sửa `.github/workflows`), Metadata R; không cấp Administration.
- Ruleset cho `main` (Syringa tự bật, tuỳ chọn): Restrict deletions và Block force pushes. Không bật Require pull request hay Require status checks vì Lovable cần push vào `main`.

### 5.6 Chống vòng lặp

Mỗi mục tối đa ba vòng thử có đo đạc. Vẫn không đạt thì ghi `PARTIAL` hoặc `BLOCKED` kèm bằng chứng và giả thuyết, chuyển mục khác. Không nới ngưỡng, không tắt test hay assertion để xanh, không dispatch lặp cho cùng head.

## 6. Quy tắc cứng (tóm tắt; bản đầy đủ trong `AGENTS.md`)

- **Riêng tư:** repo, PR, CI, log, artifact chỉ chứa fixture tổng hợp. Không tọa độ, địa chỉ, geometry, ENU, graph, source ID, override hay ảnh khu thật (xoá lat/lng chưa đủ). Dữ liệu riêng chỉ đọc cục bộ khi Syringa chỉ định đường dẫn và mục đích; đầu ra ở thư mục riêng ngoài repo và ngoài thư mục đồng bộ OneDrive; log chỉ ghi số tổng hợp đã khử nhận dạng.
- **Google:** chỉ để xem. Không trace, đo, vẽ lại hay dựng model từ Street View, ảnh vệ tinh, Google Earth, 3D Tiles; không nhúng; Phố thật chỉ mở link; không cache nội dung Google.
- **Lovable:** giữ cấu trúc TanStack Start với `@lovable.dev/vite-tanstack-config`; chỉ dùng bun (`bun.lock`); engine chỉ chạy phía client; không thêm plugin trùng; không tạo `.hermes.md` hay `AGENTS.override.md`; `main` là nhánh sync.
- **Asset:** file trên 1 MB không commit.
- **Hiệu năng:** ngân sách trong `AGENTS.md`; một canvas, một AudioContext; không request ngoài mới.
- **Trung thực:** nhãn `DONE`, `PARTIAL`, `BLOCKED`, `NOT_VERIFIED`, `NOT_DONE`, `NOT_MET`. Ghi nguồn số liệu: đo bởi Codex (kèm raw), chép từ receipt cũ, hay suy luận. Ghi môi trường: `REAL_GPU` (kèm renderer), `SWIFTSHADER_CI`, `WINDOWS_LOCAL`. Skip không phải pass; CI xanh không thay đo GPU; không trình bày suy luận như số đo.
- **Bài học từ H6:** giữ khối "Hiện trạng" ngắn ở đầu log; mỗi milestone một tổng kết; kiểm 2D trung tính trước khi kết luận về 3D; fixture dùng gốc trung tính; ghi nguồn gốc mọi số liệu.

## 7. Vạch đích — `READY_FOR_FINAL_AUDIT`

Đạt khi đồng thời:

1. M0–M4 `DONE`; M5.1 và M5.2 `DONE` hoặc `PARTIAL` có lý do (nguồn dữ liệu, quyền).
2. Mọi mục còn lại có nhãn rõ (`BLOCKED`, `NOT_VERIFIED`, `NOT_DONE`) kèm lý do và việc cần ai làm.
3. `main` xanh 4/4; không còn PR mở (trừ draft "parked" có ghi chú); gate cục bộ Windows đạt.
4. Ngân sách hiệu năng desktop GPU thật đạt, hoặc ghi `NOT_MET` kèm số.
5. Docs cập nhật: `AGENTS.md`, README, DECISIONS, BACKLOG, runbook, `docs/CODEX_LOG.md`, `docs/AUDIT_PACKET.md`.

Sau đó **đóng băng `main`** (không merge thêm tới khi audit xong; việc mới để draft PR), tạo tag `audit/YYYY-MM-DD` và báo Syringa: `READY_FOR_FINAL_AUDIT` kèm full SHA.

## 8. Gói audit cuối — `docs/AUDIT_PACKET.md`

- SHA `main` đóng băng, tag audit; so sánh `baseline/p10-published...main`.
- Bảng PR: số, tiêu đề, merge SHA, run CI của PR và của push `main`.
- Kết quả test: unit, pipeline, E2E từng trình duyệt (CI và Windows), số pass/fail/skip.
- Bảng hiệu năng: GPU thật (renderer, driver, trình duyệt) và SwiftShader; raw kèm script; bảng ngân sách đạt hoặc không đạt; Lighthouse JSON.
- Riêng tư: kết quả gitleaks, danh sách host mạng, kết quả quét diff, xác nhận không có dữ liệu thật.
- Ảnh tổng hợp: ghim ở ba viewport, bưu thiếp 4K/2K, các chế độ, PWA.
- Giới hạn còn lại kèm nhãn; câu hỏi gom cho Syringa; hướng dẫn Publish Lovable và deploy bản riêng tư; cách rollback (tag baseline, lịch sử phiên bản Lovable).

## 9. Ghi chú Windows và mini PC

- Clone ở đường dẫn ngắn (ví dụ `C:\dev\home-3d`), không đặt trong Desktop hay Documents đang đồng bộ OneDrive. Dữ liệu riêng (nếu Syringa đưa) cũng ngoài OneDrive và ngoài repo.
- `git config core.autocrlf false` và `git config core.longpaths true`; không để CRLF lọt vào repo.
- Cài đúng Bun 1.4.3 như CI; cài Python 3 nếu cần chạy `scripts/p10-summarize.py`.
- Không cho máy ngủ khi đang chạy việc dài; đặt giờ Windows Update ngoài giờ chạy. Defender có thể làm chậm `bun install` và Playwright; exclusion cho thư mục repo là tuỳ chọn, Syringa quyết.
- Đo GPU bằng Chrome hoặc Edge headed; ghi `UNMASKED_RENDERER_WEBGL`, driver, phiên bản trình duyệt; cắm điện, chế độ hiệu năng, đóng app nặng khi đo.
- Script phải chạy trên cả Windows và Linux; không phụ thuộc bash trong `package.json`.
- Log, ảnh, raw commit vào repo không chứa đường dẫn `C:\Users\...`, tên máy hay tên user.
- CI Linux là nguồn chuẩn cho ba trình duyệt; kết quả Windows là bằng chứng bổ sung.
- Phiên dài dễ mất ngữ cảnh: ghi `docs/CODEX_LOG.md` sau mỗi PR; đầu mỗi milestone đọc lại file này và log.

## 10. Phụ lục

- **SHA:** `main` (merge P10) `de7173261a8a3928685555252c2b479f76a713fe`; P10 head `a5d9011d404f531f2ebe28efb18d40f2ab0040b9`; merge P9 `72dd2bed1d58c558018538a51aae02f74304bc7d`.
- **CI:** 39968559993 (push `main` `de71732`, 4/4); 39941270224 (dispatch P10 head, số H6 20 vòng); 39941272716 (dispatch baseline `72dd2be`).
- **Trạng thái pha:** P10 A–G `DONE`, H `BLOCKED`, S1 mở; G1 `GEOREFERENCE_BOUND_PROVEN`; `REAL_WORLD_NOT_VERIFIED` cho mọi phần khu thật.
- **Lovable:** link dự án trong README. Ai mở Lovable mà thấy hộp thoại "A push to your repository replaced your Lovable work" thì chọn Keep repository version. Không sửa qua chat Lovable, không bật Lovable Cloud.
- **Notion (tuỳ chọn):**
  - [Home 3D — Bàn giao toàn bộ cho Codex](https://app.notion.com/p/1b0d272224c04e9a97ceadc8bd45888c): bản Notion của file này
  - [Phố Nhà Mình — Siêu kế hoạch map 3D](https://app.notion.com/p/7cd9eabab7584c27b7189499c03c9651): roadmap P0–P13, ngân sách, D1–D14, checklist riêng tư §10
  - [Bảng giao việc Hermes và Cue](https://app.notion.com/p/3d4389143bfe41a593a962b3304bdc4a): lịch sử giao việc và receipt
  - [Home 3D — P10.1: Độ trễ 300 ghim, ghim S1, chữ bưu thiếp](https://app.notion.com/p/f5bbee0585f141dbbe307314d3e0e96a): đặc tả gốc của M1
  - [Home 3D — P10: Kỷ niệm, tour, nhật ký xây nhà, bưu thiếp](https://app.notion.com/p/7592ff65db1f411db4d7cc8e36c2b691): receipt, số đo và giới hạn P10
  - [Home 3D — G1: Gắn tham chiếu địa lý riêng cho gói canonical](https://app.notion.com/p/f1402cd3427e40408db4223e451afcea): georeference riêng
  - [H6 — Sổ kinh nghiệm để đóng gói bộ skill khu phố thật](https://app.notion.com/p/302120d2a6f6496f948545da6d32dcd5): bài học quy trình