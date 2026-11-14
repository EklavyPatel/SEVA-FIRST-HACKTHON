# Gujarati analysis and voice questions

Choose **ગુજરાતી** before analyzing the photo. Live analysis and follow-up use
the selected language. If you switch languages after analysis, the previous
result is hidden and a localized button offers a new analysis using the same
photo. This is a new AI request, uses quota, and requires photo consent. Existing
analysis is not translated merely by changing the interface labels.

The backend validates the language of explanations, evidence, symptoms,
uncertainty reasons and condition names. Gujarati names must use Gujarati script;
the separate `name_en` field retains English/scientific names for source matching.
A wrong-language response is rejected with a localized error, rather than
presented as a Gujarati answer. Follow-up also rejects whole English answers.

## Speaking and listening

In the live follow-up section, press **ગુજરાતીમાં બોલીને પૂછો** and allow
microphone access. Recognition requests `gu-IN`. Speak the question, stop, review
or edit the transcript, select the existing Gemini consent checkbox, then press
**પૂછો**. Dictation never submits automatically. Existing typed text is retained
and the combined question is limited to 1,200 characters.

**જવાબ સાંભળો** reads the analysis or an individual follow-up answer, including
the analysis's uncertainty and provisional-diagnosis notice. Audio is started
only by a click. Playback requests a voice matching the selected language; it
does not substitute an English voice when Gujarati is unavailable. Voices that
load later are detected. Stop controls are provided, and changing language or
leaving the result stops active speech and microphone recognition.

Recognition uses the browser's Web Speech API, with a prefixed fallback. Support
and Gujarati recognition availability vary by browser. Permission denial,
network/no-speech errors and unavailable APIs leave typed questions usable.
The HTTPS production server permits same-origin microphone access.

The browser may send audio to its own recognition service; the page explains
this before microphone use. KapasMitra does not upload/store raw audio. Reviewed
text, conversation and the photo go through the existing consented Gemini API.
Device speech settings must provide a Gujarati synthesis voice for playback.

References: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition),
[available device voices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices).

## Verification

`npm run test:ui` covers Gujarati regeneration after an English result, Gujarati
voice transcripts, consent before sending, Gujarati playback, missing Gujarati
voices, voices loaded later, permission denial and stopping recognition/audio
on language changes. Speech APIs and AI responses are mocked in those tests;
they do not establish actual microphone accuracy, pronunciation or device voice
availability. `npm test` covers server language rejection and microphone policy.
Before release, verify the real microphone and an installed Gujarati voice on
the target farmer's HTTPS browser/device.

A Chromium check also exercised the built website on desktop and at 390px mobile
width with routed API fixtures and mocked speech APIs. A Gujarati transcript was
submitted with `language: gu` and consent, its answer selected `gu-IN` playback,
and English → Gujarati regeneration hid the previous result. No horizontal
overflow or browser console errors were observed. Screenshots are in
`artifacts/gujarati-voice-desktop.png` and `artifacts/gujarati-voice-mobile.png`.
