import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, Check, CheckCircle2, ChevronRight, CircleHelp,
  FileCheck2, FlaskConical, ImagePlus, Leaf, LoaderCircle, LockKeyhole, RefreshCw, ScanLine,
  ShieldCheck, Sparkles, Sprout, TriangleAlert, Upload, X, Languages } from 'lucide-react';
import { prepareImage } from './lib/images.js';
import { analyzeImage, loadCapabilities } from './lib/api.js';
import { translator } from './lib/i18n.js';
import { renameAnalysis } from '../shared/analysis-language.js';

function CottonMark({ className = '' }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 56V28M32 47C19 47 13 42 12 32c12-1 19 4 20 15ZM32 43c12 0 19-6 20-16-13 0-19 5-20 16Z" fill="currentColor" stroke="currentColor" strokeWidth="2" />
    <path d="M17 21a10 10 0 0 1 7-13 10 10 0 0 1 17 0 10 10 0 0 1 7 13 11 11 0 0 1-16 10 11 11 0 0 1-15-10Z" fill="#faf8ef" stroke="currentColor" strokeWidth="2" />
    <path d="M23 23c3 7 14 8 19 0" stroke="#d1d7c5" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

function FieldArt() {
  return <svg className="field-art" viewBox="0 0 680 200" fill="none" aria-hidden="true">
    <path d="M-20 175C135 99 303 121 423 170c96 39 168 2 282-40M-20 194C143 123 293 144 419 186M35 199c143-48 251-31 330 4M438 198c95-6 179-31 257-43" stroke="currentColor" strokeWidth="1.3" />
    <path d="M545 170V55m0 83c-24 0-41-18-43-38 26-1 41 16 43 38Zm0-31c23 0 37-15 40-34-25 0-38 15-40 34Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.3" />
    <path d="M526 52a14 14 0 0 1 8-19 15 15 0 0 1 24 0 14 14 0 0 1 9 19c0 16-15 23-22 14-10 9-20 0-19-14Z" fill="#eeeee1" stroke="currentColor" strokeWidth="1.3" />
    <path d="M457 161V99m0 40c-16 0-24-10-25-24 17 0 24 10 25 24Zm0-15c14 0 22-11 23-22-17 0-23 10-23 22Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" />
  </svg>;
}

function Result({ result, onRetake, language }) {
  const t = translator(language);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [result]);
  const { mode } = result;
  const analysis = result.language === 'en' ? renameAnalysis(result.analysis, 'gu') : result.analysis;
  const text = value => mode === 'demo' ? t(value) : value;
  const uncertainty = { low: t('ઓછી'), medium: t('મધ્યમ'), high: t('વધુ') }[analysis.uncertainty.level];
  return <section id="results" className="result-section page-width" aria-labelledby="result-title" data-testid="results">
    <div className="result-topline"><div><p className="eyebrow"><ScanLine size={15} /> {t("ફોટાનું પ્રાથમિક અવલોકન")}</p>
      <h2 ref={heading} tabIndex={-1} id="result-title">{mode === 'demo' ? t('ડેમો પરિણામ') : t('તમારા ફોટામાં શું દેખાય છે?')}</h2></div>
      <button className="button button-outline" onClick={onRetake}><RefreshCw size={17} /> {t("નવો ફોટો લો")}</button>
    </div>
    {mode === 'demo' && <div className="demo-result-note" role="note"><FlaskConical size={21} /><div><strong>{t("સિમ્યુલેશન — તમારા ફોટાનું AI વિશ્લેષણ થયું નથી.")}</strong><p>{t("આ માત્ર એપ્લિકેશનનું ઉદાહરણ છે. પાક અંગે નિર્ણય લેવા આ પરિણામ વાપરશો નહીં.")}</p></div></div>}
    {mode === 'live' && (result.language || 'gu') !== language && <p className="language-result-note" role="note">{t('આ પરિણામ અગાઉની ભાષામાં છે. પસંદ કરેલી ભાષામાં નવું વિશ્લેષણ કરવા ફરી પ્રયાસ કરો.')}</p>}
    <div className="result-grid">
      <article className="result-card">
        <div className="card-heading"><span className="icon-box"><Leaf size={21} /></span><h3>{t("સંભવિત ઓળખ")}</h3><span className="small-badge">{mode === 'demo' ? t('નમૂનો') : t('AI અનુમાન')}</span></div>
        {analysis.possibilities.length ? analysis.possibilities.map((item, i) => <div className="possibility" key={i}>
          <span className="result-number">0{i + 1}</span><div lang={mode === 'demo' ? language : result.language || 'gu'}><h4>{text(item.name_gu)}</h4><p>{text(item.evidence_gu)}</p></div>
        </div>) : <p className="muted mt-5">{t("આ ફોટા પરથી ચોક્કસ સંભવિત ઓળખ આપી શકાઈ નથી. કપાસનો વધુ સ્પષ્ટ ફોટો લો.")}</p>}
        <div className="symptoms"><h4>{t("દેખાતા લક્ષણો")}</h4>{analysis.visible_symptoms_gu.length ? <ul lang={mode === 'demo' ? language : result.language || 'gu'}>{analysis.visible_symptoms_gu.map((item, i) => <li key={i}><span />{text(item)}</li>)}</ul> : <p className="muted">{t("સ્પષ્ટ લક્ષણો ઓળખી શકાયાં નથી.")}</p>}</div>
      </article>
      <article className="result-card explanation-card">
        <div className="card-heading"><span className="icon-box"><Sparkles size={21} /></span><h3>{t("સરળ ગુજરાતીમાં સમજ")}</h3></div>
        <p className="explanation-text" lang={mode === 'demo' ? language : result.language || 'gu'}>{text(analysis.explanation_gu)}</p>
        <div className="uncertainty"><TriangleAlert size={19} /><div><h4>{t("અનિશ્ચિતતા:")} {uncertainty}</h4><p lang={mode === 'demo' ? language : result.language || 'gu'}>{text(analysis.uncertainty.reason_gu)}</p></div></div>
        <p className="fine-print">{t("આ પુષ્ટિ થયેલું નિદાન નથી. ફોટાથી કરેલું અનુમાન ખોટું હોઈ શકે છે. કૃષિ નિષ્ણાતની સમીક્ષા જરૂરી છે.")}</p>
      </article>
    </div>
    <article className="advisory-result">
      <FileCheck2 size={23} /><div><h3>{t("ચકાસાયેલ કૃષિ માર્ગદર્શન")}</h3>
        {language === 'en' && result.advisories.length > 0 && <p className="fine-print">{t('નીચેની સમીક્ષિત સલાહ તેની મૂળ ગુજરાતી ભાષામાં બતાવાઈ છે.')}</p>}
        {result.advisories.length ? result.advisories.map((item, i) => <div className="approved-advisory" key={i}>
          <h4>{item.nameGu}</h4><p><strong>{t("લક્ષણો:")}</strong> {item.symptomsGu}</p><p><strong>{t("નિવારણ:")}</strong> {item.preventionGu}</p><p><strong>{t("આગળનાં પગલાં:")}</strong> {item.nextStepsGu}</p>
          <a href={item.source.url} target="_blank" rel="noopener noreferrer">{item.source.title} <ArrowUpRight size={14} /></a>
          <p className="fine-print">{t("સમીક્ષક:")} {item.reviewedBy} · {new Date(item.reviewedAt).toLocaleDateString(language === 'en' ? 'en-IN' : 'gu-IN')}</p>
        </div>) : <><p>{t("આ પરિણામ માટે મંજૂર અને સમીક્ષિત માર્ગદર્શન હજી ઉપલબ્ધ નથી. તેથી કોઈ ઉપચાર કે માત્રા બતાવવામાં આવતી નથી.")}</p><p className="expert-next-step">{t("આગળનું પગલું: તમારા વિસ્તારના કૃષિ નિષ્ણાત સાથે ફોટો અને દેખાતા લક્ષણો શેર કરો.")}</p></>}
      </div>
    </article>
    <p className="result-meta"><LockKeyhole size={13} /> {t("રિપોર્ટ કે ફોટો કાયમી સંગ્રહિત નથી.")}{mode === 'live' && <> {t("· મોડેલ:")} <span lang="en">{result.model}</span></>}</p>
  </section>;
}

