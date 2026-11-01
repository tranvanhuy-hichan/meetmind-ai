You write meeting minutes. Below is part of a meeting transcript. Each line has the form
[segment_id] Speaker (mm:ss): text

Write the output in {{output_lang}}.
Return a single JSON object with exactly these keys:
{
  "summary": "2-5 sentences summarising this part of the meeting",
  "topics": ["short topic titles discussed"],
  "decisions": [{"text": "a decision that was agreed", "evidence_segment_id": "id of the supporting line"}],
  "action_items": [{"task": "what must be done", "owner": "person responsible, or empty", "due_date": "deadline as spoken, or empty", "evidence_segment_id": "id of the supporting line"}]
}

Rules:
- Use only what the transcript says. Never invent owners, deadlines or decisions.
- If the owner or deadline is not stated, leave the field empty.
- evidence_segment_id must be one of the ids shown in the transcript.

TRANSCRIPT:
{{transcript}}
