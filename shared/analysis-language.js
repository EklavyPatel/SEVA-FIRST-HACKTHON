// Preserve the original Gujarati API shape; English responses use neutral field names.
const names = { name_gu: 'name', evidence_gu: 'evidence', visible_symptoms_gu: 'visible_symptoms', explanation_gu: 'explanation', reason_gu: 'reason' };
const reverse = Object.fromEntries(Object.entries(names).map(([gu, en]) => [en, gu]));
export function renameAnalysis(value, language) {
  if (Array.isArray(value)) return value.map(item => renameAnalysis(item, language));
  if (!value || typeof value !== 'object') return value;
  const map = language === 'en' ? names : reverse;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [map[key] || key, renameAnalysis(item, language)]));
}
export function englishResponseSchema(schema) {
  // Also rename property references in the JSON schema's required arrays.
  return JSON.parse(JSON.stringify(schema).replace(/"(name_gu|evidence_gu|visible_symptoms_gu|explanation_gu|reason_gu)"/g,
    (_, key) => JSON.stringify(names[key])));
}
