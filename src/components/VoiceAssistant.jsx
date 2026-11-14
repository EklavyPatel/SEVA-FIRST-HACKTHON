import {useEffect, useId, useRef, useState} from 'react';
import {Mic, Square, Volume2} from 'lucide-react';
import {bilingual} from '../lib/research.js';

const locale = language => language === 'gu' ? 'gu-IN' : 'en-IN';

// Speech is opt-in. The browser handles audio; only reviewed text enters the
// existing consented follow-up request. No recording is stored by this app.
export function VoiceInput({language, value, onChange, disabled, onListeningChange}) {
  const t = bilingual(language);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef(null);
  const timeout = useRef(null);
  const hintId = useId();
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function dispose() {
    clearTimeout(timeout.current);
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onresult = current.onerror = current.onend = null;
      current.abort();
    }
  }
  useEffect(() => {
    setListening(false); setError(''); onListeningChange?.(false);
    return dispose;
  }, [language, disabled]);

  function stop() {
    recognition.current?.stop();
  }
  function start() {
    if (!Recognition || disabled || recognition.current) return;
    setError('');
    window.speechSynthesis?.cancel();
    const current = new Recognition();
    recognition.current = current;
    current.lang = locale(language);
    current.continuous = false;
    current.interimResults = false;
    current.maxAlternatives = 1;
    const prefix = value.trim();
    let received = false;
    current.onresult = event => {
      if (recognition.current !== current) return;
      const words = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
      if (words) {
        received = true;
        onChange([prefix, words].filter(Boolean).join(' ').slice(0, 1200));
      }
    };
    current.onerror = event => {
      if (recognition.current !== current) return;
      const messages = {
        'not-allowed': t('માઇક્રોફોનની પરવાનગી આપો અથવા સવાલ લખો.', 'Allow microphone access or type your question.'),
        'service-not-allowed': t('બ્રાઉઝરની અવાજ સેવા ઉપલબ્ધ નથી. સવાલ લખો.', 'The browser speech service is unavailable. Type your question.'),
        'audio-capture': t('માઇક્રોફોન મળ્યો નથી. તેને જોડો અથવા સવાલ લખો.', 'No microphone was found. Connect one or type your question.'),
        'no-speech': t('અવાજ સંભળાયો નથી. ફરી બોલો અથવા સવાલ લખો.', 'No speech was heard. Try again or type your question.'),
        'language-not-supported': t('આ બ્રાઉઝરમાં ગુજરાતી અવાજ ઓળખ ઉપલબ્ધ નથી. સવાલ લખો.', 'Speech recognition in this language is unavailable. Type your question.'),
      };
      setError(messages[event.error] || t('અવાજ ઓળખી શકાયો નથી. જોડાણ તપાસો અથવા સવાલ લખો.', 'Speech could not be recognized. Check your connection or type your question.'));
      dispose(); setListening(false); onListeningChange?.(false);
    };
    current.onend = () => {
      if (recognition.current !== current) return;
      clearTimeout(timeout.current); recognition.current = null;
      setListening(false); onListeningChange?.(false);
      if (!received) setError(t('અવાજ સંભળાયો નથી. ફરી બોલો અથવા સવાલ લખો.', 'No speech was heard. Try again or type your question.'));
    };
    try {
      setListening(true); onListeningChange?.(true);
      current.start();
      timeout.current = setTimeout(() => {
        dispose(); setListening(false); onListeningChange?.(false);
        setError(t('અવાજનો સમય પૂરો થયો. ફરી પ્રયાસ કરો અથવા સવાલ લખો.', 'Voice input timed out. Try again or type your question.'));
      }, 60000);
    } catch {
      dispose(); setListening(false); onListeningChange?.(false);
      setError(t('માઇક્રોફોન શરૂ થઈ શક્યો નથી. પરવાનગી તપાસો અથવા સવાલ લખો.', 'The microphone could not start. Check permissions or type your question.'));
    }
  }

  return <div className="voice-input">
    <button type="button" className="button button-outline" disabled={disabled || !Recognition} aria-pressed={listening} aria-describedby={hintId} onClick={listening ? stop : start}>
      {listening ? <Square size={16}/> : <Mic size={16}/>}
      {listening ? t('બોલવાનું બંધ કરો', 'Stop listening') : t('ગુજરાતીમાં બોલીને પૂછો', 'Speak your question')}
    </button>
    <p id={hintId} className="research-help">{Recognition
      ? t('માઇક દબાવવાથી અવાજ બ્રાઉઝરની અવાજ સેવા પાસે જઈ શકે છે. બોલ્યા પછી લખાણ તપાસો અને “પૂછો” દબાવો.', 'Using the microphone may send audio to your browser’s speech service. Review the transcript, then press Ask.')
      : t('આ બ્રાઉઝરમાં અવાજથી પૂછવાની સુવિધા નથી. સવાલ લખી શકો છો અથવા સમર્થિત Chrome બ્રાઉઝર અજમાવો.', 'Voice input is unavailable in this browser. Type your question or try a supported Chrome browser.')}</p>
    {listening && <p role="status">{t('સાંભળી રહ્યા છીએ… ગુજરાતીમાં સવાલ બોલો.', 'Listening… speak your question.')}</p>}
    {error && <p role="alert" className="research-notice is-error">{error}</p>}
  </div>;
}

