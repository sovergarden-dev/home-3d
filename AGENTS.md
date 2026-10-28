<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- The shared zustand store `src/state/appStore.ts` contains safe UI controls only. Package world, overrides, selection and marker opt-in belong to the client session; never SSR-serialize private world into the shared store.
- `SceneViewport` mounts one client-only Three.js world in `#scene-root`: fictional demo by default, or an explicitly opened local package. Private data stays in the tab and explicit local downloads only.
- UI strings come from `src/i18n/{vi,en}.ts` via `useT()`; never hardcode copy in components.

# Phố Nhà Mình — hướng dẫn cho agent

Web app bản đồ 3D khu phố quanh nhà Syringa, nhà làm tâm. Chỉ đạo hiện hành là `docs/CODEX_HANDOFF.md`; roadmap Notion và `docs/PLAN.md` giữ làm nguồn lịch sử, không ghi đè bàn giao. Xem `docs/DECISIONS.md` và `docs/BACKLOG.md`; không tự thêm dữ liệu thật.

Khối LOVABLE ở đầu file do Lovable quản lý: giữ nguyên. Quy tắc state phía trên đã đồng bộ cho H6; không dùng mô tả Demo 1 lịch sử để đưa world riêng trở lại store SSR.

## Chỉ đạo hiện hành — Codex

`docs/CODEX_HANDOFF.md` là chỉ đạo hiện hành do chủ dự án uỷ quyền ngày 28/10/2026. File bàn giao thắng chỉ đạo, phân vai và quy trình lịch sử; quy tắc cứng bên dưới vẫn giữ hiệu lực. `docs/PLAN.md` là snapshot lịch sử. Đầu mỗi milestone đọc lại bàn giao và khối Hiện trạng trong `docs/CODEX_LOG.md`.

Codex thực hiện M0–M5, tự quyết và ghi lý do trong `docs/DECISIONS.md`; tự mở PR và merge commit khi đủ toàn bộ cổng §5.2 của bàn giao. Không push thẳng main, không sửa lịch sử đã push. Notion AI chỉ audit cuối khi chủ dự án yêu cầu. Cue và Hermes đã dừng Home 3D.

Dữ liệu world, georeference và nội dung kỷ niệm ở phiên client riêng, không SSR-serialize. Kỷ niệm mặc định RAM; IndexedDB chỉ sau opt-in. Giữ kiểm ảnh/metadata, review ảnh trước public, nhật ký private và một canvas/vòng RAF/AudioContext. Public/guest là preview hoặc xuất tệp, không phải đăng mạng. Các ràng buộc chi tiết đã triển khai nằm trong runbook H6/P7/P8/P9/P10.

Chỉ dùng fixture tổng hợp khi chủ dự án chưa chỉ định đường dẫn và mục đích cho dữ liệu thật. G1 đã được chủ dự án báo `GEOREFERENCE_BOUND_PROVEN` cho cặp tệp riêng; Codex chưa đọc cặp tệp đó, và `REAL_WORLD_NOT_VERIFIED` giữ nguyên. Không dùng trạng thái này để bỏ guard package/consent.

Không Publish/sửa Lovable, đăng nhập/deploy Cloudflare hoặc Google, đổi visibility/cài đặt repo, chi tiền, tạo tài khoản/token, hay đụng dự án khác. Gom câu hỏi vào `docs/AUDIT_PACKET.md`; chỉ hỏi trong chat khi không còn việc độc lập làm được. Sau mỗi PR cập nhật log; mỗi milestone báo 3–5 dòng rồi tiếp tục.

## Sự thật cố định

- Bản đồ có đúng một tâm: nhà mình (gốc ENU). Không thêm bộ chọn địa điểm, danh sách hay thẻ "Góc phố", không đổi tâm. Kỷ niệm (P10) là ghim trên bản đồ: chạm vào thì camera bay tới, tâm vẫn là nhà.
- Nhà cũ đã phá để xây lại: lô nhà để trống. Không dựng lại nhà cũ (OSM, Overture, Open Buildings và ảnh Street View 06/2024 vẫn còn nhà cũ). Nhà mới thêm sau: model kiến trúc sư (P6), bản quét khi xây xong (P11).
- Khu nhà chưa có Google Photorealistic 3D. Phố mình (tự dựng từ dữ liệu mở và khảo sát) là lớp chính; Phố thật chỉ mở Google Maps qua đường link.
- OSM ở khu này gần như không có số tầng: chiều cao lấy từ khảo sát, Open Buildings bù chỗ thiếu.

## Vai trò

