const fetch = require('node-fetch');
(async () => {
  const res = await fetch('https://www.eltoque.com');
  const html = await res.text();
  const re = /<tr[^>]*>\s*<td[^>]*>\s*<span[^>]*>\s*1\s*(?:<!--.*?-->)?\s*USD\s*<\/span>.*?<span[^>]*>\s*([0-9.,]+)\s*(?:<!--.*?-->)?\s*(?:&nbsp;|\s*)CUP\s*<\/span>/is;
  const m = html.match(re);
  console.log('matched', !!m);
  if (m) console.log(m[1]);
})();
