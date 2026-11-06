import {ArrowUpRight,Eye,EyeOff,Leaf,LockKeyhole,Mail,ShieldCheck,Sprout} from 'lucide-react';
import {consumeDestination} from '../lib/account-navigation.js';
import {readAccountLink} from '../lib/account-links.js';
import { useEffect, useRef, useState } from 'react';
import { bilingual } from '../lib/research.js';
const accountMessages = {
 ACCOUNT_CONFLICT: ['અરજીની સ્થિતિ બદલાઈ છે. ફરી લોડ કરીને તપાસો.', 'This application is already pending or has changed. Refresh its status.'],
 ACCOUNT_LINK: ['ઇમેઇલની લિંક અમાન્ય છે અથવા સમય પૂરો થયો છે. નવી લિંક માગો.', 'This email link expired or was already used. Request a new link.'],
 ACCOUNT_RESPONSE: ['Supabase નો જવાબ વાંચી શકાયો નથી. થોડી વાર પછી પ્રયાસ કરો.', 'Supabase returned an unreadable response. Please try again later.'],
 ACCOUNT_NETWORK: ['બેકએન્ડ Supabase સુધી પહોંચી શક્યું નથી. DNS અને ઇન્ટરનેટ જોડાણ તપાસો.', 'The backend could not reach Supabase. Check DNS and the network connection.'],
 ACCOUNT_TIMEOUT: ['Supabase નો જવાબ આવવામાં સમય પૂરો થયો. ફરી પ્રયાસ કરો.', 'Supabase did not respond in time. Please try again.'],
 ACCOUNT_CREDENTIALS: ['ઇમેઇલ અથવા પાસવર્ડ ખોટો છે.', 'Incorrect email or password.'],
 ACCOUNT_CONFIRMATION: ['પ્રવેશ કરતાં પહેલાં તમારા ઇમેઇલની પુષ્ટિ કરો.', 'Confirm your email before logging in.'],
 ACCOUNT_EXISTS: ['ખાતું પહેલેથી બનાવ્યું હોય તો ઇમેઇલની પુષ્ટિ કરીને પ્રવેશ કરો.', 'If you already registered, confirm your email and log in.'],
 ACCOUNT_SCHEMA: ['ખાતાના ડેટાબેઝનું સેટઅપ અધૂરું છે. સમીક્ષિત account migration લાગુ કરો.', 'Account database setup is incomplete. Apply the reviewed account migration.'],
 ACCOUNT_POLICY: ['ડેટાબેઝની પરવાનગી મળી નથી. RLS નીતિઓ તપાસો.', 'Database permission was denied. Check the reviewed RLS policies.'],
 ACCOUNT_KEY: ['Supabase એ client key સ્વીકારી નથી. બેકએન્ડનું સેટઅપ તપાસો.', 'Supabase rejected the configured client key. Check SUPABASE_PUBLISHABLE_KEY.'],
 ACCOUNT_BACKEND: ['ખાતાના બેકએન્ડનો સંપર્ક થઈ શક્યો નથી. બેકએન્ડ શરૂ છે કે નહીં તપાસીને ફરી પ્રયાસ કરો.', 'The account backend could not be reached or returned an invalid response. Check that the backend is running, then retry.'],
 ACCOUNT_SESSION: ['તમારો પ્રવેશ સમય પૂરો થયો છે. ફરી પ્રવેશ કરો.', 'Your session expired. Please log in again.'],
 ACCOUNT_PROVIDER_DISABLED: ['Supabase માં ઇમેઇલથી ખાતું બનાવવાની સેવા સક્રિય કરો.', 'Enable email signup in Supabase Auth settings.'],
 ACCOUNT_PASSWORD: ['વધુ મજબૂત પાસવર્ડ પસંદ કરો.', 'Choose a stronger password that meets the project requirements.'],
 ACCOUNT_LOCAL_RATE: ['આ જોડાણ પરથી ખાતા માટે ઘણી વિનંતીઓ થઈ છે.', 'Too many account attempts from this connection.'],
 ACCOUNT_EMAIL_RATE: ['પુષ્ટિ ઇમેઇલ મોકલવાની મર્યાદા પૂરી થઈ છે. ઇમેઇલની પુષ્ટિ કરી હોય તો પ્રવેશ કરો. નવી પુષ્ટિ માટે પ્રોજેક્ટ માલિકનો સંપર્ક કરો અથવા મર્યાદા ફરી ઉપલબ્ધ થાય ત્યાં સુધી રાહ જુઓ.', 'The confirmation email sending limit has been reached. If you already confirmed your email, use Log in. For a new confirmation, contact the project owner or wait for the email limit to reset.'],
 ACCOUNT_PROVIDER_RATE: ['Supabase ખાતાની વિનંતીઓ મર્યાદિત કરી રહ્યું છે. પછીથી પ્રયાસ કરો.', 'Supabase is limiting account requests. Please try again later.'],
 ACCOUNT_EMAIL_RECIPIENT: ['ઇમેઇલ સેવા આ સરનામે પુષ્ટિ મોકલી શકતી નથી. પ્રોજેક્ટ માલિકને custom SMTP ગોઠવવા કહો.', 'The configured email sender cannot send confirmation to this address. Ask the project owner to configure custom SMTP.'],
 ACCOUNT_RATE: ['ઘણી વિનંતીઓ થઈ છે. થોડી વાર પછી પ્રયાસ કરો.', 'Too many account requests. Please try again later.'],
};
export function accountErrorMessage(error, language) {
 const message = accountMessages[error?.code]?.[language === 'en' ? 1 : 0] || (language === 'en' ? error?.message || 'Account request failed.' : 'વિનંતી પૂરી થઈ નથી. ખાતાની વિગતો અને જોડાણ તપાસો.');
 const retry = error?.retryAfterSeconds;
 return Number.isSafeInteger(retry) && retry >= 0 ? message + (language === 'en' ? ` Retry in ${retry} seconds.` : ` ${retry} સેકન્ડ પછી ફરી પ્રયાસ કરો.`) : message;
}
export async function accountRequest(path, body) {
 let response, data;
 try {
  response = await fetch('/api/account' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  data = await response.json();
 } catch { throw Object.assign(new Error('The account backend could not be reached or returned an invalid response.'), {code:'ACCOUNT_BACKEND'}); }
 if (response.status === 401 && !['/login','/signup','/confirm','/reset-password'].includes(path)) window.dispatchEvent(new Event('km-session-expired'));
 if (!response.ok) throw Object.assign(new Error(data.error?.message || 'Account request failed.'), {code:data.error?.code,status:response.status,retryAfterSeconds:data.error?.retryAfterSeconds,...(typeof data.configured==='boolean'?{configured:data.configured}:{})});
 if (path === '/me' && typeof data.configured !== 'boolean') throw Object.assign(new Error('Invalid account configuration response.'), {code:'ACCOUNT_BACKEND'});
 return data;
}
export default function AccountPage({ language, page, user, configured, onChanged, statusError, onRetry, initialEmailLink }) {
 const t=bilingual(language), signup=page==='signup', recover=page==='forgot-password', reset=page==='reset-password', confirm=page==='confirm';
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
 const loadVersion=useRef(0);
 const [requests,setRequests]=useState([]),[filter,setFilter]=useState('pending'),[loaded,setLoaded]=useState(false),[reasons,setReasons]=useState({});
 const [form,setForm]=useState({kind:'individual',name:'',institution:'',purpose:'',intendedUse:'',consent:false});
 const [showPassword,setShowPassword]=useState(false);
 const authPage=['login','signup','forgot-password','reset-password','confirm'].includes(page);
 const pending=useRef(false);
 const [emailLink,setEmailLink]=useState(()=>initialEmailLink||readAccountLink(window.location)||{});
 useEffect(()=>{if(reset||confirm)window.history.replaceState(null,'',window.location.pathname+window.location.search+'#/'+page);},[reset,confirm,page]);
 useEffect(()=>{setPassword('');setError('');setNotice('');},[page]);
 async function load(){
  const version=++loadVersion.current;setLoaded(false);
  const data=await accountRequest('/requests'+(page==='admin'?'?scope=admin&status='+filter+'&offset='+offset:''));
  if(version!==loadVersion.current)return;
  setRequests(data.requests);setHasMore(data.hasMore===true);setLoaded(true);
  if(page!=='admin'&&data.requests[0]){const r=data.requests[0];setForm(f=>({...f,kind:r.kind,name:r.applicant_name,institution:r.institution,purpose:r.purpose,intendedUse:r.intended_use}));}
 }
 useEffect(()=>{let active=true;setRequests([]);setLoaded(false);if(user)load().catch(e=>{if(active)setError(accountErrorMessage(e,language));});return()=>{active=false;loadVersion.current++;};},[user?.id,user?.role,page,filter,offset,language]);
 useEffect(()=>{
  if(!user||page==='admin'||requests[0]?.status!=='pending')return;
  const timer=setInterval(()=>{if(document.visibilityState!=='hidden')load().then(()=>onChanged?.()).catch(e=>setError(accountErrorMessage(e,language)));},15000);
  return()=>clearInterval(timer);
 },[user?.id,page,requests[0]?.status,language]);
 async function action(fn){if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(accountErrorMessage(e,language));}finally{pending.current=false;setBusy(false);setPassword('');}}
 async function authenticate(e){e.preventDefault();await action(async()=>{
  if(recover){await accountRequest('/recover',{email});setNotice(t('ખાતું હોય તો ઇમેઇલમાં પાસવર્ડ બદલવાની લિંક મળશે.','If an account exists, check your email for a password reset link.'));return;}
  if(reset||confirm){await accountRequest(confirm?'/confirm':'/reset-password',{...emailLink,password});setEmailLink({});setNotice(confirm?t('ઇમેઇલની પુષ્ટિ થઈ. હવે પ્રવેશ કરો.','Email confirmed. You can now log in.'):t('પાસવર્ડ સાચવ્યો. હવે નવા પાસવર્ડથી પ્રવેશ કરો.','Password saved. Log in using your new password.'));return;}
  await accountRequest(signup?'/signup':'/login',{email,password});
  if(signup)setNotice(t('પુષ્ટિ માટે ઇમેઇલ તપાસો, પછી પ્રવેશ કરો. નવા ખાતાને સામાન્ય વપરાશકર્તાનો જ પ્રવેશ મળે છે.','Check your email to confirm, then log in. New accounts receive normal-user access only.'));
  else{await onChanged();window.location.hash='/'+consumeDestination();}
 });}
 async function submit(e){e.preventDefault();await action(async()=>{await accountRequest('/requests',form);await load();setForm(f=>({...f,consent:false}));setNotice(t('અરજી સમીક્ષા માટે મોકલી.','Application submitted for review.'));});}
 async function review(r,decision){await action(async()=>{await accountRequest('/review',{id:r.id,revision:r.revision,decision,reason:reasons[r.id]||''});await load();await onChanged();setNotice(decision==='revoked'?t('પ્રવેશ રદ થયો. અગાઉની ફોટો લિંક વધુમાં વધુ 60 સેકન્ડ ચાલે છે.','Access revoked. Previously issued image links can remain valid for up to 60 seconds.'):t('નિર્ણય સાચવ્યો.','Decision recorded.'));});}
 const statusLabel=value=>({pending:t('સમીક્ષા બાકી','Pending'),approved:t('મંજૂર','Approved'),rejected:t('નામંજૂર','Rejected'),revoked:t('પ્રવેશ રદ','Revoked')})[value]||value;
 function history(r){return <details><summary>{t('અરજી અને સમીક્ષાનો ઇતિહાસ','Application and review history')}</summary>{r.history?.map(h=><article className="community-reply" key={h.id}><strong>{h.revision} · {statusLabel(h.event)}</strong><p>{h.applicant_name} · {h.institution}</p><p>{h.purpose}</p><p>{h.intended_use}</p>{h.reason&&<p>{h.reason}</p>}<small>{new Date(h.created_at).toLocaleString(language==='en'?'en-IN':'gu-IN')}{page==='admin'&&h.reviewer_user_id?' · '+h.reviewer_user_id:''}</small></article>)}</details>;}
 const current=requests[0],canApply=loaded&&!['pending','approved'].includes(current?.status)&&!['researcher','expert','admin'].includes(user?.role);
 return <section className={'settings-page account-page'+(authPage?' auth-layout':'')}>{authPage&&<aside className="auth-story"><a href="#/home" className="auth-back">{t('મુખ્ય પાનું','Back to the field')}<ArrowUpRight size={16}/></a><div className="auth-story-copy"><span className="landing-kicker"><Sprout size={15}/>{t('સાથે ઉગીએ.','ROOTED IN CARE.')}</span><h2>{t('દરેક પાકને','A little care.')}<br/><em>{t('થોડી કાળજી.','A clearer tomorrow.')}</em></h2><p>{t('તમારા કપાસનો ફોટો, તમારી ભાષામાં સમજ અને ખેતર માટે વધુ સારા સવાલ.','Your cotton photo, a conversation in your language, and better questions for your field.')}</p></div><div className="auth-botanical"><div/><img src="/cottoncare/leaf-study.svg" alt=""/></div><p className="auth-story-foot"><ShieldCheck size={15}/>{t('ખાનગી ખાતું. સંશોધન માટે તમારી સંમતિ.','A private account. Sharing on your terms.')}</p></aside>}<div className={authPage?'auth-panel':'account-panel'}>{authPage&&<span className="auth-label"><Leaf size={16}/>{t('કપાસમિત્રમાં સ્વાગત છે','WELCOME TO KAPASMITRA')}</span>}<h1>{page==='admin'?t('વ્યવસ્થાપક ડેશબોર્ડ','Admin dashboard'):page==='request-research'?t('સંશોધન પ્રવેશ માગો','Request research access'):user?t('મારું ખાતું','My account'):signup?t('ખાતું બનાવો','Sign up'):recover?t('પાસવર્ડ ભૂલી ગયા?','Reset your password'):reset?t('નવો પાસવર્ડ બનાવો','Set your password'):confirm?t('ઇમેઇલની પુષ્ટિ','Confirm email'):t('પાછા આવવાનું સ્વાગત છે.','Welcome back.')}</h1>
 {statusError?<><p role="alert" className="research-notice is-error">{accountErrorMessage(statusError,language)}</p><button className="button button-outline" onClick={onRetry}>{t('ફરી તપાસો','Retry connection')}</button></>:configured===null?<p role="status">{t('ખાતાની સેવા તપાસી રહ્યા છીએ…','Checking account service…')}</p>:!configured?<p role="alert">{t('ખાતાની સેવા હાલ ઉપલબ્ધ નથી. થોડી વાર પછી પ્રયાસ કરો.','Account service is currently unavailable. Please try again later.')}</p>:(!user||recover||reset||confirm)?<>
 <p className="research-help">{t('પાકની તપાસ અને ફોટાનું યોગદાન આપવા પ્રવેશ કરો. ફક્ત સંશોધન ડેટા જોવા માટે અલગ મંજૂરી જરૂરી છે.','Sign in to analyse your crop and contribute photos. Approval is only needed to access the shared research dataset.')}</p>
 <form className="research-form" onSubmit={authenticate}><fieldset disabled={busy}>
 {!(reset||confirm)&&<label>{t('ઇમેઇલ','Email address')}<span className="auth-input"><Mail size={17}/><input placeholder="you@example.com" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></span></label>}
 {!(recover||confirm)&&<label>{t('પાસવર્ડ','Password')}<span className="auth-input"><LockKeyhole size={17}/><input placeholder={t('તમારો પાસવર્ડ','Your password')} type={showPassword?'text':'password'} autoComplete={signup||reset?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={signup||reset?8:1} maxLength={128} required/><button type="button" className="password-toggle" aria-label={showPassword?t('પાસવર્ડ છુપાવો','Hide password'):t('પાસવર્ડ બતાવો','Show password')} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>}
 {!signup&&!reset&&!recover&&!confirm&&<a className="auth-forgot" href="#/forgot-password">{t('પાસવર્ડ ભૂલી ગયા?','Forgot password?')}</a>}<button className="button button-primary" type="submit" disabled={busy}>{busy?t('રાહ જુઓ…','Please wait…'):recover?t('લિંક મોકલો','Send reset link'):reset?t('પાસવર્ડ સાચવો','Save password'):confirm?t('ઇમેઇલની પુષ્ટિ કરો','Confirm email'):signup?t('ખાતું બનાવો','Sign up'):t('પ્રવેશ કરો','Log in')}<ArrowUpRight size={17}/></button>
 </fieldset></form><p><a href="#/login">{t('પ્રવેશ કરો','Log in')}</a> · <a href="#/signup">{t('ખાતું બનાવો','Sign up')}</a> · <a href="#/forgot-password">{t('પાસવર્ડ ભૂલી ગયા?','Forgot password?')}</a></p>
 </>:<>
 <p>{user.email} · {user.role==='admin'?t('વ્યવસ્થાપક','Administrator'):['researcher','expert'].includes(user.role)?t('મંજૂર સંશોધક','Approved researcher'):t('સામાન્ય વપરાશકર્તા','Normal user')}</p>
 <nav className="chat-actions" aria-label={t('ખાતાના વિકલ્પો','Account navigation')}><a href="#/account">{t('મારું ખાતું','My account')}</a><a href="#/my-submissions">{t('મારા સાચવેલા ફોટા','My submissions')}</a>{['admin','researcher','expert'].includes(user.role)?<a href="#/research">{t('સંશોધન ડેશબોર્ડ','Research dashboard')}</a>:<a href="#/request-research">{t('સંશોધન પ્રવેશ માગો','Request research access')}</a>}{user.role==='admin'&&<a href="#/admin">{t('વ્યવસ્થાપક ડેશબોર્ડ','Admin dashboard')}</a>}</nav>
 <button className="button button-outline" disabled={busy} onClick={()=>action(async()=>{await accountRequest('/logout',{});await onChanged();window.location.hash='/home';})}>{t('બહાર નીકળો','Log out')}</button>
 <button className="button button-outline" disabled={busy||!loaded} onClick={()=>action(async()=>{await load();await onChanged?.();})}>{t('સ્થિતિ ફરી તપાસો','Refresh status')}</button>
 {!loaded&&<p role="status">{t('અરજી લોડ થાય છે…','Loading applications…')}</p>}
 {page==='admin'&&user.role==='admin'?<><label>{t('અરજીની યાદી','Application list')}<select value={filter} onChange={e=>{setOffset(0);setFilter(e.target.value);}}><option value="pending">{t('બાકી','Pending')}</option><option value="reviewed">{t('સમીક્ષા થયેલી','Reviewed')}</option><option value="all">{t('બધી','All')}</option></select></label>{loaded&&!requests.length&&<p>{t('કોઈ અરજી નથી.','No applications.')}</p>}{requests.map(r=><article className="community-reply" key={r.id}><h2>{r.applicant_name||r.institution}</h2><p>{r.institution}</p><p><strong>{t('હેતુ','Purpose')}: </strong>{r.purpose}</p><p><strong>{t('ડેટાનો ઉપયોગ','Intended data use')}: </strong>{r.intended_use}</p><p>{statusLabel(r.status)} · {t('આવૃત્તિ','Revision')} {r.revision}</p><small>{r.user_id}</small>{r.review_reason&&<p>{r.review_reason}</p>}{history(r)}{['pending','approved'].includes(r.status)&&<><label>{t('અરજદારને દેખાતું કારણ','Applicant-visible reason')}<textarea value={reasons[r.id]||''} onChange={e=>setReasons({...reasons,[r.id]:e.target.value})} maxLength={1500}/></label><div className="chat-actions">{r.status==='pending'?<><button disabled={busy||r.user_id===user.id} className="button button-primary" onClick={()=>review(r,'approved')}>{t('મંજૂર કરો','Approve')}</button><button disabled={busy||!reasons[r.id]?.trim()||r.user_id===user.id} className="button button-outline" onClick={()=>review(r,'rejected')}>{t('નામંજૂર કરો','Reject')}</button></>:<button disabled={busy||!reasons[r.id]?.trim()||r.user_id===user.id} className="button button-outline" onClick={()=>review(r,'revoked')}>{t('સંશોધન પ્રવેશ રદ કરો','Revoke research access')}</button>}</div></>}</article>)}<div className="chat-actions"><button className="button button-outline" disabled={busy||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-25))}>{t('પહેલાંના','Previous')}</button><button className="button button-outline" disabled={busy||!hasMore} onClick={()=>setOffset(v=>v+25)}>{t('આગળના','Next')}</button></div></>:<>
 {current&&<article className="community-reply"><p role="status">{t('તમારી અરજી:','Your application:')} <strong>{statusLabel(current.status)}</strong></p>{current.review_reason&&<p>{t('સમીક્ષકનું કારણ:','Reviewer reason:')} {current.review_reason}</p>}{history(current)}</article>}
 {page==='request-research'&&canApply&&<form className="research-form" onSubmit={submit}><fieldset disabled={busy}>
 <label>{t('અરજદાર','Applicant type')}<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="individual">{t('વ્યક્તિ','Individual')}</option><option value="university">{t('સંસ્થા / યુનિવર્સિટી','Organization / university')}</option></select></label>
 {[["name",t('પૂરું નામ','Full name'),150],["institution",t('સંસ્થા / સંગઠન','Institution / organization'),150]].map(([key,label,max])=><label key={key}>{label}<input required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} maxLength={max}/></label>)}
 {[["purpose",t('સંશોધનનો હેતુ','Research purpose')],["intendedUse",t('ડેટાનો પ્રસ્તાવિત ઉપયોગ','Intended use of data')]].map(([key,label])=><label key={key}>{label}<textarea required rows={4} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} maxLength={1500}/></label>)}
 <label className="research-checkbox"><input type="checkbox" checked={form.consent} onChange={e=>setForm({...form,consent:e.target.checked})}/>{t('આ અરજી અને ઓળખ વ્યવસ્થાપક સાથે વહેંચવા સંમત છું.','I agree to share this application and account identity with administrators.')}</label>
 <button type="submit" disabled={!form.consent} className="button button-primary">{current?t('ફેરફાર કરીને ફરી મોકલો','Resubmit application'):t('અરજી મોકલો','Submit application')}</button></fieldset></form>}
 </>}
 </>}
 {notice&&<p role="status" className="research-notice">{notice}</p>}{error&&<p role="alert" className="research-notice is-error">{error}</p>}
 </div></section>;
}
