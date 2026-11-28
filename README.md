# Phố Nhà Mình / Home 3D

Sa bàn 3D khu phố lõi 180 m quanh ngã tư Châu Văn Liêm × Trần Hưng Đạo, kết hợp đường OpenStreetMap (ODbL 1.0, [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)), khối nhà Overture Maps / Google Open Buildings (CC BY 4.0) và 15 công trình cụm tâm. Cảnh hỗ trợ xoay Diorama, Mặt bằng, góc nhìn Đi bộ / Ngồi sau xe ôm, chạm nhà/đường để xem thông tin (`FeatureInspectorCard`), nút Phố thật mở Google Street View / Vệ tinh ở tab ngoài khi xác nhận, Tiếng phố mô phỏng, Hoàng hôn 17:45, Giờ Sài Gòn (UTC+7), đèn Tết / Trung Thu opt-in và tải bưu thiếp 2K. `verificationStatus` giữ `REAL_WORLD_NOT_VERIFIED` cho đến khi chủ sở hữu cung cấp số đo và nghiệm thu thực địa; không bịa ranh lô hay cao độ. Fixture tổng hợp vẫn dùng cho unit test và editor.

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
