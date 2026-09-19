---
name: video-downloader-transcript
description: "Use when: the user gives a direct video URL and wants it downloaded, saved locally, and transcribed into a readable transcript or subtitle file."
---

# Video Download and Transcript Workflow

## Goal

Download a video from a direct source URL, save it in a sensible local folder, and generate a transcript from the content so the user can review the spoken material without rewatching the video.

## When to use

- The user gives a direct video link or downloadable stream.
- The task includes saving the video locally and extracting text from it.
- The user wants a transcript, captions, or searchable notes based on video content.

## Workflow

1. Confirm the source is a direct video URL or downloadable stream.
2. If the link requires cookies, login, or special headers, ask for the minimum needed details before proceeding.
3. Download the video with yt-dlp into a clear output folder.
4. Normalize the filename to a readable, clean name.
5. Decide whether the user wants:
   - a downloaded video only,
   - a transcript only,
   - both the download and transcript,
   - or a caption file such as .srt.
6. Extract audio if needed for transcription, using ffmpeg or a similar tool when required.
7. Run a transcription tool such as Whisper or an equivalent speech-to-text pipeline to generate text.
8. Save the transcript as a .txt file or subtitle file (.srt if timed captions are requested).
9. Validate that the video file and transcript both exist, and report the paths clearly.
10. If the process fails at any stage, explain the likely reason and the smallest next fix.

## Decision points

- If the link is not directly downloadable, ask for the missing auth, cookies, or a different access method.
- If the content is an HLS or adaptive stream, continue with yt-dlp and choose the appropriate format when needed.
- If the transcript tool is not installed, install it or use an available fallback method.
- If subtitles already exist on the source, prefer using them instead of re-transcribing when the user wants captions.
- If the user only wants text, use the transcript output and skip unnecessary video post-processing.

## Quality criteria

- The video was downloaded successfully with a readable path and file name.
- The transcript exists and is usable as plain text or subtitle output.
- The output format matches the user's request.
- Any auth, format, or tool limitations are clearly communicated.
- The final response includes the command used, the saved file path, the transcript path, and success or failure status.

## Output format

When the skill is used, return:

- The download command used
- The saved video path
- The transcript path if created
- Success or failure status
- Any important note about auth, cookies, missing tool support, or format adjustment

## Example prompt

"Download this video from the link, save it locally, and also produce a transcript from it."

## Example completion checklist

- [ ] URL is validated
- [ ] Video is downloaded
- [ ] Output file has a clean name
- [ ] Transcript is created
- [ ] Paths are reported clearly
- [ ] Any blockers are noted
