// Farmer-reported context, never inferred diagnoses or mandatory questionnaire items.
export const researchFields = [
 {key:'country',group:'location',en:'Country',gu:'દેશ',max:80},
 {key:'state',group:'location',en:'State / region',gu:'રાજ્ય / પ્રદેશ',max:80},
 {key:'taluka',group:'location',en:'Taluka / subdistrict',gu:'તાલુકો',max:80},
 {key:'village',group:'location',en:'Village / general area',gu:'ગામ / સામાન્ય વિસ્તાર',max:120},
 {key:'photoDate',group:'location',type:'date',en:'When was this photo taken?',gu:'આ ફોટો ક્યારે લીધો હતો?'},
 {key:'variety',group:'crop',en:'Cotton variety / hybrid, if known',gu:'કપાસની જાત / હાઇબ્રિડ, ખબર હોય તો',max:120},
 {key:'cropAgeDays',group:'crop',type:'number',min:0,max:500,en:'Crop age in days',gu:'પાકની ઉંમર (દિવસ)'},
 {key:'growthStage',group:'crop',en:'Growth stage',gu:'પાકનો તબક્કો',options:[['seedling','Seedling','નાનો છોડ'],['vegetative','Vegetative','વૃદ્ધિનો તબક્કો'],['flowering','Flowering','ફૂલ આવવાનો તબક્કો'],['boll','Boll formation','જીંડવું બનવાનો તબક્કો'],['open_boll','Open bolls / harvest','જીંડવું ખૂલવું / કાપણી']]},
 {key:'symptomDays',group:'observations',type:'number',min:0,max:365,en:'How many days have symptoms been visible?',gu:'લક્ષણો કેટલા દિવસથી દેખાય છે?'},
 {key:'spread',group:'observations',en:'How widely is the problem spread?',gu:'સમસ્યા કેટલી ફેલાયેલી છે?',options:[['single','One plant','એક છોડ'],['few','A few plants','થોડા છોડ'],['patches','Patches in the field','ખેતરમાં છૂટાછવાયા ભાગો'],['widespread','Across much of the field','ખેતરના મોટા ભાગમાં']]},
 {key:'affectedPercent',group:'observations',type:'number',min:0,max:100,en:'Estimated affected plants (%) — your estimate',gu:'અસરગ્રસ્ત છોડનો અંદાજ (%) — તમારો અંદાજ'},
 {key:'pestSigns',group:'observations',en:'Any insects, eggs, webbing or other signs noticed?',gu:'જીવાત, ઇંડાં, જાળાં કે અન્ય નિશાની દેખાઈ છે?',max:500,multiline:true},
 {key:'recentWeather',group:'conditions',en:'Recent weather (rain, heat, humidity)',gu:'તાજેતરનું હવામાન (વરસાદ, ગરમી, ભેજ)',max:250},
 {key:'irrigation',group:'conditions',en:'Irrigation method',gu:'સિંચાઈની રીત',options:[['rainfed','Rainfed','વરસાદ આધારિત'],['drip','Drip','ટપક સિંચાઈ'],['furrow','Furrow / flood','પાળા / વહેણ સિંચાઈ'],['sprinkler','Sprinkler','ફુવારા'],['other','Other','અન્ય']]},
 {key:'lastIrrigationDate',group:'conditions',type:'date',en:'Last irrigation date',gu:'છેલ્લી સિંચાઈની તારીખ'},
 {key:'soil',group:'conditions',en:'Soil type or condition, if known',gu:'માટીની જાત કે સ્થિતિ, ખબર હોય તો',max:250},
 {key:'recentInputs',group:'conditions',en:'Any fertilizer or treatment already used? Names, dates and observed effect',gu:'પહેલેથી આપેલ ખાતર કે ઉપચાર? નામ, તારીખ અને દેખાયેલી અસર',max:1000,multiline:true},
 {key:'previousSeason',group:'conditions',en:'Was the same problem seen before?',gu:'આવી સમસ્યા પહેલાં જોવા મળી હતી?',options:[['yes','Yes','હા'],['no','No','ના'],['unsure','Not sure','ખબર નથી']]},
 {key:'extraNotes',group:'observations',en:'Anything else an expert should know?',gu:'નિષ્ણાતને જાણવા જેવી બીજી કોઈ વાત?',max:1000,multiline:true},
];
export const fieldGroups=[['location','Location & photo','સ્થાન અને ફોટો'],['crop','About the crop','પાકની માહિતી'],['observations','Symptoms & spread','લક્ષણો અને ફેલાવો'],['conditions','Field conditions & history','ખેતરની સ્થિતિ અને ઇતિહાસ']];
