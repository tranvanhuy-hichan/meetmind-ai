# MeetMind AI – Thiết kế mã nguồn: Attendee + LLM tự host

> Bổ sung cho [ARCHITECTURE.md](ARCHITECTURE.md). Tài liệu này trả lời: **cấu trúc code thế nào để dễ thay đổi**, **dùng Attendee làm bot ra sao**, **LLM tự chạy làm được gì**.
> Mục đánh dấu **⚠ SPIKE** là giả định chưa kiểm chứng (đặc biệt về API của Attendee).

---

## 1. Nguyên tắc thiết kế

1. **Hexagonal (Ports & Adapters)**: lõi nghiệp vụ chỉ biết *interface* (port). Attendee, Whisper, Ollama, MinIO… đều là *adapter* cắm vào. Muốn đổi thì viết adapter mới, không sửa lõi.
2. **Nền tảng họp trung lập**: lõi không biết Teams hay Meet. Chỉ lớp `MeetingBot` biết.
3. **Chọn bằng cấu hình**: adapter nào được dùng khai báo trong `config.yaml`/biến môi trường, không hard-code.
4. **Mọi thứ AI đi qua một giao diện LLM chuẩn OpenAI-compatible** (Ollama hoặc vLLM), nên đổi mô hình hay engine chỉ là đổi URL và tên model.
5. **Prompt là file có version**, không nằm rải rác trong code.
6. **Có adapter giả (fake)** cho mọi port để test không cần GPU, không cần cuộc họp thật.
7. **Chạy hoàn toàn miễn phí được**: mọi thành phần chính là mã nguồn mở, tự host.

---

## 2. LLM tự chạy làm được những gì

Cần phân biệt: **LLM chữ không nghe được âm thanh**. Ba việc trong yêu cầu của bạn chia như sau:

| Việc | Công cụ | Ghi chú |
|---|---|---|
| **Chuyển giọng nói thành văn bản (transcript)** | **Mô hình ASR (Whisper / faster-whisper)** | Không dùng LLM chữ. Có LLM đa phương thức nghe được âm thanh (kiểu Qwen audio), nhưng Whisper chuyên dụng, nhanh và rẻ hơn; để làm tùy chọn sau |
| **Dịch** | **LLM tự host (Qwen/Llama)** làm mặc định; **NLLB-200** là adapter tùy chọn | LLM dịch được theo ngữ cảnh (câu trước, thuật ngữ). NLLB nhanh hơn nhưng giấy phép phi thương mại (bạn kiểm tra lại) |
| **Tóm tắt, quyết định, action item, biên bản** | **LLM tự host** | Đầu ra theo JSON schema, có dẫn chiếu timestamp |

Vậy câu trả lời: **LLM tự chạy làm được dịch và biên bản; transcript cần thêm Whisper** (cũng tự chạy, miễn phí).

### 2.1. Hạ tầng LLM
- **Ollama** (dễ cài, chạy được CPU/GPU) hoặc **vLLM** (nhanh hơn khi có GPU, nhiều người dùng).
- Cả hai đều cung cấp API tương thích OpenAI (`/v1/chat/completions`) nên code client chỉ viết một lần.
- Chọn kích thước mô hình theo VRAM (cần đo thử; mô hình nhỏ đủ cho dịch và biên bản ở mức chấp nhận được, mô hình lớn hơn chính xác hơn). Mô hình dùng cho **dịch realtime** nên nhỏ và nhanh; mô hình cho **biên bản** có thể lớn hơn vì chạy một lần sau họp.
- Hai cấu hình model riêng: `llm.realtime_model` và `llm.report_model`.

### 2.2. Kỹ thuật để LLM dịch tốt trong cuộc họp
- Đưa **vài câu trước đó** làm ngữ cảnh (đại từ, ngữ cảnh chủ đề).
- Đưa **glossary** (thuật ngữ/tên riêng, lấy từ tài liệu đã upload).
- Yêu cầu chỉ trả bản dịch, không giải thích; tắt "suy luận dài" để giảm độ trễ.
- Cache theo `(segment_id, lang)`; chỉ dịch ngôn ngữ đang có người chọn.