export default function App() {
  const [language, setLanguage] = useState(() => {
    try { return window.localStorage.getItem('kapasmitra-language') === 'en' ? 'en' : 'gu'; }
    catch { return 'gu'; }
  });
  const t = translator(language);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'KapasMitra AI — Your cotton companion' : 'કપાસમિત્ર AI — તમારા કપાસનો સાથી';
    try { window.localStorage.setItem('kapasmitra-language', language); } catch { /* Preference storage is optional. */ }
  }, [language]);
  const [capabilities, setCapabilities] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [mode, setMode] = useState('live');
  const [image, setImage] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef(null); const cameraInput = useRef(null);
  const activeRequest = useRef(null); const selection = useRef(0);

  async function connect() {
    setConnectionError(false);
    try {
      const data = await loadCapabilities(); setCapabilities(data);
      if (!data.liveAvailable && data.demoAvailable) setMode('demo');
    } catch { setConnectionError(true); }
  }
  useEffect(() => { connect(); return () => activeRequest.current?.abort(); }, []);
  useEffect(() => {
    if (!analyzing) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [analyzing]);

  function reset() {
    activeRequest.current?.abort(); selection.current++;
    setAnalyzing(false); setPreparing(false); setImage(null); setResult(null); setError(''); setConsent(false);
    if (fileInput.current) fileInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
    document.getElementById('analyze')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fileInput.current?.focus({ preventScroll: true });
  }
  async function choose(file, illustration = false) {
    if (!file) return;
    activeRequest.current?.abort(); setAnalyzing(false);
    const id = ++selection.current;
    setPreparing(true); setError(''); setResult(null); setImage(null); setConsent(false);
    try {
      const prepared = await prepareImage(file, { illustration });
      if (id === selection.current) { setImage(prepared); if (illustration) setMode('demo'); }
    } catch (error) { if (id === selection.current) setError(error.message); }
    finally { if (id === selection.current) setPreparing(false); }
  }
  async function sample() {
    try {
      const response = await fetch('/demo-cotton.svg');
      if (!response.ok) throw new Error();
      await choose(new File([await response.blob()], 'demo-illustration.svg', { type: 'image/svg+xml' }), true);
    } catch { setError(t('નમૂનાનું ચિત્ર ખૂલી શક્યું નથી. તમારો ફોટો પસંદ કરો.')); }
  }
  async function submit(event) {
    event.preventDefault();
    if (!image || analyzing || (mode === 'live' && (!consent || image.illustration))) return;
    const controller = new AbortController(); activeRequest.current = controller;
    setAnalyzing(true); setError(''); setResult(null);
    try {
      const data = await analyzeImage(image, mode, controller.signal, language);
      if (!controller.signal.aborted) {
        setResult(data);
        setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setAnalyzing(false); }
  }
  const available = capabilities && (mode === 'demo' ? capabilities.demoAvailable : capabilities.liveAvailable);

  return <>
    <div className="utility-bar"><div className="page-width flex items-center justify-between gap-3"><span><Sprout size={13} /> {t("કપાસની કાળજી. ખેડૂતની ભાષામાં.")}</span><span className="utility-right"><span className="status-dot" /> {t("ખેડૂત માટેનું પ્રાથમિક AI સાધન")}</span></div></div>
    <header className="site-header"><div className="page-width header-inner">
      <a className="brand" href="#" aria-label={t("કપાસમિત્ર AI મુખ્ય પાનું")}><span className="brand-icon"><CottonMark /></span><span><strong>{t("કપાસમિત્ર")} <span lang="en">AI</span></strong><small lang="en">A LITTLE CLARITY. A HEALTHIER CROP.</small></span></a>
      <nav aria-label={t("મુખ્ય નેવિગેશન")}><a href="#how-it-works">{t("કેવી રીતે કામ કરે છે")}</a><a href="#guidance">{t("કૃષિ માર્ગદર્શન")}</a></nav>
      <div className="header-actions"><label className="language-switch"><Languages size={17} aria-hidden="true" />
        <select aria-label="Language / ભાષા" value={language} onChange={event => {
          activeRequest.current?.abort(); setAnalyzing(false); setLanguage(event.target.value);
        }}><option value="gu" lang="gu">ગુજરાતી</option><option value="en" lang="en">English</option></select>
      </label><a href="#analyze" className="header-cta">{t("ફોટો તપાસો")} <ArrowUpRight size={17} /></a></div>
    </div></header>
    <main>
      <section className="hero-section"><div className="page-width hero-grid">
        <div className="hero-copy"><div className="hero-kicker"><span><Leaf size={14} /></span> {t("કપાસના ખેડૂતનો ડિજિટલ સાથી")}</div>
          <h1>{t("કપાસની ચિંતા?")}<br /><span>{t("ચાલો, સાથે સમજીએ.")}</span></h1>
          <p className="hero-description">{t("પાન હોય, ફૂલ હોય કે કપાસનું જીંડવું — ફોટો લો અને દેખાતા લક્ષણો વિશે સરળ ગુજરાતીમાં જાણો.")}</p>
          <div className="hero-actions"><a className="button button-primary" href="#analyze">{t("તમારો ફોટો તપાસો")} <ArrowUpRight size={19} /></a><a className="text-link" href="#how-it-works">{t("પહેલાં જાણો")} <ArrowDown size={15} /></a></div>
          <div className="hero-features"><span><Check size={15} /> {t("ગુજરાતી સમજ")}</span><span><Check size={15} /> {t("ફોટાથી પ્રાથમિક ઓળખ")}</span><span><Check size={15} /> {t("સ્પષ્ટ અનિશ્ચિતતા")}</span></div>
          <div className="hero-note"><ShieldCheck size={20} /><p>{t("એક ફોટો, થોડી વધુ સમજ.")}<br /><strong>{t("અંતિમ નિર્ણય માટે નિષ્ણાત તમારી સાથે.")}</strong></p></div>
          <FieldArt />
        </div>
        <div className="upload-wrapper" id="analyze"><form className="upload-card" onSubmit={submit}>
          <div className="upload-card-heading"><span className="icon-box"><ScanLine size={23} /></span><div><p className="eyebrow">{t("પહેલું પગલું")}</p><h2>{t("તમારા પાકનો ફોટો ઉમેરો")}</h2></div><span className="step-pill">01 / 03</span></div>
          <p className="upload-description">{t("અસરગ્રસ્ત ભાગનો નજીકથી, સ્પષ્ટ ફોટો પસંદ કરો.")}</p>
          <input ref={fileInput} id="crop-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label={t("કપાસનો ફોટો પસંદ કરો")} onChange={event => choose(event.target.files?.[0])} />
          <input ref={cameraInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={t("કેમેરાથી નવો ફોટો લો")} onChange={event => choose(event.target.files?.[0])} />
          {image ? <div className="image-preview" data-testid="image-preview"><img src={image.preview} alt={image.illustration ? t('નમૂનાનું કપાસનું ચિત્ર, વાસ્તવિક ફોટો નથી') : t('વિશ્લેષણ માટે પસંદ કરેલો પાકનો ફોટો')} />
            <span className="preview-tag"><CheckCircle2 size={14} /> {image.illustration ? t('નમૂનાનું ચિત્ર') : t('ફોટો તૈયાર છે')}</span>
            <button type="button" className="remove-image" onClick={reset} aria-label={t("ફોટો દૂર કરો")}><X size={16} /></button>
            <span className="preview-name">{image.illustration ? t(image.name) : image.name}</span></div>
            : <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}>
              {preparing ? <><LoaderCircle size={38} className="animate-spin text-forest" /><strong>{t("ફોટો તૈયાર થઈ રહ્યો છે…")}</strong></> : <><div className="upload-art"><div className="art-ring" /><CottonMark className="art-cotton" /><span className="upload-art-badge"><ImagePlus size={18} /></span><span className="art-spark spark-one">+</span><span className="art-spark spark-two">+</span></div><strong>{t("અહીં ફોટો ખેંચીને મૂકો")}</strong><span className="drop-or">{t("અથવા")}</span><button type="button" className="button button-select" onClick={() => fileInput.current?.click()}><Upload size={16} /> {t("ફોટો પસંદ કરો")}</button><p className="file-limits" lang="en">JPG, PNG, WebP · Max. 10 MB</p></>}
            </div>}
          <div className="photo-options"><button type="button" disabled={preparing} onClick={() => cameraInput.current?.click()}><Camera size={16} /> {image ? t('ફરી ફોટો લો') : t('કેમેરાથી ફોટો લો')}</button>
            <button type="button" disabled={preparing || analyzing || (!image && !capabilities?.demoAvailable)} onClick={image ? () => fileInput.current?.click() : sample}>{image ? t('બીજો ફોટો પસંદ કરો') : t('નમૂના સાથે જુઓ')} <ChevronRight size={14} /></button></div>
          <div className={`analysis-mode ${mode === 'demo' ? 'is-demo' : ''}`}>
            <div className="mode-label">{mode === 'demo' ? <FlaskConical size={16} /> : <Sparkles size={16} />}<strong>{mode === 'demo' ? t('ડેમો મોડ · સિમ્યુલેશન') : t('લાઇવ AI વિશ્લેષણ')}</strong>
              {capabilities?.liveAvailable && capabilities?.demoAvailable && <button type="button" disabled={analyzing || image?.illustration} onClick={() => { setMode(value => value === 'live' ? 'demo' : 'live'); setResult(null); setConsent(false); }}>{mode === 'demo' ? t('લાઇવ પસંદ કરો') : t('ડેમો પસંદ કરો')}</button>}</div>
            <p>{connectionError ? t('સેવા સાથે જોડાણ થયું નથી.') : !capabilities ? t('સેવાનું જોડાણ તપાસાઈ રહ્યું છે…') : mode === 'demo' ? t('આ મોડમાં AI ફોટો તપાસતું નથી. પરિણામ માત્ર નમૂનો છે.') : t('ફોટો Google Gemini દ્વારા તપાસાશે. પરિણામ અનુમાન છે.')}</p>
            {connectionError && <button type="button" className="retry-connection" onClick={connect}><RefreshCw size={13} /> {t("જોડાણ ફરી તપાસો")}</button>}
            {capabilities && !capabilities.liveAvailable && <small>{t("લાઇવ AI હાલ ઉપલબ્ધ નથી.")}</small>}
          </div>
          {mode === 'live' && image && <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t("આ ફોટો વિશ્લેષણ માટે Google Gemini ને મોકલવાની સંમતિ આપું છું.")}</label>}
          {error && <div role="alert" className="error-box"><TriangleAlert size={18} /><p>{t(error)}</p></div>}
          <button className="button analyze-button" disabled={!image || preparing || analyzing || !available || (mode === 'live' && !consent)} type="submit">{analyzing ? <><LoaderCircle size={19} className="animate-spin" /> {mode === 'demo' ? t('ડેમો તૈયાર થાય છે…') : t('વિશ્લેષણ થઈ રહ્યું છે…')}</> : <><Sparkles size={18} /> {mode === 'demo' ? t('ડેમો પરિણામ જુઓ') : t('ફોટાનું વિશ્લેષણ કરો')} <ArrowRight size={18} /></>}</button>
          {analyzing && <p className="loading-detail" role="status">{mode === 'demo' ? t('માત્ર નમૂનાનું પરિણામ તૈયાર થાય છે.') : elapsed > 15 ? t('થોડો વધુ સમય લાગી રહ્યો છે. તમે ફોટો દૂર કરીને રદ કરી શકો છો.') : t('દેખાતા લક્ષણો અને અનિશ્ચિતતાનું અવલોકન થાય છે.')}</p>}
          <p className="upload-privacy"><LockKeyhole size={12} /> {t("આ MVP ફોટો કે રિપોર્ટ કાયમી સંગ્રહતું નથી.")}</p>
        </form><div className="below-upload"><Leaf size={14} /> {t("સમજૂતીથી શરૂઆત. કાળજીથી આગળ.")}</div></div>
      </div></section>
      {result && <Result result={result} onRetake={reset} language={language} />}
      <section className="how-section page-width" id="how-it-works"><div className="section-intro"><div><p className="eyebrow">{t("સરળ છે. તમારી ભાષામાં છે.")}</p><h2>{t("વધુ સમજ, માત્ર ત્રણ પગલાંમાં.")}</h2></div><p>{t("ખેતરથી સીધો ફોટો.")}<br />{t("સરળ ભાષામાં પ્રાથમિક સમજ.")}</p></div>
        <div className="steps-grid">{[
          { icon: Camera, title: t('સ્પષ્ટ ફોટો લો'), description: t('પાન, ફૂલ કે જીંડવાનો ફોટો ઉમેરો. અસરગ્રસ્ત ભાગ સ્પષ્ટ દેખાય તે ધ્યાનમાં રાખો.') },
          { icon: ScanLine, title: t('દેખાતા લક્ષણો સમજો'), description: t('AI સંભવિત ઓળખ અને તેની અનિશ્ચિતતા સમજાવે છે. તેને અંતિમ નિદાન માનશો નહીં.') },
          { icon: Sprout, title: t('જાણકારી સાથે આગળ વધો'), description: t('સમીક્ષિત માર્ગદર્શન ઉપલબ્ધ હોય ત્યારે વાંચો અને કૃષિ નિષ્ણાતની મદદ લો.') },
        ].map(({ icon: Icon, title, description }, i) => <article className="step-card" key={title}><div className="step-top"><span className="step-icon"><Icon size={23} /></span><span className="step-number">0{i + 1}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
      <section className="guidance-section page-width" id="guidance"><div className="guidance-main"><span className="guidance-icon"><ShieldCheck size={29} /></span><div><p className="eyebrow">{t("વિશ્વાસ પહેલાં, દાવો પછી.")}</p><h2>{t("માર્ગદર્શન, જવાબદારી સાથે.")}</h2><p>{t("AI નો અંદાજ અને ચકાસાયેલ કૃષિ સલાહ અલગ છે. માત્ર મંજૂર સ્રોત અને નિષ્ણાત સમીક્ષા ધરાવતી માહિતી જ ઉપચાર માટે બતાવવામાં આવશે.")}</p><span className="catalog-status"><span /> {t("સમીક્ષિત કૃષિ સામગ્રી હજી જોડાયેલી નથી")}</span></div></div>
        <div className="guidance-aside"><FileCheck2 size={24} /><h3>{t("અંદાજને નિદાન ન માનશો.")}</h3><p>{t("અસ્પષ્ટ ફોટો, બદલાતું હવામાન કે સમાન લક્ષણો ઓળખને અસર કરી શકે છે. નિષ્ણાતની પુષ્ટિ મહત્વની છે.")}</p></div>
      </section>
      <section className="faq-section page-width"><div><p className="eyebrow"><CircleHelp size={15} /> {t("થોડું વધુ જાણો")}</p><h2>{t("તમારા મનના સવાલ.")}</h2></div><div className="faq-list"><details><summary>{t("શું આ પરિણામ પાકનું ચોક્કસ નિદાન છે?")}</summary><p>{t("ના. આ ફોટામાં દેખાતા લક્ષણોનું પ્રાથમિક AI અવલોકન છે. પાકના નિર્ણય પહેલાં કૃષિ નિષ્ણાતની પુષ્ટિ લો.")}</p></details><details><summary>{t("મારો ફોટો ક્યાં જાય છે?")}</summary><p>{t("લાઇવ મોડમાં તમારી સંમતિ પછી તૈયાર કરેલો ફોટો Google Gemini ને મોકલાય છે. ડેમોમાં ફોટો બહારની AI સેવાને મોકલાતો નથી. આ એપ ફોટો કે રિપોર્ટ કાયમી સંગ્રહતી નથી. Google ની પોતાની ડેટા નીતિઓ લાગુ પડે છે.")}</p></details><details><summary>{t("ડેમો અને લાઇવ પરિણામમાં શું તફાવત છે?")}</summary><p>{t("ડેમો પહેલેથી લખેલું નમૂનાનું પરિણામ છે. તે તમારા ફોટાને ઓળખતું નથી. લાઇવ મોડમાં Gemini ફોટાના દેખાતા લક્ષણોનું અવલોકન કરે છે; તે પણ પુષ્ટિ થયેલું નિદાન નથી.")}</p></details></div></section>
    </main>
    <footer className="site-footer"><div className="page-width footer-inner"><a href="#" className="footer-brand"><CottonMark /> {t("કપાસમિત્ર")} <span lang="en">AI</span></a><p>{t("ખેડૂત માટે બનાવેલું. ગુજરાતીમાં.")}</p><span>{t("પ્રાથમિક અવલોકન · નિષ્ણાતની સલાહનો વિકલ્પ નથી")}</span></div></footer>
  </>;
}
