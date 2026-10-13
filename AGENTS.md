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
- All map/scene state lives in the single zustand store `src/state/appStore.ts`; UI controls only read/write it so a future 3D engine can subscribe without touching UI.
- `SceneViewport` mounts a client-only fictional Three.js demo in `#scene-root`; all geographic/private data is absent.
- UI strings come from `src/i18n/{vi,en}.ts` via `useT()`; never hardcode copy in components.

# Phố Nhà Mình — hướng dẫn cho agent

Web app bản đồ 3D khu phố quanh nhà Syringa, nhà làm tâm. Kế hoạch gốc là trang Notion "Phố Nhà Mình — Siêu kế hoạch map 3D"; `docs/PLAN.md` là bản sao, lệch nhau thì theo Notion. Chỉ làm đúng pha hoặc việc được giao. Demo 1 là ngoại lệ lát cắt xuyên pha được chủ dự án cho phép: bản chạy thử hư cấu trước, chi tiết sau. Xem `docs/DECISIONS.md` và `docs/BACKLOG.md`; không tự thêm dữ liệu thật.

Khối LOVABLE ở đầu file do Lovable quản lý: giữ nguyên. Mục "Project rules" do Lovable viết khi dựng vỏ, vẫn đúng, Demo 1 đã thay câu placeholder bằng engine Three.js client-only; các pha 3D đầy đủ vẫn chưa hoàn tất.

## Sự thật cố định

- Bản đồ có đúng một tâm: nhà mình (gốc ENU). Không thêm bộ chọn địa điểm, danh sách hay thẻ "Góc phố", không đổi tâm. Kỷ niệm (P10) là ghim trên bản đồ: chạm vào thì camera bay tới, tâm vẫn là nhà.
- Nhà cũ đã phá để xây lại: lô nhà để trống. Không dựng lại nhà cũ (OSM, Overture, Open Buildings và ảnh Street View 06/2024 vẫn còn nhà cũ). Nhà mới thêm sau: model kiến trúc sư (P6), bản quét khi xây xong (P11).
- Khu nhà chưa có Google Photorealistic 3D. Phố mình (tự dựng từ dữ liệu mở và khảo sát) là lớp chính; Phố thật chỉ mở Google Maps qua đường link.
- OSM ở khu này gần như không có số tầng: chiều cao lấy từ khảo sát, Open Buildings bù chỗ thiếu.

## Vai trò (theo trang Notion "Bảng giao việc Hermes và Cue")

- **Syringa** (chủ dự án): giữ mọi key, token, cấu hình riêng; merge; upload R2; deploy bản riêng tư; bấm Publish trên Lovable.
- **Notion AI**: lập kế hoạch, viết code và patch, review PR, xác nhận PR merge được hay chưa.
- **Hermes** (máy Syringa): áp patch hoặc code theo pha được giao; chạy test, build, e2e; push nhánh, mở PR; ghi kết quả lên Bảng giao việc.
- **Cue** (VPS): chỉ việc cần máy chạy 24/7 hoặc ở nước ngoài.

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
- Toạ độ trong repo chỉ là ENU tương đối (mét). Gốc lat/lng chỉ đến từ cấu hình riêng.
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
- Không tạo `.hermes.md` hay `AGENTS.override.md` (Hermes sẽ ưu tiên chúng và bỏ qua file này).

### 4. Asset

- File trên 1 MB (GLB, KTX2, splat, âm thanh, ảnh) không commit. Pipeline xuất ra `pipeline/out/` (gitignored); Syringa upload R2. App đọc qua `manifest.json` có hash.

### 5. Phạm vi

- Không sửa file ngoài phạm vi việc hoặc patch được giao. Việc ngoài phạm vi ghi vào `docs/BACKLOG.md`, không tự làm. Quyết định kiến trúc mới ghi vào `docs/DECISIONS.md`.

## Stack

- App: mặc định của Lovable: TanStack Start, React 19, TypeScript, Tailwind 4, shadcn/ui, vite.
- 3D (từ P3): three, @react-three/fiber 9, @react-three/drei 10 (khớp React 19). WebGL2 là nền, chưa dùng WebGPU.
- State: zustand. `src/state/appStore.ts` là nguồn duy nhất; UI và engine chỉ giao tiếp qua store.
- Khác: 3d-tiles-renderer (tileset của mình), camera-controls (qua drei), postprocessing + n8ao, three-mesh-bvh, suncalc, âm lịch Hồ Ngọc Đức (múi giờ +7), Open-Meteo.
- Giờ hiển thị luôn theo `Asia/Ho_Chi_Minh`, không theo múi giờ của máy hay server.
- Kiểm thử: vitest (đã có); @playwright/test, size-limit, gitleaks (thêm ở P2).