### 2.3. Kỹ thuật tạo biên bản
- Transcript dài → **map-reduce**: tóm tắt từng đoạn rồi gộp.
- Đầu ra theo **JSON schema**, kiểm tra hợp lệ; sai thì thử lại có sửa lỗi.
- Mỗi quyết định/action item kèm `evidence_segment_id` để người dùng kiểm chứng.
- Người dùng chỉnh sửa trước khi chốt (LLM có thể sai tên người phụ trách hoặc deadline).

---

## 3. Attendee trong thiết kế

Attendee là **một adapter của port `MeetingBot`**, không phải lõi hệ thống.

```
Core ──► MeetingBot (port) ◄── AttendeeBot (adapter)
                           ◄── RecallBot (adapter, sau này nếu cần)
                           ◄── GraphTranscriptSource (adapter, chỉ sau họp)
```

Việc `AttendeeBot` phải làm:

| Chức năng | Ghi chú |
|---|---|
| `join(meeting_url)` | Tạo bot vào họp (Teams hoặc Meet) |
| `leave()` | Rời họp |
| `audio_stream()` | Nhận audio realtime kèm định danh người nói. **⚠ SPIKE**: kiểm tra Attendee trả audio theo từng người bằng cách nào (webhook, WebSocket hay file) |
| `get_recording()` | Lấy bản ghi sau họp (dự phòng, nhất là để chạy lại ASR chất lượng cao) |
| `events()` | Bot vào, bị từ chối, họp kết thúc, người vào/ra |

Nếu Attendee chỉ cung cấp transcript từ nhà cung cấp bên ngoài (không có audio thô), thì thêm adapter `ExternalTranscriptASR` hoặc đổi sang bot khác; lõi không đổi.

Triển khai: container `attendee` trong Docker Compose; `AttendeeBot` gọi API của nó.

---

## 4. Các port (interface)

Viết bằng Python `Protocol` (có thể đổi sang ABC). Đây là **hợp đồng** giữa lõi và adapter.

```python
# core/ports.py
from typing import AsyncIterator, Protocol
from core.models import AudioChunk, Segment, Translation, Minutes, MeetingEvent

class MeetingBot(Protocol):
    async def join(self, meeting_url: str, meeting_id: str) -> None: ...
    async def leave(self, meeting_id: str) -> None: ...
    def audio_stream(self, meeting_id: str) -> AsyncIterator[AudioChunk]: ...
    def events(self, meeting_id: str) -> AsyncIterator[MeetingEvent]: ...
    async def get_recording(self, meeting_id: str) -> str | None: ...  # đường dẫn file

class ASR(Protocol):
    def stream(self, chunks: AsyncIterator[AudioChunk]) -> AsyncIterator[Segment]: ...  # partial/final
    async def transcribe_file(self, path: str, lang: str | None = None) -> list[Segment]: ...

class SpeakerResolver(Protocol):
    async def resolve(self, segment: Segment, meeting_id: str) -> Segment: ...  # gán tên người nói

class Translator(Protocol):
    async def translate(self, segs: list[Segment], target_lang: str,
                        context: list[Segment] | None = None,
                        glossary: dict[str, str] | None = None) -> list[Translation]: ...

class LLM(Protocol):
    async def complete_json(self, prompt_id: str, variables: dict, schema: dict) -> dict: ...
    async def complete_text(self, prompt_id: str, variables: dict) -> str: ...

class MinutesGenerator(Protocol):
    async def generate(self, meeting_id: str, segments: list[Segment]) -> Minutes: ...

class ObjectStore(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def presigned_url(self, key: str, ttl_s: int) -> str: ...

class DocConverter(Protocol):
    async def to_pdf(self, src_key: str) -> str: ...  # trả khóa PDF

class EventBus(Protocol):
    async def publish(self, topic: str, payload: dict) -> None: ...
    def subscribe(self, topic: str) -> AsyncIterator[dict]: ...
```

### 4.1. Adapter dự kiến

