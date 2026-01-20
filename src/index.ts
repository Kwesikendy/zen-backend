import 'dotenv/config';
import { createApp } from './app';
import { initSocket } from './services/socket';
const app = createApp();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`server listening on ${PORT}`));
initSocket(server);
