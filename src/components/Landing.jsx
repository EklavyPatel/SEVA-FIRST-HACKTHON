import {ArrowRight,ArrowUpRight,Camera,Check,FlaskConical,Leaf,LockKeyhole,MessageCircle,ScanLine,ShieldCheck,Sprout} from 'lucide-react';
import {bilingual} from '../lib/research.js';
export default function Landing({language,user}) {
 const t=bilingual(language);
 return <div className="km-landing">
 <section className="landing-hero">
  <div className="landing-copy"><div className="landing-kicker"><span/> {t('ખેતરની કાળજી. તમારી ભાષામાં.','A LITTLE CLARITY. A LOT OF CARE.')}</div>
   <h1>{t('તમારા પાકની વાત,','Your crop has a story.')}<br/><em>{t('હવે વધુ સારી રીતે સમજો.','Let’s understand it.')}</em></h1>
   <p className="landing-description">{t('કપાસના ફોટાથી શરૂઆત કરો. સરળ ગુજરાતીમાં અવલોકન મેળવો, સવાલ પૂછો અને આગળનું પગલું સમજીને ભરો.','Start with a photo of your cotton plant. Get observations in Gujarati, ask a question, and take your next step with a little more clarity.')}</p>
   <div className="landing-actions"><a href="#/crop" className="button button-primary">{t('મારા પાકની તપાસ કરો','Explore my crop')}<ArrowUpRight size={18}/></a><a href="#/guide" className="landing-text-link">{t('આ કેવી રીતે કામ કરે છે','See how it works')}<ArrowRight size={16}/></a></div>
   <div className="landing-assurances"><span><Check size={14}/>{t('ગુજરાતીમાં માર્ગદર્શન','Guidance in Gujarati')}</span><span><LockKeyhole size={13}/>{t('તમારા ફોટા, તમારી પસંદગી','Your photos, your choice')}</span></div>
  </div>
  <div className="landing-specimen" aria-label={t('કપાસના પાનનું સુશોભન ચિત્ર','Decorative cotton leaf illustration')}>
   <div className="specimen-top"><span><span className="status-dot"/> {t('કપાસને થોડું નજીકથી જુઓ','A CLOSER LOOK AT COTTON')}</span><Leaf size={18}/></div>
   <div className="specimen-orbit orbit-a"/><div className="specimen-orbit orbit-b"/><div className="specimen-grid"/>
   <img className="specimen-leaf" src="/cottoncare/leaf-study.svg" alt=""/>
   <div className="specimen-marker"><span/><small>{t('દરેક પાન એક શરૂઆત.','Every leaf, a starting point.')}</small></div>
   <div className="specimen-note"><span className="specimen-note-icon"><ScanLine size={20}/></span><div><strong>{t('જોતાં શીખીએ. સમજીને આગળ વધીએ.','Observe. Understand. Take care.')}</strong><p>{t('ફોટો → અવલોકન → આગળનું પગલું','Photo → observation → next step')}</p></div></div>
   <div className="specimen-bottom"><span>GOSSYPIUM · 01</span><span>{t('ચિત્ર · AI પરિણામ નથી','ILLUSTRATION · NOT AN AI RESULT')}</span></div>
  </div>
 </section>
 <div className="landing-principles"><span><Sprout size={19}/>{t('કપાસ માટે બનાવેલું','Made for cotton')}</span><span><MessageCircle size={19}/>{t('તમારી ભાષામાં વાતચીત','A conversation in your language')}</span><span><ShieldCheck size={19}/>{t('નિષ્ણાતની પુષ્ટિ સાથે નિર્ણય','Decisions with expert confirmation')}</span></div>
 <section className="landing-steps"><div className="landing-section-heading"><div><p className="landing-kicker">{t('ખેતરથી સમજ સુધી','FROM THE FIELD TO A LITTLE MORE CLARITY')}</p><h2>{t('એક ફોટાથી શરૂઆત.','It begins with one photo.')}</h2></div><p>{t('ખાતું બનાવો. ફોટો ઉમેરો. સાથે સમજીએ.','Create an account. Bring your photo. We’ll work through it together.')}</p></div><div className="landing-step-grid">{[
 [Camera,'01',t('જે દેખાય છે, તે બતાવો.','Show what you see.'),t('પાન, જીંડવું કે આખા છોડનો સ્પષ્ટ ફોટો ઉમેરો.','Take a clear photo of a leaf, a boll, or the whole plant.')],
 [ScanLine,'02',t('થોડું વધુ સમજો.','Make a little more sense of it.'),t('દેખાતાં લક્ષણો અને અનિશ્ચિતતાનું સરળ ભાષામાં અવલોકન વાંચો.','Read a plain-language observation of visible symptoms and what remains uncertain.')],
 [MessageCircle,'03',t('સવાલ સાથે આગળ વધો.','Keep the conversation growing.'),t('વધુ સવાલ પૂછો અને પાકનો નિર્ણય લેતાં પહેલાં નિષ્ણાતની મદદ લો.','Ask a follow-up question and seek an agricultural expert’s confirmation before acting.')],
 ].map(([Icon,number,title,description])=><article key={number}><div className="landing-step-top"><Icon size={23}/><span>{number}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
 <section className="landing-research"><div className="landing-research-intro"><span className="landing-kicker"><FlaskConical size={15}/>{t('એકસાથે શીખીએ','GROWING KNOWLEDGE, TOGETHER')}</span><h2>{t('તમારો ફોટો.','Your photo.')}<br/>{t('આવતી કાલની સમજ.','Tomorrow’s understanding.')}</h2><p>{t('દરેક વપરાશકર્તા સંશોધન માટે યોગદાન આપી શકે છે. ડેટા જોવા માટે અલગ મંજૂરી જરૂરી છે.','Everyone with an account can contribute to research. Access to the shared dataset needs separate approval.')}</p></div><div className="landing-research-options"><article><span className="landing-option-icon"><Camera size={21}/></span><div><h3>{t('સંશોધન માટે ફોટો આપો','Contribute a photo')}</h3><p>{t('સામાન્ય ખાતાથી ફોટો સાચવો અને સંશોધન માટે વહેંચવાની અલગ સંમતિ આપો. કોઈ સંશોધન મંજૂરીની જરૂર નથી.','Save a photo with your normal account and choose whether to share it for research. No research approval is needed to contribute.')}</p><a href="#/crop">{t('યોગદાન આપો','Make a contribution')}<ArrowUpRight size={16}/></a></div></article><article><span className="landing-option-icon"><LockKeyhole size={21}/></span><div><h3>{t('સંશોધન ડેટાનો પ્રવેશ માગો','Apply to access research data')}</h3><p>{t('સંસ્થા, સંશોધનનો હેતુ અને ડેટાનો ઉપયોગ જણાવી અરજી કરો. વ્યવસ્થાપકની મંજૂરી પછી જ સંમતિ ધરાવતા ફોટા જોઈ શકશો.','Tell us your institution, research purpose, and intended data use. Admin approval unlocks only photos with active sharing consent.')}</p><a href="#/request-research">{t('સંશોધન પ્રવેશ માગો','Request research access')}<ArrowUpRight size={16}/></a></div></article></div></section>
 <p className="landing-disclaimer"><ShieldCheck size={16}/>{t('AI પ્રાથમિક અવલોકન આપે છે, પુષ્ટિ થયેલું નિદાન નહીં. કૃષિ નિષ્ણાતની સલાહ જરૂરી છે.','AI provides preliminary observations. Confirm crop decisions with an agricultural expert.')}</p>
 </div>;
}
