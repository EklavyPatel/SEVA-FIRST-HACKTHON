import catalog from './approved-advisories.json' with { type: 'json' };

// No model text, user input, or unreviewed web result can populate this catalog.
// Content approval is an editorial action; an official-looking URL alone is not approval.
export function findAdvisories(possibilities, source = catalog) {
  if (!source || !Array.isArray(source.entries) || !Array.isArray(source.approvedSourceHosts)) return [];
  const keys = new Set(possibilities.map(item => item.name_en.trim().toLowerCase()));
  return source.entries.filter(entry => {
    let url;
    try { url = new URL(entry.source?.url); } catch { return false; }
    return entry.approved === true && typeof entry.conditionKey === 'string' && keys.has(entry.conditionKey.trim().toLowerCase()) &&
      typeof entry.source?.title === 'string' && entry.source.title.trim().length > 0 &&
      typeof entry.reviewedBy === 'string' && entry.reviewedBy.trim().length > 0 &&
      Number.isFinite(Date.parse(entry.reviewedAt)) && Date.parse(entry.reviewedAt) <= Date.now() &&
      url.protocol === 'https:' && !url.username && !url.password &&
      source.approvedSourceHosts.includes(url.hostname) &&
      ['nameGu', 'symptomsGu', 'preventionGu', 'nextStepsGu'].every(field =>
        typeof entry[field] === 'string' && entry[field].trim().length > 0);
  }).slice(0, 3).map(({ nameGu, symptomsGu, preventionGu, nextStepsGu, source, reviewedBy, reviewedAt }) =>
    ({ nameGu, symptomsGu, preventionGu, nextStepsGu, source, reviewedBy, reviewedAt }));
}
