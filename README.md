# MeetMind

Trợ lý cho cuộc họp trực tuyến: **phụ đề trực tiếp** theo ngôn ngữ từng người, **tài liệu chia sẻ** trong họp, **biên bản tự động**.
Họp được trên **Google Meet** hoặc **Zoom**. Người tạo phiên chọn nền tảng; mọi thứ còn lại (phụ đề, dịch, tài liệu, biên bản) dùng chung.

| | Google Meet | Zoom |
|---|---|---|
| Video | Mở ở tab hoặc cửa sổ Meet riêng (Google không cho nhúng) | **Nhúng ngay trong phòng họp MeetMind** (tab Zoom) |
| Tạo phòng | Nút "Tạo phòng Meet" (đồng ý với Google một lần) | Nút "Tạo cuộc họp Zoom" (đồng ý với Zoom một lần) |
| Lấy lời nói | Bot Attendee vào họp, đọc phụ đề có sẵn của Meet | Bot Attendee vào họp, đọc phụ đề có sẵn của Zoom |

Hướng dẫn cài đặt từng bước, kể cả cách lấy các khóa Google, Zoom và Cloudflare: **[docs/SETUP.md](docs/SETUP.md)**.

## Đã làm được

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Đăng nhập bằng Google (Google xác minh email), không mật khẩu. Có thể bật thêm đăng nhập bằng mã 6 số gửi qua email (mã dùng một lần, hết hạn sau 10 phút, sai 5 lần thì khóa) |
| Tổ chức | Tạo tổ chức; mời thành viên bằng email; vai trò chủ sở hữu / quản trị viên / thành viên; thu hồi lời mời, xóa thành viên, rời tổ chức; luôn còn ít nhất một chủ sở hữu |
| Phiên họp | Thuộc một tổ chức; **chọn Meet hoặc Zoom khi tạo**; mời người tham gia bằng email (cả người ngoài tổ chức, họ là khách của phiên đó); chủ trì và đồng chủ trì; mã tham gia dự phòng; link được kiểm tra khớp với nền tảng |
| Zoom | Tạo cuộc họp Zoom từ MeetMind (OAuth); **video Zoom nhúng trong phòng họp** bằng Zoom Meeting SDK, hai tab bên trái: **Zoom** và **Tài liệu** |
| Phụ đề | Bot vào họp, phụ đề hiện trực tiếp kèm tên người nói; mỗi người chọn ngôn ngữ đọc riêng, chỉ dịch những ngôn ngữ đang có người đọc; đổi ngôn ngữ giữa chừng thì dịch bù phần vừa qua |
| Tài liệu | Chủ trì tải lên PDF / Word / PowerPoint (tự chuyển sang PDF), lưu trong MinIO; nhiều tài liệu, nhiều tab; chuyển tab không mất vị trí đang đọc; cho phép hoặc cấm thành viên tải bản gốc |
| Theo dõi người trình bày | Một người trình bày điều khiển vị trí đọc của cả phòng; người xem có thể tự đọc rồi quay lại; thành viên xin quyền, chủ trì duyệt hoặc trao quyền |
| Biên bản | Tự soạn khi họp kết thúc: tóm tắt, chủ đề, quyết định, công việc (người phụ trách, thời hạn), mỗi mục dẫn về câu gốc; chủ trì sửa, lưu nháp, chốt; xuất Word và Markdown |

## Chạy nhanh (demo, không cần tài khoản nào)

Bot được giả lập bằng một cuộc họp mẫu, "mô hình ngôn ngữ" là bộ quy tắc đơn giản, email chỉ ghi ra log (mã đăng nhập hiện ngay trên màn hình đăng nhập).

```bash
make setup      # tạo .env với khóa ngẫu nhiên
make up-demo    # Ollama + backend + giao diện, bot giả lập
```

Mở http://localhost:3000, đăng nhập bằng email bất kỳ, tạo tổ chức, tạo phiên họp (chọn Meet hoặc Zoom, link chỉ để điền cho đủ), bấm **Gọi bot vào họp**.
Chạy trực tiếp không qua Docker và các lệnh đầy đủ: xem [docs/SETUP.md](docs/SETUP.md).

## Chạy thật

```bash
make setup      # lần đầu, rồi điền .env: khóa MinIO, DATABASE_URL
make up         # dựng tất cả: Ollama, bot Attendee, backend, giao diện
```

`make up` còn cần các khóa của Google và Zoom nếu bạn muốn đăng nhập Google, tạo phòng tự động và nhúng Zoom. Lấy chúng ở đâu, điền vào đâu: **[docs/SETUP.md](docs/SETUP.md)** (mục 3 đến 6).
Lệnh `make` liệt kê mọi lệnh con. Compose chỉ chạy backend và giao diện; MinIO, PostgreSQL và Ollama là của máy bạn. Backend chạy ở mạng của máy chủ (`network_mode: host`, chỉ Linux).

### Địa chỉ công khai (Cloudflare Tunnel)

Zoom chỉ nhận địa chỉ callback dạng `https://`. Khi chạy trên máy, dùng Cloudflare Tunnel để có địa chỉ `https://` cố định về `localhost`
(dịch vụ `cloudflared` trong `docker-compose.yml`, profile `tunnel`). Cách dựng: [docs/SETUP.md](docs/SETUP.md) mục 5.
**Cảnh báo:** khi đưa giao diện và API ra internet phải có cách chặn người lạ (đăng nhập Google có danh sách Test users, hoặc Cloudflare Access). Xem mục "Bảo mật" trong SETUP.

## Cấu trúc mã

