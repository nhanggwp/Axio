# Axio · Hình học 2D

Ứng dụng dựng hình bằng React, TypeScript, GeoGebra, Express, DeepSeek và Better Auth. Giao diện tiếng Việt; có nhiều phiên độc lập, xem trước/áp dụng thao tác AI, Undo/Redo, tài liệu tài khoản và nhập/xuất GGB/PNG/SVG.

## Phát triển

Cần Node.js 22.13+; kiểm thử trình duyệt dùng Google Chrome.

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Mở `http://127.0.0.1:5173`. Điền khóa DeepSeek ở `.env` phía server. Không đưa khóa vào biến Vite hoặc mã client.

SMTP cục bộ, mở hai terminal:

```sh
npm run mail:dev
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 npm run dev
```

Hộp thư thử nghiệm ở `http://127.0.0.1:8025`; thư không gửi ra Internet. Khi thiếu SMTP, ứng dụng báo đăng ký/xác minh/quên mật khẩu chưa khả dụng; chế độ khách và đăng nhập tài khoản đã xác minh vẫn hoạt động.

## Docker và triển khai

```sh
cp .env.example .env.production
# Điền APP_ORIGIN=https://ten-mien, BETTER_AUTH_SECRET và DEEPSEEK_API_KEY.
# Sinh secret bằng: openssl rand -hex 48
AXIO_IMAGE_TAG=local docker compose build
AXIO_IMAGE_TAG=local docker compose up -d --wait
```

Container chạy bằng tài khoản không phải root, tự khởi động lại, có healthcheck và volume SQLite bền `axio_data`. API chỉ công bố ở `127.0.0.1:3007`; đặt Nginx/TLS phía trước. Migrations tự chạy lúc khởi động. Không dùng `docker compose down -v` nếu cần giữ dữ liệu.

Dùng `deploy/nginx.conf.template` với tên miền và cổng thực. Tạo bản ghi A của tên miền về máy chủ, cấp chứng chỉ Let's Encrypt qua webroot `/var/www/axio-acme`, rồi cài cấu hình TLS. Khi thay template bằng `envsubst`, chỉ thay hai biến:

```sh
envsubst '${AXIO_DOMAIN} ${AXIO_PORT}' < deploy/nginx.conf.template
```

Giữ `.env.production` ngoài Git và Docker image, quyền `600`. Giữ nguyên `BETTER_AUTH_SECRET` và volume dữ liệu giữa các lần cập nhật. Gắn tag image theo commit để có thể quay lại phiên bản trước. Khi triển khai theo thư mục release, symlink `.env.production` trong release tới tệp cấu hình dùng chung ngoài release.

Các biến chính:

| Biến | Ý nghĩa |
| --- | --- |
| `APP_ORIGIN` | Origin HTTPS chính xác của ứng dụng khi production |
| `BETTER_AUTH_SECRET` | Secret riêng, ổn định, ít nhất 32 ký tự |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Khóa server và model, mặc định `deepseek-flash` |
| `DEEPSEEK_REASONING_EFFORT` | `none`, `low`, `high`, `max`; mặc định `low` |
| `DATABASE_PATH` | SQLite; container dùng `/app/data/axio.sqlite` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP thực; không dùng SMTP cục bộ trên máy production |
| `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Cấu hình gửi thư |
| `TRUST_PROXY` | `0` khi truy cập trực tiếp; Compose dùng `1` sau một Nginx và cổng chỉ bind loopback |
| `AI_GUEST_DAILY_LIMIT`, `AI_USER_DAILY_LIMIT` | Lượt AI mỗi ngày UTC, mặc định 20/100 |
| `AXIO_IMAGE_TAG`, `AXIO_PORT` | Tag image và cổng loopback của Compose, mặc định local/3007 |

HTTPS cần thiết cho cookie bảo mật và các API trình duyệt như `crypto.randomUUID`. Production không mở CORS; origin phải khớp `APP_ORIGIN`. Sao lưu SQLite trước cập nhật có thay đổi lược đồ; volume không tự đồng bộ giữa nhiều máy chủ.

## Kiểm tra

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
# Dùng hạn mức API DeepSeek thật:
RUN_LIVE_AI=1 npm run test:e2e
RUN_LIVE_AI=1 npx playwright test --config tests/probes/playwright.config.ts
```

Kiểm thử dùng server/SQLite/SMTP riêng. Thư mục `docs/` chỉ chứa báo cáo và ảnh kiểm tra cục bộ, được loại khỏi Git và Docker image; bài kiểm thử tự tạo thư mục này khi cần.

## Phạm vi

Mỗi phiên có hình GGB, chat và bản nháp riêng, tự lưu trên trình duyệt hiện tại. Undo/Redo riêng theo phiên trong lần mở trang; chưa đồng bộ toàn bộ chat giữa các thiết bị. Tài liệu tài khoản được lưu trên server và kiểm tra quyền sở hữu.

Agent tạo kế hoạch có schema, dựng thử trong GeoGebra rồi kiểm tra các quan hệ đã khai báo. Có kiểm tra phụ thuộc bằng di chuyển điểm trong preview và vòng tự sửa giới hạn. Đây là kiểm tra số trên một số cấu hình, không phải bộ chứng minh hình học hay bảo đảm mọi đề đều được giải đúng. Không chạy JavaScript/lệnh thô do model gửi.
