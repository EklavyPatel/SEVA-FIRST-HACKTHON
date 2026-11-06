import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { openResearchStore } from '../server/research-store.js';

const command = process.argv[2] || 'add';
const store = openResearchStore();
async function hiddenPassword() {
  if (!stdin.isTTY) throw new Error('Run account creation in an interactive terminal. Passwords are never accepted in command arguments.');
  stdout.write('Password (12+ characters, hidden): ');
  emitKeypressEvents(stdin); stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve,reject) => {
    let value = '';
    function done(error) { stdin.off('keypress',key); stdin.setRawMode(false); stdin.pause();stdout.write('\n'); error ? reject(error) : resolve(value); }
    function key(text,event={}) {
      if (event.ctrl && event.name === 'c') return done(new Error('Cancelled.'));
      if (event.name === 'return') return done();
      if (event.name === 'backspace') value = value.slice(0,-1);
      else if (text && !event.ctrl && !event.meta && value.length < 128) value += text;
    }
    stdin.on('keypress',key);
  });
}
try {
  if (command === 'list') console.table(store.listResearchers());
  else if (command === 'disable') {
    const username = process.argv[3]; if (!username) throw new Error('Usage: npm run research:users -- disable username');
    store.disableResearcher(username);console.log('Researcher access disabled, including existing sessions.');
  } else if (command === 'add') {
    const prompt = createInterface({input:stdin,output:stdout});
    const username = await prompt.question('Username: ');
    const name = await prompt.question('Reviewer display name: ');
    const institution = await prompt.question('University / organization: ');
    prompt.close();
    const password = await hiddenPassword();
    await store.addResearcher({username,name,institution,password});console.log('Researcher account created. Share its credentials privately with the intended reviewer.');
  } else throw new Error('Choose add, list, or disable.');
} catch (error) {
  console.error(error.code?.startsWith('SQLITE_CONSTRAINT') ? 'That account could not be created. Check whether the username already exists.' : error.message);
  process.exitCode = 1;
} finally { store.close(); }
