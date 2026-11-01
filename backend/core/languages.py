LANGUAGES: dict[str, str] = {
    "vi": "Vietnamese",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "th": "Thai",
}

_VI_CHARS = set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ")


def language_name(code: str) -> str:
    return LANGUAGES.get(code, code)


def guess_lang(text: str) -> str:
    """Cheap fallback used only when the source gives no language: Vietnamese
    diacritics vs. everything else. Real language ID belongs in the ASR adapter."""
    letters = [c for c in text.lower() if c.isalpha()]
    if not letters:
        return "en"
    vi = sum(1 for c in letters if c in _VI_CHARS)
    return "vi" if vi / len(letters) > 0.04 else "en"