| Port | Mặc định (miễn phí) | Thay thế được bằng |
|---|---|---|
| `MeetingBot` | `AttendeeBot` | `RecallBot`, `FakeBot` (phát lại file ghi âm) |
| `ASR` | `FasterWhisperASR` | `AzureSpeechASR`, `ExternalTranscriptASR` |
| `SpeakerResolver` | `MetadataSpeakerResolver` (ưu tiên định danh từ bot), `PyannoteSpeakerResolver` (dự phòng) | `ManualSpeakerResolver` |
| `Translator` | `LLMTranslator` | `NLLBTranslator` |
| `LLM` | `OpenAICompatLLM` (Ollama/vLLM) | bất kỳ API tương thích OpenAI |
| `MinutesGenerator` | `LLMMinutesGenerator` | — |
| `ObjectStore` | `MinioStore` | S3, ổ đĩa local |
| `DocConverter` | `LibreOfficeConverter` | — |
| `EventBus` | `RedisBus` | in-memory (test) |

---

## 5. Cấu trúc thư mục

```
ai-meeting/
├─ docs/
│   ├─ ARCHITECTURE.md
│   └─ DESIGN.md
├─ config/
│   ├─ config.example.yaml        # chọn adapter, model, ngôn ngữ
│   └─ prompts/                   # prompt có version
│       ├─ translate.v1.md
│       ├─ minutes_map.v1.md
│       └─ minutes_reduce.v1.md
├─ backend/                       # Python (FastAPI)
│   ├─ core/                      # KHÔNG import adapter
│   │   ├─ models.py              # Segment, Translation, Minutes, ...
│   │   ├─ ports.py               # các Protocol ở mục 4
│   │   ├─ services/
│   │   │   ├─ live_pipeline.py   # bot → ASR → speaker → translate → bus
│   │   │   ├─ post_meeting.py    # recording/transcript → minutes
│   │   │   ├─ documents.py       # upload, convert, quyền
│   │   │   └─ presenter.py       # follow mode, xin/trao quyền
│   │   └─ prompts.py             # nạp prompt theo id
│   ├─ adapters/
│   │   ├─ bot/        attendee.py, recall.py, fake.py
│   │   ├─ asr/        faster_whisper.py, external.py, fake.py
│   │   ├─ speaker/    metadata.py, pyannote.py
│   │   ├─ translate/  llm.py, nllb.py, fake.py
│   │   ├─ llm/        openai_compat.py, fake.py
│   │   ├─ storage/    minio.py, local.py
│   │   ├─ convert/    libreoffice.py
│   │   └─ bus/        redis.py, memory.py
│   ├─ app/                       # lớp ngoài cùng
│   │   ├─ main.py                # FastAPI, WebSocket
│   │   ├─ routes/                # meetings, documents, minutes
│   │   ├─ ws.py                  # gateway
│   │   ├─ container.py           # đọc config, lắp adapter vào core
│   │   └─ db/                    # SQLAlchemy models, migrations
│   └─ tests/
│       ├─ unit/                  # dùng adapter fake
│       ├─ contract/              # cùng một bộ test chạy cho mọi adapter của một port
│       └─ e2e/                   # phát lại file ghi âm qua FakeBot
├─ frontend/                      # Next.js + TypeScript
│   └─ src/{live, documents, minutes, lib/ws}
├─ deploy/
│   ├─ docker-compose.yml         # api, web, attendee, ollama|vllm, whisper, postgres, minio, redis
│   └─ ...
└─ eval/                          # WER, DER, chrF, đánh giá biên bản
```

**Quy tắc phụ thuộc**: `app → core ← adapters`. `core` không bao giờ import `adapters` hay thư viện hạ tầng. Có thể thêm kiểm tra tự động (ví dụ `import-linter`) để giữ quy tắc này.

---

## 6. Lắp ghép bằng cấu hình

```yaml
# config/config.yaml
meeting_bot:  { adapter: attendee, base_url: http://attendee:8000 }
asr:          { adapter: faster_whisper, model: small, device: cuda, language: auto }
speaker:      { adapter: metadata, fallback: pyannote }
translator:   { adapter: llm }              # hoặc nllb
llm:
  base_url: http://ollama:11434/v1
  realtime_model: <model nhỏ, nhanh>
  report_model:   <model lớn hơn>
languages: { default_display: vi }
```

`container.py` đọc file này, tạo đúng adapter và đưa vào các service ở `core`. Đổi bot, đổi mô hình, đổi cách dịch chỉ cần sửa file cấu hình (hoặc thêm một adapter mới).

---

## 7. Luồng chính

