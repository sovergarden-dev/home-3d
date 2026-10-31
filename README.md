# Phố Nhà Mình / Home 3D

Ứng dụng khu phố 3D với một tâm cố định là nhà, điều khiển ngày/giờ/thời tiết, đời sống và âm thanh tổng hợp, kỷ niệm, tour và bưu thiếp. Bản công khai luôn là phố hư cấu. Gói khu thật chỉ được chủ sở hữu chọn từ file cục bộ; dữ liệu không gửi lên server hoặc SSR.

Stack: TanStack Start, React 19, Three.js trực tiếp, TypeScript và Bun 1.4.3. Giữ cấu hình `@lovable.dev/vite-tanstack-config` để tương thích [dự án Lovable](https://lovable.dev/projects/233f103b-6806-4738-9cc3-913722e17ad6). [Bản công khai](https://nhacvl.lovable.app/) chỉ thay đổi khi chủ sở hữu Publish.

## Phát triển và kiểm chứng

Cài Bun 1.4.3, Node.js 22 và Git. Trên Windows dùng đường dẫn ngắn, ngoài thư mục đồng bộ. Không nâng Bun toàn máy nếu dự án khác phụ thuộc phiên bản riêng.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun x playwright install chromium firefox webkit
bun run test:e2e
```

`check` gồm typecheck, lint, unit/coverage, pipeline và production build/budget. Các kiểm tra GPU thật và soak chạy riêng theo runbook; CI hoặc Playwright WebKit không thay thế thiết bị thật. Không bỏ qua kết quả fail/skip. Guard tuổi dependency 24 giờ nằm trong `bunfig.toml`.

## Cấu trúc

- `src/routes`, `src/components`: vỏ giao diện và route; engine tải phía client.
- `src/engine`, `src/atmosphere`: scene Three.js, mô phỏng, thời tiết và âm thanh.
- `src/world`, `src/geo`, `src/memories`: phiên world riêng, chuyển đổi toạ độ và kỷ niệm.
- `src/state`: UI state an toàn; không chứa gói khu thật hay georeference riêng.
- `pipeline`: công cụ dữ liệu có dependency riêng; đầu ra private bị gitignore.
- `scripts`, `tests`, `docs/assets/qa`: harness và bằng chứng fixture tổng hợp.

## Giới hạn và quy trình

Repo, PR, CI, log và artifact chỉ chứa fixture tổng hợp. Không commit dữ liệu, toạ độ, geometry, ảnh hay đường dẫn khu thật. Không suy dựng từ ảnh/Street View/Google 3D; Phố thật chỉ mở Google Maps khi người dùng chủ động xác nhận. Không có secret trong `.env` hoặc bundle client. Ảnh đi qua kiểm metadata và review riêng trước khi xuất public.

Mọi thay đổi qua PR và merge commit sau các cổng trong [bàn giao](docs/CODEX_HANDOFF.md). Không push thẳng main hoặc viết lại lịch sử đã push. Codex không Publish, deploy, đổi cài đặt dịch vụ hoặc truy cập dữ liệu riêng khi chưa được chỉ định.

Đọc [AGENTS.md](AGENTS.md), [nhật ký](docs/CODEX_LOG.md), [quyết định](docs/DECISIONS.md), [backlog](docs/BACKLOG.md), [gói audit](docs/AUDIT_PACKET.md), [attribution](docs/ATTRIBUTION.md) và [runbook H6](docs/H6_PRIVATE_WORLD_RUNBOOK.md). Chưa chọn giấy phép mã nguồn; không suy ra quyền sử dụng từ visibility public.