- **Codex:** triển khai, kiểm chứng, self-review trong phiên riêng, quét riêng tư, PR/CI/merge theo cổng bàn giao; ghi log và chuẩn bị audit cuối.
- **Syringa:** quyết định dữ liệu thật, giấy phép, tài khoản, chi phí, Publish và deploy; nghiệm thu thực địa.
- **Notion AI:** chỉ audit cuối khi Syringa yêu cầu.
- **Cue và Hermes:** không còn thực hiện Home 3D.

## Quy tắc cứng (vi phạm thì dừng lại và hỏi)

### 1. Nội dung Google Maps Platform

- Chỉ để xem. Không pre-fetch, lưu, cache (Service Worker, Cache API, IndexedDB, R2, đĩa), proxy-cache, đóng gói hay chụp lại 3D Tiles, Street View, ảnh vệ tinh hoặc dữ liệu Places. Tôn trọng `Cache-Control` của Google.
- Không tạo nội dung từ nội dung Google (Google Maps Platform Terms 3.2.3(c)): không trace, đo, vẽ lại hay dựng model nhà, đường, cây, cột điện từ Street View, ảnh vệ tinh, Google Earth hay 3D Tiles, kể cả bằng tay hay bằng AI (image-to-3D). Phố mình chỉ dựng từ OSM, Overture, Google Open Buildings (dataset mở, CC BY 4.0), khảo sát và ảnh, video của Syringa.
- Không dùng dịch vụ Google cùng hoặc cạnh bản đồ không phải Google (Terms 3.2.3(e)): không nhúng Street View, bản đồ hay ảnh Google vào app. "Phố thật" mở Google Maps ở tab mới hoặc app Google Maps qua Maps URLs (không cần key).
- Muốn nhúng bất kỳ lớp Google nào (ví dụ 3D Tiles khi khu nhà có 3D): dừng và hỏi Notion AI trước.

### 2. Bí mật và riêng tư

- Dự án Lovable bắt buộc commit `.env`, nên `.env` chỉ chứa giá trị công khai, không nhạy cảm.
- "Cấu hình riêng" (toạ độ gốc, polygon lô, URL riêng, key nếu có) chỉ có ở bản riêng tư: Worker secret trên Cloudflare của Syringa, sau Cloudflare Access. Khi dev: file local gitignored (ví dụ `.dev.vars` hoặc `*.local`) do Syringa điền. Không hard-code, không commit, không in ra log.
- Bản Lovable (link công khai) luôn chạy chế độ demo: không cấu hình riêng, không dữ liệu thật, không ảnh riêng. Thiếu cấu hình riêng thì chạy demo (gốc giả, ẩn Phố thật), không crash.
- Repo chỉ giữ toạ độ hư cấu/tổng hợp. ENU tương đối của khu thật cũng riêng tư, không đưa vào repo/build/CI. Gốc lat/lng chỉ đến từ cấu hình riêng.
- Mọi ảnh đi qua pipeline phải xoá EXIF/GPS, có test.
- Không đụng Google Cloud Console, Cloudflare, cài đặt Lovable, DNS, billing. Viết script hoặc hướng dẫn để Syringa tự chạy.
- Không ghi secret, token, toạ độ, địa chỉ vào code, log, PR, issue, Notion.

### 3. Tương thích Lovable

- Giữ cấu trúc app Lovable tạo: TanStack Start (SSR, build ra Cloudflare Worker) với `@lovable.dev/vite-tanstack-config`; không thêm lại plugin mà `vite.config.ts` ghi là đã có. Không chuyển sang monorepo, không đổi alias `@/`.
- Package manager là bun (`bun.lock`). Không thêm `package-lock.json`, `pnpm-lock.yaml` hay `yarn.lock`.
- Engine 3D chỉ chạy phía client: lazy import trong `ClientOnly` hoặc route client-only; không truy cập `window`, `document`, WebGL ở module scope.
- Dependency của pipeline nằm trong `pipeline/package.json`, không thêm vào root.
- main là nhánh Lovable sync: không push thẳng vào main, mọi thay đổi qua PR. Không force push; không rebase, amend hay squash commit đã push.
- Service Worker chỉ đăng ký ở bản production và không đăng ký khi chạy trong iframe (preview của Lovable).
- Không tạo `.hermes.md` hay `AGENTS.override.md` (các harness ưu tiên file override; Codex cũng ưu tiên `AGENTS.override.md` thay cho `AGENTS.md`).

### 4. Asset

- File trên 1 MB (GLB, KTX2, splat, âm thanh, ảnh) không commit. Pipeline xuất ra `pipeline/out/` (gitignored); Syringa upload R2. App đọc qua `manifest.json` có hash.