```
backend/
  core/            nghiệp vụ, không import adapter hay thư viện hạ tầng
    models.py ports.py platforms.py   mô hình, các interface (MeetingBot, LLM, Translator, ObjectStore ...), nhận dạng nền tảng Meet/Zoom
    services/                         auth, orgs, invitations, meetings, meet_rooms, documents, presenter, live_pipeline, minutes ...
  adapters/        cài đặt cụ thể của từng port:
                   bot (attendee, fake, router: chọn bot theo nền tảng), meet (google, zoom: tạo phòng), llm, translate,
                   storage (minio, local), email (smtp, console), db (SQLAlchemy), docproc (LibreOffice), export (docx, markdown), asr
  app/             FastAPI: routes, WebSocket, container.py (nơi duy nhất biết adapter nào ứng với port nào)
  prompts/         prompt có đánh số phiên bản
  tests/
frontend/          Next.js + TypeScript, CSS thuần
  src/hooks/       useMeetingRoom (REST + WebSocket), useDocTabs
  src/components/  PdfViewer, DocumentPane, TranscriptPanel, ParticipantsPanel, ZoomEmbed, InviteBox ...
deploy/            tạo API key cho Attendee, ghi .env
docs/              SETUP.md (cài đặt, bắt buộc đọc), ARCHITECTURE.md và DESIGN.md (thiết kế ban đầu, chưa cập nhật đủ)
```

Đổi bot, mô hình, kho lưu trữ hay cách gửi email là thêm một adapter hoặc sửa `config.yaml`, không đụng phần `core`.

## Kiểm thử

```bash
cd backend && pytest        # 53 test, 1 test MinIO bị bỏ qua nếu không có MinIO
cd frontend && npm run typecheck && npm run build
```

Test có ở các nhóm: luồng phiên họp end to end, nền tảng Meet/Zoom và chọn bot, tạo phòng Meet và Zoom (gọi API được giả lập), chữ ký Zoom SDK, đăng nhập Google (kiểm tra token giả lập), tài khoản và tổ chức, tài liệu, WebSocket và người trình bày.

## Trạng thái kiểm chứng

**Đã chạy thật:**
- Toàn bộ test backend; chạy cả trên PostgreSQL và MySQL ở các đợt trước.
- Tạo phiên Zoom, tạo cuộc họp Zoom từ MeetMind (OAuth), bot Attendee vào họp Zoom, **video Zoom nhúng trong phòng** hiển thị người tham gia, qua tên miền thật bằng Cloudflare Tunnel.
- Giao diện chọn nền tảng, hai tab Zoom và Tài liệu.
- Dịch và biên bản bằng Ollama `qwen2.5:3b` trên RTX 3050 4 GB (xem chất lượng bên dưới).

**Chưa kiểm chứng (đừng coi là chạy được):**
- **Phụ đề của Zoom**: bot vào được họp nhưng chưa xác nhận phụ đề có về đủ, đúng người nói. Cần thử nói trong họp.
- **Chia sẻ màn hình trong Zoom nhúng**: người nhúng vào là người tham gia thường nên có thể bị chặn nếu cuộc họp để "chỉ host chia sẻ". Cách sửa ở SETUP mục 7.
- **Vai trò host trong Zoom nhúng**: hiện tất cả vào với vai người tham gia. Vào bằng host (token ZAK) chưa làm.
- **Họp Google Meet thật từ đầu đến cuối** trong đợt này, và việc Google đôi khi chặn bot ẩn danh ("You can't join this video call").
- **Ngoài tài khoản của chính bạn**: Zoom yêu cầu app được duyệt và token OBF để bot hoặc video nhúng vào họp của tài khoản Zoom khác. Chưa nộp duyệt, chưa thử.
- SMTP thật, faster-whisper, MariaDB, build các Docker image trên máy khác.

**Cảnh báo về Zoom:** khi cài Meeting SDK, Zoom ghi rõ SDK này dành cho người dùng thật và **không hỗ trợ bot hoặc trợ lý ghi chú AI**, Zoom khuyên dùng RTMS (Realtime Media Streams).
Bot Attendee hiện tại là loại bot đó. Nó chạy được khi phát triển, nhưng có thể bị Zoom chặn hoặc từ chối khi phát hành rộng. Hướng lâu dài là adapter RTMS (chưa làm).

**Chất lượng mô hình 3B:** dịch trung vị khoảng 0,4 giây một câu; biên bản mới bắt được khoảng 1/4 công việc trong cuộc họp mẫu, đôi khi lặp chữ; quyết định và dẫn nguồn khá đúng. Chưa thử cỡ 7B và chưa thử vLLM.

## Hạn chế đã biết

- Một tiến trình API: bus sự kiện và trạng thái người trình bày nằm trong bộ nhớ. Muốn chạy nhiều tiến trình cần adapter Redis.
- CSDL tạo bảng bằng `create_all` và thêm cột thiếu bằng `ALTER TABLE` (xem `_add_missing_columns`), chưa có Alembic.
- Phụ đề Meet theo một ngôn ngữ cố định cho cả cuộc họp (`MEET_CAPTION_LANG`); Zoom dùng `ZOOM_CAPTION_LANG`. Họp trộn nhiều ngôn ngữ cần phiên âm tự nhận ngôn ngữ (chưa làm).
- Không có lớp văn bản trong trình xem PDF (chưa chọn và sao chép chữ được).
- Mã đăng nhập chưa giới hạn tần suất theo IP; token đăng nhập lưu trong `localStorage`.
- Mỗi bot Attendee mở một Chrome nên khá nặng; chưa đo mức dùng RAM.
- Bảng thuật ngữ cho dịch, và chuyển giọng nói từ bản ghi âm của Attendee, chưa làm.
