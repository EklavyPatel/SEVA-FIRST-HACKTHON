export async function researchRequest(path, { method = 'GET', body, signal } = {}) {
  let response;
  try { response = await fetch('/api/research' + path, {
    method, credentials:'same-origin', cache:'no-store',
    ...(body !== undefined ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {}),
    signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  }); } catch (error) {
    if (signal?.aborted) throw error;
    throw Object.assign(new Error('Research service could not be reached. Please try again.'),{code:'RESEARCH_NETWORK'});
  }
  let data; try { data=await response.json(); } catch { throw new Error('The research service response could not be read.'); }
  if (response.status === 401) window.dispatchEvent(new Event('km-session-expired'));
  if (!response.ok) throw Object.assign(new Error(data.error?.message || 'Research request failed.'),{code:data.error?.code,status:response.status});
  return data;
}
export const bilingual = language => (gu,en) => language === 'en' ? en : gu;
const messages = {
  RESEARCH_NETWORK:'બેકએન્ડ Supabase ફોટો સંગ્રહ સુધી પહોંચી શક્યું નથી. પાકનું માર્ગદર્શન ઉપલબ્ધ રહે છે.',
  RESEARCH_SCHEMA:'સંશોધન ડેટાબેઝનું સેટઅપ અધૂરું છે. પ્રોજેક્ટ માલિકનો સંપર્ક કરો.',
  RESEARCH_STORAGE_KEY:'ફોટો સંગ્રહનું જોડાણ અમાન્ય છે. પ્રોજેક્ટ માલિકનો સંપર્ક કરો.',
  RESEARCH_SAVE_FAILED:'Supabase માં ફોટો સાચવી શકાયો નથી. પાકનું માર્ગદર્શન ઉપલબ્ધ રહે છે. પછીથી ફરી સાચવો.',
  RESEARCH_ANALYSIS_EXPIRED:'AI પરિણામનો અસ્થાયી સંદર્ભ સમાપ્ત થયો છે. ફરી તપાસ કરો અથવા AI સૂચનો જોડવાની પસંદગી બંધ કરો.',
  RESEARCH_PENDING:'આ ફોટો સાચવાઈ રહ્યો છે. ફરી પ્રયાસ કરતાં પહેલાં મારા યોગદાન તપાસો.',
  RESEARCH_OWNER:'ખાનગી સત્ર બનાવવા યોગદાનનું ફોર્મ ફરી ખોલો.',
  RESEARCH_AUTH: 'અધિકૃત સંશોધક ખાતાથી પ્રવેશ કરો.', RESEARCH_LOGIN:'વપરાશકર્તાનામ અથવા પાસવર્ડ ખોટો છે.',
  RESEARCH_CONSENT:'આ ફોટા માટે સંશોધનની સ્પષ્ટ સંમતિ જરૂરી છે.', RESEARCH_NOT_FOUND:'આ સંશોધન ફોટો હવે ઉપલબ્ધ નથી.',
  RESEARCH_CONFLICT:'બીજી સમીક્ષા સાચવાઈ છે. ફોટો ફરી ખોલો.', RESEARCH_FULL:'સંશોધન સંગ્રહ ભરાઈ ગયો છે. પ્રોજેક્ટ ટીમનો સંપર્ક કરો.',
  RESEARCH_RATE:'ઘણી વિનંતીઓ થઈ છે. થોડી વાર પછી ફરી પ્રયાસ કરો.', RESEARCH_LIMIT:'તમારા ફોટાની મર્યાદા પૂરી થઈ છે.',
  RESEARCH_IMAGE:'ફોટો વાંચી શકાયો નથી. વધુ સ્પષ્ટ ફોટો પસંદ કરો.',RESEARCH_INPUT:'ફોર્મની વિગતો ફરી તપાસો.',
  RESEARCH_UNAVAILABLE:'સંશોધન સંગ્રહ હાલ ઉપલબ્ધ નથી.',RESEARCH_NETWORK:'સંશોધન સેવા સુધી પહોંચી શકાયું નથી. ફરી પ્રયાસ કરો.',
};
export const researchError = (error,language) => language === 'en' ? error.message : messages[error.code] || 'વિનંતી પૂરી થઈ શકી નથી. ફરી પ્રયાસ કરો.';
export const plantParts = [ ['leaf','પાન','Leaf'], ['boll','જીંડવું','Boll'], ['flower','ફૂલ','Flower'], ['stem','ડાળી','Stem'], ['whole_plant','આખો છોડ','Whole plant'], ['other','અન્ય','Other'], ['unknown','જવાબ આપેલો નથી','Not provided'] ];
export const partLabel = (part,language) => plantParts.find(item => item[0] === part)?.[language === 'en' ? 2 : 1] || part;
// getRandomValues also works on HTTP development previews where randomUUID is absent.
export function newRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function readPreference(key,fallback) { try { return window.localStorage.getItem(key) || fallback; } catch { return fallback; } }
export function savePreference(key,value) { try { window.localStorage.setItem(key,value); } catch { /* Display preferences are optional. */ } }