### 7.1. Realtime
```
AttendeeBot.audio_stream ─► ASR.stream ─► SpeakerResolver ─► EventBus("segment")
                                                          └► Translator (theo ngôn ngữ đang chọn) ─► EventBus("translation")
WebSocket gateway đọc EventBus và đẩy tới từng client theo ngôn ngữ họ chọn.
```
- Phụ đề partial hiển thị ngay, **chỉ bản final mới được dịch** để giảm tải.
- Backpressure: nếu dịch chậm thì bỏ qua partial, chỉ dịch final; giữ hàng đợi có giới hạn.

### 7.2. Sau họp
```
MeetingBot.events (họp kết thúc)
   ► lấy recording (hoặc dùng transcript đã có)
   ► ASR.transcribe_file (chất lượng cao, chạy lại)  [tùy chọn]
   ► MinutesGenerator.generate (map-reduce bằng LLM)
   ► lưu DB, thông báo người dùng, cho phép chỉnh sửa và xuất DOCX/PDF
```
Chạy lại ASR trên recording cho transcript chuẩn hơn bản realtime; bản realtime chỉ để theo dõi trực tiếp.

### 7.3. Trạng thái cuộc họp
`created → bot_joining → live → ended → processing → ready` (kèm `bot_failed`, `bot_rejected`). Mỗi chuyển trạng thái phát sự kiện để UI hiển thị.

---

## 8. Kiểm thử để dễ thay đổi

- **Unit**: chạy toàn bộ `core` với adapter fake, không cần GPU hay cuộc họp.
- **Contract test**: một bộ test cho mỗi port; mọi adapter của port đó phải qua. Thêm adapter mới chỉ cần chạy bộ này.
- **E2E**: `FakeBot` phát lại một file ghi âm mẫu (có nhiều người nói), kiểm tra toàn pipeline từ audio tới biên bản. Đây cũng là cách phát triển hằng ngày mà không cần mở họp thật.
- **Đánh giá chất lượng** (`eval/`): WER (ASR), DER (người nói), chrF (dịch), chấm biên bản trên bộ mẫu cố định; chạy lại khi đổi model hoặc prompt để biết thay đổi tốt hay xấu.

---

## 9. Thứ tự làm (ưu tiên giảm rủi ro, toàn bộ miễn phí)

| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Dựng khung `core` + `ports` + adapter fake + Docker Compose | Chạy được e2e bằng `FakeBot` |
| 2 | `FasterWhisperASR` + `OpenAICompatLLM` (Ollama) | Từ file ghi âm ra transcript và biên bản |
| 3 | `LLMTranslator` + prompt dịch + glossary | Dịch theo ngôn ngữ chọn |
| 4 | **Spike Attendee**: `AttendeeBot` vào họp thật, lấy audio/recording | Xác nhận audio realtime và người nói; quyết định adapter dự phòng |
| 5 | Pipeline realtime + WebSocket + frontend phụ đề | Phụ đề trực tiếp |
| 6 | Tài liệu nhiều tab + follow mode | Tính năng tài liệu |
| 7 | Biên bản hoàn chỉnh, xuất DOCX/PDF, bộ đánh giá | Sản phẩm hoàn chỉnh |

Bước 1–3 không phụ thuộc Attendee, nên có thể làm và kiểm chứng trước khi biết kết quả spike.

---

## 10. Rủi ro riêng của thiết kế này

| Rủi ro | Giảm thiểu |
|---|---|
| Attendee không cung cấp audio thô theo từng người | Adapter `ExternalTranscriptASR`, hoặc bot khác (Vexa, Recall); lõi không đổi |
| LLM tự host dịch chậm → phụ đề trễ | Model nhỏ riêng cho realtime, chỉ dịch final, cache, giới hạn hàng đợi; thêm `NLLBTranslator` làm phương án nhanh |
| Tên người nói sai | Ưu tiên định danh từ bot; hiện độ tin cậy; cho gán tay |
| LLM bịa deadline/người phụ trách trong biên bản | Bắt buộc `evidence_segment_id`, người dùng duyệt trước khi chốt |
| Không có GPU | Whisper nhỏ + model LLM nhỏ trên CPU, chấp nhận độ trễ; tắt dịch realtime, chỉ dịch sau họp |
| Giấy phép model (ví dụ NLLB phi thương mại) | Ghi rõ giấy phép từng model trong `config`; mặc định dùng model cho phép thương mại nếu sau này bán sản phẩm |
