def meeting_topic(meeting_id: str) -> str:
    """Event-bus topic that carries everything a meeting's clients need to see."""
    return f"meeting:{meeting_id}"
