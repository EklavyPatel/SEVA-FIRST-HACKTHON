// Supabase's standard emails return bearer tokens in a URL fragment. Custom
// templates return a token_hash. Keep either proof in memory and scrub the URL
// before React mounts; never persist provider tokens in browser storage.
export function readAccountLink(location) {
 const fragment=(location.hash||'').slice(1);
 const parts=fragment.split(/[?#]/);
 const query=parts.find(part=>/(?:^|&)(?:token_hash|access_token|error|error_code)=/.test(part));
 if(!query)return null;
 const params=new URLSearchParams(query);
 const type=params.get('type')||(fragment.startsWith('/confirm')?'email':'recovery');
 const page=['recovery','invite'].includes(type)?'reset-password':'confirm';
 return {page,type,tokenHash:params.get('token_hash')||'',accessToken:params.get('access_token')||'',error:Boolean(params.get('error')||params.get('error_code'))};
}
export function prepareAccountLink(browser) {
 const link=readAccountLink(browser.location);
 if(link)browser.history.replaceState(null,'',browser.location.pathname+browser.location.search+'#/'+link.page);
 return link;
}
