const { Worker } = require('bullmq');
const redis = require('../lib/redis');
const emailService = require('../lib/emailService');

const emailWorker = new Worker(
    'email',
    async (job) => {
        const { orderId, userEmail } = job.data;

        await emailService.sendConfirmation(
            orderId,
            userEmail
        );
    },
    {
        connection: redis,
        concurrency: 5
    }
);

emailWorker.on('completed', (job) => {
    console.log(
        `[EmailWorker] Job ${job.id} completed`
    );
});

emailWorker.on('failed', (job, err) => {
    console.error(
        `[EmailWorker] Job ${job.id} failed:`,
        err.message
    );
});

module.exports = emailWorker;