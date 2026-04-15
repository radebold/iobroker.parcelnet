'use strict';

process.on('uncaughtException', error => {
    console.error('[parcelnet] Uncaught Exception:', error && error.stack ? error.stack : error);
});

process.on('unhandledRejection', error => {
    console.error('[parcelnet] Unhandled Rejection:', error && error.stack ? error.stack : error);
});

const startAdapter = require('./build/main.js');

if (typeof startAdapter === 'function') {
    startAdapter();
} else if (startAdapter && typeof startAdapter.startAdapter === 'function') {
    startAdapter.startAdapter();
} else if (startAdapter && typeof startAdapter.default === 'function') {
    startAdapter.default();
} else {
    console.error('[parcelnet] Kein gültiger Start-Export in build/main.js gefunden.');
    process.exit(1);
}
