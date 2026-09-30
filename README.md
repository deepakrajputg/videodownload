# Video Downloader Customization

This project contains the GitHub Copilot customization files for downloading a video from a direct source URL and producing a transcript.

## Included files

- `.github/skills/video-downloader/SKILL.md`
- `.github/agents/video-downloader.agent.md`

## Live Demo
https://anyvd.netlify.app/

## Purpose

This repo is intentionally minimal and only contains the files needed for the video downloader workflow. It does not include unrelated study or course content.

## Web app (Netlify)

The site in `public/` is a simple video downloader anyone can use: paste a link, press **Find video**, then press **Download**.
The `/api/resolve` Netlify Function (`netlify/functions/resolve.mts`) finds the video file for a link. It handles direct
video links and pages that embed a video (`<video>` tags, Open Graph tags, `.mp4`/`.m3u8` links).

To support sites like YouTube, TikTok or Instagram, host a [cobalt](https://github.com/imputnet/cobalt) instance and set
these environment variables in Netlify:

- `COBALT_API_URL`: the URL of your cobalt API
- `COBALT_API_KEY`: optional, only if your instance requires an API key
