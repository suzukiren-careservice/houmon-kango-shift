const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 3003;
const mime = {
  html: 'text/html; charset=utf-8',
  css: 'text/css',
  js: 'application/javascript',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      const ext = path.extname(file).slice(1);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
      res.end(data);
    }
  });
}).listen(port, () => console.error('Serving on http://localhost:' + port + '/'));