export function ReadAloud({text, language}) {
  const t = bilingual(language);
  const [voice, setVoice] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const utterance = useRef(null);
  const hintId = useId();
  const synth = typeof window !== 'undefined' && window.speechSynthesis;
  function stop() {
    const current = utterance.current;
    utterance.current = null;
    if (current) { current.onend = current.onerror = null; synth?.cancel(); }
    setSpeaking(false);
  }
  useEffect(() => {
    if (!synth) return;
    const load = () => setVoice(synth.getVoices().find(item => item.lang.toLowerCase().replace('_', '-').split('-')[0] === language) || null);
    load(); synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, [synth, language]);
  useEffect(() => { setError(''); return stop; }, [text, language]);
  function speak() {
    if (!voice || !text || !window.SpeechSynthesisUtterance) return;
    setError(''); synth.cancel();
    const current = new window.SpeechSynthesisUtterance(text);
    current.lang = locale(language); current.voice = voice; current.rate = 0.9;
    current.onend = () => { if (utterance.current === current) { utterance.current = null; setSpeaking(false); } };
    current.onerror = event => {
      if (utterance.current !== current) return;
      utterance.current = null; setSpeaking(false);
      if (!['canceled', 'interrupted'].includes(event.error)) setError(t('જવાબ વાંચી શકાયો નથી. લખાણ વાંચો અથવા ફરી પ્રયાસ કરો.', 'Playback failed. Read the text or try again.'));
    };
    utterance.current = current; setSpeaking(true);
    try { synth.speak(current); } catch { stop(); setError(t('અવાજ ઉપલબ્ધ નથી. લખાણ વાંચો.', 'Audio is unavailable. Read the text.')); }
  }
  const available = Boolean(voice && typeof window !== 'undefined' && window.SpeechSynthesisUtterance);
  return <div className="voice-playback">
    <button type="button" className="button button-outline" disabled={!available || !text} aria-pressed={speaking} aria-describedby={!available ? hintId : undefined} onClick={speaking ? stop : speak}>
      {speaking ? <Square size={16}/> : <Volume2 size={16}/>}{speaking ? t('વાંચવાનું બંધ કરો', 'Stop reading') : t('જવાબ સાંભળો', 'Listen to answer')}
    </button>
    {!available && <p className="research-help" id={hintId}>{t('આ ઉપકરણમાં ગુજરાતી વાંચવાનો અવાજ ઉપલબ્ધ નથી. ઉપકરણની ભાષા/અવાજ સેટિંગ્સમાં ગુજરાતી ઉમેરો; જવાબ લખાણમાં ઉપલબ્ધ છે.', 'A voice for this language is unavailable. Add it in your device’s language/speech settings; the text answer is available.')}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
