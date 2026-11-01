"""Scripted meeting used by the demo adapters (FakeBot, DemoTranslator, DemoLLM).

It lets the whole product be tried without Google Meet, a GPU or a language model.
"""

SCRIPT: list[dict] = [
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Chào mọi người, hôm nay chúng ta họp về tiến độ dự án MeetMind.",
        "tr": {"en": "Hello everyone, today we are meeting about the progress of the MeetMind project."},
    },
    {
        "speaker": "Trần Văn B", "lang": "en",
        "text": "Thanks. I will report on the backend first. The API for transcripts is finished.",
        "tr": {"vi": "Cảm ơn. Tôi sẽ báo cáo phần backend trước. API cho transcript đã hoàn thành."},
    },
    {
        "speaker": "Trần Văn B", "lang": "en",
        "text": "We still need to finish the document upload service by 15/11.",
        "tr": {"vi": "Chúng ta vẫn cần hoàn thành dịch vụ tải tài liệu trước ngày 15/11."},
    },
    {
        "speaker": "Lê Thị C", "lang": "vi",
        "text": "Em phụ trách phần giao diện. Phần xem tài liệu đã xong, còn phần phụ đề trực tiếp.",
        "tr": {"en": "I am in charge of the interface. The document viewer is done, the live subtitles are still open."},
    },
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Phụ đề trực tiếp có bị trễ không?",
        "tr": {"en": "Are the live subtitles delayed?"},
    },
    {
        "speaker": "Lê Thị C", "lang": "vi",
        "text": "Hiện tại độ trễ khoảng hai đến ba giây, em sẽ tối ưu trước ngày 18/11.",
        "tr": {"en": "The delay is currently about two to three seconds, and I will optimise it by 18/11."},
    },
    {
        "speaker": "Trần Văn B", "lang": "en",
        "text": "Translation quality for Vietnamese is good enough for the demo.",
        "tr": {"vi": "Chất lượng dịch sang tiếng Việt đủ tốt cho bản demo."},
    },
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Vậy chúng ta thảo luận về việc kiểm thử. Ai sẽ chịu trách nhiệm?",
        "tr": {"en": "Then let us discuss testing. Who will be responsible?"},
    },
    {
        "speaker": "Trần Văn B", "lang": "en",
        "text": "I will write the test plan by 20/11.",
        "tr": {"vi": "Tôi sẽ viết kế hoạch kiểm thử trước ngày 20/11."},
    },
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Chốt lại: backend hoàn thành trước ngày 15/11, giao diện trước ngày 18/11.",
        "tr": {"en": "To conclude: backend finished by 15/11, interface by 18/11."},
    },
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Thống nhất: kiểm thử toàn bộ hệ thống trước ngày 20/11.",
        "tr": {"en": "Agreed: full system testing by 20/11."},
    },
    {
        "speaker": "Nguyễn Văn A", "lang": "vi",
        "text": "Cảm ơn mọi người, chúng ta kết thúc cuộc họp tại đây.",
        "tr": {"en": "Thank you all, we will end the meeting here."},
    },
]
