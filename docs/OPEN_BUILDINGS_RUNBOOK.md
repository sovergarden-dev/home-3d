# Chiều cao Open Buildings Temporal — xử lý cục bộ

`PARTIAL`: thuật toán và bộ đọc đã kiểm bằng fixture tổng hợp; chưa có lần chạy trên khu thật. Không tìm vùng, tải tile hay đăng nhập Google/Earth Engine. Chỉ chủ dự án cung cấp đường dẫn và mục đích thì Codex mới đọc dữ liệu thật.

## Nguồn và ý nghĩa

[Catalogue v1](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1) hiện mô tả các năm 2016–2023. Raster phát hành 0,5 m, độ phân giải hiệu dụng khoảng 4 m; không suy độ chính xác 0,5 m từ kích thước pixel. [Hướng dẫn nhà sản xuất](https://sites.research.google/gr/open-buildings/temporal/) yêu cầu dùng height cùng presence. Presence là độ tin cậy chưa hiệu chuẩn; ngưỡng 0,8 không có nghĩa xác suất 80%. Giấy phép chọn CC-BY-4.0 theo bàn giao, giữ ghi công Google Research và Copernicus Sentinel-2.

Height là chiều cao trên nền đất, không phải cao độ tuyệt đối. Pipeline lấy trung vị các mẫu hợp lệ trong footprint đã có, bỏ lỗ và phần ngoài geometry; trừ roofHeight đã biết để không cộng mái hai lần. Mái chưa biết không được xác nhận thành mái thật. Giá trị ngoài 0–100 m, bằng 0, NoData hoặc dưới ngưỡng presence bị bỏ; thiếu mẫu giữ unknown.

## Hai đường vào

- `pipeline/src/enrich-canonical.ts`: ưu tiên với package canonical hiện có và companion G1 khớp hash. Không dựng lại footprint từ nguồn mới.
- `pipeline/src/cli.ts`: config pipeline nguồn hiện có có thể thêm trường openBuildings; bước height chạy sau build/conflation, giữ override tách riêng.

GeoTIFF chỉ đọc từ file cục bộ, hỗ trợ WGS84 EPSG:4326 và WGS84 UTM 32601–32660/32701–32760, affine và pixel area/point. Reader đọc cửa sổ nhỏ tại từng footprint, không nạp toàn tile vào RAM. Năm lớn nhất trong danh sách file được cung cấp là năm được dùng; vùng năm đó không có mẫu không fallback sang năm cũ. Band height và presence phải chỉ định rõ bằng index bắt đầu từ 0, theo metadata file thực; không mặc định thứ tự ví dụ là thứ tự của mọi nhà cung cấp.

## Quy tắc giữ nguyên

Không thêm building, đổi polygon, topology, ID, tầng, mái hay đường. Bỏ qua building/part có override hoặc height/tầng đã có căn cứ. Không gán cho footprint chạm bất kỳ polygon lô hoặc vùng bảo vệ quanh tâm. Vùng tâm là hình vuông bảo thủ bao quanh bán kính cấu hình, không phải ranh lô hay số đo khảo sát.

Provenance của wallHeight mới: open_buildings / inferred, sourceRevision v1/năm, CC-BY-4.0. Manifest ghi nguồn bổ sung; không đổi chất lượng world thành verified. Chi tiết conflation/nhãn nguồn ở file report local; stdout chỉ đếm tổng hợp, không ID, tọa độ, đường dẫn hoặc hash riêng.

## Chủ dự án chuẩn bị và chạy

1. Giữ package, companion, config, GeoTIFF và output ở thư mục riêng ngoài repo và OneDrive. Không gửi file/ảnh/tọa độ vào PR, CI, log hay artifact public. Không dùng ảnh Google Maps/Street View để tạo hoặc kiểm model.
2. Xác nhận companion G1 gắn đúng byte của package nguồn. CLI canonical từ chối hash sai; không tự suy hoặc thay origin.
3. Chuẩn bị config local schemaVersion 1.0 với packagePath, georeferencePath, openBuildings và output. Output có ba tên file mới: packagePath, georeferencePath, reportPath. Đường dẫn tương đối được tính từ file config, không từ repo. Không dùng URL tải từ mạng.
4. openBuildings gồm centerExclusionRadiusMetres dương, presenceThreshold trong (0,1], tiles là danh sách path/year/heightBand/presenceBand. Chọn vùng bảo vệ tâm từ hiểu biết lô đã xác nhận; chưa rõ thì dùng vùng bảo thủ rộng hơn và giữ các nhà đó unknown. Không coi ngưỡng presence là bằng chứng khảo sát.
5. Với Bun 1.4.3 và dependency đã cài frozen trong pipeline, đặt biến tiến trình HOME3D_LOCAL_CONFIG tới config riêng; chạy từ repo:

```powershell
bun pipeline/src/enrich-canonical.ts --config "$env:HOME3D_LOCAL_CONFIG" --dry-run
bun pipeline/src/enrich-canonical.ts --config "$env:HOME3D_LOCAL_CONFIG"
```

Dry run không ghi output. Lệnh thật không ghi đè nguồn hoặc file output đã có. Nếu ghi bị gián đoạn, kiểm ba file riêng và chọn bộ tên mới trước khi thử lại; không dùng package/companion chưa kiểm ghép cặp. CLI tạo companion mới giữ nguyên origin và hash của đúng byte package đã enrich. Companion cũ phải bị app từ chối với package mới; không nới guard G1.

6. Mở package mới và companion mới trong app local, kiểm Mặt bằng trung tính trước 3D. So số lượng/ID/geometry với nguồn; chỉ height/provenance và metadata nguồn được thay. Kiểm các nhà đã khảo sát, vùng tâm/lô, mái và dữ liệu bị bỏ qua. Đánh giá sai lệch bằng khảo sát của chủ dự án, không dùng raster như số đo thực địa.
7. Chỉ báo số tổng hợp đã khử nhận dạng. Nếu nguồn yêu cầu tài khoản, chi phí hoặc nguồn dữ liệu khác, chủ dự án quyết định; Codex không tự đăng nhập/tạo tài khoản.

## Bằng chứng và giới hạn

Đã chạy: 50 test pipeline đạt (kể cả ranh lô override và tie-point raster lệch gốc), gồm median/holes/roof/preservation/config, đọc GeoTIFF tổng hợp thật WGS84/UTM, CLI canonical giữ geometry và binding G1, cùng summary loại bỏ ID/nhãn riêng. Full gate sau tích hợp M4 và dữ liệu thật chưa kiểm. Dependency geotiff/proj4 và các gói bắc cầu có tarball đúng integrity, tuổi trên 24 giờ, không native OS binary/install script; xem dependency-review.json và ATTRIBUTION.

`REAL_WORLD_NOT_VERIFIED`: chưa xác minh vùng phủ, band metadata, chất lượng height tại khu nhà, file dữ liệu thật, hoặc G1 mới trên dữ liệu của chủ dự án. Không chứng nhận độ giống thực địa từ fixture tổng hợp. Đầu ra phải được chủ dự án rà soát trước mọi sử dụng riêng; không tự Publish/deploy.
