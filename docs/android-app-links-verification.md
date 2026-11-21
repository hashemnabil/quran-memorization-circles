# Android App Links: /chat verification (Play release 15 / 1.1.12)

## What was checked (2026-11-20)

- `https://quran-frontend-sknr.onrender.com/.well-known/assetlinks.json` returned HTTP 200, `application/json`, with no redirect in the HTTP inspection.
- The live JSON declares `delegate_permission/common.handle_all_urls`, package `com.abdullahschool.myapp`, and the single SHA-256 fingerprint `35:F6:3D:3D:98:5F:05:98:C5:65:59:54:29:50:6E:63:C9:E7:13:61:78:3A:82:78:5C:71:EC:95:85:2A:30:6C`.
- `https://quran-frontend-sknr.onrender.com/chat` returned HTTP 200, `text/html`.
- The Android manifest already had an auto-verified HTTPS filter. The app's URL handler handled `/chat` but silently discarded `/chat/:id`, which the React router supports.
- The SHA-256 listed above was **not** independently verified against Google Play's *App signing key certificate* and must not be assumed correct.

## Changes on this branch

- Android filter matches `/chat` and `/chat/...`, instead of inadvertently claiming `/chatroom` via `pathPrefix="/chat"`.
- URL handling preserves the conversation path and query for trusted HTTPS links while refusing unrelated origins and paths.
- Added unit coverage for invite links, conversation links, custom scheme compatibility, and rejected URLs.

## Required manual verification (do not deploy on this PR alone)

1. In **Play Console → Test and release → App integrity → App signing → App signing key certificate**, copy the **SHA-256 certificate fingerprint** (not the upload-key fingerprint). Compare it byte-for-byte with the value in `frontend/public/.well-known/assetlinks.json`.
2. If different, replace/add the *app-signing* fingerprint in that file, and deploy the frontend to Render separately when approved. The file must be available publicly at exactly `https://quran-frontend-sknr.onrender.com/.well-known/assetlinks.json`, no auth or redirect, with HTTP 200 and JSON.
3. After deployment check:
   ```sh
   curl -i https://quran-frontend-sknr.onrender.com/.well-known/assetlinks.json
   curl -i https://quran-frontend-sknr.onrender.com/chat
   ```
4. On a physical Android device with the **Play-distributed** signed app installed, check verification:
   ```sh
   adb shell pm verify-app-links --re-verify com.abdullahschool.myapp
   adb shell pm get-app-links com.abdullahschool.myapp
   adb shell am start -a android.intent.action.VIEW -d 'https://quran-frontend-sknr.onrender.com/chat?join=TEST'
   adb shell am start -a android.intent.action.VIEW -d 'https://quran-frontend-sknr.onrender.com/chat/123'
   ```
   Confirm the app opens and the appropriate chat route is reached after authentication. `TEST` is just a navigation test, not a valid invite.
5. The manifest changes only ship in a **future Android build**. They cannot change the already-submitted version 15 while it remains in review. Do not merge, deploy, or submit a new build solely because this PR exists.

**Limitations:** Live HTTP checks confirm availability, **not** domain association success. Verification requires the actual Play signing fingerprint and a device/Play Console verification result. No Play Console or Render settings were changed.
