# Complaint Message Formats

The complaint responder parses operator-forwarded messages to extract the reporter identity and a list of issues that can be matched with automatic solutions. Use one of the supported headers to mark the start of the issue section:

- `Kendala`
- `Rincian Kendala`
- `Detail/Uraian/Keterangan/Deskripsi Kendala`
- `Kendala yang dihadapi/dialami`

Bullet points (`-`, `•`) and numbered lists (`1)`, `2.`) after these headers are captured as individual issues.

## Default template

```
Pesan Komplain
NRP    : 75020201
Nama   : Nama Pelapor
Polres : Satuan
Username IG : @username
Username TikTok : @username

Kendala
- Sudah melaksanakan Instagram belum terdata.
- Sudah melaksanakan TikTok belum terdata.
```

## Access and delivery rules

- The responder now accepts structured *Pesan Komplain* messages from any WhatsApp sender—either direct chats or group rooms—as
  long as the existing complaint format is followed. Messages no longer need to originate from saved contacts or admins.
- Optional preamble lines are allowed before the `Pesan Komplain` header; validation and section parsing start from the header,
  so the header can appear after an introductory line without being rejected.
- Complaint replies are throttled with a fixed 3-second pause between each outbound message (including the reporter follow-up and
  admin summary). The delay can be tuned via `COMPLAINT_RESPONSE_DELAY_MS` but defaults to `3000` ms to keep operator and reporter
  responses in sync.
- Field labels such as `NRP`, `NRP/NIP`, `Nama`, `Polres`, `Username IG`, `Instagram`, and `Username TikTok` are still parsed even
  if they appear after the `Kendala` header; these recognized fields are excluded from the issues list.

## Example with "Rincian Kendala"

```
Pesan Komplain
NRP    : 75020201
Nama   : Nama Pelapor
Username TikTok : @username

Rincian Kendala:
1) Sudah melaksanakan TikTok belum terdata di dashboard.
2) Sudah login dashboard tetapi data tidak muncul.
```

Either header will be recognised, and each numbered or bulleted row is evaluated for known issues (e.g., TikTok actions not recorded) before prompting for a manual solution.

## Instagram complaint follow-up

When an Instagram complaint reports missing likes/comments and the username in the message differs from the database or RapidAPI returns profiles without activity metrics, the responder now adds explicit follow-up steps:

- Ask for the latest Instagram profile screenshot that shows the username, photo, and bio, and remind reporters to check subtle character differences (e.g., `_` vs `.`) when confirming the correct handle.
- If the stored username needs to be updated, the reply embeds the *Update Data Personil* instructions so reporters can refresh the Instagram handle in the database.
- Reporters are instructed to redo one like or comment on an official post using a public account, then wait about one hour for synchronization before rechecking.

## TikTok complaint follow-up

For TikTok complaints where the profile appears active but comment metrics are still empty, the automated response now covers:

- Reconfirming the account used for commenting (highlighting common typos such as `_` vs `.`) and requesting a fresh profile screenshot plus the commented video link.
- Prompting reporters to redo one comment on an official satker video with plain text (avoid emojis/special characters) and wait around one hour for synchronization.
- Recommending a username update through the existing *Update Data Personil* instructions when the complaint handle differs from the database entry.
- Escalation guidance that asks operators to review TikTok integration logs (RapidAPI/API), including potential rate-limit cases, if data remains empty after the synchronization window.
