import { createServer } from 'net';

const server = createServer();
server.listen(0, () => {
  process.stdout.write(String(server.address().port));
  server.close();
});
