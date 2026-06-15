require('dotenv').config();

const app = require('./app');

// Start worker
require('./workers/email.worker');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 QuickBite API running on port ${PORT}`);
    console.log(
        `📂 DB URL: ${
            process.env.DATABASE_URL
                ? 'Configured'
                : 'Missing!'
        }`
    );
    console.log(
        `🛠️ Mode: ${
            process.env.NODE_ENV || 'development'
        }`
    );
    console.log('----------------------------------------------------');
});