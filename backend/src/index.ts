import app from './app.js';
import {env} from './config.js';
import {DEMO} from './demo/index.js';
app.listen(env.PORT,()=>console.info(`GU Tech LMS API listening on :${env.PORT}${DEMO?' (DEMO MODE)':''}`));
