import Landing from './components/Landing.jsx';
import {rememberDestination,routeAccess} from './lib/account-navigation.js';
import AccountPage, { accountRequest } from './components/Account.jsx';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, Check, CheckCircle2, ChevronRight, CircleHelp,
  FileCheck2, FlaskConical, ImagePlus, Leaf, LoaderCircle, LockKeyhole, RefreshCw, ScanLine,
  ShieldCheck, Sparkles, Sprout, TriangleAlert, Upload, X, Languages, LayoutDashboard, BookOpen, Download, Printer, Sun, Moon, MoveUpRight, Settings2 } from 'lucide-react';
import Community, { Followup } from './components/Community.jsx';
import { prepareImage } from './lib/images.js';
import { analyzeImage, loadCapabilities } from './lib/api.js';
import { translator } from './lib/i18n.js';
import { renameAnalysis } from '../shared/analysis-language.js';
import { ResearchContribution, ResearchHub, SettingsDialog } from './components/Research.jsx';
import { readPreference, savePreference } from './lib/research.js';

function CottonMark({ className = '' }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 56V28M32 47C19 47 13 42 12 32c12-1 19 4 20 15ZM32 43c12 0 19-6 20-16-13 0-19 5-20 16Z" fill="currentColor" stroke="currentColor" strokeWidth="2" />
    <path d="M17 21a10 10 0 0 1 7-13 10 10 0 0 1 17 0 10 10 0 0 1 7 13 11 11 0 0 1-16 10 11 11 0 0 1-15-10Z" fill="#faf8ef" stroke="currentColor" strokeWidth="2" />
    <path d="M23 23c3 7 14 8 19 0" stroke="#d1d7c5" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

function Result({ result, onRetake, language, image }) {
  const t = translator(language);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [result]);
  const { mode } = result;
  const analysis = result.language === 'en' ? renameAnalysis(result.analysis, 'gu') : result.analysis;
  const text = value => mode === 'demo' ? t(value) : value;
  const uncertainty = { low: t('ઓછી'), medium: t('મધ્યમ'), high: t('વધુ') }[analysis.uncertainty.level];
  function saveReview() {
    const lines = [t('કપાસમિત્ર') + ' AI', mode === 'demo' ? t('સિમ્યુલેશન — તમારા ફોટાનું AI વિશ્લેષણ થયું નથી.') : t('આ પુષ્ટિ થયેલું નિદાન નથી. ફોટાથી કરેલું અનુમાન ખોટું હોઈ શકે છે. કૃષિ નિષ્ણાતની સમીક્ષા જરૂરી છે.'),
      ...analysis.possibilities.map(item => `${text(item.name_gu)}: ${text(item.evidence_gu)}`),
      t('દેખાતા લક્ષણો'), ...analysis.visible_symptoms_gu.map(text), text(analysis.explanation_gu),
      `${t('અનિશ્ચિતતા:')} ${uncertainty}`, text(analysis.uncertainty.reason_gu),
      ...result.advisories.map(item => `${item.nameGu}\n${item.symptomsGu}\n${item.preventionGu}\n${item.nextStepsGu}\n${item.source.title}: ${item.source.url}\n${t('સમીક્ષક:')} ${item.reviewedBy}`),
      t('આગળનું પગલું: તમારા વિસ્તારના કૃષિ નિષ્ણાત સાથે ફોટો અને દેખાતા લક્ષણો શેર કરો.'),
      ...(mode === 'live' ? [`${t('· મોડેલ:')} ${result.model}`] : []),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'kapasmitra-crop-review.txt';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section id="results" className="result-section page-width" aria-labelledby="result-title" data-testid="results">
    <div className="result-topline"><div><p className="eyebrow"><ScanLine size={15} /> {t("ફોટાનું પ્રાથમિક અવલોકન")}</p>
      <h2 ref={heading} tabIndex={-1} id="result-title">{mode === 'demo' ? t('ડેમો પરિણામ') : t('તમારા ફોટામાં શું દેખાય છે?')}</h2></div>
      <button className="button button-outline" onClick={onRetake}><RefreshCw size={17} /> {t("નવો ફોટો લો")}</button>
    </div>
    {mode === 'demo' && <div className="demo-result-note" role="note"><FlaskConical size={21} /><div><strong>{t("સિમ્યુલેશન — તમારા ફોટાનું AI વિશ્લેષણ થયું નથી.")}</strong><p>{t("આ માત્ર એપ્લિકેશનનું ઉદાહરણ છે. પાક અંગે નિર્ણય લેવા આ પરિણામ વાપરશો નહીં.")}</p></div></div>}
    {mode === 'live' && (result.language || 'gu') !== language && <p className="language-result-note" role="note">{t('આ પરિણામ અગાઉની ભાષામાં છે. પસંદ કરેલી ભાષામાં નવું વિશ્લેષણ કરવા ફરી પ્રયાસ કરો.')}</p>}
    {image && <figure className="review-photo"><img src={image.preview} alt={t('વિશ્લેષણ માટે પસંદ કરેલો પાકનો ફોટો')} /><figcaption><span>{image.illustration ? t('નમૂનાનું ચિત્ર') : image.name}</span><strong>{mode === 'demo' ? t('ડેમો મોડ · સિમ્યુલેશન') : t('લાઇવ AI વિશ્લેષણ')}</strong></figcaption></figure>}
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
        <div className="uncertainty"><span className="certainty-ring" aria-label={t("આંકડાકીય વિશ્વાસ માપવામાં આવ્યો નથી")}>—</span><div><h4>{t("અનિશ્ચિતતા:")} {uncertainty}</h4><p lang={mode === 'demo' ? language : result.language || 'gu'}>{text(analysis.uncertainty.reason_gu)}</p></div></div>
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
    <div className="review-actions"><button type="button" className="button button-outline" onClick={saveReview}><Download size={16} />{t('ટેક્સ્ટ સાચવો')}</button><button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={16} />{t('પ્રિન્ટ / PDF સાચવો')}</button></div>
    <section className="next-step-plan"><h3>{language==='en'?'What to do next':'હવે શું કરવું?'}</h3><ol>{(language==='en' ? (analysis.image_assessment==='cotton' ? ['Inspect the affected part and leaf undersides in daylight.','Take a close-up and a whole-plant photo; note when symptoms started and whether they are spreading.','Share these observations with a local agricultural expert before choosing a treatment.'] : ['Retake a clear daylight photo of the affected cotton plant.','Include both the affected part and the whole plant so an expert can assess the context.']) : (analysis.image_assessment==='cotton' ? ['દિવસના પ્રકાશમાં અસરગ્રસ્ત ભાગ અને પાનની નીચેની બાજુ તપાસો.','નજીકનો અને આખા છોડનો ફોટો લો; લક્ષણો ક્યારથી છે અને ફેલાય છે કે નહીં તેની નોંધ લો.','ઉપચાર પસંદ કરતાં પહેલાં આ વિગતો સ્થાનિક કૃષિ નિષ્ણાત સાથે શેર કરો.'] : ['દિવસના પ્રકાશમાં કપાસના અસરગ્રસ્ત છોડનો સ્પષ્ટ ફોટો ફરી લો.','અસરગ્રસ્ત ભાગ અને આખા છોડના ફોટા લો જેથી નિષ્ણાત સંદર્ભ સમજી શકે.'])).map(step=><li key={step}>{step}</li>)}</ol><p className="research-help">{language==='en'?'These are observation and escalation steps, not a disease-specific treatment plan.':'આ અવલોકન અને નિષ્ણાતની મદદ માટેનાં પગલાં છે, રોગ-વિશેષ ઉપચાર નથી.'}</p></section>
    <Followup image={image} result={result} language={language} />
    <p className="result-meta"><LockKeyhole size={13} /> {t("રિપોર્ટ કે સંશોધન ફક્ત સંમતિથી.")}{mode === 'live' && <> {t("· મોડેલ:")} <span lang="en">{result.model}</span></>}</p>
  </section>;
}

function ReviewPlaceholder({ language, analyzing, mode, hasImage }) {
  const t = translator(language);
  return <div className="review-placeholder">
    <div className={`placeholder-hero ${analyzing ? 'is-scanning' : ''}`}>
      <div className="scan-grid" aria-hidden="true" />
      <div className="scan-heading"><span><span className="status-dot" />{t('પાકનું અવલોકન સ્ટુડિયો')}</span><span>01 / 03</span></div>
      <div className="scan-copy"><p className="eyebrow">{t('કુદરત મળે સમજને.')}</p><h2>{t('થોડી વધુ સમજ.')}<br /><em>{t('આગળનું સ્પષ્ટ પગલું.')}</em></h2><p>{t('ડાબી બાજુ ફોટો ઉમેરો. સંભવિત ઓળખ, દેખાતા લક્ષણો અને અનિશ્ચિતતા અહીં સાથે જુઓ.')}</p><a className="scan-link" href="#analyze" onClick={event => { event.preventDefault(); document.getElementById('analyze')?.scrollIntoView({ block: 'start' }); document.getElementById('crop-photo')?.focus({ preventScroll: true }); }}>{hasImage ? t('તમારો ફોટો તૈયાર છે') : t('તમારા ફોટાથી શરૂઆત કરો')}<MoveUpRight size={17} /></a></div>
      <div className="leaf-study" aria-hidden="true"><div className="leaf-orbit orbit-one" /><div className="leaf-orbit orbit-two" /><img src="/cottoncare/leaf-study.svg" alt="" /><span className="leaf-marker marker-one" /><span className="leaf-marker marker-two" /><span className="leaf-label"><Leaf size={12} /> GOSSYPIUM <span>·</span> {t('ચિત્ર')}</span><span className="scan-corner corner-tl" /><span className="scan-corner corner-tr" /><span className="scan-corner corner-bl" /><span className="scan-corner corner-br" /></div>
      <div className="scan-caption"><span><ScanLine size={14} />{t('એક ફોટો. એક સરળ સમજૂતી.')}</span><span>{t('સુશોભન ચિત્ર · વિશ્લેષણ નથી')}</span></div>
    </div>
    {analyzing ? <div className="workspace-processing" role="status"><LoaderCircle size={28} className="animate-spin" /><h3>{mode === 'demo' ? t('ડેમો તૈયાર થાય છે…') : t('વિશ્લેષણ થઈ રહ્યું છે…')}</h3><p>{mode === 'demo' ? t('માત્ર નમૂનાનું પરિણામ તૈયાર થાય છે.') : t('દેખાતા લક્ષણો અને અનિશ્ચિતતાનું અવલોકન થાય છે.')}</p></div> : <div className="preview-sections">{[
      [ImagePlus, 'ફોટો અને સંભવિત ઓળખ', 'તમારા ફોટામાં દેખાતા લક્ષણોનું પ્રાથમિક અવલોકન.'],
      [CircleHelp, 'સ્પષ્ટ અનિશ્ચિતતા', 'આંકડાકીય વિશ્વાસ માપવામાં આવ્યો નથી'],
      [Sprout, 'જાણકારી સાથે આગળ વધો', 'અંતિમ નિર્ણય માટે નિષ્ણાત તમારી સાથે.'],
    ].map(([Icon, title, description], i) => <article key={title}><span>0{i + 1}</span><Icon size={22} /><h3>{t(title)}</h3><p>{t(description)}</p></article>)}</div>}
    <div className="quick-photo-tip"><Sun size={20} /><p><strong>{t('સ્પષ્ટ ફોટો લો')}</strong><br />{t('દિવસના કુદરતી પ્રકાશમાં અસરગ્રસ્ત ભાગનો નજીકથી ફોટો લો.')}</p><a href="#/guide">{t('ફોટો માર્ગદર્શિકા')} <ArrowUpRight size={14} /></a></div>
  </div>;
}

export default function App({emailLink} = {}) {
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
  const [theme, setTheme] = useState(() => readPreference('kapasmitra-theme', 'light') === 'dark' ? 'dark' : 'light');
  const [reducedMotion, setReducedMotion] = useState(() => readPreference('kapasmitra-reduced-motion', 'false') === 'true');
  const [researchRevision, setResearchRevision] = useState(0);
  const resolvePage = () => ({home:'home','request-research':'request-research',admin:'admin','my-submissions':'my-submissions','forgot-password':'forgot-password','reset-password':'reset-password',confirm:'confirm',crop:'crop',guide:'guide',analyze:'crop',main:'crop',research:'research','how-it-works':'guide',guidance:'guide',about:'about',settings:'settings',community:'community',account:'account',login:'login',signup:'signup'}[window.location.hash.replace(/^#\/?/,'').split('?')[0]] || 'home');
  const [page, setPage] = useState(resolvePage);
  const [accountUser, setAccountUser] = useState(null);
  const [accountsConfigured, setAccountsConfigured] = useState(null);
  const [accountStatusError, setAccountStatusError] = useState(null);
  const [accountConfiguration, setAccountConfiguration] = useState({});
  async function refreshAccount(throwOnError = false) {
    try {
      const data = await accountRequest('/me'); setAccountUser(data.user); setAccountsConfigured(data.configured);
      setAccountConfiguration(data); setAccountStatusError(null);
      setResearchRevision(value => value + 1);
    } catch (error) {
      setAccountUser(null); if (typeof error.configured === 'boolean') setAccountsConfigured(error.configured);
      setAccountStatusError(error);
      if (throwOnError === true) throw error;
    }
  }
  useEffect(() => { refreshAccount(); window.addEventListener('km-account-change', refreshAccount); return () => window.removeEventListener('km-account-change', refreshAccount); }, []);
  const [activeSection, setActiveSection] = useState('analyze');
  useEffect(() => {const change=()=>{setPage(resolvePage());document.documentElement.scrollTop=0;};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{
    if(accountsConfigured===null)return;
    const destination=routeAccess(page,accountUser);
    if(destination!==page){if(destination==='login')rememberDestination(page);window.location.hash='/'+destination;setPage(destination);}
  },[page,accountUser,accountsConfigured]);
  useEffect(()=>{
    const expired=()=>{rememberDestination(page);setAccountUser(null);window.location.hash='/login';setPage('login');};
    const focus=()=>refreshAccount();
    window.addEventListener('km-session-expired',expired);window.addEventListener('focus',focus);
    return()=>{window.removeEventListener('km-session-expired',expired);window.removeEventListener('focus',focus);};
  },[page]);
  const fileInput = useRef(null); const cameraInput = useRef(null);
  const activeRequest = useRef(null); const selection = useRef(0);

  useEffect(()=>{activeRequest.current?.abort();selection.current++;setImage(null);setResult(null);setAnalyzing(false);setPreparing(false);setError('');setConsent(false);},[accountUser?.id]);

  async function connect() {
    setConnectionError(false);
    try {
      const data = await loadCapabilities(); setCapabilities(data);
      if (!data.liveAvailable && data.demoAvailable) setMode('demo');
    } catch { setConnectionError(true); }
  }
  useEffect(() => { connect(); return () => activeRequest.current?.abort(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreference('kapasmitra-theme', theme);
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    savePreference('kapasmitra-reduced-motion', String(reducedMotion));
    return () => { delete document.documentElement.dataset.reducedMotion; };
  }, [reducedMotion]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActiveSection(entry.target.id);
    }, { rootMargin: '-12% 0px -55% 0px', threshold: 0 });
    for (const id of ['analyze', 'research', 'how-it-works', 'guidance', 'about']) {
      const section = document.getElementById(id); if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
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
      const data = await analyzeImage(image, mode, controller.signal, language, consent);
      if (!controller.signal.aborted) {
        setResult(data);
        setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setAnalyzing(false); }
  }
  const available = capabilities && (mode === 'demo' ? capabilities.demoAvailable : capabilities.liveAvailable);

  return <div className={'cotton-workspace'+(['home','login','signup','forgot-password','reset-password','confirm'].includes(page)?' public-shell':'')} data-page={page}>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>{t('મુખ્ય સામગ્રી પર જાઓ')}</a>
    <aside className="workspace-sidebar">
      <a className="workspace-brand" href="#/home"><span className="workspace-brand-icon"><CottonMark /></span><span>{t('કપાસમિત્ર')}<small>AI</small><b>.</b></span></a>
      <p className="sidebar-caption">ROOTED IN CARE. GROWN WITH AI.</p>
      <p className="nav-caption">{t('તમારું કાર્યસ્થળ')}</p>
      <nav aria-label={t('મુખ્ય નેવિગેશન')}>{[
        ['home', Leaf, language==='en'?'Home':'મુખ્ય પાનું'], ['crop', LayoutDashboard, 'પાકની તપાસ'], ...(accountUser&&['admin','researcher','expert'].includes(accountUser.role)?[['research', FlaskConical, language==='en'?'Research dashboard':'સંશોધન ડેશબોર્ડ']]:[]), ['community', Sprout, 'સમુદાય'], ['guide', BookOpen, 'કૃષિ માર્ગદર્શન'], ['about', CircleHelp, 'આ એપ વિશે'], ...(accountUser?[["account",LockKeyhole,language==='en'?'My account':'મારું ખાતું'],['my-submissions',ImagePlus,language==='en'?'My submissions':'મારા ફોટા'],...(!['admin','researcher','expert'].includes(accountUser.role)?[['request-research',FileCheck2,language==='en'?'Request research access':'સંશોધન પ્રવેશ માગો']]:[]),...(accountUser.role==='admin'?[['admin',ShieldCheck,language==='en'?'Admin dashboard':'વ્યવસ્થાપક ડેશબોર્ડ']]:[])]:[]),
      ].map(([id, Icon, label], i) => <a key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} href={`#/${id}`} onClick={() => setPage(id)}><Icon size={18} />{t(label)}<span className="nav-index">0{i + 1}</span></a>)}</nav>
      <button type="button" className="sidebar-settings" onClick={() => {window.location.hash="/settings";setPage("settings");}}><Settings2 size={17} />{t('સેટિંગ્સ')}</button>
      <div className="sidebar-bottom"><div className="sidebar-plant" aria-hidden="true"><Sprout strokeWidth={.8} /></div><span className="sidebar-card-label"><Leaf size={13} />{t('ખેતર માટે બનાવેલું')}</span><h2>{t('કાળજીથી શરૂઆત.')}</h2><p>{t('ફોટાથી પ્રાથમિક ઓળખ')}<br />{t('અંતિમ નિર્ણય માટે નિષ્ણાત તમારી સાથે.')}</p><span className="sidebar-footnote"><span className="status-dot" />{t('ખેડૂત માટેનું પ્રાથમિક AI સાધન')}</span></div>
    </aside>
    <div className="workspace-body">
    <header className="workspace-topbar">{['home','login','signup','forgot-password','reset-password','confirm'].includes(page)&&<a className="public-brand" href="#/home"><span><CottonMark/></span><strong>{language==='en'?'KapasMitra':'કપાસમિત્ર'}<small>AI</small></strong></a>}<div className="breadcrumb"><span className="topbar-mark"><Sprout size={16} /></span>{t('તમારા પાકનો સાથી')}<span>/</span><strong>{t({home:'મુખ્ય પાનું','request-research':'સંશોધન પ્રવેશ','my-submissions':'મારા ફોટા',admin:'વ્યવસ્થાપક','forgot-password':'પાસવર્ડ','reset-password':'પાસવર્ડ',confirm:'ઇમેઇલ',crop:'પાકની તપાસ',research:'સંશોધન',community:'સમુદાય',guide:'કૃષિ માર્ગદર્શન',about:'આ એપ વિશે',settings:'સેટિંગ્સ',account:'ખાતું',login:'પ્રવેશ',signup:'ખાતું બનાવો'}[page])}</strong></div><div className="header-actions"><div className="account-actions"><a className="public-home-link" href="#/home">{language==='en'?'Home':'મુખ્ય પાનું'}</a>{accountUser ? <a href="#/account">{language === 'en' ? (accountUser.role === 'admin' ? 'Admin' : 'Account') : (accountUser.role === 'admin' ? 'વ્યવસ્થાપક' : 'ખાતું')}</a> : <><a href="#/login">{language === 'en' ? 'Log in' : 'પ્રવેશ'}</a><a href="#/signup">{language === 'en' ? 'Sign up' : 'ખાતું બનાવો'}</a></>}</div><button className="theme-switch" type="button" aria-label={theme === 'light' ? t('ડાર્ક થીમ પસંદ કરો') : t('લાઇટ થીમ પસંદ કરો')} onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><label className="language-switch"><Languages size={16} aria-hidden="true" /><select aria-label="Language / ભાષા" value={language} onChange={event => {activeRequest.current?.abort(); setAnalyzing(false); setLanguage(event.target.value);}}><option value="gu" lang="gu">ગુજરાતી</option><option value="en" lang="en">English</option></select></label><span className="workspace-private"><LockKeyhole size={13} />{t('સંશોધન ફક્ત સંમતિથી')}</span></div></header>
    <main id="main" tabIndex={-1}>{['account','login','signup','request-research','admin','forgot-password','reset-password','confirm'].includes(page) && <AccountPage initialEmailLink={emailLink?.page===page?emailLink:undefined} key={page+':'+(accountUser?.id||'guest')} language={language} page={page} user={accountUser} configured={accountsConfigured} onChanged={() => refreshAccount(true)} statusError={accountStatusError} onRetry={() => refreshAccount()} configurationIssue={accountConfiguration.configurationIssue} missingConfiguration={accountConfiguration.missingConfiguration} />}{page==='home'&&<Landing language={language} user={accountUser}/>}{accountUser&&page==='crop'&&<div className="route-page">
      <div className="workspace-heading"><div><p className="eyebrow"><span className="eyebrow-line" />{t('કપાસના ખેડૂતનો ડિજિટલ સાથી')}</p><h1>{t('કપાસની ચિંતા?')} <span>{t('ચાલો, સાથે સમજીએ.')}</span></h1><p>{t('ફોટો ડાબી બાજુ. સંપૂર્ણ અવલોકન જમણી બાજુ.')}</p></div><div className="workspace-status"><span className="studio-edition">CROP STUDIO <span> / </span> 01</span><span className={`workspace-mode ${mode}`}><span className="status-dot" />{!capabilities ? t('જોડાણ તપાસી રહ્યા છીએ') : mode === 'demo' ? t('ડેમો મોડ · સિમ્યુલેશન') : t('લાઇવ AI વિશ્લેષણ')}</span></div></div>
      <div className="workspace-notice"><ShieldCheck size={18} /><p>{t('આ પુષ્ટિ થયેલું નિદાન નથી. ફોટાથી કરેલું અનુમાન ખોટું હોઈ શકે છે. કૃષિ નિષ્ણાતની સમીક્ષા જરૂરી છે.')}</p><a href="#/about">{t('વધુ જાણો')} <ArrowUpRight size={14} /></a></div>
      <section className="hero-section"><div className="page-width hero-grid">
        <div className="upload-wrapper" id="analyze"><form className="upload-card" onSubmit={submit}>
          <ol className="workspace-stepper" aria-label={t('તપાસની પ્રગતિ')}><li className={!result ? 'current' : ''}><span>1</span>{t('ફોટો')}</li><li className={result ? 'current' : ''}><span>2</span>{t('અવલોકન')}</li><li><span>3</span>{t('આગળનું પગલું')}</li></ol>
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
          <p className="upload-privacy"><LockKeyhole size={12} /> {t("AI તપાસ ફોટો સાચવતી નથી. સંશોધન માટે અલગ સંમતિ આપો.")}</p>
        </form><ResearchContribution publicResearchAccess={Boolean(capabilities?.publicResearchAccess)} image={image} analysisReceipt={result?.analysisReceipt} language={language} available={Boolean(capabilities?.researchAvailable)} onSaved={() => setResearchRevision(value => value + 1)} /><div className="below-upload"><Leaf size={14} /> {t("સમજૂતીથી શરૂઆત. કાળજીથી આગળ.")}</div></div>
        <div className="workspace-results" aria-busy={analyzing}><div className="workspace-results-topline"><span><ScanLine size={15} />{t('તમારા પાકનું અવલોકન')}</span><span className={result ? 'status-ready' : ''}><span className="status-dot" />{analyzing ? t('વિશ્લેષણ થઈ રહ્યું છે…') : result ? t('અવલોકન તૈયાર છે') : error ? t('ફરી પ્રયાસ કરો') : t('ફોટાની રાહ જોઈ રહ્યા છીએ')}</span></div>{result ? <Result result={result} onRetake={reset} language={language} image={image} /> : <ReviewPlaceholder language={language} analyzing={analyzing} mode={mode} hasImage={!!image} />}</div>
      </div></section>
      </div>}{accountUser&&['research','my-submissions'].includes(page)&&routeAccess(page,accountUser)===page&&<div className="route-page"><ResearchHub key={page} initialScope={page==='research'?'dataset':'mine'} publicResearchAccess={Boolean(capabilities?.publicResearchAccess)} onRetry={connect} language={language} revision={researchRevision} available={Boolean(capabilities?.researchAvailable)} /></div>}
      {accountUser&&page==='community'&&<div className="route-page"><Community language={language} available={capabilities?.services?.community==='sqlite'||Boolean(capabilities?.researchAvailable)} /></div>}
      <div className="route-page" hidden={page!=='guide'}><section className="how-section page-width" id="how-it-works"><div className="section-intro"><div><p className="eyebrow">{t("સરળ છે. તમારી ભાષામાં છે.")}</p><h2>{t("વધુ સમજ, માત્ર ત્રણ પગલાંમાં.")}</h2></div><p>{t("ખેતરથી સીધો ફોટો.")}<br />{t("સરળ ભાષામાં પ્રાથમિક સમજ.")}</p></div>
        <div className="steps-grid">{[
          { icon: Camera, title: t('સ્પષ્ટ ફોટો લો'), description: t('પાન, ફૂલ કે જીંડવાનો ફોટો ઉમેરો. અસરગ્રસ્ત ભાગ સ્પષ્ટ દેખાય તે ધ્યાનમાં રાખો.') },
          { icon: ScanLine, title: t('દેખાતા લક્ષણો સમજો'), description: t('AI સંભવિત ઓળખ અને તેની અનિશ્ચિતતા સમજાવે છે. તેને અંતિમ નિદાન માનશો નહીં.') },
          { icon: Sprout, title: t('જાણકારી સાથે આગળ વધો'), description: t('સમીક્ષિત માર્ગદર્શન ઉપલબ્ધ હોય ત્યારે વાંચો અને કૃષિ નિષ્ણાતની મદદ લો.') },
        ].map(({ icon: Icon, title, description }, i) => <article className="step-card" key={title}><div className="step-top"><span className="step-icon"><Icon size={23} /></span><span className="step-number">0{i + 1}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
      <section className="guidance-section page-width" id="guidance"><div className="guidance-main"><span className="guidance-icon"><ShieldCheck size={29} /></span><div><p className="eyebrow">{t("વિશ્વાસ પહેલાં, દાવો પછી.")}</p><h2>{t("માર્ગદર્શન, જવાબદારી સાથે.")}</h2><p>{t("AI નો અંદાજ અને ચકાસાયેલ કૃષિ સલાહ અલગ છે. માત્ર મંજૂર સ્રોત અને નિષ્ણાત સમીક્ષા ધરાવતી માહિતી જ ઉપચાર માટે બતાવવામાં આવશે.")}</p><span className="catalog-status"><span /> {t("સમીક્ષિત કૃષિ સામગ્રી હજી જોડાયેલી નથી")}</span></div></div>
        <div className="guidance-aside"><FileCheck2 size={24} /><h3>{t("અંદાજને નિદાન ન માનશો.")}</h3><p>{t("અસ્પષ્ટ ફોટો, બદલાતું હવામાન કે સમાન લક્ષણો ઓળખને અસર કરી શકે છે. નિષ્ણાતની પુષ્ટિ મહત્વની છે.")}</p></div>
      </section>
      </div><div className="route-page" hidden={page!=='about'}><section className="faq-section page-width" id="about"><div><p className="eyebrow"><CircleHelp size={15} /> {t("થોડું વધુ જાણો")}</p><h2>{t("તમારા મનના સવાલ.")}</h2></div><div className="faq-list"><details><summary>{t("શું આ પરિણામ પાકનું ચોક્કસ નિદાન છે?")}</summary><p>{t("ના. આ ફોટામાં દેખાતા લક્ષણોનું પ્રાથમિક AI અવલોકન છે. પાકના નિર્ણય પહેલાં કૃષિ નિષ્ણાતની પુષ્ટિ લો.")}</p></details><details><summary>{t("મારો ફોટો ક્યાં જાય છે?")}</summary><p>{t("લાઇવ મોડમાં સંમતિ પછી ફોટો Google Gemini ને મોકલાય છે. ડેમો બહારની AI સેવાને ફોટો મોકલતો નથી. સામાન્ય AI તપાસ ફોટો સાચવતી નથી. સંશોધન માટે અલગ સંમતિ આપો ત્યારે ફોટો અને વિગતો ડેટાબેઝમાં સાચવાય છે અને અધિકૃત સંશોધકો જોઈ શકે છે. Google ની પોતાની ડેટા નીતિઓ લાગુ પડે છે.")}</p></details><details><summary>{t("ડેમો અને લાઇવ પરિણામમાં શું તફાવત છે?")}</summary><p>{t("ડેમો પહેલેથી લખેલું નમૂનાનું પરિણામ છે. તે તમારા ફોટાને ઓળખતું નથી. લાઇવ મોડમાં Gemini ફોટાના દેખાતા લક્ષણોનું અવલોકન કરે છે; તે પણ પુષ્ટિ થયેલું નિદાન નથી.")}</p></details></div></section>
    </div><div className="route-page" hidden={page!=='settings'}><SettingsDialog embedded language={language} setLanguage={value=>{activeRequest.current?.abort();setAnalyzing(false);setLanguage(value);}} theme={theme} setTheme={setTheme} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} onClose={()=>{window.location.hash="/crop";setPage("crop");}} /></div></main>
    <footer className="site-footer"><div className="page-width footer-inner"><a href="#/crop" className="footer-brand"><CottonMark /> {t("કપાસમિત્ર")} <span lang="en">AI</span></a><p>{t("ખેડૂત માટે બનાવેલું. ગુજરાતીમાં.")}</p><span>{t("પ્રાથમિક અવલોકન · નિષ્ણાતની સલાહનો વિકલ્પ નથી")}</span></div></footer>
    </div>
  </div>;}
