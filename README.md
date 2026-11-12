# Phố Nhà Mình / Home 3D

Ứng dụng sa bàn 3D tĩnh của khu phố quanh một ngôi nhà đang xây để cho thuê. Snapshot OSM canonical có 138 đường và 317 footprints, giấy phép ODbL 1.0, ghi công [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Có sáu preset thời điểm/thời tiết, hai chế độ xem và nhãn quy hoạch trong Mặt bằng. `verificationStatus` giữ `REAL_WORLD_NOT_VERIFIED` cho đến khi chủ sở hữu cung cấp số đo và nghiệm thu thực địa; không bịa ranh lô hay cao độ. Fixture tổng hợp vẫn dùng cho unit test và editor.

Stack: TanStack Start, React 19, Three.js trực tiếp, TypeScript và Bun 1.4.3. Giữ cấu hình `@lovable.dev/vite-tanstack-config` để tương thích [dự án Lovable](https://lovable.dev/projects/233f103b-6806-4738-9cc3-913722e17ad6). main là nhánh Lovable sync. [Bản công khai](https://nhacvl.lovable.app/) chỉ thay đổi khi chủ sở hữu Publish.

## Phát triển và kiểm chứng

Cài Bun 1.4.3, Node.js 22 và Git. Trên Windows dùng đường dẫn ngắn, ngoài thư mục đồng bộ. Không nâng Bun toàn máy nếu dự án khác phụ thuộc phiên bản riêng.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun x playwright install chromium firefox webkit
bun run test:e2e
```

`check` gồm typecheck, lint, unit/coverage, pipeline và production build/budget. Unit test Vitest chạy trên Node (`bun run test`, `bunx vitest run`, `bun run check`); không dùng `bun --bun vitest` hay `bun test`. Golden tuyến POV được mô tả trong [docs/POV_ROUTE_GOLDEN.md](docs/POV_ROUTE_GOLDEN.md). Các kiểm tra GPU thật và soak chạy riêng theo runbook; CI hoặc Playwright WebKit không thay thế thiết bị thật. Không bỏ qua kết quả fail/skip. Guard tuổi dependency 24 giờ nằm trong `bunfig.toml`.

## Cấu trúc

- `src/routes`, `src/components`: vỏ giao diện và route; engine tải phía client.
- `src/engine`, `src/atmosphere`: scene Three.js, mô phỏng, thời tiết và âm thanh.
- `src/world`, `src/geo`, `src/memories`: phiên world riêng, chuyển đổi toạ độ và kỷ niệm.
- `src/state`: UI state an toàn; không chứa gói khu thật hay georeference riêng.
- `pipeline`: công cụ dữ liệu có dependency riêng; đầu ra private bị gitignore.
- `scripts`, `tests`, `docs/assets/qa`: harness và bằng chứng fixture tổng hợp.

## Giới hạn và quy trình

Snapshot OSM đã được chủ dự án cho phép (`src/world/data/homeNeighborhood.json`, 138 đường và 317 footprints, ODbL 1.0) cùng companion G1 là dữ liệu khu phố canonical. Không chạy prettier hay formatter khác trên `src/world/data/*.json`. Không bịa ranh lô hay cao độ. Không suy dựng hình học từ ảnh, Street View, Google Earth hay 3D Tiles; nút Phố thật chỉ mở Google Maps bằng liên kết ngoài khi người dùng xác nhận. Giữ dòng ghi công © OpenStreetMap contributors luôn nhìn thấy, không cắt. Fixture tổng hợp vẫn dùng cho unit test và editor. Không có secret trong `.env` hoặc bundle client. Ảnh đi qua kiểm metadata và review riêng trước khi xuất public.

main là nhánh Lovable sync. Mọi thay đổi qua PR và merge commit sau các cổng trong [bàn giao](docs/CODEX_HANDOFF.md). Không push thẳng main; không force-push, rebase, amend hay squash các commit đã đẩy lên main. Không sửa khối `LOVABLE:BEGIN` trong `AGENTS.md`. Codex không Publish, deploy, đổi cài đặt dịch vụ hoặc truy cập dữ liệu riêng khi chưa được chỉ định.

Đọc [AGENTS.md](AGENTS.md), [nhật ký](docs/CODEX_LOG.md), [quyết định](docs/DECISIONS.md), [backlog](docs/BACKLOG.md), [gói audit](docs/AUDIT_PACKET.md), [attribution](docs/ATTRIBUTION.md) và [runbook H6](docs/H6_PRIVATE_WORLD_RUNBOOK.md). Chưa chọn giấy phép mã nguồn; không suy ra quyền sử dụng từ visibility public.