### 5. Phạm vi

- Không sửa file ngoài phạm vi việc hoặc patch được giao. Việc ngoài phạm vi ghi vào `docs/BACKLOG.md`, không tự làm. Quyết định kiến trúc mới ghi vào `docs/DECISIONS.md`.

## Stack

- App: mặc định của Lovable: TanStack Start, React 19, TypeScript, Tailwind 4, shadcn/ui, vite.
- 3D hiện hành: Three.js trực tiếp + OrbitControls, WebGL2, không R3F/drei. Engine chỉ chạy phía client.
- State: zustand cho UI an toàn; provider phiên client cho world/overrides/selection riêng. Không đưa world riêng vào payload SSR.
- BVH va chạm và thiên văn là mã trong dự án; âm lịch Việt múi giờ +7, adapter Open-Meteo có consent riêng. Thư viện trong roadmap cũ chưa mặc nhiên là dependency hiện hành.
- Giờ hiển thị luôn theo `Asia/Ho_Chi_Minh`, không theo múi giờ của máy hay server.
- Kiểm thử: Vitest, Playwright và Bun cho pipeline; các cổng bổ sung theo milestone M2/M3.

## Hệ toạ độ

- Mét. Gốc (0, 0, 0) = tâm lô nhà, cao độ mặt đường trước nhà.
- three.js Y-up: +X Đông, +Y Lên, −Z Bắc.
- Chuyển đổi WGS84 ↔ ECEF ↔ ENU chỉ ở `src/geo/` (pipeline dùng chung code này). Test: sai số dưới 1 cm trong bán kính 2 km.

## Ngân sách hiệu năng (vượt = chưa xong)

| Tier | DPR tối đa | Draw calls | Tam giác hiển thị | Bộ nhớ GPU | FPS  |
| ---- | ---------- | ---------- | ----------------- | ---------- | ---- |
| low  | 1.0        | ≤ 120      | ≤ 400k            | ≤ 200 MB   | ≥ 30 |
| mid  | 1.5        | ≤ 200      | ≤ 800k            | ≤ 350 MB   | ≥ 55 |
| high | 2.0        | ≤ 400      | ≤ 3M              | ≤ 1 GB     | 60   |

- JS của vỏ ≤ 250 KB gzip; engine tách chunk. Không frame nào quá 50 ms khi đang xoay/zoom ở tier mid.
- Dồn việc nặng vào lúc tải: precompile shader cho mọi trạng thái (đêm, mưa, lễ hội), upload GPU, dựng BVH trước khi cho thao tác.
- Trong `useFrame`: không tạo object/array, không setState của React. Dispose geometry, material, texture khi gỡ. Đồ vật lặp lại dùng InstancedMesh. Parse và giải nén trong worker.

## Lệnh và quy trình

- Bun 1.4.3 theo CI; cài bằng `bun install --frozen-lockfile`. Không đổi guard 24 giờ để cài cho được.
- `bun run check`: typecheck, lint, unit, pipeline và build. `bun run test:e2e`: Chromium, Firefox, WebKit. Pipeline có package riêng; script chạy trên Windows và Linux.
- Nhánh `codex/<milestone>-<scope>` từ main mới nhất; commit nhỏ Conventional Commits. Code, comment và commit bằng tiếng Anh; docs tiếng Việt; UI VI mặc định, có EN.
- Trước merge: local gate đạt, CI bốn job success đúng full head SHA, nhánh không behind main, self-review ở phiên riêng, gitleaks và quét diff sạch. Chỉ merge commit; không auto-merge trước đủ cổng.
- Sau merge: CI push main bốn job success; nếu đỏ, sửa hoặc revert bằng PR mới. Ghi PR/head/merge SHA/run ID/counts và giới hạn kiểm chứng vào `docs/CODEX_LOG.md`.
- Skip không phải pass. GPU thật phải có renderer, driver và phiên bản trình duyệt; SwiftShader không chứng minh hiệu năng phần cứng. Không đổi assertion, capability guard hoặc timeout H6 90 giây để làm xanh.
- Đạt §7 bàn giao mới báo `READY_FOR_FINAL_AUDIT`; đóng băng main, tạo tag audit và hoàn tất `docs/AUDIT_PACKET.md`.

## Định nghĩa "Xong" cho mọi PR

- Lệnh kiểm tra (và e2e khi đã có) đạt; không có cảnh báo mới trong console.
- Không vi phạm quy tắc cứng; gitleaks sạch (từ P2).
- Đạt ngân sách hiệu năng ở tier liên quan.
- Docs được cập nhật nếu có quyết định mới.