## Hệ toạ độ

- Mét. Gốc (0, 0, 0) = tâm lô nhà, cao độ mặt đường trước nhà.
- three.js Y-up: +X Đông, +Y Lên, −Z Bắc.
- Chuyển đổi WGS84 ↔ ECEF ↔ ENU chỉ ở `src/geo/` (pipeline dùng chung code này). Test: sai số dưới 1 cm trong bán kính 2 km.

## Ngân sách hiệu năng (vượt = chưa xong)

| Tier | DPR tối đa | Draw calls | Tam giác hiển thị | Bộ nhớ GPU | FPS |
|---|---|---|---|---|---|
| low | 1.0 | ≤ 120 | ≤ 400k | ≤ 200 MB | ≥ 30 |
| mid | 1.5 | ≤ 200 | ≤ 800k | ≤ 350 MB | ≥ 55 |
| high | 2.0 | ≤ 400 | ≤ 3M | ≤ 1 GB | 60 |

- JS của vỏ ≤ 250 KB gzip; engine tách chunk. Không frame nào quá 50 ms khi đang xoay/zoom ở tier mid.
- Dồn việc nặng vào lúc tải: precompile shader cho mọi trạng thái (đêm, mưa, lễ hội), upload GPU, dựng BVH trước khi cho thao tác.
- Trong `useFrame`: không tạo object/array, không setState của React. Dispose geometry, material, texture khi gỡ. Đồ vật lặp lại dùng InstancedMesh. Parse và giải nén trong worker.

## Lệnh

- Cài: `bun install --frozen-lockfile`.
- Hiện có: `bun run dev`, `bun run build`, `bun run test`, `bun run lint`; kiểm kiểu: `bunx tsc --noEmit`.
- P2 thêm: `typecheck`, `test:e2e`, `check` (= typecheck + lint + test + build + size-limit).
- Lint đang đỏ sẵn từ bản Lovable (chủ yếu Prettier) cho tới commit Prettier ở P2: không thêm lỗi lint mới; file mới phải sạch lint.
- Pipeline: `cd pipeline` rồi chạy script tương ứng. Script chạy được trên Windows và Linux.

## Quy trình mỗi việc

1. Nhánh `p<số pha>-<tên ngắn>` từ main mới nhất (việc có patch: dùng đúng tên nhánh ghi trong việc).
2. Commit nhỏ theo Conventional Commits. Code, comment, commit: tiếng Anh. UI: tiếng Việt mặc định, có tiếng Anh. Docs: tiếng Việt.
3. Trên máy: các lệnh kiểm tra đạt. Khi đã có e2e (từ P2): chromium, firefox, webkit (viewport desktop, iPhone, Android) đạt trước khi mở PR, để tiết kiệm phút Actions. E2E trong CI là smoke: chấp nhận nhánh fallback khi trình duyệt headless không có WebGL2; test hình ảnh và hiệu năng chạy trên máy có GPU.
4. PR gồm: việc đã làm theo "Phạm vi" của pha; checklist "Xong khi"; ảnh desktop và mobile; số đo hiệu năng trước/sau khi có đụng 3D (fps p50/p95, draw calls, tam giác).
5. Báo kết quả trên Bảng giao việc theo mẫu ở đó: PR, nhánh; SHA head (đủ 40 ký tự); dòng tổng của `git diff --stat origin/main...HEAD`; CI run (ID, event, SHA, kết luận từng job), hoặc kết quả từng lệnh trên máy khi repo chưa có CI. Job lỗi: tên bước và khoảng 30 dòng log cuối (che mọi giá trị trông giống secret).
6. Không merge khi Notion AI chưa xác nhận. Syringa merge; Lovable nhận commit trên main; Syringa bấm Publish.

## Định nghĩa "Xong" cho mọi PR

- Lệnh kiểm tra (và e2e khi đã có) đạt; không có cảnh báo mới trong console.
- Không vi phạm quy tắc cứng; gitleaks sạch (từ P2).
- Đạt ngân sách hiệu năng ở tier liên quan.
- Docs được cập nhật nếu có quyết định mới.
