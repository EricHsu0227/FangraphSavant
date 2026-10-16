import handler from 'vinext/server/fetch-handler';
import {publicWorker} from './public-worker.mjs';

// Public statistics and per-browser preferences; no Zero Trust setup required.
export default publicWorker(handler);
