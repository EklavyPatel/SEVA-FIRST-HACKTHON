const destinations = new Set(['crop','community','research','account','request-research','admin','my-submissions']);
export function safeDestination(value) { return destinations.has(value) ? value : 'account'; }
export function rememberDestination(page) { try { sessionStorage.setItem('km-return-to',safeDestination(page)); } catch {} }
export function consumeDestination() { try { const value=sessionStorage.getItem('km-return-to'); sessionStorage.removeItem('km-return-to'); return safeDestination(value); } catch { return 'account'; } }
export function routeAccess(page,user) {
 if(destinations.has(page)&&!user)return 'login';
 if(page==='admin'&&user?.role!=='admin')return 'account';
 if(page==='research'&&!['admin','researcher','expert'].includes(user?.role))return user?'request-research':'login';
 return page;
}
