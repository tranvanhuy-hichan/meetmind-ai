You write meeting minutes. Below is part of a meeting transcript. Each line has the form
[segment_id] Speaker (mm:ss): text

Write the output in {{output_lang}}.
Return a single JSON object with exactly these keys:
{
  "summary": "2-5 sentences summarising this part of the meeting",
  "topics": ["short topic titles discussed"],
  "decisions": [{"text": "a decision that was agreed", "evidence_segment_id": "id of the line where it was agreed"}],
  "action_items": [{"task": "what must be done", "owner": "person responsible, or empty", "due_date": "deadline as spoken, or empty", "evidence_segment_id": "id of the line where the task was stated"}]
}

Rules:
- Use only what the transcript says. Never invent owners, deadlines or decisions.
- List EVERY task or commitment that a person states or accepts, one entry each, even when the deadline is missing. When a speaker says they will do or are in charge of something ("I will", "em sẽ", "em phụ trách"), that speaker is the owner.
- A task someone says "still needs to be done" with no one named gets an empty owner.
- A line that sums up an agreement ("chốt lại", "thống nhất", "to conclude", "agreed") is a decision; give its own line id as evidence, not the line of an earlier discussion.
- If the owner or deadline is not stated, leave the field empty.
- evidence_segment_id must be one of the ids shown in the transcript.

TRANSCRIPT:
{{transcript}}
