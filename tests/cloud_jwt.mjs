// cloud_jwt：雲端登入通行證（Cloudflare Access JWT）驗證。node tests/cloud_jwt.mjs（不需要 wrangler）
import { verifyAccess } from '../cloud/worker.js';
const { subtle } = globalThis.crypto;
const kp = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256' };
const other = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
globalThis.fetch = async url => ({ json: async () => (url === 'https://team.cloudflareaccess.com/cdn-cgi/access/certs' ? { keys: [jwk] } : {}) });
const b64u = x => Buffer.from(typeof x === 'string' ? x : new Uint8Array(x)).toString('base64url');
const sign = async (body, key = kp.privateKey, kid = 'k1') => { const h = b64u(JSON.stringify({ alg: 'RS256', kid })), p = b64u(JSON.stringify(body)); return `${h}.${p}.${b64u(await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p)))}`; };
const env = { TEAM_DOMAIN: 'team.cloudflareaccess.com', POLICY_AUD: 'aud123' };
const good = { aud: ['aud123'], email: 'Matt@Company.com', iss: 'https://team.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600 };
const cases = [
  ['正確通行證', await sign(good), 'matt@company.com'],
  ['AUD 不符', await sign({ ...good, aud: ['x'] }), null],
  ['已過期', await sign({ ...good, exp: 1 }), null],
  ['簽發者不符', await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' }), null],
  ['別把鑰匙簽的', await sign(good, other.privateKey), null],
  ['竄改內容', (await sign(good)).replace(/\.[^.]+\./, '.' + b64u(JSON.stringify({ ...good, email: 'boss@company.com' })) + '.'), null],
  ['亂碼', 'abc', null]
];
let bad = 0;
for (const [n, t, want] of cases) { let got; try { got = await verifyAccess(t, env); } catch { got = null; } const ok = got === want; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : ` 得到 ${got}`}`); }
console.log(bad ? '有失敗' : '全部通過');
