// Cover ASCII and Gujarati digits and word endings (JS \b is ASCII-centric).
const amount = '[0-9૦-૯]+(?:[.,][0-9૦-૯]+)?';
export const dosagePattern = new RegExp(`${amount}\\s*(?:ml|mg|grams?|litres?|liters?|લિટર|ગ્રામ|મિલિલિટર|મિલીલીટર)(?=$|[^\\p{L}])`, 'iu');
export const percentagePattern = new RegExp(`${amount}\\s*[%٪]`, 'u');
