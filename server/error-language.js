import { translator } from '../src/lib/i18n.js';
const messages = {
 ACCOUNT_AUTH:['પુષ્ટિ થયેલા ખાતાથી પહેલાં પ્રવેશ કરો.','Log in with a confirmed account first.'],
 ACCOUNT_SESSION:['તમારો પ્રવેશ સમય પૂરો થયો છે. ફરી પ્રવેશ કરો.','Your session expired. Please log in again.'],
 AI_NETWORK_ERROR: ['AI સેવા સાથે જોડાણ થઈ શક્યું નથી. ફરી પ્રયાસ કરો.', 'Could not connect to the AI service. Please try again.'],
 ANALYSIS_CONSENT: ['ફોટો Gemini ને મોકલવા માટે તમારી સ્પષ્ટ સંમતિ જરૂરી છે.', 'Explicit consent to send this photo to Gemini is required.'],
 FOLLOWUP_CONSENT: ['ફોટો અને વાતચીત Gemini ને મોકલવાની સંમતિ જરૂરી છે.', 'Consent to send the photo and conversation to Gemini is required.'],
 FOLLOWUP_INPUT: ['ટૂંકો સવાલ લખો અથવા નવી વાતચીત શરૂ કરો.', 'Use a shorter question or start a new conversation.'],
 FOLLOWUP_RESPONSE: ['AI નો જવાબ અધૂરો છે અથવા સુરક્ષિત રીતે બતાવી શકાયો નથી. ફરી પ્રયાસ કરો અથવા કૃષિ નિષ્ણાતની મદદ લો.', 'The AI answer is incomplete or cannot be safely displayed. Retry or consult an agricultural expert.'],
 FOLLOWUP_PROVIDER: ['વાતચીત સેવા વિનંતી પૂરી કરી શકી નથી. ફરી પ્રયાસ કરો.', 'The follow-up service could not complete this request.'],
 AI_NOT_CONFIGURED: ['લાઇવ AI હાલ ઉપલબ્ધ નથી. સ્પષ્ટ રીતે દર્શાવેલો ડેમો અજમાવી શકો છો.', 'Live AI is unavailable. You can try the clearly labelled demo.'],
 AI_CONFIGURATION: ['AI સેટિંગમાં સમસ્યા છે. પછીથી પ્રયાસ કરો.', 'There is an AI configuration issue. Please try again later.'],
 RATE_LIMIT: ['ઘણી વિનંતીઓ થઈ છે. થોડી વાર પછી પ્રયાસ કરો.', 'Too many requests. Please try again shortly.'],
 INTERNAL_ERROR: ['કંઈક ખોટું થયું. ફરીથી પ્રયાસ કરો.', 'Something went wrong. Please try again.'],
};
export function errorMessage(code, message, language) {
 const pair = messages[code];
 return pair ? pair[language === 'en' ? 1 : 0] : translator(language)(message);
}
